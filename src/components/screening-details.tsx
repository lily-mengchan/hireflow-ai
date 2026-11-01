"use client";
import { App, Button, Descriptions, Popconfirm, Space, Tag } from "antd";
import { recruitmentActions, useRecruitment } from "../data/store";
import { copyRecommendation } from "../screening/rules";
import { formatDate } from "../data/selectors";
import { ScreeningChecks } from "./candidate-import";
import "./candidate-import.css";
import { conditionsVersion } from "../screening/conditions";
export default function ScreeningDetails({ applicationId }: { applicationId: string }) {
  const { data } = useRecruitment(); const { message } = App.useApp();
  const application = data.applications.find(a => a.id === applicationId), record = application?.recommendation;
  const job = data.jobs.find(j => j.id === application?.jobId);
  if (!record || !application || !job) return null;
  async function copy() {
    try { await navigator.clipboard.writeText(copyRecommendation(application!.candidateId, job!.title, record!.content, record!.hrNotes)); message.success("推荐内容已复制"); }
    catch { message.error("复制失败，请检查浏览器剪贴板权限"); }
  }
  const hr = record.hrNotes;
  const pre = application.preScreening;
  function recommend() {
    try {
      recruitmentActions.saveImport({ importId: crypto.randomUUID(), jobId: job!.id, jobVersion: record!.jobVersion, resumeHash: record!.resumeHash, resume: record!.resume, hrNotes: record!.hrNotes, preScreening: pre && { jobId:pre.jobId, conditionsVersion:pre.conditionsVersion, conditions:pre.conditions, values:pre.values, results:pre.results, decision:pre.decision, checkedAt:pre.checkedAt, overrideReason:pre.overrideReason }, analysis: record!.analysis, usage: record!.usage, content: record!.content, recommend: true, acknowledged: true, existingCandidateId: application!.candidateId, newIdentityConfirmed: false });
      message.success("已确认推荐，等待业务复筛");
    } catch (e) { message.error(e instanceof Error ? e.message : "推荐保存失败"); }
  }
  return <div className="candidate-import">{pre && <section className="screening-section"><h3>基础条件核验 <Tag>{pre.decision === "UNCONFIGURED" ? "未配置筛选条件" : pre.decision}</Tag></h3>{pre.conditionsVersion !== conditionsVersion(job.screeningConditions) && <p role="alert" className="condition-stale">岗位条件已更新，以下为历史核验结果，新的筛选须重新核验。</p>}<p className="muted">核验时间：{formatDate(pre.checkedAt)} · 来源：HR 沟通确认（独立于沟通备注）</p>{pre.records.map(row => <div className="condition-summary" key={row.conditionId}><div><strong>{pre.conditions.find(c => c.conditionId === row.conditionId)?.label}</strong><p>填写值：{row.candidateValue === null ? "未提供" : typeof row.candidateValue === "boolean" ? row.candidateValue ? "是" : "否" : String(row.candidateValue)}</p></div><div><Tag>{row.checkResult}</Tag><small>{row.reason}</small></div></div>)}{pre.overrideReason && <p className="muted">人工确认继续原因：{pre.overrideReason}</p>}</section>}<div className="screening-section"><h3>推荐记录 <Tag color="blue">{record.status}</Tag></h3><p className="muted">保存：{formatDate(record.savedAt)}{record.recommendedAt ? ` · 推荐：${formatDate(record.recommendedAt)}` : " · 尚未确认推荐"}</p><p className="muted">以上是推荐时状态，当前招聘进度以申请记录为准。</p><div className="screening-content">{record.content}</div><Button onClick={() => { void copy(); }}>复制推荐内容</Button></div>
    {record.status === "待 HR 审核" && <Space><Popconfirm title="确认推荐至业务复筛？" description="请确认已核对身份、来源冲突及推荐评语。" onConfirm={recommend} okText="确认推荐" cancelText="取消"><Button type="primary">确认推荐</Button></Popconfirm></Space>}
    <div className="screening-section"><h3>沟通确认 <Tag>HR_NOTE</Tag></h3><Descriptions column={1} size="small" items={[{ key: "base", label: "目前 Base", children: hr.currentBase || "未提供" }, { key: "location", label: "意向地点", children: hr.desiredLocation || "未提供" }, { key: "accept", label: "接受岗位地点", children: hr.acceptsLocation }, { key: "salary", label: "期望薪资", children: hr.expectedSalary || "未提供" }, { key: "start", label: "最早到岗", children: hr.earliestStart || "未提供" }, { key: "days", label: "每周可实习", children: hr.internshipDays ? `${hr.internshipDays} 天` : "未提供" }, { key: "notes", label: "其他备注", children: hr.remarks || "未提供" }]} /></div>
    <div className="screening-section"><h3>结构化简历与来源</h3>{Object.entries({ 姓名: record.resume.name, 学历: record.resume.education, 院校: record.resume.school, 最近工作单位: record.resume.company, 工作年限: record.resume.experienceYears, "Base 地": record.resume.currentBase, 意向地点: record.resume.desiredLocation, 到岗时间: record.resume.earliestStart }).map(([label, fact]) => <p className="screening-content" key={label}><strong>{label}：</strong>{fact.value ?? "未提供"} <Tag>{fact.source}</Tag>{(fact.evidence || fact.originalEvidence) && <small>原文：{fact.evidence ?? fact.originalEvidence}</small>}</p>)}{[...record.resume.skills, ...record.resume.experiences, ...record.resume.projects].map((fact, i) => <p key={i} className="screening-content">{fact.value ?? "未提供"} <Tag>{fact.source}</Tag>{(fact.evidence || fact.originalEvidence) && <small>原文：{fact.evidence ?? fact.originalEvidence}</small>}</p>)}</div>
    <div className="screening-section"><h3>推荐时岗位条件及匹配依据</h3><p className="muted">分析基于保存时的 JD 快照；岗位后续编辑不会改写历史推荐。</p><ScreeningChecks analysis={record.analysis} /></div></div>;
}
