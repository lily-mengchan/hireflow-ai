import type { RecruitmentData } from "../types/recruitment";
import { deriveEventType, eventSchema, type ExtractedEvent, type MessageInput } from "./schema";

/** A deterministic form receipt, not AI evidence. Uses the same confirmation command. */
export function manualFeedbackSource(data: RecruitmentData, applicationId: string, fields: ExtractedEvent, messageAt: string) {
  const application = data.applications.find(a => a.id === applicationId);
  const candidate = data.candidates.find(c => c.id === application?.candidateId);
  const job = data.jobs.find(j => j.id === application?.jobId);
  if (!application || !candidate || !job) throw new Error("请选择有效的候选人和岗位申请");
  const event = eventSchema.parse({ ...fields, candidateId: candidate.id, candidateName: candidate.name, jobTitle: job.title,
    eventType: deriveEventType(fields), timeEvidence: fields.interviewTime, evidence: "手动录入" });
  const content = `手动面试记录\n${JSON.stringify({ applicationId, candidateId: candidate.id, candidateName: candidate.name,
    jobTitle: job.title, completedStage: event.completedStage, interviewResult: event.interviewResult,
    nextStage: event.nextStage, interviewTime: event.interviewTime, interviewer: event.interviewer, remarks: event.remarks })}`;
  event.evidence = content;
  const input: MessageInput = { message: content, messageAt, timeZone: "Asia/Shanghai" };
  return { event, input };
}
