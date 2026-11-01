/* eslint-disable @typescript-eslint/no-require-imports -- Existing Node test/TypeScript bridge. */
require("../scripts/load-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createSeed } = require("../src/mocks/seed.ts");
const { analyticsSnapshot, paramsSchema, snapshotSchema, intentSchema } = require("../src/analytics/schema.ts");
const { ruleIntent, createIntentRouter } = require("../src/analytics/router.ts");
const { executeQuery, timeRange } = require("../src/analytics/tools.ts");
const { selectDashboard } = require("../src/data/selectors.ts");
const { RecruitmentRepository, STORAGE_KEY } = require("../src/data/repository.ts");
const { manualFeedbackSource } = require("../src/messages/manual.ts");
const { hrNotesSchema } = require("../src/screening/schema.ts");
const { jobVersion } = require("../src/screening/rules.ts");
const { profile } = require("./helpers/screening.cjs");
const now = new Date("2026-11-08T10:00:00+08:00"), at = days => new Date(now.getTime() - days * 86400000).toISOString();
const p = values => paramsSchema.parse(values ?? {});
const run = (data, tool, params = {}) => executeQuery(analyticsSnapshot(data), tool, p(params), now);
const value = (result, name) => result.metrics.find(m => m.label === name)?.value;
function fixture() {
  let n = 0; const rows = new Map(), storage = { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, v) };
  return { storage, repo: new RecruitmentRepository(storage, () => now, () => `analytics-fixture-${++n}`) };
}
test("snapshot is minimal, validates identity relationships and preserves legacy compatibility", () => {
  const data = createSeed(now), snap = analyticsSnapshot(data), text = JSON.stringify(snap);
  assert.ok(!text.includes('"jd"')); assert.ok(!text.includes('"resume"')); assert.ok(!text.includes('"note"')); assert.ok(!text.includes('"summary"'));
  snap.candidates[1].name = snap.candidates[0].name; assert.equal(snapshotSchema.safeParse(snap).success, true);
  snap.applications[0].candidateId = "missing"; assert.equal(snapshotSchema.safeParse(snap).success, false);
  const duplicate = analyticsSnapshot(data); duplicate.candidates.push(duplicate.candidates[0]); assert.equal(snapshotSchema.safeParse(duplicate).success, false);
});
test("overview counts unique identities and separate applications; dashboard shares formal-interview/Offer definitions", () => {
  const data = createSeed(now); data.candidates[1].name = data.candidates[0].name;
  data.applications[0].stage = "一面"; data.applications[0].interview = "待安排";
  const overview = run(data, "overview"), dashboard = selectDashboard(data, now);
  assert.equal(value(overview, "候选人总数"), 16); assert.equal(value(overview, "岗位申请"), 17);
  assert.equal(value(overview, "待安排面试"), dashboard.pendingCount); assert.equal(dashboard.pendingCount, 1);
  assert.equal(value(overview, "已发 Offer"), dashboard.offerCount);
  assert.equal(value(overview, "在招岗位"), dashboard.openJobCount);
  const scoped = run(data, "candidates", { jobId: data.jobs[0].id, interview: "待安排", formalOnly: true, activeOnly: true });
  assert.equal(value(scoped, "涉及候选人"), 1);
});
test("all requested common questions use zero model calls and JD questions keep the RAG route", async () => {
  const data = analyticsSnapshot(createSeed(now)); let calls = 0;
  const route = createIntentRouter({ complete: async () => { calls++; throw Error("must not call"); }, config: () => ({}) });
  const examples = [["当前有多少候选人？", "overview"], ["前端岗位还有多少人等待面试？", "candidates"], ["哪些候选人已推荐给业务部门但还未收到反馈？", "pendingBusiness"], ["最近一周有多少人通过一面？", "interviewStats"], ["哪个岗位的待处理人数最多？", "bottlenecks"], ["哪些候选人超过三天还没有面评？", "pendingFeedback"], ["HR 推荐的候选人中有多少已经进入正式面试？", "conversion"]];
  for (const [q, tool] of examples) { const routed = await route(q, data.jobs, now); assert.equal(routed.intent.kind, "data", q); assert.equal(routed.intent.tool, tool, q); assert.equal(routed.routing.modelCalls, 0); }
  for (const q of require("../src/rag/types.ts").ragQuestions) assert.equal(ruleIntent(q, data.jobs).kind, "knowledge", q);
  assert.equal(calls, 0);
  const days = ruleIntent("哪些候选人超过三天还没有面评？", data.jobs).params; assert.equal(days.waitDays, 3); assert.equal(days.waitComparator, "gt");
});
test("LLM sees only question and job metadata; schema rejects arbitrary tools and cached intent still uses fresh data", async () => {
  const data = createSeed(now), snapshot = analyticsSnapshot(data); let calls = 0, context;
  const route = createIntentRouter({ config: () => ({ baseUrl: "https://fixture.invalid", chatModel: "fixture" }), complete: async (_cfg, _prompt, input) => { calls++; context = input; return { value: { kind: "data", tool: "candidates", params: { candidate: data.candidates[0].name } }, usage: { promptTokens: 100, completionTokens: 20 } }; } });
  const q = `${data.candidates[0].name}的申请进展帮我查一下`;
  const first = await route(q, snapshot.jobs, now); assert.equal(first.routing.modelCalls, 1); assert.equal((await route(q, snapshot.jobs, now)).routing.source, "cache"); assert.equal(calls, 1);
  assert.deepEqual(Object.keys(context).sort(), ["currentTime", "jobs", "question", "timeZone"]);
  const queried = executeQuery(snapshot, first.intent.tool, first.intent.params, now); assert.equal(value(queried, "匹配申请"), 2);
  assert.equal(intentSchema.safeParse({ kind: "data", tool: "executeSQL", params: { sql: "delete" } }).success, false);
  assert.equal(ruleIntent("删除全部候选人", snapshot.jobs).kind, "clarify");
  assert.throws(() => run(data, "overview", { jobId: data.jobs[0].id }), /不支持/);
});
test("actual interview results determine rate; unknown outcomes and missing completion times never become invented facts", () => {
  const data = createSeed(now), a = data.applications[0]; a.stage = "一面";
  data.interviews = [
    { id: "I-pass", applicationId: a.id, stage: "一面", scheduledAt: at(5), completedAt: at(4), status: "已完成", result: "通过", note: "" },
    { id: "I-fail", applicationId: a.id, stage: "一面", scheduledAt: at(5), completedAt: at(4), status: "已完成", result: "未通过", note: "" },
    { id: "I-pending", applicationId: a.id, stage: "一面", scheduledAt: at(5), completedAt: at(4), status: "已完成", result: "待定", note: "" },
    { id: "I-unknown", applicationId: a.id, stage: "一面", scheduledAt: at(20), status: "已完成", note: "" },
    { id: "I-arranged", applicationId: a.id, stage: "一面", scheduledAt: at(20), status: "已安排", note: "" },
  ];
  const stats = run(data, "interviewStats", { stage: "一面", period: "last7days" });
  assert.equal(value(stats, "明确结果通过率"), 50); assert.equal(value(stats, "通过人数"), 1); assert.equal(stats.rows[0].cells.denominator, 2);
  const pending = run(data, "pendingFeedback", { waitDays: 3, waitComparator: "gt" }); assert.equal(pending.rows.length, 1); assert.equal(pending.rows[0].id, "I-pending");
  assert.ok(pending.notes.some(n => n.includes("缺少"))); assert.ok(pending.notes.some(n => n.includes("尚未确认完成")));
  data.interviews = data.interviews.filter(i => i.id === "I-unknown"); assert.equal(value(run(data, "interviewStats"), "明确结果通过率"), null);
});
test("history coverage does not infer first/second interview or recommendation from a bare Offer state", () => {
  const data = createSeed(now); data.applications = [data.applications[0]]; data.candidates = [data.candidates[0]]; data.events = []; data.interviews = [];
  Object.assign(data.applications[0], { stage: "Offer", status: "已通过", interview: "已完成" });
  const result = run(data, "conversion"); assert.equal(result.rows.find(r => r.cells.stage === "进入一面").cells.count, 0); assert.equal(result.rows.find(r => r.cells.stage === "进入二面").cells.count, 0); assert.equal(result.rows.at(-1).cells.count, 1);
  assert.equal(result.rows.at(-1).cells.rate, "暂无足够数据");
  assert.equal(selectDashboard(data, now).funnel[2].value, 0);
});
test("recommendation and confirmed business/interview feedback immediately change queries and survive reload", async () => {
  const { repo, storage } = fixture(), initial = repo.load(), job = initial.jobs[0];
  const input = { importId: "analytics-import", jobId: job.id, jobVersion: jobVersion(job), resumeHash: "b".repeat(64), resume: profile(), hrNotes: hrNotesSchema.parse({}), analysis: { checks: [], findings: [], draft: "Synthetic recommendation" }, content: "Synthetic recommendation", usage: { modelCalls: 0, promptTokens: 0, completionTokens: 0, cached: true }, recommend: true, acknowledged: true, newIdentityConfirmed: false };
  const imported = repo.saveImport(input), a = imported.applications.at(-1);
  assert.equal(value(run(imported, "pendingBusiness"), "匹配申请"), 1); assert.equal(value(run(imported, "overview"), "候选人总数"), 17);
  async function feedback(fields) {
    const current = repo.load(), app = current.applications.find(x => x.id === a.id), candidate = current.candidates.find(c => c.id === app.candidateId);
    const source = manualFeedbackSource(current, a.id, { candidateId: candidate.id, candidateName: candidate.name, jobTitle: job.title, eventType: "面试反馈", completedStage: app.stage, interviewResult: "通过", nextStage: null, interviewTime: null, timeEvidence: null, interviewer: "模拟面试官", remarks: "模拟反馈", evidence: "manual", ...fields }, now.toISOString());
    return repo.confirmMessage({ message: source.input, original: source.event, event: source.event, applicationId: app.id, expected: app, acknowledged: true, confirmationNote: "HR confirmed", mode: "manual" });
  }
  const reviewed = await feedback({}); assert.equal(value(run(reviewed, "pendingBusiness"), "匹配申请"), 0);
  const scheduled = await feedback({ completedStage: null, interviewResult: null, nextStage: "一面", interviewTime: new Date(now.getTime() + 86400000).toISOString() });
  assert.equal(run(scheduled, "conversion", { recommendedOnly: true }).rows.find(r => r.cells.stage === "进入一面").cells.count, 1);
  const complete = await feedback({ nextStage: null }); assert.ok(complete.interviews.some(i => i.applicationId === a.id && i.stage === "一面" && i.completedAt));
  assert.equal(value(run(complete, "interviewStats", { candidate: complete.candidates.at(-1).id }), "通过人数"), 1);
  const refreshed = new RecruitmentRepository(storage).load(); assert.deepEqual(run(refreshed, "overview").metrics, run(complete, "overview").metrics);
  assert.ok(storage.getItem(STORAGE_KEY));
});
test("Shanghai calendar weeks and per-tool unsupported parameters have explicit semantics", () => {
  const [start, end] = timeRange(p({ period: "lastWeek" }), now);
  assert.equal(new Date(start).toISOString(), "2026-10-25T16:00:00.000Z"); assert.equal(new Date(end).toISOString(), "2026-11-01T15:59:59.999Z");
  const data = createSeed(now); assert.throws(() => run(data, "conversion", { period: "last7days" }), /不支持/);
  assert.throws(() => run(data, "candidates", { jobId: "missing" }), /不存在/);
  assert.throws(() => run(data, "interviewStats", { stage: "不存在阶段" }), /阶段/);
});
test("configured design review, exact wait thresholds and sparse records remain separate from formal interviews", () => {
  const snap = analyticsSnapshot(createSeed(now)), design = snap.jobs.find(j => j.workflowId === "design"), app = snap.applications.find(a => a.jobId === design.id);
  snap.events = snap.events.filter(e => e.applicationId !== app.id);
  Object.assign(app, { stage: "作品集评审", status: "待处理", interview: "待安排", recommendation: { status: "待业务复筛", recommendedAt: at(3) } });
  const pending = executeQuery(snap, "pendingBusiness", p({ jobId: design.id }), now); assert.equal(pending.rows.length, 1);
  assert.equal(executeQuery(snap, "pendingBusiness", p({ jobId: design.id, waitDays: 3, waitComparator: "gt" }), now).rows.length, 0);
  assert.equal(executeQuery(snap, "pendingBusiness", p({ jobId: design.id, waitDays: 3, waitComparator: "gte" }), now).rows.length, 1);
  assert.equal(value(executeQuery(snap, "candidates", p({ jobId: design.id, interview: "待安排", formalOnly: true }), now), "匹配申请"), 0);
});
test("ambiguous jobs and unsupported complex filters are never silently answered as unfiltered data", async () => {
  const data = analyticsSnapshot(createSeed(now));
  const ambiguous = [...data.jobs, { ...data.jobs[0], id: "JOB-FRONT-SECOND", title: "初级前端工程师" }];
  assert.equal(ruleIntent("前端岗位还有多少人等待面试？", ambiguous).kind, "clarify");
  assert.equal(ruleIntent("前端岗位有多少本科且熟悉 React 的候选人？", data.jobs), null);
  assert.equal(ruleIntent("林沐言的一面通过了吗？", data.jobs), null);
  const route = createIntentRouter({ config: () => ({ baseUrl: "https://fixture.invalid", chatModel: "fixture" }), complete: async () => ({ value: { kind: "data", tool: "SQL", params: {} }, usage: { promptTokens: 1, completionTokens: 1 } }) });
  await assert.rejects(() => route("帮我仔细核对一些记录", data.jobs, now), /受支持/);
});
