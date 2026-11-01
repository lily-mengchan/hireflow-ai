import type { Application, RecruitmentData } from "../types/recruitment";
import type { ExtractedEvent } from "./schema";
import { workflows } from "../mocks/data";

const normalizedTitle = (value: string) => value.replace(/高级|中级|初级|资深|岗位|职位|工程师|开发|\s/g, "").toLowerCase();
export function matchApplications(data: RecruitmentData, event: ExtractedEvent) {
  const warnings: string[] = [];
  const explicit = data.candidates.filter(c => event.evidence.split(/[^\w-]+/).includes(c.id));
  const id = event.candidateId ?? (explicit.length === 1 ? explicit[0].id : null);
  if (explicit.length > 1) return { options: [] as Application[], warnings: ["原文包含多个候选人 ID，请拆分并重新解析"], requiresSelection: true };
  const candidates = id ? data.candidates.filter(c => c.id === id) : event.candidateName ? data.candidates.filter(c => c.name === event.candidateName) : data.candidates;
  if (id && (!candidates.length || (event.candidateName && candidates[0].name !== event.candidateName))) return { options: [] as Application[], warnings: ["候选人 ID 不存在或与姓名冲突，不会按姓名回退匹配"], requiresSelection: true };
  if (!id && !event.candidateName) warnings.push("缺少明确身份，必须人工选择候选人申请");
  if (candidates.length > 1) warnings.push("存在同名或身份不明确的候选人，必须核对唯一 ID");
  if (!event.jobTitle) warnings.push("未明确岗位，请人工核对具体岗位申请");
  const title = event.jobTitle ? normalizedTitle(event.jobTitle) : null;
  const options = data.applications.filter(a => candidates.some(c => c.id === a.candidateId) && (!title || data.jobs.some(j => j.id === a.jobId && (normalizedTitle(j.title).includes(title) || title.includes(normalizedTitle(j.title))))));
  if (!options.length) warnings.push("没有匹配申请，保留为待处理；不会自动创建候选人");
  if (options.length > 1) warnings.push("匹配到多份申请，请选择具体岗位申请");
  return { options, warnings, requiresSelection: candidates.length !== 1 || options.length !== 1 || !event.jobTitle };
}

export function proposeChange(data: RecruitmentData, application: Application, event: ExtractedEvent, now: Date) {
  const errors: string[] = [];
  const job = data.jobs.find(j => j.id === application.jobId);
  const stages = workflows.find(w => w.id === job?.workflowId)?.stages ?? [];
  const current = stages.indexOf(application.stage);
  const target = { stage: application.stage, status: application.status, interview: application.interview };
  if (job?.status !== "招聘中") errors.push("岗位已暂停或结束，请先核实岗位状态");
  if (application.status === "已淘汰" || application.stage === "Offer") errors.push("申请已淘汰或进入 Offer，旧面试反馈不能推进或回退状态");
  if (!event.eventType || event.eventType === "其他") errors.push("事件类型不明确，请人工核实");
  if (event.completedStage) {
    if (event.completedStage !== application.stage) errors.push("已完成阶段与当前阶段不符，可能是旧反馈或跳级事件");
    if (!event.interviewResult) errors.push("面试结果不明确，请人工确认结果");
    if (event.interviewResult === "未通过" && application.status === "已通过") errors.push("与当前已通过结果冲突，不能直接覆盖");
    target.status = event.interviewResult === "通过" ? "已通过" : event.interviewResult === "未通过" ? "已淘汰" : "待处理";
    target.interview = "已完成";
  } else if (event.eventType === "面试反馈") errors.push("缺少已完成阶段，请人工确认");
  const next = event.nextStage ?? (event.eventType === "Offer" ? "Offer" : null);
  if (next) {
    const nextIndex = stages.indexOf(next);
    if (nextIndex < 0 || nextIndex < current || nextIndex > current + 1) errors.push("目标阶段不属于岗位流程或存在回退、跳级");
    if (event.interviewResult === "未通过" || event.interviewResult === "待定") errors.push("未通过或结果待定时不能安排下一阶段");
    if (event.completedStage && nextIndex <= current) errors.push("完成面试后的下一阶段必须是紧邻的后续阶段");
    if (nextIndex === current && (application.interview === "已完成" || application.status === "已通过")) errors.push("该轮次已经完成，不能重新安排同一轮");
    if (nextIndex > current && target.status !== "已通过") errors.push("当前阶段尚未通过，不能推进；请补齐明确反馈");
    target.stage = next;
    target.status = next === "Offer" ? "已通过" : "待处理";
    target.interview = next === "Offer" ? "已完成" : "已安排";
    if (next !== "Offer") {
      if (!event.interviewTime || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(event.interviewTime) || !Number.isFinite(Date.parse(event.interviewTime))) errors.push("缺少明确的面试日期和时刻，请人工补齐");
      else if (Date.parse(event.interviewTime) <= now.getTime()) errors.push("待安排的面试时间已过期，请核实消息时间或重新安排");
      if (!event.interviewer) errors.push("请补齐下一轮面试官");
    }
  } else if (!event.completedStage) errors.push("没有可执行的面试反馈或安排");
  for (const stage of [event.completedStage, next].filter(Boolean)) {
    if (data.interviews.filter(i => i.applicationId === application.id && i.stage === stage && i.status === "已安排").length > 1) errors.push("该轮次存在多条待面试记录，请先人工核实记录");
  }
  return { target, errors: [...new Set(errors)] };
}

export async function messageFingerprint(message: string) {
  const normalized = message.normalize("NFKC").replace(/\s+/gu, " ").trim();
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, "0")).join("");
}
