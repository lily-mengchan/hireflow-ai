import type { CandidateApplication, JobSummary, RecruitmentData } from "../types/recruitment";
import { currentOverview, formalStage, jobStages, passedStage, visitedStages } from "../analytics/facts";

/** Count application records instead of summing optional or stale job counters. */
export function selectHiredCount(data: RecruitmentData, jobId?: string): number {
  return data.applications.filter(application =>
    (!jobId || application.jobId === jobId) &&
    application.stage === "Offer" && application.status === "已通过"
  ).length;
}

export function selectJobs(data: RecruitmentData): JobSummary[] {
  return data.jobs.map(job => {
    const applications = data.applications.filter(a => a.jobId === job.id);
    return { ...job, applicants: applications.length, hired: selectHiredCount(data, job.id) };
  });
}

export function selectApplications(data: RecruitmentData): CandidateApplication[] {
  return data.applications.map(application => {
    const candidate = data.candidates.find(c => c.id === application.candidateId)!;
    return {
      ...candidate, ...application, id: candidate.id, applicationId: application.id,
      history: data.events.filter(e => e.applicationId === application.id)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
        .map(e => ({ date: formatDate(e.occurredAt), title: e.title, note: e.note })),
    };
  });
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

export function selectDashboard(data: RecruitmentData, now = new Date()) {
  const overview = currentOverview(data);
  const names = ["申请入库", "业务复筛 / 评审", "面试评估", "HR 面", "发放 Offer"];
  const funnel = names.map((_, i) => ({
    name: names[i],
    value: data.applications.filter(a => {
      const positions = visitedStages(data, a.id), stages = jobStages(data, a.jobId);
      if (i === 0) return true;
      if (i === 1) return positions.has(stages[1]);
      if (i === 2) return [...positions].some(stage => formalStage(data, a.jobId, stage));
      if (i === 3) return positions.has("HR 面");
      return passedStage(data, a.id, "Offer");
    }).length,
    color: ["#3774f6", "#5b8cf8", "#7da5fb", "#a2c1fc", "#c5d9ff"][i],
  }));
  function daily(offset: number) {
    const today = new Date(now.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" }) + "T00:00:00+08:00");
    today.setUTCDate(today.getUTCDate() + offset);
    const key = today.toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    const dateKey = (value: string) => new Date(value).toLocaleDateString("en-CA", { timeZone: "Asia/Shanghai" });
    return { day: key.slice(5).replace("-", "/"), candidates: data.candidates.filter(c => dateKey(c.createdAt) === key).length, interviews: data.interviews.filter(r => r.scheduledAt && dateKey(r.scheduledAt) === key).length };
  }
  return {
    candidateCount: overview.candidates,
    applicationCount: overview.applications,
    pendingCount: overview.pendingInterviews,
    pendingBusinessCount: overview.pendingBusiness,
    openJobCount: overview.openJobs,
    offerCount: overview.offers,
    funnel,
    conversion: data.applications.length ? (overview.offers / data.applications.length * 100).toFixed(1) : "0.0",
    trend: Array.from({ length: 7 }, (_, i) => daily(i - 6)),
    previousTrend: Array.from({ length: 7 }, (_, i) => daily(i - 13)),
    activities: [...data.events].reverse().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 6).map(e => ({
      id: e.id,
      name: data.candidates.find(c => c.id === e.candidateId)?.name ?? "岗位管理",
      action: `${data.jobs.find(j => j.id === e.jobId)?.title} · ${e.title}`,
      time: formatDate(e.occurredAt),
    })),
  };
}
