import type { Application, RecruitmentData } from "../types/recruitment";
import type { Recommendation, ResumeProfile } from "../screening/schema";

const notes: Record<string, { strengths: string; concern: string; focus: string }> = {
  "JOB-001": { strengths: "熟悉 React、TypeScript 和 Next.js，能够说明后台系统模块拆分、组件复用及性能优化思路，具备企业级产品交付意识", concern: "复杂业务下的架构决策、性能指标及个人贡献尚需通过技术追问核实", focus: "前端架构、组件库设计与性能排查" },
  "JOB-002": { strengths: "能够从用户场景拆解需求，具备需求优先级管理、跨团队协作及数据复盘意识，对 AI 产品落地有明确兴趣", concern: "模型效果评估、成本控制和从试点到规模化落地的经验仍需核实", focus: "AI 场景判断、产品方案及效果评估" },
  "JOB-003": { strengths: "能够围绕用户任务组织信息架构，关注交互一致性和设计交付质量，具备与产品及研发协作的意识", concern: "作品集中的个人负责范围、用户研究方法和上线后效果需要进一步核实", focus: "作品集复盘、复杂交互及设计系统" },
  "JOB-004": { strengths: "具备服务端业务拆解意识，能够围绕接口设计、数据一致性和异常处理讨论实现方案，重视协作与交付", concern: "高并发场景、数据库优化及线上故障处理的实际深度尚需技术面验证", focus: "服务设计、事务一致性及故障排查" },
  "JOB-005": { strengths: "具备数据分析与实验迭代意识，能够描述从问题定义、数据处理到结果评估的工作路径，关注算法业务价值", concern: "模型选择依据、实验可复现性及部署后的效果监控仍需深入核实", focus: "算法基础、实验设计及工程落地" },
  "JOB-006": { strengths: "具备招聘流程协作意识，能够围绕渠道维护、面试协调和数据整理描述执行方法，沟通表达较有条理", concern: "多岗位并行推进、招聘漏斗分析和突发情况处理能力仍需通过案例确认", focus: "招聘协调、渠道运营及数据复盘" },
};

/** Display existing synthetic samples without rewriting stored or imported recommendations. */
export function mockRecommendation(data: RecruitmentData, application: Application): Recommendation | undefined {
  const candidate = data.candidates.find(c => c.id === application.candidateId);
  const job = data.jobs.find(j => j.id === application.jobId);
  const sample = notes[application.jobId];
  if (!candidate || !job || !sample || !/^HF-\d{4}$/.test(candidate.id) || !candidate.summary.includes("所有档案均为虚构演示资料") || !data.events.some(e => e.id.startsWith("EV-INIT-") && e.candidateId === candidate.id)) return undefined;
  const variant = Number(candidate.id.slice(-4)) % 3;
  const suggestion = ["建议优先安排业务复筛，重点确认岗位关键能力。", "建议进入业务复筛，以具体项目案例核实经验深度。", "建议谨慎复筛，先补充关键项目细节，再判断是否安排面试。"][variant];
  const content = `【Mock 演示评语｜虚构资料，非真实 AI 分析】\n${candidate.name}应聘${job.title}，样本档案为${candidate.education}学历、${candidate.experience}年工作经验。\n\n推荐理由：${sample.strengths}。\n\n待核实点：${sample.concern}。${variant === 2 ? "当前材料不足以确认全部岗位要求，不建议仅凭资料直接判断通过。" : "建议业务面试结合具体案例确认能力边界。"}\n\nHR 建议：${suggestion}复筛重点为${sample.focus}。`;
  const fact = (value: string | null): ResumeProfile["name"] => ({ value, evidence: value, source: "RESUME" });
  return {
    id: `MOCK-RECOMMENDATION-${application.id}`, resumeHash: "0".repeat(64), jobVersion: "mock-demo-v1",
    resume: { name: fact(candidate.name), education: fact(candidate.education), school: fact(candidate.school), company: fact(candidate.company), experienceYears: { value: candidate.experience, evidence: `虚构样本：${candidate.experience}年`, source: "RESUME" }, currentBase: fact(null), desiredLocation: fact(null), earliestStart: fact(null), skills: candidate.skills.map(fact), experiences: [fact(candidate.summary)], projects: [fact("Mock 演示：参与业务系统交付，项目规模、个人职责与效果指标待业务面试核实。")] },
    hrNotes: { currentBase: "", desiredLocation: "", acceptsLocation: "未确认", expectedSalary: "", earliestStart: "", internshipDays: null, remarks: `【Mock 沟通结论】已完成岗位意向的演示沟通；候选人愿意了解${job.title}的职责与团队情况。工作地点、薪资及到岗时间待 HR 核实。业务复筛建议重点关注${sample.focus}。` },
    analysis: { findings: [], checks: [{ label: "演示来源", status: "待核实", detail: "人工编写的虚构推荐评语，不代表真实简历解析、AI 匹配或面试结果。" }], draft: content },
    usage: { modelCalls: 0, promptTokens: null, completionTokens: null, cached: false },
    content, status: "待 HR 审核", savedAt: application.createdAt, recommendedAt: null,
  };
}
