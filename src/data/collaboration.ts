import { z } from "zod";
export const identities = [{ id: "hr-demo", role: "hr", name: "HR 演示身份" }, { id: "interviewer-1", role: "interviewer", name: "业务面试官 · 林（Demo）" }, { id: "interviewer-2", role: "interviewer", name: "业务面试官 · 陈（Demo）" }] as const;
export type Identity = typeof identities[number];
export const hrIdentity = identities[0];
export function requireHR(actor: Identity) { if (actor.role !== "hr") throw new Error("仅 HR 可以执行此操作"); }
export function requireAssigned(actor: Identity, interviewerId: string) { if (actor.role !== "interviewer" || actor.id !== interviewerId) throw new Error("只能操作分配给自己的任务"); }
const text = z.string().max(4000);
export const feedbackFields = z.object({ ability: text, projects: text, communication: text, strengths: text, summary: text, result: z.enum(["通过", "不通过", "待定"]), remarks: text }).strict();
export type FeedbackFields = z.infer<typeof feedbackFields>;
export const blankFeedback: FeedbackFields = { ability: "", projects: "", communication: "", strengths: "", summary: "", result: "待定", remarks: "" };
const review = z.object({ id: z.string().min(1), reviewerId: z.string(), submittedAt: z.string().datetime(), result: z.enum(["建议进入面试", "不建议进入"]), comment: text });
const feedback = z.object({ id: z.string().min(1), interviewId: z.string(), reviewerId: z.string(), submittedAt: z.string().datetime(), revisionOf: z.string().optional(), fields: feedbackFields });
export const collaborationSchema = z.object({ interviewerId: z.enum(["interviewer-1", "interviewer-2"]), sharedConclusion: z.string().max(1000), assignedAt: z.string().datetime(), assignmentId: z.string().min(1), businessReviewStatus: z.enum(["待业务复筛", "建议进入面试", "不建议进入", "HR 已确认推进"]), reviews: z.array(review), feedback: z.array(feedback), drafts: z.record(z.string(), feedbackFields) }).strict();
export type Collaboration = z.infer<typeof collaborationSchema>;
export type CollaborationCommand =
 | { type: "assign"; interviewerId: string; sharedConclusion: string }
 | { type: "review"; assignmentId: string; result: "建议进入面试" | "不建议进入"; comment: string }
 | { type: "advance" }
 | { type: "schedule"; interviewerId: string; scheduledAt: string }
 | { type: "draft" | "submit"; interviewId: string; fields: FeedbackFields; revisionOf?: string };
