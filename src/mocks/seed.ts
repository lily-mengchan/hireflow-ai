import { candidateNames, jobs, workflows } from "./data";
import type { Application, RecruitmentData } from "../types/recruitment";

/** Pure factory: the repository supplies the clock only after browser hydration. */
export function createSeed(now = new Date("2026-11-01T10:00:00+08:00")): RecruitmentData {
  const data: RecruitmentData = { version: 1, jobs: structuredClone(jobs), candidates: [], applications: [], interviews: [], events: [] };
  const at = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86400000).toISOString();
  candidateNames.forEach((name, i) => {
    const id = `HF-${String(i + 1).padStart(4, "0")}`;
    data.candidates.push({ id, name, education: i % 4 === 1 ? "硕士" : "本科", school: ["华东理工大学", "浙江大学", "同济大学", "上海大学"][i % 4], experience: 3 + i % 6, company: "模拟科技公司", skills: i % 6 === 0 ? ["React", "TypeScript", "Next.js"] : ["项目协作", "数据分析", "AI 产品"], summary: "模拟候选人：具备产品交付和团队协作经验。所有档案均为虚构演示资料。", createdAt: at(6 - i % 7) });
    const job = data.jobs[i % data.jobs.length];
    const stages = workflows.find(w => w.id === job.workflowId)!.stages;
    const index = (i + Math.floor(i / 6)) % stages.length;
    const application: Application = { id: `APP-${i + 1}`, candidateId: id, jobId: job.id, stage: stages[index], status: i === 8 ? "已淘汰" : i % 5 === 4 ? "已通过" : "待处理", interview: index < 2 ? "待安排" : index === 5 || i === 8 ? "已完成" : "已安排", score: 96 - i * 3 % 28, createdAt: at(6 - i % 7), updatedAt: now.toISOString() };
    data.applications.push(application);
    data.events.push({ id: `EV-INIT-${i}`, applicationId: application.id, candidateId: id, jobId: job.id, type: "application-created", occurredAt: application.createdAt, title: "申请已建立", note: "从模拟候选人档案建立独立岗位申请", after: { stage: stages[0], status: "待处理", interview: "待安排" } });
    stages.slice(0, index).forEach((stage, j) => {
      const occurredAt = new Date(new Date(application.createdAt).getTime() + (now.getTime() - new Date(application.createdAt).getTime()) * (j + 1) / (index + 1)).toISOString();
      data.events.push({ id: `EV-${i}-${j}`, applicationId: application.id, candidateId: id, jobId: job.id, type: "application-updated", occurredAt, title: `${stage}通过 → ${stages[j + 1]}`, note: "已完成演示阶段评估", before: { stage, status: "已通过", interview: j >= 2 ? "已完成" : "待安排" }, after: { stage: stages[j + 1], status: "待处理", interview: j >= 1 ? "已安排" : "待安排" } });
      if (stage.includes("面")) data.interviews.push({ id: `INT-${i}-${j}`, applicationId: application.id, stage, scheduledAt: occurredAt, status: "已完成", note: "模拟面试记录：专业能力与沟通表现符合要求" });
    });
    data.events.push({ id: `EV-CURRENT-${i}`, applicationId: application.id, candidateId: id, jobId: job.id, type: "application-updated", occurredAt: now.toISOString(), title: `${application.stage} · ${application.status}`, note: "初始化当前申请状态", after: { stage: application.stage, status: application.status, interview: application.interview } });
    if (application.interview === "已安排") data.interviews.push({ id: `INT-CURRENT-${i}`, applicationId: application.id, stage: application.stage, scheduledAt: at(0), status: "已安排", note: "待完成的模拟面试" });
  });
  // One identity, two job applications, each with its own stage and history.
  const second: Application = { ...data.applications[0], id: "APP-SECOND", jobId: data.jobs[1].id, stage: "业务复筛", score: 82 };
  data.applications.push(second);
  data.events.push({ id: "EV-SECOND", applicationId: second.id, candidateId: second.candidateId, jobId: second.jobId, type: "application-created", occurredAt: now.toISOString(), title: "申请已建立 · 业务复筛", note: "同一模拟候选人申请第二个岗位，进度独立保存", after: { stage: second.stage, status: second.status, interview: second.interview } });
  return data;
}
