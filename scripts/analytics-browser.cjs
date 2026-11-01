/* eslint-disable @typescript-eslint/no-require-imports -- Isolated Edge acceptance against local app, synthetic records only. */
require("./load-ts.cjs");
const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { RecruitmentRepository, STORAGE_KEY } = require("../src/data/repository.ts");
const { analyticsSnapshot } = require("../src/analytics/schema.ts");
const { hrNotesSchema } = require("../src/screening/schema.ts");
const { jobVersion } = require("../src/screening/rules.ts");
const { profile } = require("../tests/helpers/screening.cjs");
async function main() {
  const now = new Date(), daysAgo = n => new Date(now.getTime() - n * 86400000).toISOString();
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const repo = new RecruitmentRepository(storage, () => now); const data = repo.load(), job = data.jobs[0];
  const apps = data.applications.filter(a => a.jobId === job.id);
  apps.slice(0, 3).forEach((a, i) => { a.stage = "一面"; a.interview = "已完成"; a.status = i === 1 ? "已通过" : i === 2 ? "已淘汰" : "待处理"; });
  data.interviews = [...["待定", "通过", "未通过"].map((result, i) => ({ id: `ANALYTICS-BROWSER-${i}`, applicationId: apps[i].id, stage: "一面", scheduledAt: daysAgo(5), completedAt: daysAgo(i === 0 ? 4 : 2), status: "已完成", result, note: "合成面试反馈" })), ...data.interviews.filter(i => !apps.slice(0, 3).some(a => a.id === i.applicationId))];
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
  const imported = repo.saveImport({ importId: "analytics-browser-import", jobId: job.id, jobVersion: jobVersion(job), resumeHash: "c".repeat(64), resume: profile(), hrNotes: hrNotesSchema.parse({}), analysis: { findings: [], checks: [], draft: "Synthetic" }, usage: { modelCalls: 0, promptTokens: 0, completionTokens: 0, cached: true }, content: "Synthetic recommendation", recommend: true, acknowledged: true, newIdentityConfirmed: false });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  await context.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: STORAGE_KEY, raw: JSON.stringify(imported) });
  const page = await context.newPage(), checks = [], errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const base = process.env.ANALYTICS_TEST_URL || "http://localhost:3103";
  async function ask(question, quick = false) {
    const cardCount = await page.locator(".recruitment-query-result").count();
    const awaited = page.waitForResponse(r => r.url().endsWith("/api/recruitment/query"));
    if (quick) await page.getByRole("button", { name: question, exact: true }).click();
    else { await page.getByRole("textbox", { name: "招聘助手消息输入框" }).fill(question); await page.getByRole("button", { name: "发送", exact: true }).click(); }
    const response = await awaited, body = await response.json(); assert.equal(response.status(), 200, body.error);
    if (body.kind === "data") { assert.equal(body.routing.modelCalls, 0); await page.locator(".recruitment-query-result").nth(cardCount).waitFor(); await page.getByRole("status").waitFor({ state: "hidden" }); }
    return body;
  }
  try {
    await page.goto(`${base}/assistant`);
    const overview = await ask("招聘总体情况", true); assert.equal(overview.kind, "data"); assert.equal(overview.result.metrics.find(m => m.label === "候选人总数").value, 17); checks.push("zero-model-overview");
    const business = await ask("待业务复筛", true); assert.equal(business.result.rows.length, 1); checks.push("recommended-business-review");
    await page.locator('.recruitment-query-result').last().getByRole("button", { name: "Demo Candidate Q", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "候选人详情" }); await drawer.waitFor(); await drawer.locator(".ant-drawer-close").click(); checks.push("application-id-drilldown");
    const stats = await ask("前端岗位最近一周有多少人通过一面？"); assert.equal(stats.result.metrics.find(m => m.label === "明确结果通过率").value, 50); checks.push("explicit-result-pass-rate");
    const pending = await ask("哪些候选人超过三天还没有面评？"); assert.equal(pending.result.rows.length, 1); checks.push("completed-interview-overdue");
    await page.locator('.recruitment-query-result').last().getByRole("button", { name: data.candidates[0].name, exact: true }).click();
    await drawer.getByLabel("手动录入事件发生时间").fill(new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 16));
    await drawer.locator(".feedback-editor").getByRole("combobox").nth(1).click(); await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content").filter({ hasText: /^通过$/ }).click();
    await drawer.getByRole("checkbox", { name: "已确认候选人、岗位和反馈内容" }).check();
    await drawer.getByRole("button", { name: "确认保存", exact: true }).click();
    await page.getByText("面试记录已保存，招聘进度已更新", { exact: true }).waitFor();
    await drawer.locator(".ant-drawer-close").click();
    const fresh = await ask("哪些候选人超过三天还没有面评？"); assert.equal(fresh.result.rows.length, 0); checks.push("confirmed-feedback-updates-query");
    const conversion = await ask("招聘转化分析", true); assert.equal(conversion.kind, "data"); assert.ok(conversion.result.notes.some(n => n.includes("不根据"))); checks.push("evidence-based-conversion");
    await page.reload(); const refreshed = await ask("招聘总体情况", true); assert.deepEqual(refreshed.result.metrics, overview.result.metrics); checks.push("persisted-snapshot-after-refresh");
    const ragPromise = page.waitForResponse(r => r.url().endsWith("/api/rag/ask"), { timeout: 240000 });
    const routed = await ask("前端开发岗位需要哪些技术？", true); assert.equal(routed.kind, "knowledge");
    const ragResponse = await ragPromise, rag = await ragResponse.json(); assert.equal(ragResponse.status(), 200, rag.error); assert.ok(rag.sources.length > 0); assert.ok(rag.answer.includes("React")); checks.push("original-real-JD-RAG");
    await page.getByRole("status").waitFor({ state: "hidden" });
    await ask("待业务复筛", true);
    assert.equal(errors.length, 0, errors.join("\n"));
    // A direct HTTP request with a corrupted snapshot must fail before routing.
    const invalid = analyticsSnapshot(imported); invalid.applications[0].candidateId = "missing";
    const rejected = await context.request.post(`${base}/api/recruitment/query`, { data: { question: "招聘总体情况", snapshot: invalid } }); assert.equal(rejected.status(), 400); checks.push("invalid-snapshot-rejected");
    await mkdir(".local", { recursive: true }); await page.screenshot({ path: ".local/analytics-assistant.png", fullPage: false });
    await writeFile(".local/analytics-browser-verification.json", JSON.stringify({ verifiedAt: new Date().toISOString(), checks, pageErrors: errors.length }, null, 2));
    console.log(`PASS ${checks.length} query browser checks, including real RAG`);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
