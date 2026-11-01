/* eslint-disable @typescript-eslint/no-require-imports -- Run the same server pipeline without a second framework. */
require("./load-ts.cjs");
require("@next/env").loadEnvConfig(process.cwd());
const { jobs } = require("../src/mocks/data.ts");
const { jobSnapshot, ragQuestions } = require("../src/rag/types.ts");
const { getModelConfig } = require("../src/rag/model.ts");
const { ensureIndex: cachedIndex, createIndexResolver, indexKey } = require("../src/rag/index.ts");
const { answerQuestion } = require("../src/rag/answer.ts");
const { readFile, mkdir, writeFile } = require("node:fs/promises");
async function main() {
  const config = getModelConfig();
  const memoryOnly = process.argv.includes("--memory-only");
  const ensureIndex = memoryOnly ? createIndexResolver({ readIndex: async () => { throw Object.assign(new Error("Read-only filesystem"), { code: "EROFS" }); } }) : cachedIndex;
  const sourceArg = process.argv.find(a => a.startsWith("--jobs="));
  const { parseJobs } = require("../src/rag/chunks.ts");
  const snapshot = sourceArg ? parseJobs(JSON.parse(await readFile(sourceArg.slice(7), "utf8"))) : jobSnapshot(jobs);
  const index = await ensureIndex(snapshot, config);
  console.log(JSON.stringify({ indexedJobs: snapshot.length, chunks: index.chunks.length, dimension: index.dimension, embeddingModel: index.embeddingModel, chatModel: config.chatModel, version: index.corpusVersion }, null, 2));
  if (!process.argv.includes("--verify")) {
    // Explicit local CLI export only. API handlers never call filesystem writers.
    if (!memoryOnly) {
      await mkdir(".local/rag/indexes", { recursive: true });
      await writeFile(`.local/rag/indexes/${indexKey(snapshot, config)}.json`, JSON.stringify(index));
    }
    return;
  }
  const assertions = [/React|TypeScript|Next\.js/i, /React/i, /AI.*优先|优先.*AI/i, /上海/, /本科|硕士|年/];
  const answers = [];
  for (const [i, question] of ragQuestions.entries()) {
    const response = await answerQuestion(question, index, config);
    if (!response.sources.length || !assertions[i].test(response.answer)) throw new Error(`Acceptance question failed: ${question}`);
    if (i === 4 && new Set(response.sources.map(s => s.jobId)).size !== snapshot.length) throw new Error("Education query did not cover all saved jobs");
    answers.push({ question, ...response });
    console.log(JSON.stringify({ question, answer: response.answer, sources: response.sources.map(s => ({ jobTitle: s.jobTitle, section: s.section, chunkId: s.chunkId, score: s.score })) }, null, 2));
  }
  const unknown = await answerQuestion("前端岗位是否提供每月五千元宠物托管津贴？", index, config);
  if (unknown.sources.length || !unknown.answer.includes("未找到")) throw new Error("Missing-evidence refusal failed");
  const editedJobs = snapshot.map((job, i) => i === 0 ? { ...job, jd: job.jd.replaceAll("React", "Vue") } : job);
  const editedIndex = await ensureIndex(editedJobs, config);
  if (editedIndex.corpusVersion === index.corpusVersion || editedIndex.chunks.some(c => c.content.includes("React"))) throw new Error("Edited JD index invalidation failed");
  const editedAnswer = await answerQuestion("哪些岗位要求熟悉 React？", editedIndex, config);
  if (editedAnswer.sources.length) throw new Error("Edited JD returned stale React evidence");
  const deletedJobs = snapshot.slice(1);
  const deletedIndex = await ensureIndex(deletedJobs, config);
  if (deletedIndex.chunks.some(c => c.jobId === snapshot[0].id)) throw new Error("Deleted job remains retrievable");
  const deletedAnswer = await answerQuestion("前端岗位的工作地点在哪里？", deletedIndex, config);
  if (deletedAnswer.sources.length) throw new Error("Deleted job returned stale location evidence");
  const addedJob = { ...snapshot[0], id: "RAG-VERIFY-NEW", title: "RAG 验证岗位", jd: "任职要求\n熟悉 Svelte 和 TypeScript。" };
  const addedIndex = await ensureIndex([addedJob], config);
  const addedAnswer = await answerQuestion("RAG 验证岗位需要哪些技术？", addedIndex, config);
  if (!addedAnswer.answer.includes("Svelte") || addedAnswer.sources.some(s => s.jobId !== addedJob.id)) throw new Error("New job indexing failed");
  if (memoryOnly) {
    // A fresh resolver represents another cold Serverless instance, with no shared cache.
    const coldIndex = await createIndexResolver({ readIndex: async () => undefined })([addedJob], config);
    const coldAnswer = await answerQuestion("RAG 验证岗位需要哪些技术？", coldIndex, config);
    if (!coldAnswer.answer.includes("Svelte")) throw new Error("Cold instance without shared cache failed");
  }
  await mkdir(".local/rag", { recursive: true });
  await writeFile(`.local/rag/${memoryOnly ? "serverless-verification" : "verification"}.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), memoryOnly, embeddingModel: config.embeddingModel, chatModel: config.chatModel, answers, missingEvidence: unknown, editedAnswer, deletedAnswer, addedAnswer }, null, 2));
  console.log(`PASS: five live Embedding + LLM questions, missing-evidence refusal, create/edit/delete snapshot isolation${memoryOnly ? ", read-only cache and cold instance" : ""}. Report: .local/rag/${memoryOnly ? "serverless-verification" : "verification"}.json`);
}
main().catch(error => { console.error(error instanceof Error ? error.message : "RAG verification failed"); process.exitCode = 1; });
