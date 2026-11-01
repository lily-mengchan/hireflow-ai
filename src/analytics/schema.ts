import { z } from "zod";
import type { RecruitmentData } from "../types/recruitment";
import { workflows } from "../mocks/data";
const id = z.string().min(1).max(300);
const at = z.string().datetime({ offset: true });
const progress = z.object({ stage: z.string().min(1).max(80), status: z.enum(["待处理", "已通过", "已淘汰"]), interview: z.enum(["待安排", "已安排", "已完成"]) }).strict();
export const snapshotSchema = z.object({
  jobs: z.array(z.object({ id, title: z.string().min(1).max(200), workflowId: z.enum(workflows.map(w => w.id) as [string, ...string[]]), status: z.enum(["招聘中", "已暂停", "已结束"]) }).strict()).max(1000),
  candidates: z.array(z.object({ id, name: z.string().min(1).max(200) }).strict()).max(5000),
  applications: z.array(progress.extend({ id, candidateId: id, jobId: id, createdAt: at, updatedAt: at, recommendation: z.object({ status: z.enum(["待 HR 审核", "待业务复筛"]), recommendedAt: at.nullable() }).strict().optional() }).strict()).max(10000),
  interviews: z.array(z.object({ id, applicationId: id, stage: z.string().min(1).max(80), scheduledAt: at.nullable(), status: z.enum(["已安排", "已完成"]), result: z.enum(["通过", "未通过", "待定"]).nullable().optional(), completedAt: at.nullable().optional(), recordedAt: at.optional(), sourceEventId: id.optional() }).strict()).max(15000),
  events: z.array(z.object({ id, jobId: id, candidateId: id.optional(), applicationId: id.optional(), occurredAt: at, before: progress.optional(), after: progress.optional() }).strict()).max(25000),
}).strict().superRefine((data, ctx) => {
  const sets = new Map<string, Set<string>>();
  for (const key of ["jobs", "candidates", "applications", "interviews", "events"] as const) {
    const ids = new Set(data[key].map(row => row.id)); sets.set(key, ids);
    if (ids.size !== data[key].length) ctx.addIssue({ code: "custom", path: [key], message: "唯一 ID 重复" });
  }
  const jobs = new Map(data.jobs.map(j => [j.id, j])), apps = new Map(data.applications.map(a => [a.id, a]));
  const pairs = new Set<string>();
  for (const a of data.applications) {
    const job = jobs.get(a.jobId), pair = JSON.stringify([a.candidateId, a.jobId]);
    if (!job || !sets.get("candidates")!.has(a.candidateId) || !workflows.find(w => w.id === job.workflowId)?.stages.includes(a.stage) || pairs.has(pair)) ctx.addIssue({ code: "custom", message: "申请关联或阶段无效" });
    pairs.add(pair);
  }
  for (const i of data.interviews) {
    const a = apps.get(i.applicationId), job = jobs.get(a?.jobId ?? "");
    if (!a || !workflows.find(w => w.id === job?.workflowId)?.stages.includes(i.stage) || (i.sourceEventId && !sets.get("events")!.has(i.sourceEventId))) ctx.addIssue({ code: "custom", message: "面试关联无效" });
  }
  for (const e of data.events) {
    const app = e.applicationId ? apps.get(e.applicationId) : undefined;
    if (!jobs.has(e.jobId) || (e.applicationId && (!app || app.jobId !== e.jobId || e.candidateId !== app.candidateId))) ctx.addIssue({ code: "custom", message: "事件关联无效" });
  }
});
export type AnalyticsData = z.infer<typeof snapshotSchema>;
/** Only the fields needed by read-only tools leave the browser. No resume/JD/notes/contact. */
export function analyticsSnapshot(data: RecruitmentData): AnalyticsData {
  return snapshotSchema.parse({
    jobs: data.jobs.map(({ id, title, workflowId, status }) => ({ id, title, workflowId, status })),
    candidates: data.candidates.map(({ id, name }) => ({ id, name })),
    applications: data.applications.map(({ id, candidateId, jobId, stage, status, interview, createdAt, updatedAt, recommendation }) => ({ id, candidateId, jobId, stage, status, interview, createdAt, updatedAt, ...(recommendation ? { recommendation: { status: recommendation.status, recommendedAt: recommendation.recommendedAt } } : {}) })),
    interviews: data.interviews.map(({ id, applicationId, stage, scheduledAt, status, result, completedAt, recordedAt, sourceEventId }) => ({ id, applicationId, stage, scheduledAt, status, result, completedAt, recordedAt, sourceEventId })),
    events: data.events.map(({ id, jobId, candidateId, applicationId, occurredAt, before, after }) => ({ id, jobId, candidateId, applicationId, occurredAt, before, after })),
  });
}
export const paramsSchema = z.object({
  jobId: id.nullable().default(null), stage: z.string().max(80).nullable().default(null), status: z.enum(["待处理", "已通过", "已淘汰"]).nullable().default(null),
  candidate: z.string().min(1).max(200).nullable().default(null),
  interview: z.enum(["待安排", "已安排", "已完成"]).nullable().default(null), formalOnly: z.boolean().default(false), activeOnly: z.boolean().default(false),
  waitDays: z.number().int().min(0).max(3650).nullable().default(null), waitComparator: z.enum(["gte", "gt"]).default("gte"),
  period: z.enum(["all", "last7days", "last30days", "today", "thisWeek", "lastWeek", "custom"]).default("all"),
  from: at.nullable().default(null), to: at.nullable().default(null), recommendedOnly: z.boolean().default(false), limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const toolSchema = z.enum(["overview", "candidates", "pendingBusiness", "pendingFeedback", "interviewStats", "conversion", "bottlenecks"]);
export const intentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("knowledge") }).strict(),
  z.object({ kind: z.literal("clarify"), message: z.string().min(1).max(300) }).strict(),
  z.object({ kind: z.literal("data"), tool: toolSchema, params: paramsSchema }).strict(),
]);
export type Intent = z.infer<typeof intentSchema>;
export type QueryParams = z.infer<typeof paramsSchema>;
export type Tool = z.infer<typeof toolSchema>;
export type QueryRow = { id: string; applicationId?: string; cells: Record<string, string | number | null> };
export type QueryResult = { tool: Tool; title: string; answer: string; asOf: string; metrics: { label: string; value: number | null; unit: string }[]; columns: { key: string; title: string }[]; rows: QueryRow[]; notes: string[] };
export type QueryReply = { kind: "knowledge" } | { kind: "clarify"; message: string } | { kind: "data"; result: QueryResult; routing: { source: "rule" | "model" | "cache"; modelCalls: number; promptTokens: number | null; completionTokens: number | null } };
