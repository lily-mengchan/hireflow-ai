/* eslint-disable @typescript-eslint/no-require-imports -- Production acceptance; isolated browser and synthetic PDF only. */
const { chromium } = require("@playwright/test");
const { pdf } = require("../tests/helpers/screening.cjs");
const { mkdir, writeFile } = require("node:fs/promises");
const assert = require("node:assert/strict");
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 }, permissions: ["clipboard-read", "clipboard-write"] });
  const page = await context.newPage(), checks = [], errors = [], hydration = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && /hydration|hydrating|server rendered|did not match/i.test(m.text())) hydration.push(m.text()); });
  const base = process.env.DEPLOYMENT_TEST_URL || "http://localhost:3105";
  const title = "部署核验前端工程师", key = "hireflow-ai:recruitment:v1";
  const localTime = date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 16);
  const data = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
  async function option(text) { await page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content").filter({ hasText: new RegExp(`^${text}$`) }).click(); }
  async function ask(question) {
    const count = await page.locator(".recruitment-query-result").count();
    const pending = page.waitForResponse(r => r.url().endsWith("/api/recruitment/query"));
    await page.getByRole("textbox", { name: "招聘助手消息输入框" }).fill(question); await page.getByRole("button", { name: "发送", exact: true }).click();
    const response = await pending, value = await response.json(); assert.equal(response.status(), 200, value.error);
    if (value.kind === "data") await page.locator(".recruitment-query-result").nth(count).waitFor();
    return value;
  }
  try {
    for (const route of ["/", "/jobs", "/candidates", "/pipeline", "/assistant"]) {
      const response = await page.goto(base + route); assert.equal(response.status(), 200);
      await page.getByRole("button", { name: "重置演示数据", exact: true }).waitFor();
    }
    checks.push("five-production-routes-and-empty-storage-hydration");
    await page.goto(base + "/jobs"); await page.getByRole("button", { name: "新建岗位", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "新建岗位" });
    await modal.getByLabel("岗位名称", { exact: true }).fill(title); await modal.getByLabel("薪资范围", { exact: true }).fill("20–30K");
    await modal.getByLabel("岗位职责与任职要求", { exact: true }).fill("岗位职责\n负责 React 招聘管理后台开发。\n任职要求\n本科及以上学历，3 年以上开发经验。\n熟练使用 React、TypeScript，熟悉部署核验组件库。\n工作条件\n工作地点：上海。");
    await modal.getByRole("button", { name: "保存岗位", exact: true }).click(); await modal.waitFor({ state: "hidden" });
    const created = (await data()).jobs.find(j => j.title === title); assert.ok(created);
    await page.reload(); await page.getByRole("button", { name: title, exact: true }).waitFor(); checks.push("create-job-and-refresh-restore"); console.log("PASS production job creation and restore");
    const worker = await context.request.get(base + "/pdf.worker.min.mjs"); assert.equal(worker.status(), 200); assert.match(worker.headers()["content-type"], /javascript/);
    const cmap = await context.request.get(base + "/pdf-cmaps/Adobe-GB1-UCS2.bcmap"); assert.equal(cmap.status(), 200); checks.push("production-worker-and-CMap-assets");
    await page.goto(base + "/candidates"); await page.getByRole("button", { name: "导入候选人", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "导入候选人" });
    await importer.locator('input[type="file"]').setInputFiles({ name: "synthetic-deployment.pdf", mimeType: "application/pdf", buffer: pdf() });
    await importer.getByText(/已提取 \d+ 字/).waitFor({ timeout: 30000 });
    await importer.getByRole("combobox").first().click(); await option(`${title} · 上海`);
    await importer.getByLabel("目前 Base 地", { exact: true }).fill("Shanghai");
    await importer.getByLabel("最早可到岗时间", { exact: true }).fill("2026-12-15");
    const analyzed = page.waitForResponse(r => r.url().endsWith("/api/recruitment/screen"), { timeout: 180000 });
    analyzed.catch(() => {});
    await importer.getByRole("button", { name: "生成推荐评语", exact: true }).click();
    const analysisResponse = await analyzed, analysis = await analysisResponse.json(); assert.equal(analysisResponse.status(), 200, analysis.error);
    await importer.getByRole("button", { name: "编辑推荐评语", exact: true }).click();
    await importer.getByRole("checkbox", { name: "已核对候选人身份、事实、来源冲突及推荐内容" }).check();
    await importer.getByRole("button", { name: "确认推荐并保存", exact: true }).click(); await importer.getByRole("heading", { name: "候选人记录已保存" }).waitFor();
    const saved = await data(), application = saved.applications.find(a => a.jobId === created.id); assert.equal(application.stage, "业务复筛");
    await importer.getByRole("button", { name: "复制推荐内容", exact: true }).click(); assert.ok((await page.evaluate(() => navigator.clipboard.readText())).includes(application.candidateId));
    await importer.getByRole("button", { name: /完\s*成/ }).click(); checks.push("real-PDF-analysis-recommendation-and-copy"); console.log("PASS production PDF and real recommendation");
    await page.goto(base + "/assistant"); const pendingBusiness = await ask(`${title}有哪些候选人等待业务复筛？`); assert.equal(pendingBusiness.kind, "data"); assert.equal(pendingBusiness.result.rows.length, 1); assert.equal(pendingBusiness.routing.modelCalls, 0); checks.push("recommendation-query-on-same-application");
    await page.locator(".recruitment-query-result").last().getByRole("button", { name: "Demo Candidate Q", exact: true }).click();
    const detail = page.getByRole("dialog", { name: "候选人详情" });
    await detail.getByLabel("手动录入事件发生时间").fill(localTime(new Date()));
    const editor = detail.locator(".feedback-editor"); await editor.getByRole("combobox").nth(1).click(); await option("通过");
    await editor.getByRole("combobox").nth(2).click(); await option("一面");
    await editor.getByLabel("面试时间", { exact: true }).fill(localTime(new Date(Date.now() + 86400000)));
    await editor.getByLabel("面试官", { exact: true }).fill("模拟面试官");
    await editor.getByRole("checkbox", { name: "已确认候选人、岗位和反馈内容" }).check(); await editor.getByRole("button", { name: "确认保存", exact: true }).click();
    await page.getByText("面试记录已保存，招聘进度已更新", { exact: true }).waitFor(); await detail.locator(".ant-drawer-close").click();
    assert.equal((await data()).applications.find(a => a.id === application.id).stage, "一面"); checks.push("business-review-to-scheduled-interview");
    await page.goto(base + "/pipeline"); await page.getByRole("button", { name: "录入面试反馈", exact: true }).click();
    const entry = page.locator("#pipeline-feedback-entry"); await entry.getByLabel("事件发生时间", { exact: true }).fill(localTime(new Date()));
    await entry.getByRole("textbox", { name: "面试反馈内容" }).fill(`Demo Candidate Q，${title}，一面通过。`);
    const parsed = page.waitForResponse(r => r.url().endsWith("/api/recruitment/parse"), { timeout: 120000 }); await entry.getByRole("button", { name: "识别并填写", exact: true }).click();
    const parseResponse = await parsed, parsedBody = await parseResponse.json(); assert.equal(parseResponse.status(), 200, parsedBody.error);
    const parsedEditor = entry.locator(".feedback-editor").first(); await parsedEditor.waitFor();
    const note = parsedEditor.getByPlaceholder("请说明缺失信息或修改字段的核对依据"); if (await note.isVisible()) await note.fill("已核对模拟候选人编号、目标岗位和原文反馈。");
    await parsedEditor.getByRole("checkbox", { name: "已确认候选人、岗位和反馈内容" }).check(); await parsedEditor.getByRole("button", { name: "确认保存", exact: true }).click();
    await entry.getByText("面试记录已保存", { exact: true }).waitFor();
    const progressed = await data(), updated = progressed.applications.find(a => a.id === application.id); assert.equal(updated.status, "已通过"); assert.equal(updated.interview, "已完成"); assert.ok(progressed.events.some(e => e.applicationId === application.id && e.source?.mode === "ai")); checks.push("real-AI-feedback-confirmation-and-history");
    await page.goto(base + "/assistant"); const stats = await ask(`${title}一面通过率是多少？`); assert.equal(stats.kind, "data"); assert.equal(stats.result.metrics.find(m => m.label === "明确结果通过率").value, 100); checks.push("query-statistics-after-feedback");
    const ragResponsePromise = page.waitForResponse(r => r.url().endsWith("/api/rag/ask"), { timeout: 240000 });
    const route = await ask(`${title}的技术要求是什么？`); assert.equal(route.kind, "knowledge");
    const ragResponse = await ragResponsePromise, rag = await ragResponse.json(); assert.equal(ragResponse.status(), 200, rag.error); assert.ok(rag.sources.some(s => s.jobId === created.id)); checks.push("new-job-real-RAG-in-production");
    await page.getByRole("status").waitFor({ state: "hidden" }); await page.reload();
    const overview = await ask("招聘总体情况"); assert.equal(overview.result.metrics.find(m => m.label === "候选人总数").value, 17); assert.equal((await data()).applications.find(a => a.id === application.id).status, "已通过"); checks.push("complete-cycle-persists-across-refresh");
    assert.equal(errors.length, 0, errors.join("\n")); assert.equal(hydration.length, 0, hydration.join("\n"));
    await mkdir(".local", { recursive: true }); await page.screenshot({ path: ".local/deployment-production.png", fullPage: false });
    await writeFile(".local/deployment-browser-verification.json", JSON.stringify({ verifiedAt: new Date().toISOString(), checks, pageErrors: errors.length, hydrationErrors: hydration.length, screeningUsage: analysis.usage }, null, 2));
    console.log(`PASS ${checks.length} production deployment checks; zero hydration/page errors`);
  } catch (e) {
    await mkdir(".local", { recursive: true }); await page.screenshot({ path: ".local/deployment-flow-error.png", fullPage: false });
    console.log("Completed production checks:", checks); throw e;
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
