import type { RecruitmentData } from "../types/recruitment";
import type { Identity } from "./collaboration";
/** Demo read boundary; raw localStorage remains accessible to browser owners. */
export function visibleData(source: RecruitmentData, actor: Identity): RecruitmentData {
  if (actor.role === "hr") return source;
  const interviews = source.interviews.filter(i => i.interviewerId === actor.id);
  const applications = source.applications.filter(a => a.collaboration?.interviewerId === actor.id || interviews.some(i => i.applicationId === a.id)).map(a => ({ ...a,
    preScreening: undefined,
    recommendation: a.recommendation ? { ...a.recommendation, hrNotes: { currentBase: "", desiredLocation: "", acceptsLocation: "未确认" as const, expectedSalary: "", earliestStart: "", internshipDays: null, remarks: "" } } : undefined,
    collaboration: a.collaboration ? { ...a.collaboration, reviews: a.collaboration.reviews.filter(r => r.reviewerId === actor.id), feedback: a.collaboration.feedback.filter(f => f.reviewerId === actor.id), drafts: Object.fromEntries(Object.entries(a.collaboration.drafts).filter(([key]) => key.endsWith(`:${actor.id}`))) } : undefined,
  }));
  return { ...source, applications, interviews, events: [], candidates: source.candidates.filter(c => applications.some(a => a.candidateId === c.id)), jobs: source.jobs.filter(j => applications.some(a => a.jobId === j.id)) };
}
