/* eslint-disable @typescript-eslint/no-require-imports -- Live extraction verification using existing server modules. */
require("./load-ts.cjs");
require("@next/env").loadEnvConfig(process.cwd());
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { extractRecruitmentMessage } = require("../src/messages/extract.ts");
const { RecruitmentRepository, STORAGE_KEY } = require("../src/data/repository.ts");
const { matchApplications } = require("../src/messages/workflow.ts");
const now = new Date("2026-11-01T10:00:00+08:00");
const input = message => ({ message, messageAt: now.toISOString(), timeZone: "Asia/Shanghai" });
function repository() {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const repo = new RecruitmentRepository(storage, () => now); const data = repo.load();
  data.candidates[0].name = "张三"; data.candidates[1].name = "李四";
  data.applications.slice(0, 2).forEach(a => Object.assign(a, { stage: "一面", status: "待处理", interview: "已安排" }));
  storage.setItem(STORAGE_KEY, JSON.stringify(data)); return { repo, storage };
}
async function confirm(repo, source, event) {
  const matched = matchApplications(repo.load(), event); assert.equal(matched.options.length, 1);
  const a = matched.options[0];
  return repo.confirmMessage({ message: source, original: event, event, applicationId: a.id, expected: { stage: a.stage, status: a.status, interview: a.interview, updatedAt: a.updatedAt }, acknowledged: true, confirmationNote: "真实模型提取的模拟消息，验证脚本模拟 HR 明确确认" });
}
async function main() {
  const first = input("张三，前端开发岗位，一面通过，安排下周一下午两点二面，面试官李经理。");
  const single = await extractRecruitmentMessage(first);
  assert.equal(single.events.length, 1); const event = single.events[0].event;
  assert.equal(event.candidateName, "张三"); assert.equal(event.completedStage, "一面"); assert.equal(event.interviewResult, "通过"); assert.equal(event.nextStage, "二面");
  assert.equal(event.interviewTime, "2026-11-02T06:00:00.000Z");
  const { repo, storage } = repository();
  const updated = await confirm(repo, first, event);
  assert.equal(updated.applications.find(a => a.id === "APP-1").stage, "二面");
  const count = updated.events.length; const repeat = await confirm(repo, first, event); assert.equal(repeat.events.length, count);
  assert.equal(new RecruitmentRepository(storage, () => now).load().applications[0].stage, "二面");
  const many = input(first.message + "\n李四，AI 产品经理，一面未通过，结束本次招聘。");
  const multi = await extractRecruitmentMessage(many); assert.equal(multi.events.length, 2);
  const multiRepo = repository().repo;
  for (const row of multi.events) await confirm(multiRepo, many, row.event);
  assert.equal(multiRepo.load().applications.find(a => a.id === "APP-2").status, "已淘汰");
  const unclear = await extractRecruitmentMessage(input("张三一面表现还行，明天下午再安排二面，具体时间待定。"));
  assert.ok(unclear.events.length); assert.equal(unclear.events[0].event.jobTitle, null);
  assert.equal(unclear.events[0].event.interviewResult, null); assert.equal(unclear.events[0].event.interviewTime, null);
  const irrelevant = await extractRecruitmentMessage(input("今天天气晴朗，午饭吃什么？")); assert.equal(irrelevant.skipped, true);
  await mkdir(".local", { recursive: true });
  await writeFile(".local/messages-verification.json", JSON.stringify({ verifiedAt: new Date().toISOString(), first, single, multi, unclear, irrelevant, confirmedEvents: multiRepo.load().events.filter(e => e.source) }, null, 2));
  console.log("PASS: live single/multi-candidate extraction, relative date, uncertain fields, simulated HR commit, idempotency, persistence reload, irrelevant-message skip. Report: .local/messages-verification.json");
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Message extraction verification failed"); process.exitCode = 1; });
