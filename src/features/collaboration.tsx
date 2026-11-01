"use client";
import { useState } from "react";
import { Alert, App, Button, Card, Empty, Input, Select, Space, Tabs } from "antd";
import { recruitmentActions, useRecruitment } from "../data/store";
import { useIdentity } from "../data/identity";
import { blankFeedback, identities, type CollaborationCommand, type FeedbackFields } from "../data/collaboration";
import type { Application, InterviewRecord } from "../types/recruitment";
import { PageHeading } from "../components/ui";
import StatusBadge from "../components/status-badge";
import { mockRecommendation } from "../mocks/recommendations";

function FeedbackForm({ application, task }: { application: Application; task: InterviewRecord }) {
  const actor = useIdentity(); const { message } = App.useApp();
  const c = application.collaboration!;
  const latest = c.feedback.filter(f => f.interviewId === task.id && f.reviewerId === actor.id).at(-1);
  const draft = c.drafts[`${task.id}:${actor.id}`];
  const [editing, setEditing] = useState<boolean>(!latest || !!draft);
  const [fields, setFields] = useState<FeedbackFields>(draft ?? latest?.fields ?? blankFeedback);
  const labels = { ability: "技术或岗位能力评价", projects: "项目经历评价", communication: "沟通及综合表现", strengths: "优势与不足", summary: "综合评价", remarks: "补充备注" };
  function save(type: "draft" | "submit") { try { recruitmentActions.collaborate(application.id, crypto.randomUUID(), { type, interviewId: task.id, fields, revisionOf: latest?.id }); message.success(type === "draft" ? "草稿已保存" : "面评已提交，招聘阶段保持不变"); if (type === "submit") setEditing(false); } catch (e) { message.error((e as Error).message); } }
  return <Card title={`${task.stage} · ${task.scheduledAt ? new Date(task.scheduledAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) : "时间待核实"}`}>
    {editing ? <div className="collab-form">{Object.entries(labels).map(([key, label]) => <label key={key}>{label}<Input.TextArea aria-label={label} rows={2} maxLength={4000} value={fields[key as keyof typeof labels]} onChange={e => setFields({ ...fields, [key]: e.target.value })} /></label>)}<label>面试结果<Select value={fields.result} onChange={result => setFields({ ...fields, result })} options={["通过", "不通过", "待定"].map(value => ({ value }))} /></label><Space><Button onClick={() => save("draft")}>保存草稿</Button><Button type="primary" onClick={() => save("submit")}>正式提交面评</Button></Space></div> : <><p>{latest?.fields.summary} · {latest?.fields.result}</p><Button onClick={() => { setFields(latest?.fields ?? blankFeedback); setEditing(true); }}>发起修订（保留原记录）</Button></>}
  </Card>;
}
export function CollaborationDetail({ applicationId }: { applicationId: string }) {
  const { data } = useRecruitment(); const actor = useIdentity(); const { message } = App.useApp();
  const a = data.applications.find(a => a.id === applicationId);
  const [interviewerId, setInterviewerId] = useState("interviewer-1"); const [conclusion, setConclusion] = useState(""); const [comment, setComment] = useState(""); const [time, setTime] = useState("");
  if (!a) return null;
  const c = a.collaboration;
  const recommendation = a.recommendation ?? mockRecommendation(data, a);
  const tasks = data.interviews.filter(i => i.applicationId === a.id && i.interviewerId);
  function act(command: CollaborationCommand) { try { recruitmentActions.collaborate(applicationId, crypto.randomUUID(), command); message.success("已保存"); } catch (e) { message.error((e as Error).message); } }
  return <div className="collab-form">
    <Space wrap><StatusBadge value={c?.businessReviewStatus ?? "尚未分配"} />{c?.businessReviewStatus === "建议进入面试" && <StatusBadge value="待 HR 确认推进" />}</Space>
    {actor.role === "hr" ? <>{recommendation && <><h3>HR 推荐评语</h3><p className="collab-copy">{recommendation.content}</p></>}<label>业务面试官<Select aria-label="业务面试官" value={interviewerId} onChange={setInterviewerId} options={identities.filter(i => i.role === "interviewer").map(i => ({ value: i.id, label: i.name }))} /></label><label>给面试官的沟通摘要（选填）<Input.TextArea value={conclusion} maxLength={1000} onChange={e => setConclusion(e.target.value)} /></label><Button disabled={!recommendation || a.status !== "待处理" || !["HR 初筛", "业务复筛", "作品集评审"].includes(a.stage) || c?.businessReviewStatus === "HR 已确认推进"} onClick={() => act({ type: "assign", interviewerId, sharedConclusion: conclusion })}>推荐并分配复筛</Button>{!recommendation && <p className="muted">请先通过简历导入完成 HR 推荐评语。</p>}{c?.businessReviewStatus === "建议进入面试" && <Button type="primary" onClick={() => act({ type: "advance" })}>确认推进</Button>}{c?.businessReviewStatus === "不建议进入" && <Alert type="warning" title="请查看反馈后决定进一步沟通、重新分配或在招聘流程中结束申请。" />}{c?.businessReviewStatus === "HR 已确认推进" && <><label>面试时间（上海）<Input type="datetime-local" value={time} onChange={e => setTime(e.target.value)} /></label><Button disabled={!time} onClick={() => act({ type: "schedule", interviewerId, scheduledAt: new Date(`${time}:00+08:00`).toISOString() })}>分配当前轮面试任务</Button></>}</> : <>
      <Card className="collab-section" size="small" title="HR 推荐评语">
        <p className="collab-copy">{a.recommendation?.content.trim() || "无"}</p>
      </Card>
      <Card className="collab-section" size="small" title="AI 岗位匹配依据">
        {a.recommendation?.analysis.findings.length ? a.recommendation.analysis.findings.map((f, i) => <div className="collab-finding" key={i}><p><strong>岗位要求：</strong>{f.jdQuote.trim() || "无"}</p><p><strong>简历依据：</strong>{f.resumeQuote?.trim() || "无"}</p><p><strong>匹配判断：</strong>{f.assessment}</p></div>) : <p>无</p>}
      </Card>
      <Card className="collab-section" size="small" title="HR 沟通摘要">
        <p className="collab-copy">{c?.sharedConclusion.trim() || "无"}</p>
      </Card>
      {c?.interviewerId === actor.id && c.businessReviewStatus === "待业务复筛" && <Card className="collab-section" size="small" title="提交业务复筛意见"><div className="collab-form"><label>复筛原因（选填）<Input.TextArea aria-label="复筛原因（选填）" value={comment} maxLength={4000} onChange={e => setComment(e.target.value)} /></label><Space wrap>{(["建议进入面试", "不建议进入"] as const).map(result => <Button key={result} onClick={() => act({ type: "review", assignmentId: c.assignmentId, result, comment })}>{result}</Button>)}</Space></div></Card>}
      {tasks.map(task => <FeedbackForm key={task.id} application={a} task={task} />)}
    </>}
    <h3>业务复筛反馈及历史</h3>{c?.reviews.length ? c.reviews.map(r => <Card key={r.id} size="small" title={`${r.result} · ${identities.find(i => i.id === r.reviewerId)?.name}`}><p>复筛原因：{r.comment.trim() || "无"}</p><time>{r.submittedAt}</time></Card>) : <p className="muted">无</p>}
    <h3>面评记录</h3>{c?.feedback.length ? c.feedback.map(f => <Card key={f.id} size="small" title={`${data.interviews.find(i => i.id === f.interviewId)?.stage} · ${f.fields.result}${f.revisionOf ? " · 修订" : ""}`}><p>{identities.find(i => i.id === f.reviewerId)?.name} · {f.submittedAt}</p>{Object.entries(f.fields).map(([key, value]) => <p key={key}><strong>{{ ability: "岗位能力", projects: "项目经历", communication: "沟通表现", strengths: "优势与不足", summary: "综合评价", result: "结果", remarks: "备注" }[key]}：</strong>{value.trim() || "无"}</p>)}</Card>) : <p className="muted">无</p>}
  </div>;
}
export default function CollaborationWorkspace() {
  const { data, ready, error } = useRecruitment(); const actor = useIdentity(); const [tab, setTab] = useState("review");
  const hr = actor.role === "hr";
  const pending = data.applications.filter(a => a.collaboration?.interviewerId === actor.id && a.collaboration.businessReviewStatus === "待业务复筛");
  const tasks = data.interviews.filter(i => i.interviewerId === actor.id);
  const unfinished = tasks.filter(i => !data.applications.find(a => a.id === i.applicationId)?.collaboration?.feedback.some(f => f.interviewId === i.id && f.reviewerId === actor.id));
  const rows = hr ? data.applications : tab === "review" ? pending : data.applications.filter(a => tab === "tasks" ? tasks.some(i => i.applicationId === a.id) : a.collaboration?.feedback.some(f => f.reviewerId === actor.id));
  return <><PageHeading eyebrow="RECRUITMENT COLLABORATION" title={hr ? "业务复筛反馈" : "业务面试官工作台"} description="Demo 登录 · 数据仅保存在当前浏览器。业务意见与面评不会自动推进招聘阶段。" /><Alert type="info" showIcon title="模拟权限演示，不具备生产身份认证或跨设备数据隔离能力。" />{error && <Alert type="error" title={error} />}{!hr && <><div className="collab-stats"><Card>待复筛人数<strong>{pending.length}</strong></Card><Card>待填写面评人数<strong>{new Set(unfinished.map(i => data.applications.find(a => a.id === i.applicationId)?.candidateId)).size}</strong></Card><Card>已提交面评<strong>{data.applications.reduce((n, a) => n + (a.collaboration?.feedback.length ?? 0), 0)}</strong></Card></div><RecentSubmissions /><Tabs activeKey={tab} onChange={setTab} items={[{ key: "review", label: "待我复筛" }, { key: "tasks", label: "我的面试任务" }, { key: "history", label: "面评记录 / 最近提交" }]} /></>}
    {ready && !rows.length && <Empty description="暂无分配任务或记录" />}{rows.map(a => { const candidate = data.candidates.find(c => c.id === a.candidateId)!; return <Card className="collab-card" key={a.id} title={`${candidate.name} · ${data.jobs.find(j => j.id === a.jobId)?.title}`}><p className="muted">{a.id} · {a.stage} · {candidate.education} · {candidate.school} · {candidate.company}</p><p>{candidate.summary}</p><p>{candidate.skills.join(" / ")}</p>{!hr && a.recommendation && <details><summary>查看结构化简历</summary>{[...a.recommendation.resume.experiences, ...a.recommendation.resume.projects].map((f, i) => <p key={i}>{f.value}</p>)}</details>}<CollaborationDetail key={`${actor.id}:${a.collaboration?.assignmentId}`} applicationId={a.id} /></Card>; })}</>;
}

function RecentSubmissions() {
  const { data } = useRecruitment();
  const records = data.applications.flatMap(a => [
    ...(a.collaboration?.feedback ?? []).map(f => ({ id: f.id, at: f.submittedAt, application: a, text: `面评 · ${f.fields.result} · ${f.fields.summary}` })),
    ...(a.collaboration?.reviews ?? []).map(r => ({ id: r.id, at: r.submittedAt, application: a, text: `复筛 · ${r.result}` })),
  ]).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 3);
  return <Card className="collab-card" title="最近提交记录">{records.length ? records.map(r => <p key={r.id}>{data.candidates.find(c => c.id === r.application.candidateId)?.name} · {data.jobs.find(j => j.id === r.application.jobId)?.title}<br />{r.text}<br /><time>{new Date(r.at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</time></p>) : <p className="muted">暂无提交记录</p>}</Card>;
}
