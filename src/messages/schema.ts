import { z } from "zod";

const optionalText = z.string().trim().min(1).max(500).nullable();
export const eventSchema = z.object({
  candidateId: optionalText,
  candidateName: optionalText,
  jobTitle: optionalText,
  eventType: z.enum(["面试反馈", "面试安排", "Offer", "其他"]).nullable(),
  completedStage: optionalText,
  interviewResult: z.enum(["通过", "未通过", "待定"]).nullable(),
  nextStage: optionalText,
  interviewTime: optionalText,
  timeEvidence: optionalText,
  interviewer: optionalText,
  remarks: optionalText,
  evidence: z.string().trim().min(1).max(10000),
}).strict();
export type ExtractedEvent = z.infer<typeof eventSchema>;
export const extractionSchema = z.object({ events: z.array(eventSchema).max(12) }).strict();
export const messageSchema = z.object({
  message: z.string().trim().min(1).max(10000),
  messageAt: z.string().regex(/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/).refine(v => Number.isFinite(Date.parse(v)), "消息时间无效"),
  timeZone: z.literal("Asia/Shanghai"),
}).strict();
export type MessageInput = z.infer<typeof messageSchema>;
export type ParsedEvent = { event: ExtractedEvent; warnings: string[] };
export const MAX_FEEDBACK_LENGTH = 800;
export const feedbackRequestSchema = messageSchema.extend({
  message: z.string().trim().min(2).max(MAX_FEEDBACK_LENGTH),
  messageAt: messageSchema.shape.messageAt.optional(),
  timeZone: z.literal("Asia/Shanghai").default("Asia/Shanghai"),
}).strict();
// Event type and normalized time are deterministic; the LLM need not generate them.
export const compactExtractionSchema = z.object({ events: z.array(eventSchema.omit({ eventType: true, interviewTime: true })).max(12) }).strict();
export function deriveEventType(event: Pick<ExtractedEvent, "completedStage" | "nextStage">): ExtractedEvent["eventType"] {
  return event.completedStage ? "面试反馈" : event.nextStage === "Offer" ? "Offer" : event.nextStage ? "面试安排" : "其他";
}
export function feedbackInputIssue(text: string) {
  if (text.trim().length < 2) return "请输入面试反馈或安排";
  if (text.trim().length > MAX_FEEDBACK_LENGTH) return `请将反馈精简至 ${MAX_FEEDBACK_LENGTH} 字以内`;
  if (!/面试|[一二三]面|初筛|复筛|复试|候选人|offer|录用|淘汰|招聘|入职|通过|过了/i.test(text)) return "请描述面试轮次、结果或安排，也可切换手动录入";
  return null;
}

export interface Confirmation {
  message: MessageInput;
  original: ExtractedEvent;
  event: ExtractedEvent;
  applicationId: string;
  expected: { stage: string; status: string; interview: string; updatedAt: string };
  acknowledged: boolean;
  confirmationNote: string;
  mode?: "ai" | "manual";
}
