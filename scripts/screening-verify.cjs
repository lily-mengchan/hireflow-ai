/* eslint-disable @typescript-eslint/no-require-imports -- Real model acceptance with synthetic data, no resume logs. */
require("./load-ts.cjs");
require("@next/env").loadEnvConfig(process.cwd());
const { createScreeningAnalyzer } = require("../src/screening/analyze.ts");
const { completeMeasured } = require("../src/rag/model.ts");
const { resumeSchema, semanticSchema, hrNotesSchema } = require("../src/screening/schema.ts");
const { createSeed } = require("../src/mocks/seed.ts");
const { evaluateConditions } = require("../src/screening/conditions.ts");
const { text } = require("../tests/helpers/screening.cjs");
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
async function main() {
  const analyze = createScreeningAnalyzer({ complete: async (...args) => {
    const response = await completeMeasured(...args);
    const validation = (args[1].includes("experienceYears") ? resumeSchema : semanticSchema).safeParse(response.value);
    if (!validation.success) console.log("Schema diagnostics", validation.error.issues.map(i => ({ path: i.path, code: i.code, message: i.message })));
    return response;
  } });
  const jobs = createSeed().jobs, job = Object.fromEntries(["id", "title", "jd", "location", "education", "experience", "workflowId"].map(k => [k, jobs[0][k]]));
  const input = { text, job, hrNotes: hrNotesSchema.parse({ currentBase: "Shanghai", earliestStart: "2026-12-15" }), preScreening: {...evaluateConditions(job.id, [], {}), overrideReason:"无预设条件，人工核对后继续"} };
  const first = await analyze(input); assert.equal(first.resume.name.value, "Demo Candidate Q");
  assert.ok(first.analysis.checks.some(c => c.status === "来源冲突")); assert.ok(first.analysis.draft.includes("2026-12-15"));
  const cached = await analyze(input); assert.equal(cached.usage.modelCalls, 0);
  const anotherJob = { ...job, id: jobs[2].id, title: jobs[2].title, jd: jobs[2].jd, location: jobs[2].location, workflowId: jobs[2].workflowId };
  const second = await analyze({ ...input, job: anotherJob, preScreening: {...evaluateConditions(anotherJob.id, [], {}), overrideReason:"切换岗位后人工核对"}, editedResume: first.resume });
  assert.notEqual(second.jobVersion, first.jobVersion); assert.equal(second.usage.modelCalls, 1);
  assert.ok(second.analysis.draft.includes(anotherJob.title));
  await mkdir(".local", { recursive: true }); await writeFile(".local/screening-live-verification.json", JSON.stringify({ verifiedAt: new Date().toISOString(), checks: ["real-structured-extraction", "real-JD-semantic-analysis", "HR-notes-and-conflicts", "exact-request-cache", "switch-job-reuses-profile"], usage: [first.usage, cached.usage, second.usage] }, null, 2));
  console.log("PASS real screening chain, cache and different JD", { calls: first.usage.modelCalls + second.usage.modelCalls });
}
main().catch(e => { console.error(e.issues ? e.issues.map(i => ({ path: i.path, code: i.code, message: i.message })) : e.message); process.exitCode = 1; });
