/* eslint-disable @typescript-eslint/no-require-imports -- Existing Node test runner and TypeScript bridge. */
require("../scripts/load-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createFeedbackExtractor } = require("../src/messages/extract.ts");
const { feedbackRequestSchema, feedbackInputIssue } = require("../src/messages/schema.ts");
const { createParseCache } = require("../src/messages/parse-cache.ts");
const { manualFeedbackSource } = require("../src/messages/manual.ts");
const { matchApplications, proposeChange } = require("../src/messages/workflow.ts");
const { resolveMessageTime } = require("../src/messages/time.ts");
const { RecruitmentRepository, STORAGE_KEY } = require("../src/data/repository.ts");
const { selectApplications } = require("../src/data/selectors.ts");
const now = new Date("2026-11-01T10:00:00+08:00");
const input = { message: "张三一面通过", messageAt: now.toISOString(), timeZone: "Asia/Shanghai" };
const compact = { candidateId: null, candidateName: "张三", jobTitle: null, completedStage: "一面", interviewResult: "通过", nextStage: null, timeEvidence: null, interviewer: null, remarks: null, evidence: input.message };
const config = () => ({ baseUrl: "https://fixture.invalid", chatModel: "fixture-model" });

test("short feedback uses compact JSON, keeps evidence validation, and produces an editable proposal", async () => {
  const extract = createFeedbackExtractor({ config, complete: async () => ({ events: [compact] }) });
  const result = await extract(input);
  assert.equal(result.events[0].event.eventType, "面试反馈");
  assert.equal(result.events[0].event.interviewTime, null);
  const { repo } = fixture(); const data = repo.load();
  const matched = matchApplications(data, result.events[0].event);
  assert.ok(matched.options.some(a => a.id === "APP-1"));
  assert.equal(matched.requiresSelection, true); // Missing job still requires human confirmation.
  const modified = { ...result.events[0].event, interviewResult: "待定" };
  assert.equal(proposeChange(data, data.applications[0], result.events[0].event, now).target.status, "已通过");
  assert.equal(proposeChange(data, data.applications[0], modified, now).target.status, "待处理");
});

test("exact content and time context share concurrent parses, with bounded expiry and immutable results", async () => {
  let calls = 0, clock = 0;
  const extract = createFeedbackExtractor({ config, now: () => clock, complete: async () => { calls++; return { events: [compact] }; } });
  const [first] = await Promise.all([extract(input), extract(input)]);
  assert.equal(calls, 1);
  first.events[0].event.candidateName = "已编辑";
  assert.equal((await extract(input)).events[0].event.candidateName, "张三");
  assert.equal(calls, 1);
  await extract({ ...input, messageAt: "2026-11-02T10:00:00+08:00" }); assert.equal(calls, 2);
  clock = 300001; await extract(input); assert.equal(calls, 3);
});

test("invalid or irrelevant feedback consumes zero model calls; failed calls are not cached", async () => {
  let calls = 0;
  const extract = createFeedbackExtractor({ config, complete: async () => { calls++; throw new Error("unavailable"); } });
  assert.equal(feedbackRequestSchema.safeParse({ message: "张三一面通过" }).success, true);
  assert.equal(feedbackRequestSchema.parse({ message: "张三一面通过" }).timeZone, "Asia/Shanghai");
  assert.equal(feedbackRequestSchema.safeParse({ message: "x".repeat(801) }).success, false);
  for (const message of ["", "今天天气晴朗", "x".repeat(801)]) {
    assert.ok(feedbackInputIssue(message));
    if (message) assert.equal((await extract({ ...input, message })).skipped, true);
  }
  assert.equal(calls, 0);
  await assert.rejects(extract(input), /unavailable/); await assert.rejects(extract(input), /unavailable/);
  assert.equal(calls, 2);
});

test("client result cache separates explicit/current contexts, expires and does not retain edited fields", () => {
  let clock = 0; const cache = createParseCache(() => clock);
  const key = JSON.stringify([input.message, input.messageAt]);
  cache.set(key, compact, 60000);
  const cached = cache.get(key); cached.interviewResult = "未通过";
  assert.equal(cache.get(key).interviewResult, "通过");
  assert.equal(cache.get(JSON.stringify([input.message, "server-current"])), undefined);
  clock = 60000; assert.equal(cache.get(key), undefined);
});

test("daypart alone uses the reference date and does not invent a next-day interview", () => {
  assert.equal(resolveMessageTime("下午两点", now.toISOString()), "2026-11-01T06:00:00.000Z");
  assert.equal(resolveMessageTime("下周一14:00", now.toISOString()), "2026-11-02T06:00:00.000Z");
  assert.equal(resolveMessageTime("明天9:00", now.toISOString()), "2026-11-02T01:00:00.000Z");
  assert.equal(resolveMessageTime("明天下午", now.toISOString()), null);
});

function fixture() {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const repo = new RecruitmentRepository(storage, () => now); const data = repo.load();
  data.candidates[0].name = "张三";
  Object.assign(data.applications[0], { stage: "一面", status: "待处理", interview: "已安排" });
  storage.setItem(STORAGE_KEY, JSON.stringify(data)); return { repo, storage };
}

test("manual entry never invokes fetch/LLM and reuses identity, flow, history, persistence and idempotency", async () => {
  const originalFetch = global.fetch; let requests = 0;
  global.fetch = async () => { requests++; throw new Error("Manual entry must be offline"); };
  try {
    const { repo, storage } = fixture(); const data = repo.load(); const application = data.applications[0];
    const fields = { ...compact, eventType: "面试反馈", interviewTime: "2026-11-02T06:00:00Z", nextStage: "二面", interviewer: "李经理" };
    const source = manualFeedbackSource(data, application.id, fields, input.messageAt);
    const command = { message: source.input, original: source.event, event: source.event, applicationId: application.id, expected: { stage: application.stage, status: application.status, interview: application.interview, updatedAt: application.updatedAt }, mode: "manual", acknowledged: true, confirmationNote: "手动核对确认" };
    const saved = await repo.confirmMessage(command);
    assert.equal(saved.applications[0].stage, "二面"); assert.equal(saved.events.at(-1).source.mode, "manual");
    assert.equal(saved.events.at(-1).interviewChanges.length, 2);
    assert.equal(requests, 0);
    const repeated = await repo.confirmMessage({ ...command, message: { ...source.input, messageAt: "2026-11-01T11:00:00+08:00" } });
    assert.equal(repeated.events.length, saved.events.length); assert.equal(repeated.interviews.length, saved.interviews.length);
    const reloaded = new RecruitmentRepository(storage, () => now).load();
    assert.equal(selectApplications(reloaded).find(a => a.applicationId === application.id).stage, "二面");
    assert.equal(reloaded.events.at(-1).source.mode, "manual");
  } finally { global.fetch = originalFetch; }
});
