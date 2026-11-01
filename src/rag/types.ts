export type RagJob = {
  id: string; title: string; jd: string; location: string;
  education: string; experience: string; status: string;
};
export type JdChunk = {
  jobId: string; jobTitle: string; section: string; content: string;
  chunkId: string; version: string; origin: "jd" | "fields";
};
export type IndexedChunk = JdChunk & { vector: number[] };
export type VectorIndex = {
  schemaVersion: 1; corpusVersion: string; embeddingSignature: string;
  embeddingModel: string; dimension: number; createdAt: string;
  chunks: IndexedChunk[];
};
export type Citation = JdChunk & { score: number; quote: string };
export type RagAnswer = {
  answer: string; sources: Citation[]; corpusVersion: string;
  embeddingModel: string; chatModel: string; retrievedCount: number;
};
export const ragQuestions = [
  "前端开发岗位需要哪些技术？", "哪些岗位要求熟悉 React？",
  "AI 相关经验属于哪些岗位的加分项？", "前端岗位的工作地点在哪里？",
  "当前岗位有哪些学历或工作年限要求？",
];
/** Only job knowledge leaves the browser; candidate profiles and credentials never do. */
export function jobSnapshot(jobs: RagJob[]): RagJob[] {
  return jobs.map(({ id, title, jd, location, education, experience, status }) =>
    ({ id, title, jd, location, education, experience, status })).sort((a, b) => a.id.localeCompare(b.id));
}
