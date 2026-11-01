"use client";

import { Drawer, Empty, Tag, Tabs, Timeline, Descriptions, Progress } from "antd";
import { BriefcaseBusiness, GraduationCap, MapPin, Sparkles } from "lucide-react";
import { workflows } from "@/src/mocks/data";
import type { Candidate, CandidateApplication } from "@/src/types/recruitment";
import { useRecruitment } from "@/src/data/store";
import { formatDate } from "@/src/data/selectors";
import ApplicationEditor from "./application-editor";
import ScreeningDetails from "./screening-details";
export { default as StatusTag } from "./status-badge";
import StatusTag from "./status-badge";
export function PageHeading({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div>;
}
export function Panel({
  title,
  subtitle,
  extra,
  children,
  className = ""
}: {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{extra}</div>{children}</section>;
}
export function Score({
  value
}: {
  value: number;
}) {
  return <span className={`score ${value >= 85 ? "high" : "medium"}`}><Sparkles size={13} />{value}<small>分</small></span>;
}
export function Person({
  candidate
}: {
  candidate: Candidate;
}) {
  return <div className="person"><span className={`person-avatar tone-${Number(candidate.id.slice(-1)) % 4}`}>{candidate.name.slice(-2)}</span><span><strong>{candidate.name}</strong><small>{candidate.id}</small></span></div>;
}
export function EmptyResult() {
  return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的数据，请调整筛选条件" />;
}
export function CandidateDrawer({
  candidate: selectedCandidate,
  onClose,
  initialTab = "profile"
}: {
  candidate: CandidateApplication | null;
  onClose: () => void;
  initialTab?: string;
}) {
  const { jobs, candidates, data } = useRecruitment();
  const candidate = candidates.find(c => c.applicationId === selectedCandidate?.applicationId) ?? null;
  const job = jobs.find(j => j.id === candidate?.jobId);
  const stages = workflows.find(w => w.id === job?.workflowId)?.stages ?? [];
  return <Drawer title="候选人详情" open={!!candidate} onClose={onClose} size={760}>{candidate && <><div className="detail-person"><Person candidate={candidate} />{candidate.recommendation ? <Tag>见初筛分析</Tag> : <Score value={candidate.score} />}</div><p className="muted">应聘 {job?.title} · {job?.department}</p><div className="detail-tags"><StatusTag kind="stage" value={candidate.stage} /><StatusTag value={candidate.status} /><Tag>{candidate.recommendation ? "简历导入" : "Mock 候选人"}</Tag></div><Tabs key={`${candidate.applicationId}-${initialTab}`} defaultActiveKey={initialTab} items={[...(candidate.recommendation ? [{ key: "screening", label: "初筛与推荐", children: <ScreeningDetails applicationId={candidate.applicationId} /> }] : []), {
        key: "profile",
        label: "基本资料",
        children: <><Descriptions column={2} items={[{
            key: "school",
            label: "毕业院校",
            children: candidate.school
          }, {
            key: "education",
            label: "学历",
            children: candidate.education
          }, {
            key: "experience",
            label: "工作经验",
            children: candidate.recommendation?.resume.experienceYears.value === null ? "未提供" : `${candidate.experience} 年`
          }, {
            key: "company",
            label: "最近公司",
            children: candidate.company
          }, {
            key: "interview",
            label: "面试状态",
            children: <StatusTag value={candidate.interview} />
          }, {
            key: "location",
            label: "意向城市",
            children: candidate.recommendation ? candidate.recommendation.hrNotes.desiredLocation || candidate.recommendation.resume.desiredLocation.value || "未提供" : job?.location
          }]} /><h3 className="section-title">个人简介</h3><p className="detail-copy">{candidate.summary}</p><h3 className="section-title">专业技能</h3>{candidate.skills.map(s => <Tag key={s}>{s}</Tag>)}<h3 className="section-title">教育经历</h3><div className="info-block"><GraduationCap size={21} /><div><strong>{candidate.school}</strong><p>{candidate.education}</p></div></div><h3 className="section-title">工作经历</h3><div className="info-block"><BriefcaseBusiness size={21} /><div><strong>{candidate.company}</strong><p>{candidate.recommendation ? candidate.summary : "负责核心产品交付与跨团队协作，参与业务流程优化。"}</p></div></div></>
      }, {
        key: "match",
        label: "AI 匹配概览",
        children: candidate.recommendation ? <ScreeningDetails applicationId={candidate.applicationId} /> : <><div className="match-summary"><Sparkles size={24} /><h3>岗位匹配度 {candidate.score}%</h3><p>以下为预置展示内容，未执行真实 AI 评分。</p></div>{["专业技能", "工作经验", "教育背景"].map((s, i) => <div className="match-row" key={s}><span>{s}</span><Progress percent={Math.min(100, candidate.score + i * 2)} size="small" /></div>)}<blockquote>示例依据：{candidate.summary}</blockquote></>
      }, {
        key: "feedback",
        label: "录入反馈",
        children: <ApplicationEditor key={`${candidate.applicationId}-${candidate.stage}-${candidate.status}-${candidate.interview}`} candidate={candidate} />
      }, {
        key: "timeline",
        label: "招聘进度",
        children: <><div className="workflow-note"><MapPin size={16} />{workflows.find(w => w.id === job?.workflowId)?.name} · 当前：{candidate.stage}</div><div className="stage-list">{stages.map(s => <StatusTag kind="stage" current={s === candidate.stage} key={s} value={s} />)}</div><div className="interview-records">{data.interviews.filter(r => r.applicationId === candidate.applicationId).map(r => <div className="info-block" key={r.id}><div><strong>{r.stage}</strong> <StatusTag value={r.status} /><p>{r.scheduledAt ? new Date(r.scheduledAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "面试时间未提供"}</p><p>{r.note}</p>{r.interviewer && <p>面试官：{r.interviewer}</p>}{r.result && <p>结果：<StatusTag value={r.result} /></p>}</div></div>)}</div><div>{data.events.filter(e => e.applicationId === candidate.applicationId && e.source).map(e => <details key={e.id}><summary>{e.title}</summary><blockquote>{e.source?.mode === "manual" ? (e.source.confirmed.remarks || "手动填写面试记录") : e.source?.original.evidence}</blockquote><p className="muted">{e.source?.confirmationNote}</p><p className="muted">事件时间：{e.source && formatDate(e.source.message.messageAt)}（上海）</p><p className="muted">{e.source?.mode === "manual" ? "手动填写" : "AI 提取"}：{e.source?.original.completedStage ?? "未提供"} / {e.source?.original.interviewResult ?? "未提供"} / {e.source?.original.nextStage ?? "无后续安排"}</p><p className="muted">HR 确认：{e.source?.confirmed.completedStage ?? "未提供"} / {e.source?.confirmed.interviewResult ?? "未提供"} / {e.source?.confirmed.nextStage ?? "无后续安排"}</p>{e.interviewChanges?.map(change => <p className="muted" key={change.after.id}>{change.after.stage} / {change.after.status} / {change.after.interviewer ?? "面试官未提供"} / {change.after.result ?? "待反馈"}<br />原时间：{change.before?.scheduledAt ? formatDate(change.before.scheduledAt) : "未记录"} → 确认时间：{change.after.scheduledAt ? formatDate(change.after.scheduledAt) : "未提供"}</p>)}</details>)}</div><h3 className="section-title">面试与流转历史</h3><Timeline items={[...candidate.history.map(h => ({
            color: "green",
            content: <><strong>{h.title}</strong><p className="muted">{h.date}</p><p>{h.note}</p></>
          })), {
            color: candidate.status === "已淘汰" ? "gray" : "blue",
            content: <><strong>{candidate.stage} · {candidate.status}</strong><p className="muted">{candidate.interview}</p><p>当前招聘阶段，等待下一步处理。</p></>
          }]} /></>
      }]} /></>}</Drawer>;
}
