/* eslint-disable @typescript-eslint/no-require-imports */
require('./load-ts.cjs');
const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const { RecruitmentRepository, STORAGE_KEY } = require('../src/data/repository.ts');
const { hrNotesSchema } = require('../src/screening/schema.ts');
const { jobVersion } = require('../src/screening/rules.ts');
const { profile } = require('../tests/helpers/screening.cjs');
async function main() {
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
  const repo = new RecruitmentRepository(storage), job = repo.load().jobs[0];
  const data = repo.saveImport({ importId: 'collab-browser', jobId: job.id, jobVersion: jobVersion(job), resumeHash: 'd'.repeat(64), resume: profile(), hrNotes: hrNotesSchema.parse({ remarks: 'Private HR notes' }), analysis: { findings: [], checks: [], draft: 'Synthetic' }, usage: { modelCalls: 0, promptTokens: 0, completionTokens: 0, cached: true }, content: 'Synthetic HR recommendation', recommend: true, acknowledged: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: STORAGE_KEY, raw: JSON.stringify(data) });
  const page = await context.newPage(), errors = [], checks = [];
  page.on('pageerror', e => errors.push(e.message));
  const base = process.env.COLLAB_TEST_URL || 'http://localhost:3110';
  const identity = () => page.getByLabel('Demo 登录身份');
  const card = () => page.locator('.collab-card').filter({ hasText: 'Demo Candidate Q' });
  try {
    await page.goto(`${base}/collaboration`);
    await card().getByRole('button', { name: '推荐并分配复筛', exact: true }).click();
    await card().getByText('待业务复筛', { exact: true }).waitFor(); checks.push('HR assignment');
    await identity().selectOption('interviewer-2'); await page.goto(`${base}/interviewer`);
    await page.getByText('暂无分配任务或记录').waitFor(); assert.equal(await card().count(), 0); checks.push('other interviewer cannot view task');
    await identity().selectOption('interviewer-1'); await card().getByText('Synthetic HR recommendation', { exact: true }).waitFor();
    assert.equal(await page.getByText('Private HR notes', { exact: true }).count(), 0);
    await card().getByRole('button', { name: '建议进入面试', exact: true }).click();
    await identity().selectOption('hr-demo'); await page.goto(`${base}/collaboration`);
    await card().getByText('待 HR 确认推进', { exact: true }).waitFor(); checks.push('business feedback visible to HR');
    await card().getByRole('button', { name: '确认推进', exact: true }).click();
    await card().locator('input[type="datetime-local"]').fill('2026-11-03T14:00');
    await card().getByRole('button', { name: '分配当前轮面试任务', exact: true }).click();
    await identity().selectOption('interviewer-1'); await page.goto(`${base}/interviewer`);
    await page.getByRole('tab', { name: '我的面试任务', exact: true }).click();
    for (const label of ['技术或岗位能力评价', '项目经历评价', '沟通及综合表现', '优势与不足', '综合评价']) await page.getByRole('textbox', { name: label, exact: true }).fill(`Synthetic ${label}`);
    await page.getByRole('button', { name: '保存草稿', exact: true }).click(); await page.reload();
    await page.getByRole('tab', { name: '我的面试任务', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: '综合评价', exact: true }).inputValue(), 'Synthetic 综合评价'); checks.push('draft survives reload');
    await page.getByRole('button', { name: '正式提交面评', exact: true }).click();
    await page.getByRole('button', { name: '发起修订（保留原记录）', exact: true }).click();
    await page.getByRole('textbox', { name: '综合评价', exact: true }).fill('Revised feedback');
    await page.getByRole('button', { name: '正式提交面评', exact: true }).click();
    await identity().selectOption('hr-demo'); await page.goto(`${base}/collaboration`);
    await card().getByText('Revised feedback', { exact: false }).waitFor(); checks.push('HR sees original and revision');
    const raw = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
    const app = raw.applications.find(a => a.recommendation?.id === 'collab-browser');
    assert.equal(app.stage, '一面'); assert.equal(app.collaboration.feedback.length, 2); assert.equal(app.collaboration.feedback[0].fields.summary, 'Synthetic 综合评价');
    await identity().selectOption('interviewer-1'); await page.goto(`${base}/interviewer`); await page.getByRole('tab', { name: '面评记录 / 最近提交', exact: true }).click(); await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'mobile horizontal overflow'); await page.screenshot({ path: 'docs/collaboration-mobile.png', fullPage: true });
    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: checks, pageErrors: errors, stage: app.stage }, null, 2));
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
