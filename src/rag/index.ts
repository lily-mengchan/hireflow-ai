import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chunkJob, corpusVersion, digest } from "./chunks";
import { embed, RagError, type ModelConfig } from "./model";
import type { JdChunk, RagJob, VectorIndex } from "./types";

export function indexKey(jobs: RagJob[], config: ModelConfig) { return digest(`${corpusVersion(jobs)}:${config.signature}`); }

type Dependencies = {
  embed?: typeof embed;
  readIndex?: (key: string) => Promise<unknown>;
};
const readLocalIndex = async (key: string): Promise<unknown> =>
  JSON.parse(await readFile(join(process.cwd(), ".local", "rag", "indexes", `${key}.json`), "utf8"));

function validVector(value: unknown, dimension?: number): value is number[] {
  return Array.isArray(value) && value.length > 0 &&
    (dimension === undefined || value.length === dimension) &&
    value.every(v => typeof v === "number" && Number.isFinite(v)) && value.some(v => v !== 0);
}

function matchesIndex(value: unknown, jobs: RagJob[], chunks: JdChunk[], config: ModelConfig): value is VectorIndex {
  if (!value || typeof value !== "object") return false;
  const saved = value as VectorIndex;
  return saved.schemaVersion === 1 && saved.corpusVersion === corpusVersion(jobs) &&
    saved.embeddingSignature === config.signature && saved.embeddingModel === config.embeddingModel &&
    Number.isInteger(saved.dimension) && (chunks.length ? saved.dimension > 0 : saved.dimension === 0) &&
    (!chunks.length || config.dimensions === undefined || saved.dimension === config.dimensions) &&
    Array.isArray(saved.chunks) && saved.chunks.length === chunks.length && saved.chunks.every((c, i) =>
      c && c.chunkId === chunks[i].chunkId && c.content === chunks[i].content &&
      c.version === chunks[i].version && c.jobId === chunks[i].jobId && c.jobTitle === chunks[i].jobTitle &&
      c.section === chunks[i].section && c.origin === chunks[i].origin && validVector(c.vector, saved.dimension));
}

function remember<K, V>(cache: Map<K, V>, key: K, value: V, limit: number) {
  cache.delete(key); cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value!);
}

/** Caches are optional, bounded warm-instance optimizations. No request writes files. */
export function createIndexResolver(dependencies: Dependencies = {}) {
  const embedInputs = dependencies.embed ?? embed;
  const readIndex = dependencies.readIndex ?? readLocalIndex;
  const indexes = new Map<string, VectorIndex>();
  const vectors = new Map<string, number[]>();
  const inFlight = new Map<string, Promise<VectorIndex>>();
  const pendingVectors = new Map<string, Promise<number[]>>();
  const inputText = (c: JdChunk) => `${c.jobTitle}\n${c.section}\n${c.content}`;
  const vectorKey = (text: string, config: ModelConfig) => digest(`${config.signature}:${text}`);

  async function resolveVectors(chunks: JdChunk[], config: ModelConfig): Promise<number[][]> {
    const inputs = chunks.map(inputText);
    const keys = inputs.map(text => vectorKey(text, config));
    const missing = [...new Map(keys.map((key, i) => [key, inputs[i]])).entries()]
      .filter(([key]) => !vectors.has(key) && !pendingVectors.has(key));
    if (missing.length) {
      // Reserve promises before the API call so overlapping snapshots share work.
      const batch = Promise.resolve().then(() => embedInputs(config, missing.map(([, text]) => text))).then(result => {
        if (result.length !== missing.length || result.some(v => !validVector(v, config.dimensions ?? result[0]?.length))) throw new RagError("Embedding 返回无效向量", 502);
        return result;
      });
      missing.forEach(([key], i) => {
        const pending = batch.then(result => {
          if (result.length !== missing.length || !validVector(result[i], config.dimensions)) throw new RagError("Embedding 返回无效向量", 502);
          remember(vectors, key, result[i], 512);
          return result[i];
        }).finally(() => { pendingVectors.delete(key); });
        pendingVectors.set(key, pending);
      });
    }
    return Promise.all(keys.map(key => pendingVectors.get(key) ?? vectors.get(key)!));
  }

  async function buildIndex(jobs: RagJob[], config: ModelConfig, key: string): Promise<VectorIndex> {
    const chunks = jobs.flatMap(chunkJob);
    try {
      const saved = await readIndex(key);
      if (matchesIndex(saved, jobs, chunks, config)) {
        saved.chunks.forEach(c => remember(vectors, vectorKey(inputText(c), config), c.vector, 512));
        return saved;
      }
    } catch { /* Missing, unreadable or invalid optional seed never blocks in-memory retrieval. */ }
    const embedded = await resolveVectors(chunks, config);
    const dimension = embedded[0]?.length ?? 0;
    if (embedded.some(v => v.length !== dimension)) throw new RagError("Embedding 返回的向量维度不一致", 502);
    return { schemaVersion: 1, corpusVersion: corpusVersion(jobs), embeddingSignature: config.signature,
      embeddingModel: config.embeddingModel, dimension, createdAt: new Date().toISOString(),
      chunks: chunks.map((c, i) => ({ ...c, vector: embedded[i] })) };
  }

  return async function ensureIndex(jobs: RagJob[], config: ModelConfig): Promise<VectorIndex> {
    const key = indexKey(jobs, config);
    const cached = indexes.get(key);
    if (cached) { remember(indexes, key, cached, 3); return cached; }
    const pending = inFlight.get(key);
    if (pending) return pending;
    const task = buildIndex(jobs, config, key);
    inFlight.set(key, task);
    try {
      const index = await task;
      remember(indexes, key, index, 3);
      return index;
    } finally { inFlight.delete(key); }
  };
}

export const ensureIndex = createIndexResolver();
