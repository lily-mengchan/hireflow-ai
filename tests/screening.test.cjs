/* eslint-disable @typescript-eslint/no-require-imports -- Existing node:test and TypeScript bridge. */
require("../scripts/load-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createScreeningAnalyzer } = require("../src/screening/analyze.ts");
const { hrNotesSchema, resumeSchema } = require("../src/screening/schema.ts");
const { deterministicChecks, copyRecommendation } = require("../src/screening/rules.ts");
const { RecruitmentRepository, STORAGE_KEY } = require("../src/data/repository.ts");
const { selectDashboard } = require("../src/data/selectors.ts");
const { text, profile } = require("./helpers/screening.cjs");
function fixture() {
  const rows = new Map(); let id = 0;
  const storage = { getItem: key => rows.get(key) ?? null, setItem: (key, value) => rows.set(key, value) };
  const repo = new RecruitmentRepository(storage, () => new Date("2026-11-01T10:00:00+08:00"), () => `screening-fixture-${++id}`);
  const job = repo.load().jobs[0];
  const snapshot = Object.fromEntries(["id", "title", "jd", "location", "education", "experience", "workflowId"].map(k => [k, job[k]]));
  let calls = 0;
  const analyze = createScreeningAnalyzer({ config: () => ({ baseUrl: "https://fixture.invalid", chatModel: "fixture" }), complete: async (_, prompt, body) => {
    calls++;
    return { value: prompt.includes('experienceYears') ? profile() : { findings: [{ jdQuote: body.jd.slice(0, 20), resumeQuote: "React", assessment: "相关" }] }, usage: { promptTokens: 100, completionTokens: 50 } };
  } });
  const input = { text, job: snapshot, hrNotes: hrNotesSchema.parse({ currentBase: "Shanghai", earliestStart: "2026-12-15" }) };
  return { repo, storage, analyze, input, calls: () => calls };
}
function saveInput(result, input, extra = {}) { return { importId: "fixture-import", jobId: input.job.id, jobVersion: result.jobVersion, resumeHash: result.resumeHash, resume: result.resume, hrNotes: input.hrNotes, analysis: result.analysis, usage: result.usage, content: result.analysis.draft, recommend: true, acknowledged: true, ...extra }; }
test("extraction and semantic matching cache independently; notes and JD updates use current data", async () => {
  const f = fixture(); const first = await f.analyze(f.input);
  assert.equal(f.calls(), 2); assert.equal(first.usage.modelCalls, 2); assert.equal(first.usage.promptTokens, 200);
  assert.match(first.analysis.draft, /Shanghai/); assert.match(first.analysis.draft, /2026-12-15/);
  assert.ok(first.analysis.checks.some(c => c.status === "来源冲突"));
  const hit = await f.analyze({ ...f.input, editedResume: first.resume }); assert.equal(hit.usage.modelCalls, 0); assert.equal(f.calls(), 2);
  await f.analyze({ ...f.input, hrNotes: { ...f.input.hrNotes, expectedSalary: "30K" } }); assert.equal(f.calls(), 3);
  const changed = await f.analyze({ ...f.input, job: { ...f.input.job, jd: "New requirements: React admin dashboard" } });
  assert.equal(f.calls(), 4); assert.notEqual(first.jobVersion, changed.jobVersion); assert.match(changed.analysis.draft, /New requirements/);
});
test("missing information stays unknown, invalid quotes are rejected, edited facts keep HR source", async () => {
  const checks = deterministicChecks(profile(), hrNotesSchema.parse({}), fixture().input.job);
  assert.equal(checks.find(c => c.label === "工作地点意愿").status, "待核实");
  const f = fixture(), result = await f.analyze(f.input), edited = structuredClone(result.resume);
  edited.education = { value: "本科", evidence: null, source: "HR_NOTE" };
  const next = await f.analyze({ ...f.input, editedResume: edited }); assert.equal(next.resume.education.source, "HR_NOTE");
  edited.school.evidence = "invented evidence";
  await assert.rejects(() => f.analyze({ ...f.input, editedResume: edited }), /证据|依据/);
});
test("HR confirmation creates unique candidate/application, review stage and persistent history atomically", async () => {
  const f = fixture(), result = await f.analyze(f.input), before = f.repo.load();
  const input = saveInput(result, f.input); const saved = f.repo.saveImport(input);
  const application = saved.applications.at(-1), candidate = saved.candidates.at(-1);
  assert.equal(application.stage, "业务复筛"); assert.equal(application.interview, "待安排"); assert.equal(application.recommendation.status, "待业务复筛");
  assert.equal(selectDashboard(saved).candidateCount, before.candidates.length + 1);
  assert.equal(f.repo.load().applications.at(-1).recommendation.content, input.content);
  assert.equal(f.repo.saveImport(input).events.length, saved.events.length);
  assert.throws(() => f.repo.saveImport({ ...input, importId: "repeat" }), /简历已导入/);
  assert.throws(() => f.repo.saveImport({ ...input, importId: "repeat", existingCandidateId: candidate.id }), /已有该岗位申请/);
});
test("same-name ambiguity, different jobs, draft promotion and stale JD guards", async () => {
  const f = fixture(), result = await f.analyze(f.input), data = f.repo.load();
  data.candidates[0].name = result.resume.name.value; f.storage.setItem(STORAGE_KEY, JSON.stringify(data));
  const input = saveInput(result, f.input, { recommend: false });
  assert.throws(() => f.repo.saveImport(input), /同名/);
  const draft = f.repo.saveImport({ ...input, newIdentityConfirmed: true }); const candidateId = draft.candidates.at(-1).id;
  assert.equal(draft.applications.at(-1).stage, "HR 初筛");
  const promoted = f.repo.saveImport({ ...input, importId: "confirmed", recommend: true, existingCandidateId: candidateId });
  assert.equal(promoted.applications.at(-1).stage, "业务复筛");
  assert.equal(promoted.candidates.length, draft.candidates.length);
  const other = { ...f.input, job: { ...f.input.job, id: data.jobs[1].id, title: data.jobs[1].title, jd: data.jobs[1].jd } };
  const analysis = await f.analyze(other);
  const second = f.repo.saveImport(saveInput(analysis, other, { importId: "second-job", existingCandidateId: candidateId }));
  assert.equal(second.applications.filter(a => a.candidateId === candidateId).length, 2);
  const job = second.jobs[0]; f.repo.saveJob({ ...job, jd: job.jd + "\nnew JD" }, job.id);
  assert.throws(() => f.repo.saveImport({ ...input, importId: "stale", existingCandidateId: candidateId }), /JD/);
});
test("storage failures leave no partial candidate and copied content excludes contact fields", async () => {
  const f = fixture(), result = await f.analyze(f.input), input = saveInput(result, f.input), original = f.storage.getItem(STORAGE_KEY);
  const broken = new RecruitmentRepository({ getItem: f.storage.getItem, setItem() { throw Error("quota"); } });
  assert.throws(() => broken.saveImport(input), /quota/); assert.equal(f.storage.getItem(STORAGE_KEY), original);
  const copy = copyRecommendation("C-fixture", f.input.job.title, "Good React experience. contact demo@example.invalid 13800000000", f.input.hrNotes);
  assert.match(copy, /C-fixture/); assert.ok(!copy.includes("demo@example.invalid")); assert.ok(!copy.includes("13800000000"));
});
test("explicit numeric strings normalize without inventing missing work years", () => {
  const p = profile(); p.experienceYears.value = "4 years";
  assert.equal(resumeSchema.parse(p).experienceYears.value, 4);
  p.experienceYears.value = null; assert.equal(resumeSchema.parse(p).experienceYears.value, null);
  p.experienceYears.value = "several years"; assert.equal(resumeSchema.safeParse(p).success, false);
});
test("PDF extension, size and signature errors are rejected locally before importing the parser", async () => {
  const { extractPdf } = require("../src/screening/pdf.ts");
  await assert.rejects(() => extractPdf(new File(["text"], "resume.txt", { type: "text/plain" })), /PDF/);
  await assert.rejects(() => extractPdf(new File(["not a PDF"], "resume.pdf", { type: "application/pdf" })), /有效/);
  await assert.rejects(() => extractPdf(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.pdf", { type: "application/pdf" })), /5 MB/);
});
