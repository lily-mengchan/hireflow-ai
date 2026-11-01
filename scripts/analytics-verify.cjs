/* eslint-disable @typescript-eslint/no-require-imports -- Real intent verification using synthetic ATS data only. */
require("./load-ts.cjs");
require("@next/env").loadEnvConfig(process.cwd());
const assert = require("node:assert/strict");
const { mkdir, writeFile } = require("node:fs/promises");
const { createSeed } = require("../src/mocks/seed.ts");
const { analyticsSnapshot } = require("../src/analytics/schema.ts");
const { createIntentRouter } = require("../src/analytics/router.ts");
const { executeQuery } = require("../src/analytics/tools.ts");
async function main() {
  const now = new Date(), data = createSeed(now), snapshot = analyticsSnapshot(data), route = createIntentRouter();
  const question = "想核对一下前端这个岗，最近七天已做完的第一轮面谈到底有多少通过和没过";
  const first = await route(question, snapshot.jobs, now);
  assert.equal(first.intent.kind, "data"); assert.equal(first.intent.tool, "interviewStats"); assert.equal(first.intent.params.jobId, "JOB-001"); assert.equal(first.intent.params.stage, "一面"); assert.equal(first.intent.params.period, "last7days");
  assert.equal(first.routing.modelCalls, 1);
  const before = executeQuery(snapshot, first.intent.tool, first.intent.params, now);
  assert.equal(before.metrics.find(m => m.label === "明确结果通过率").value, null);
  const second = await route(question, snapshot.jobs, now); assert.equal(second.routing.modelCalls, 0);
  snapshot.interviews.push({ id: "SYNTHETIC-ANALYTICS-PASS", applicationId: snapshot.applications[0].id, stage: "一面", status: "已完成", scheduledAt: now.toISOString(), completedAt: now.toISOString(), result: "通过" });
  const after = executeQuery(snapshot, second.intent.tool, second.intent.params, now);
  assert.equal(after.metrics.find(m => m.label === "通过人数").value, 1);
  await mkdir(".local", { recursive: true }); await writeFile(".local/analytics-live-verification.json", JSON.stringify({ verifiedAt: now.toISOString(), checks: ["real-complex-intent", "validated-parameters", "unknown-rate-stays-unknown", "intent-cache", "fresh-snapshot-computation"], routing: [first.routing, second.routing] }, null, 2));
  console.log("PASS real intent, cache, validated tool and fresh snapshot");
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
