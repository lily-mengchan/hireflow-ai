/* eslint-disable @typescript-eslint/no-require-imports -- Isolated browser acceptance with synthetic PDF only. */
const { chromium } = require("@playwright/test");
const { pdf } = require("../tests/helpers/screening.cjs");
const { mkdir, writeFile } = require("node:fs/promises");
const assert = require("node:assert/strict");
async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(); const checks = [], errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const base = process.env.SCREENING_TEST_URL || "http://localhost:3101";
  try {
    await page.goto(`${base}/candidates`);
    await page.getByRole("button", { name: "导入候选人", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "导入候选人" });
    await drawer.locator('input[type="file"]').setInputFiles({ name: "synthetic-resume.pdf", mimeType: "application/pdf", buffer: pdf() });
    await drawer.getByText(/已提取 \d+ 字/).waitFor({ timeout: 30000 }); checks.push("text-PDF-local-extraction"); console.log("PASS local PDF extraction");
    await drawer.getByRole("combobox").first().click(); await drawer.getByRole("combobox").first().press("ArrowDown"); await drawer.getByRole("combobox").first().press("Enter");
    await drawer.getByLabel("目前 Base 地", { exact: true }).fill("Shanghai");
    await drawer.getByLabel("最早可到岗时间", { exact: true }).fill("2026-12-15");
    await drawer.getByRole("button", { name: "检查基础条件", exact: true }).click();
    await drawer.getByRole("textbox", { name: "人工继续原因", exact: true }).fill("未配置条件，人工核对模拟资料后继续");
    await drawer.getByRole("button", { name: "人工确认继续分析", exact: true }).click();
    await page.getByRole("button", { name: "确认继续", exact: true }).click();
    const responsePromise = page.waitForResponse(r => r.url().endsWith("/api/recruitment/screen"), { timeout: 180000 });
    await drawer.getByRole("button", { name: "生成推荐评语", exact: true }).click();
    const response = await responsePromise, result = await response.json();
    assert.equal(response.status(), 200, result.error); checks.push("real-LLM-extraction-and-match"); console.log("PASS real LLM extraction and matching");
    assert.equal(result.resume.name.value, "Demo Candidate Q");
    assert.ok(result.analysis.checks.some(c => c.status === "来源冲突"));
    assert.ok(result.analysis.draft.includes("2026-12-15")); checks.push("HR-notes-and-source-conflict");
    await drawer.getByRole("button", { name: "编辑推荐评语", exact: true }).click();
    const edited = result.analysis.draft + "\nHR 已人工核对本次模拟推荐。";
    await drawer.getByRole("textbox", { name: "推荐评语", exact: true }).fill(edited);
    await drawer.getByRole("checkbox", { name: "已核对候选人身份、事实、来源冲突及推荐内容" }).check();
    await drawer.getByRole("button", { name: "确认推荐并保存", exact: true }).click();
    await drawer.getByRole("heading", { name: "候选人记录已保存" }).waitFor();
    let data = await page.evaluate(() => JSON.parse(localStorage.getItem("hireflow-ai:recruitment:v1")));
    const imported = data.applications.find(a => a.recommendation?.resume.name.value === "Demo Candidate Q");
    assert.equal(imported.stage, "业务复筛"); assert.equal(imported.recommendation.content, edited); checks.push("editable-draft-atomic-confirmation");
    await drawer.getByRole("button", { name: "复制推荐内容", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText()); assert.ok(copied.includes(imported.candidateId)); checks.push("copy-with-candidate-id");
    await drawer.getByRole("button", { name: /完\s*成/ }).click();
    await page.reload(); await page.getByRole("textbox", { name: "搜索候选人" }).fill("Demo Candidate Q");
    await page.getByRole("button", { name: /Demo Candidate Q/ }).first().waitFor();
    await page.getByRole("button", { name: /Demo Candidate Q/ }).first().click();
    const detail = page.getByRole("dialog", { name: "候选人详情" }); await detail.getByRole("tab", { name: "初筛与推荐" }).click();
    await detail.getByText("HR 已人工核对本次模拟推荐。", { exact: false }).waitFor(); checks.push("refresh-and-detail-provenance");
    await page.screenshot({ path: ".local/screening-detail.png", fullPage: false });
    await detail.locator(".ant-drawer-close").click();
    await page.getByRole("button", { name: "导入候选人", exact: true }).click();
    await drawer.locator('input[type="file"]').setInputFiles({ name: "scanned-fixture.pdf", mimeType: "application/pdf", buffer: pdf("") });
    await page.getByText(/可能是扫描件/).waitFor(); checks.push("scanned-PDF-clear-error");
    assert.equal(errors.length, 0, errors.join("\n"));
    await mkdir(".local", { recursive: true }); await writeFile(".local/screening-browser-verification.json", JSON.stringify({ checkedAt: new Date().toISOString(), checks, usage: result.usage, pageErrors: errors.length }, null, 2));
    console.log(`PASS ${checks.length} browser acceptance checks`);
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
