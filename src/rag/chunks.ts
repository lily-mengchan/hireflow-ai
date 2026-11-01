import { createHash } from "node:crypto";
import { jobSnapshot, type JdChunk, type RagJob } from "./types";

export const CHUNKER_VERSION = "jd-sections-v1";
export function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function corpusVersion(jobs: RagJob[]) { return digest(CHUNKER_VERSION + JSON.stringify(jobSnapshot(jobs))); }

const headings: [RegExp, string][] = [
  [/^(?:岗位职责|工作职责|主要职责|职责描述|职位描述|工作内容|responsibilities)$/i, "岗位职责"],
  [/^(?:任职要求|岗位要求|职位要求|任职资格|基本要求|requirements|qualifications)$/i, "任职要求"],
  [/^(?:加分项|加分条件|优先条件|优先考虑|优先项|bonus|preferred)$/i, "加分项"],
  [/^(?:工作条件|工作地点|薪资福利|工作待遇|福利待遇|工作时间|benefits)$/i, "工作条件"],
];
function heading(line: string) {
  const cleaned = line.replace(/^\s*(?:#{1,6}\s*|[一二三四五六七八九十\d]+[、.．)）]\s*)?/, "").replace(/[：:]\s*$/, "").trim();
  return headings.find(([pattern]) => pattern.test(cleaned))?.[1];
}

/** Heading-aware, sentence/bullet bounded chunks; original wording is never rewritten. */
export function chunkJob(job: RagJob): JdChunk[] {
  const version = digest(JSON.stringify(jobSnapshot([job])[0]));
  const groups: { section: string; lines: string[]; origin: "jd" | "fields" }[] = [];
  let current = { section: "岗位描述", lines: [] as string[], origin: "jd" as const };
  function flush() { if (current.lines.some(l => l.trim())) groups.push(current); }
  for (const line of job.jd.replace(/\r\n?/g, "\n").split("\n")) {
    const section = heading(line);
    if (section) { flush(); current = { section, lines: [], origin: "jd" }; }
    else current.lines.push(line);
  }
  flush();
  groups.push({ section: "工作条件（岗位字段）", origin: "fields", lines: [`工作地点：${job.location}`, `学历要求：${job.education}`, `工作年限要求：${job.experience}`, `岗位状态：${job.status}`] });
  const chunks: JdChunk[] = [];
  for (const group of groups) {
    const content = group.lines.join("\n").trim();
    // A long bullet is split at sentence punctuation, with a hard cap for unbroken text.
    const units = content.split(/(?<=[。！？；\n])/u);
    let buffer = "";
    const emit = () => {
      if (!buffer.trim()) return;
      chunks.push({ jobId: job.id, jobTitle: job.title, section: group.section, content: buffer.trim(), version, origin: group.origin, chunkId: digest(`${job.id}:${version}:${group.section}:${chunks.length}:${buffer.trim()}`) });
      buffer = "";
    };
    for (const unit of units) {
      if (buffer.length + unit.length > 700) emit();
      if (unit.length > 700) { for (let i = 0; i < unit.length; i += 700) { buffer = unit.slice(i, i + 700); emit(); } }
      else buffer += unit;
    }
    emit();
  }
  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (!a.length || a.length !== b.length) throw new Error("向量维度不一致，需要重建索引");
  let dot = 0, left = 0, right = 0;
  for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) throw new Error("向量包含无效数字"); dot += a[i] * b[i]; left += a[i] ** 2; right += b[i] ** 2; }
  if (!left || !right) throw new Error("模型返回了零向量");
  return Math.max(-1, Math.min(1, dot / Math.sqrt(left * right)));
}

export function parseJobs(value: unknown): RagJob[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("请提交最多 100 个当前岗位");
  const ids = new Set<string>();
  const jobs = value.map(row => {
    if (!row || typeof row !== "object") throw new Error("岗位格式不正确");
    const job = row as Record<string, unknown>;
    for (const key of ["id", "title", "jd", "location", "education", "experience", "status"]) {
      const max = key === "jd" ? 10000 : 200;
      if (typeof job[key] !== "string" || (job[key] as string).length > max || !(job[key] as string).trim()) throw new Error(`岗位字段 ${key} 无效`);
    }
    if (ids.has(String(job.id))) throw new Error("岗位 ID 重复"); ids.add(String(job.id));
    return job as unknown as RagJob;
  });
  return jobSnapshot(jobs);
}
