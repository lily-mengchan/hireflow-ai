/* eslint-disable @typescript-eslint/no-require-imports -- Run TypeScript domain tests with Node's built-in runner, without another test dependency. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  module._compile(outputText, filename);
};
const { RecruitmentRepository, STORAGE_KEY, validateData } = require("../src/data/repository.ts");
const { selectApplications, selectDashboard, selectHiredCount, selectJobs } = require("../src/data/selectors.ts");
const now = new Date("2026-11-01T10:00:00+08:00");
function setup() {
  const values = new Map(); let id = 0;
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const repo = new RecruitmentRepository(storage, () => now, () => `test-${++id}`);
  return { repo, storage, values };
}

test("initialization persists valid normalized seed with unique candidates and independent applications", () => {
  const { repo, values } = setup(); const data = repo.load(); validateData(data);
  assert.equal(data.jobs.length, 6); assert.equal(data.candidates.length, 16);
  assert.equal(data.applications.length, 17); assert.ok(data.interviews.length > 0);
  assert.equal(new Set(data.candidates.map(c => c.id)).size, data.candidates.length);
  assert.equal(new Set(data.applications.map(a => a.stage)).size, 6);
  assert.deepEqual(JSON.parse(values.get(STORAGE_KEY)), data);
});

test("create, reload and edit a job; shared selectors use actual counts", () => {
  const { repo, storage } = setup(); const initial = repo.load();
  const input = { ...initial.jobs[0] }; delete input.id; delete input.created;
  const created = repo.saveJob({ ...input, title: "模拟新岗位" });
  const newId = created.jobs[0].id;
  assert.equal(created.jobs.length, initial.jobs.length + 1);
  assert.equal(selectDashboard(created, now).candidateCount, 16);
  const refreshed = new RecruitmentRepository(storage).load();
  assert.equal(refreshed.jobs[0].title, "模拟新岗位");
  const edited = repo.saveJob({ ...input, title: "模拟编辑岗位", status: "已暂停" }, newId);
  assert.equal(edited.jobs.find(j => j.id === newId).status, "已暂停");
  assert.equal(selectJobs(edited).find(j => j.id === newId).applicants, 0);
  assert.equal(edited.events.at(-1).type, "job-updated");
});

test("application changes survive refresh, preserve before/after history and leave a second job unchanged", () => {
  const { repo, storage } = setup(); const initial = repo.load();
  const second = structuredClone(initial.applications.find(a => a.id === "APP-SECOND"));
  const before = selectDashboard(initial, now);
  const changed = repo.updateApplication("APP-1", { stage: "Offer", status: "已通过", interview: "已完成", note: "模拟面试通过，发放 Offer" });
  assert.equal(changed.events.length, initial.events.length + 1);
  assert.equal(changed.events.at(-1).before.stage, "HR 初筛");
  assert.equal(changed.events.at(-1).after.stage, "Offer");
  assert.deepEqual(changed.applications.find(a => a.id === second.id), second);
  const dashboard = selectDashboard(changed, now);
  assert.equal(dashboard.offerCount, before.offerCount + 1);
  assert.equal(dashboard.candidateCount, before.candidateCount);
  assert.equal(dashboard.pendingCount, before.pendingCount); // HR/business screening is not a formal interview.
  assert.equal(selectJobs(changed).find(j => j.id === "JOB-001").hired, 1);
  const reloaded = new RecruitmentRepository(storage).load();
  assert.equal(selectApplications(reloaded).find(a => a.applicationId === "APP-1").stage, "Offer");
  assert.equal(selectApplications(reloaded).find(a => a.applicationId === "APP-1").history.at(-1).note, "模拟面试通过，发放 Offer");
  const rejected = repo.updateApplication("APP-SECOND", { stage: "业务复筛", status: "已淘汰", interview: "待安排", note: "结束第二份岗位申请" });
  assert.equal(selectDashboard(rejected, now).pendingCount, before.pendingCount); // Rejecting a business-screening application does not change formal interview counts.
});

test("completed interviews keep the scheduled record and append a recruitment event", () => {
  const { repo } = setup(); const data = repo.load();
  const scheduled = data.interviews.find(i => i.status === "已安排");
  const application = data.applications.find(a => a.id === scheduled.applicationId);
  const changed = repo.updateApplication(application.id, { stage: application.stage, status: "已通过", interview: "已完成", note: "模拟面试完成" });
  assert.equal(changed.interviews.find(i => i.id === scheduled.id).status, "已完成");
  assert.equal(changed.interviews.find(i => i.id === scheduled.id).scheduledAt, scheduled.scheduledAt);
  assert.equal(changed.events.length, data.events.length + 1);
});

test("invalid stages and template changes do not overwrite persistent data", () => {
  const { repo, values } = setup(); const data = repo.load(); const raw = values.get(STORAGE_KEY);
  assert.throws(() => repo.updateApplication("APP-1", { stage: "不存在的阶段", status: "待处理", interview: "待安排", note: "无效阶段" }));
  assert.equal(values.get(STORAGE_KEY), raw);
  const job = { ...data.jobs[0] }; const id = job.id; delete job.id; delete job.created;
  assert.throws(() => repo.saveJob({ ...job, workflowId: "design" }, id));
  assert.equal(values.get(STORAGE_KEY), raw);
});

test("corrupt storage is preserved until explicit reset; reset restores all entities and histories", () => {
  const { repo, values } = setup(); const initial = repo.load();
  values.set(STORAGE_KEY, "broken json"); assert.throws(() => repo.load());
  assert.equal(values.get(STORAGE_KEY), "broken json");
  assert.deepEqual(repo.reset(), initial);
  const invalid = structuredClone(initial); invalid.applications[0].candidateId = "missing";
  values.set(STORAGE_KEY, JSON.stringify(invalid)); assert.throws(() => repo.load());
  assert.deepEqual(repo.reset(), initial);
});

test("write failures surface to the caller and keep persisted data unchanged", () => {
  const { storage, repo, values } = setup(); const data = repo.load(); const raw = values.get(STORAGE_KEY);
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  assert.throws(() => repo.updateApplication(data.applications[0].id, { stage: "一面", status: "待处理", interview: "已安排", note: "模拟安排面试" }), /Quota/);
  assert.equal(values.get(STORAGE_KEY), raw);
});

test("hired totals ignore missing or invalid legacy job counters and follow application outcomes", () => {
  const { repo } = setup(); const data = repo.load();
  data.jobs[0].hired = undefined;
  data.jobs[1].hired = NaN;
  data.jobs[2].hired = "not-a-number";
  const expected = data.applications.filter(a => a.stage === "Offer" && a.status === "已通过").length;
  assert.equal(selectHiredCount(data), expected);
  assert.equal(selectJobs(data).reduce((total, job) => total + job.hired, 0), expected);
  data.applications = [];
  assert.equal(selectHiredCount(data), 0);
  assert.ok(selectJobs(data).every(job => job.hired === 0));
});
