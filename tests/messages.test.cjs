/* eslint-disable @typescript-eslint/no-require-imports -- Node runner with the existing TypeScript bridge. */
require("../scripts/load-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { RecruitmentRepository, STORAGE_KEY } = require("../src/data/repository.ts");
const { matchApplications, messageFingerprint } = require("../src/messages/workflow.ts");
const { resolveMessageTime } = require("../src/messages/time.ts");
const { validateExtraction } = require("../src/messages/extract.ts");
const { selectDashboard, selectApplications } = require("../src/data/selectors.ts");
const now = new Date("2026-11-01T10:00:00+08:00");

function setup() {
  const values = new Map(); let writes = 0;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes++; values.set(key, value); } };
  const repo = new RecruitmentRepository(storage, () => now);
  const data = repo.load();
  data.candidates[0].name = "张三"; data.candidates[1].name = "李四";
  for (const application of data.applications.slice(0, 2)) Object.assign(application, { stage: "一面", status: "待处理", interview: "已安排" });
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
  return { repo, storage, values, writes: () => writes };
}
function parsed(name = "张三", job = "前端开发岗位", evidence = "张三，前端开发岗位，一面通过，安排下周一下午两点二面，面试官李经理。") {
  return { candidateId: null, candidateName: name, jobTitle: job, eventType: "面试反馈", completedStage: "一面", interviewResult: "通过", nextStage: "二面", interviewTime: "2026-11-02T06:00:00.000Z", timeEvidence: "下周一下午两点", interviewer: "李经理", remarks: null, evidence };
}
function confirmation(repo, event = parsed(), applicationId = "APP-1", text = event.evidence) {
  const application = repo.load().applications.find(a => a.id === applicationId);
  return { message: { message: text, messageAt: now.toISOString(), timeZone: "Asia/Shanghai" }, original: event, event, applicationId,
    expected: { stage: application.stage, status: application.status, interview: application.interview, updatedAt: application.updatedAt }, acknowledged: true, confirmationNote: "已核对模拟消息、申请 ID 与时间" };
}

test("A: first interview passes and second interview is scheduled atomically with evidence and interviewer", async () => {
  const { repo, writes } = setup(); const input = confirmation(repo); const count = writes();
  const changed = await repo.confirmMessage(input);
  assert.equal(writes(), count + 1);
  const application = changed.applications.find(a => a.id === "APP-1");
  assert.equal(application.stage, "二面"); assert.equal(application.status, "待处理"); assert.equal(application.interview, "已安排");
  const history = changed.events.at(-1);
  assert.equal(history.source.original.evidence, input.event.evidence);
  assert.equal(history.interviewChanges.length, 2);
  const completed = changed.interviews.find(i => i.applicationId === "APP-1" && i.stage === "一面");
  assert.equal(completed.result, "通过"); assert.equal(completed.scheduledAt, null);
  const second = changed.interviews.find(i => i.applicationId === "APP-1" && i.stage === "二面");
  assert.equal(second.interviewer, "李经理"); assert.equal(second.scheduledAt, "2026-11-02T06:00:00.000Z");
});

test("B: retries, re-parsing and different message timestamp cannot duplicate records", async () => {
  const { repo, writes } = setup(); const input = confirmation(repo);
  const first = await repo.confirmMessage(input); const count = writes();
  const duplicate = await repo.confirmMessage({ ...input, message: { ...input.message, messageAt: "2026-11-01T11:00:00+08:00" } });
  assert.deepEqual(duplicate, first); assert.equal(writes(), count);
  assert.equal(await messageFingerprint(" 张三  一面通过 "), await messageFingerprint("张三\n一面通过"));
});

test("C: same-name candidates require human selection; explicit invalid or conflicting IDs never fall back", async () => {
  const { repo, storage } = setup(); const data = repo.load(); data.candidates[6].name = "张三";
  storage.setItem(STORAGE_KEY, JSON.stringify(data));
  const matched = matchApplications(data, parsed()); assert.equal(matched.options.length, 2); assert.equal(matched.requiresSelection, true);
  assert.equal(matchApplications(data, { ...parsed(), candidateId: "HF-NOT-FOUND" }).options.length, 0);
  assert.equal(matchApplications(data, { ...parsed(), candidateId: "HF-0002" }).options.length, 0);
  const changed = await repo.confirmMessage(confirmation(repo));
  assert.equal(changed.applications.find(a => a.id === "APP-7").stage, data.applications.find(a => a.id === "APP-7").stage);
});

test("D: Offer, eliminated applications and stage jumps reject old feedback without partial writes", async () => {
  for (const state of [{ stage: "Offer" }, { status: "已淘汰" }, { stage: "HR 初筛" }]) {
    const { repo, storage, values } = setup(); const data = repo.load(); Object.assign(data.applications[0], state);
    storage.setItem(STORAGE_KEY, JSON.stringify(data)); const before = values.get(STORAGE_KEY);
    await assert.rejects(repo.confirmMessage(confirmation(repo)), /Offer|淘汰|阶段/);
    assert.equal(values.get(STORAGE_KEY), before);
  }
});

test("E: two candidates in one message are confirmed independently by application ID", async () => {
  const { repo } = setup(); const first = parsed(); const second = parsed("李四", "AI 产品经理", "李四，AI 产品经理，一面通过，安排下周一下午两点二面，面试官李经理。");
  const text = first.evidence + "\n" + second.evidence;
  const a = confirmation(repo, first, "APP-1", text); const b = confirmation(repo, second, "APP-2", text);
  await repo.confirmMessage(a); assert.equal(repo.load().applications.find(a => a.id === "APP-2").stage, "一面");
  const changed = await repo.confirmMessage(b);
  assert.equal(changed.applications.find(a => a.id === "APP-2").stage, "二面");
  assert.equal(changed.events.filter(e => e.source).length, 2);
});

test("F: reload retains state, interview history and duplicate detection", async () => {
  const { repo, storage } = setup(); const input = confirmation(repo); await repo.confirmMessage(input);
  const refreshed = new RecruitmentRepository(storage, () => now);
  assert.equal(selectApplications(refreshed.load()).find(a => a.applicationId === "APP-1").stage, "二面");
  assert.equal(selectApplications(refreshed.load()).find(a => a.applicationId === "APP-1").history.at(-1).note, input.confirmationNote);
  const count = refreshed.load().events.length; await refreshed.confirmMessage(input);
  assert.equal(refreshed.load().events.length, count);
});

test("G: confirmed HR interview to Offer immediately changes dashboard counts", async () => {
  const { repo, storage } = setup(); const data = repo.load(); Object.assign(data.applications[1], { stage: "HR 面", interview: "待安排" });
  storage.setItem(STORAGE_KEY, JSON.stringify(data)); const before = selectDashboard(data, now);
  const event = { ...parsed("李四", "AI 产品经理", "李四，AI 产品经理，HR 面通过，发放 Offer。"), completedStage: "HR 面", nextStage: "Offer", interviewTime: null, timeEvidence: null, interviewer: null };
  const changed = await repo.confirmMessage(confirmation(repo, event, "APP-2")); const after = selectDashboard(changed, now);
  assert.equal(after.offerCount, before.offerCount + 1); assert.equal(after.pendingCount, before.pendingCount - 1);
  assert.ok(after.activities[0].action.includes("面试记录"));
});

test("H: relative times are deterministic; missing date/result/job needs human resolution", async () => {
  assert.equal(resolveMessageTime("下周一下午两点二面", now.toISOString()), "2026-11-02T06:00:00.000Z");
  assert.equal(resolveMessageTime("明天下午两点半", now.toISOString()), "2026-11-02T06:30:00.000Z");
  assert.equal(resolveMessageTime("下周一下午", now.toISOString()), null);
  assert.equal(resolveMessageTime("周一两点", now.toISOString()), null);
  assert.equal(resolveMessageTime("2026-11-02T14:00:00Z", now.toISOString()), "2026-11-02T14:00:00.000Z");
  assert.equal(resolveMessageTime("昨天下午两点", now.toISOString()), "2026-10-31T06:00:00.000Z");
  const { repo } = setup(); const missing = { ...parsed(), interviewTime: null, interviewResult: null, jobTitle: null };
  assert.equal(matchApplications(repo.load(), missing).requiresSelection, true);
  await assert.rejects(repo.confirmMessage(confirmation(repo, missing)), /结果|日期/);
});

test("stale state and failed storage writes cannot partially commit", async () => {
  const { repo, storage, values } = setup(); const input = confirmation(repo);
  repo.updateApplication("APP-1", { stage: "一面", status: "已通过", interview: "已完成", note: "另一项人工操作" });
  const current = values.get(STORAGE_KEY); await assert.rejects(repo.confirmMessage(input), /状态已变化/); assert.equal(values.get(STORAGE_KEY), current);
  const fresh = confirmation(repo); storage.setItem = () => { throw new Error("QuotaExceeded"); };
  await assert.rejects(repo.confirmMessage(fresh), /Quota/); assert.equal(values.get(STORAGE_KEY), current);
});

test("unmatched candidates are never created and hallucinated evidence is rejected", async () => {
  const { repo } = setup(); const unknown = { ...parsed(), candidateName: "不存在的模拟候选人" };
  assert.equal(matchApplications(repo.load(), unknown).options.length, 0);
  await assert.rejects(repo.confirmMessage(confirmation(repo, unknown)), /匹配申请/);
  const input = { message: parsed().evidence, messageAt: now.toISOString(), timeZone: "Asia/Shanghai" };
  assert.throws(() => validateExtraction({ events: [{ ...parsed(), evidence: "模型编造的原文" }] }, input), /原文证据/);
  const corrected = validateExtraction({ events: [{ ...parsed(), interviewer: "虚构面试官", interviewTime: "2026-11-03T00:00:00Z" }] }, input)[0];
  assert.equal(corrected.event.interviewer, null);
  assert.equal(corrected.event.interviewTime, "2026-11-02T06:00:00.000Z");
});
