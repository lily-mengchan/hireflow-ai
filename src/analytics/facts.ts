import { workflows } from "../mocks/data";
import type { AnalyticsData } from "./schema";
export const DAY = 86400000;
export function jobStages(data: AnalyticsData, jobId: string) { return workflows.find(w => w.id === data.jobs.find(j => j.id === jobId)?.workflowId)?.stages ?? []; }
export function formalStage(data: AnalyticsData, jobId: string, stage: string) { return jobStages(data, jobId).includes(stage) && /面/.test(stage); }
export function awaitingInterview(data: AnalyticsData, a: AnalyticsData["applications"][number]) { return a.status !== "已淘汰" && a.interview === "待安排" && formalStage(data, a.jobId, a.stage); }
export function visitedStages(data: AnalyticsData, applicationId: string) {
  const a = data.applications.find(a => a.id === applicationId);
  return new Set([...(a ? [a.stage] : []), ...data.events.filter(e => e.applicationId === applicationId).flatMap(e => [e.before?.stage, e.after?.stage]).filter((s): s is string => !!s), ...data.interviews.filter(i => i.applicationId === applicationId).map(i => i.stage)]);
}
export function passedStage(data: AnalyticsData, applicationId: string, stage: string) {
  const a = data.applications.find(a => a.id === applicationId);
  return !!a && ((a.stage === stage && a.status === "已通过") || data.events.some(e => e.applicationId === applicationId && [e.before, e.after].some(p => p?.stage === stage && p.status === "已通过")) || data.interviews.some(i => i.applicationId === applicationId && i.stage === stage && i.status === "已完成" && i.result === "通过"));
}
export function completionTime(data: AnalyticsData, interview: AnalyticsData["interviews"][number]) {
  if (interview.status !== "已完成") return null;
  if (interview.completedAt) return { at: interview.completedAt, basis: "HR 确认的完成时间" };
  if (interview.recordedAt) return { at: interview.recordedAt, basis: "完成反馈记录时间" };
  const event = data.events.find(e => e.id === interview.sourceEventId && e.applicationId === interview.applicationId);
  return event ? { at: event.occurredAt, basis: "完成反馈关联事件时间" } : null;
}
export function pendingBusiness(data: AnalyticsData) {
  return data.applications.filter(a => a.recommendation?.recommendedAt && a.recommendation.status === "待业务复筛" && a.stage === jobStages(data, a.jobId)[1] && a.status === "待处理" && !passedStage(data, a.id, a.stage));
}
export function currentOverview(data: AnalyticsData) {
  const pending = data.applications.filter(a => awaitingInterview(data, a));
  return { openJobs: data.jobs.filter(j => j.status === "招聘中").length, candidates: new Set(data.candidates.map(c => c.id)).size, applications: data.applications.length, pendingBusiness: pendingBusiness(data).length, pendingInterviews: new Set(pending.map(a => a.candidateId)).size, pendingInterviewApplications: pending.length, offers: data.applications.filter(a => a.stage === "Offer" && a.status === "已通过").length };
}
