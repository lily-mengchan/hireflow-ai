/* eslint-disable @typescript-eslint/no-require-imports -- Use Node's test runner and the existing TypeScript bridge. */
require("../scripts/load-ts.cjs");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { chunkJob, corpusVersion, cosineSimilarity, parseJobs } = require("../src/rag/chunks.ts");
const { verifyEvidence } = require("../src/rag/answer.ts");
const { indexKey, createIndexResolver } = require("../src/rag/index.ts");
const { jobs } = require("../src/mocks/data.ts");
const { jobSnapshot } = require("../src/rag/types.ts");

test("section chunks preserve original JD wording and distinguish saved job fields", () => {
  const job = { ...jobs[0], jd: "岗位职责\n开发 React 页面。\n任职要求\n本科，3 年经验。\n加分项\nAI 项目经验优先。\n工作条件\n周末双休。" };
  const chunks = chunkJob(job);
  assert.deepEqual(chunks.map(c => c.section), ["岗位职责", "任职要求", "加分项", "工作条件", "工作条件（岗位字段）"]);
  assert.ok(chunks.filter(c => c.origin === "jd").every(c => job.jd.includes(c.content)));
  assert.ok(chunks.find(c => c.origin === "fields").content.includes("工作地点：上海"));
  assert.equal(new Set(chunks.map(c => c.chunkId)).size, chunks.length);
});

test("long chunks are bounded and stable; edits to JD or job fields invalidate the version", () => {
  const job = { ...jobs[0], jd: "任职要求\n" + "开发。".repeat(800) };
  const chunks = chunkJob(job);
  assert.ok(chunks.every(c => c.content.length <= 700));
  assert.deepEqual(chunkJob(job), chunks);
  assert.notEqual(chunkJob({ ...job, jd: job.jd + "新要求。" })[0].version, chunks[0].version);
  assert.notEqual(chunkJob({ ...job, location: "杭州" })[0].version, chunks[0].version);
});

test("snapshot order does not matter, but deletion and embedding model changes invalidate the index", () => {
  const snapshot = jobSnapshot(jobs);
  assert.equal(corpusVersion(snapshot), corpusVersion([...snapshot].reverse()));
  assert.notEqual(corpusVersion(snapshot), corpusVersion(snapshot.slice(1)));
  assert.notEqual(indexKey(snapshot, { signature: "provider-model-a" }), indexKey(snapshot, { signature: "provider-model-b" }));
  assert.ok(!parseJobs(snapshot.slice(1)).flatMap(chunkJob).some(c => c.jobId === snapshot[0].id));
});

test("cosine ranking uses actual vector arithmetic and rejects incompatible vectors", () => {
  // Small fixed mathematical fixtures, never used as model embeddings by the application.
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  assert.throws(() => cosineSimilarity([1], [1, 2]));
  assert.throws(() => cosineSimilarity([0, 0], [1, 0]));
  assert.throws(() => cosineSimilarity([NaN, 1], [1, 0]));
});

test("model evidence must match retrieved source IDs and exact original text", () => {
  const chunk = { ...chunkJob(jobs[0])[1], score: .8, quote: "" };
  assert.deepEqual(verifyEvidence({ items: [] }, [chunk]), []);
  const quote = chunk.content.split("\n")[0];
  assert.equal(verifyEvidence({ items: [{ chunkId: chunk.chunkId, quote }] }, [chunk])[0].quote, quote);
  assert.throws(() => verifyEvidence({ items: [{ chunkId: "made-up-id", quote }] }, [chunk]));
  assert.throws(() => verifyEvidence({ items: [{ chunkId: chunk.chunkId, quote: "每月补贴五千元" }] }, [chunk]));
});

test("request validation rejects duplicate IDs, invalid fields and oversized snapshots", () => {
  assert.throws(() => parseJobs([jobs[0], jobs[0]]));
  assert.throws(() => parseJobs([{ ...jobs[0], jd: " " }]));
  assert.throws(() => parseJobs([{ ...jobs[0], jd: "a".repeat(10001) }]));
  assert.throws(() => parseJobs(Array(101).fill(jobs[0])));
  assert.deepEqual(parseJobs([]), []);
});

const config = { signature: "test-model-v1", embeddingModel: "fixture-model", dimensions: 2 };
function embeddingFixture() {
  const calls = [];
  return {
    calls,
    // Fixed math fixtures for cache tests only; live verification uses the actual provider.
    embed: async (_config, inputs) => { calls.push(inputs); return inputs.map(() => [1, 2]); },
  };
}

test("read-only filesystem and missing files both fall back to memory without filesystem writes", async () => {
  const fs = require("node:fs/promises");
  const originals = { mkdir: fs.mkdir, writeFile: fs.writeFile, rename: fs.rename };
  let writes = 0;
  for (const name of Object.keys(originals)) fs[name] = async () => { writes++; throw new Error("EROFS"); };
  try {
    for (const code of ["EROFS", "ENOENT", "EACCES"]) {
      const fixture = embeddingFixture();
      const resolver = createIndexResolver({ embed: fixture.embed, readIndex: async () => { throw Object.assign(new Error(code), { code }); } });
      const index = await resolver([jobs[0]], config);
      assert.ok(index.chunks.length > 0);
      assert.equal(index.dimension, 2);
      assert.equal(fixture.calls.length, 1);
    }
    assert.equal(writes, 0);
  } finally { Object.assign(fs, originals); }
});

test("same snapshot and concurrent callers share embeddings; only changed text is embedded", async () => {
  const fixture = embeddingFixture();
  const resolver = createIndexResolver({ embed: fixture.embed, readIndex: async () => undefined });
  const [first, concurrent] = await Promise.all([resolver([jobs[0]], config), resolver([jobs[0]], config)]);
  assert.strictEqual(first, concurrent);
  assert.equal(fixture.calls.length, 1);
  assert.strictEqual(await resolver([jobs[0]], config), first);
  const edited = { ...jobs[0], jd: jobs[0].jd.replaceAll("React", "Vue") };
  const updated = await resolver([edited], config);
  assert.notEqual(updated.corpusVersion, first.corpusVersion);
  assert.equal(fixture.calls[1].length, 2); // Responsibilities and requirements changed; saved fields did not.
  assert.ok(!updated.chunks.some(c => c.content.includes("React")));
  assert.ok(updated.chunks.every(c => c.version === chunkJob(edited)[0].version));
});

test("new and deleted jobs use the current snapshot; an empty index needs no embeddings", async () => {
  const fixture = embeddingFixture();
  const resolver = createIndexResolver({ embed: fixture.embed, readIndex: async () => undefined });
  await resolver([jobs[0]], config);
  const added = await resolver([jobs[0], jobs[1]], config);
  assert.ok(added.chunks.some(c => c.jobId === jobs[1].id));
  assert.equal(fixture.calls[1].length, chunkJob(jobs[1]).length);
  const count = fixture.calls.length;
  const removed = await resolver([jobs[1]], config);
  assert.ok(!removed.chunks.some(c => c.jobId === jobs[0].id));
  assert.equal(fixture.calls.length, count);
  const empty = await resolver([], config);
  assert.equal(empty.chunks.length, 0);
  assert.equal(fixture.calls.length, count);
});

test("valid read-only JSON seed skips embeddings; cold resolvers never need earlier memory", async () => {
  const firstFixture = embeddingFixture();
  const seed = await createIndexResolver({ embed: firstFixture.embed, readIndex: async () => undefined })([jobs[0]], config);
  const fixture = embeddingFixture();
  const seeded = createIndexResolver({ embed: fixture.embed, readIndex: async () => seed });
  assert.deepEqual(await seeded([jobs[0]], config), seed);
  assert.equal(fixture.calls.length, 0);
  const cold = createIndexResolver({ embed: fixture.embed, readIndex: async () => undefined });
  assert.equal((await cold([jobs[0]], config)).chunks.length, seed.chunks.length);
  assert.equal(fixture.calls.length, 1);
  // A seed for an old snapshot is rejected rather than reused as current content.
  const edited = { ...jobs[0], location: "杭州" };
  const refreshed = await seeded([edited], config);
  assert.equal(fixture.calls.at(-1).length, 1);
  assert.ok(refreshed.chunks.some(c => c.content.includes("工作地点：杭州")));
});

test("overlapping different snapshots share in-flight chunks and failed calls can be retried", async () => {
  const fixture = embeddingFixture();
  const resolver = createIndexResolver({ embed: fixture.embed, readIndex: async () => undefined });
  await Promise.all([resolver([jobs[0]], config), resolver([jobs[0], jobs[1]], config)]);
  const inputs = fixture.calls.flat();
  assert.equal(new Set(inputs).size, inputs.length);
  let attempts = 0;
  const retry = createIndexResolver({ readIndex: async () => undefined, embed: async (_config, text) => {
    if (++attempts === 1) throw new Error("Provider unavailable");
    return text.map(() => [1, 2]);
  } });
  await assert.rejects(retry([jobs[0]], config), /unavailable/);
  assert.ok((await retry([jobs[0]], config)).chunks.length);
  assert.equal(attempts, 2);
});
