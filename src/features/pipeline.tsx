"use client";

import { useState } from "react";
import { Button, Segmented, Select, Space, Table, Tag } from "antd";
import { ArrowRight, ClipboardList, GitBranch, LayoutGrid, List, SlidersHorizontal } from "lucide-react";
import { workflows } from "@/src/mocks/data";
import type { CandidateApplication as Candidate } from "@/src/types/recruitment";
import { useRecruitment } from "@/src/data/store";
import { CandidateDrawer, EmptyResult, PageHeading, Person, Score, StatusTag } from "@/src/components/ui";
import RecruitmentMessageEntry from "@/src/components/recruitment-message-entry";
export default function Pipeline() {
  const { candidates, jobs } = useRecruitment();
  const [jobId, setJobId] = useState<string>();
  const [workflowId, setWorkflowId] = useState("standard");
  const [view, setView] = useState("看板");
  const [status, setStatus] = useState<string>();
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const workflow = workflows.find(w => w.id === workflowId)!;
  const filtered = candidates.filter(c => (!jobId || c.jobId === jobId) && jobs.find(j => j.id === c.jobId)?.workflowId === workflowId && (!status || c.status === status));
  return <><PageHeading eyebrow="RECRUITMENT PIPELINE" title="招聘流程管理" description="按岗位推进申请，跟进面试安排与反馈。" actions={<Space wrap><Button icon={<SlidersHorizontal size={15} />} onClick={() => setShowConfig(!showConfig)}>{showConfig ? "收起流程说明" : "查看流程模板"}</Button><Button type="primary" icon={<ClipboardList size={15} />} aria-expanded={showFeedback} aria-controls="pipeline-feedback-entry" onClick={() => setShowFeedback(v => !v)}>{showFeedback ? "收起反馈录入" : "录入面试反馈"}</Button></Space>} /><div id="pipeline-feedback-entry" hidden={!showFeedback}><RecruitmentMessageEntry /></div><div className="pipeline-toolbar"><div className="pipeline-selects"><Select aria-label="招聘流程模板" value={workflowId} onChange={v => {
          setWorkflowId(v);
          setJobId(undefined);
        }} options={workflows.map(w => ({
          value: w.id,
          label: w.name
        }))} /><Select aria-label="按岗位查看流程" placeholder="全部岗位" allowClear value={jobId} onChange={setJobId} options={jobs.filter(j => j.workflowId === workflowId).map(j => ({
          value: j.id,
          label: j.title
        }))} /><Select aria-label="按处理状态筛选流程" placeholder="全部状态" allowClear value={status} onChange={setStatus} options={["待处理", "已通过", "已淘汰"].map(value => ({
          value
        }))} /></div><Segmented value={view} onChange={v => setView(String(v))} options={[{
        value: "看板",
        icon: <LayoutGrid size={14} />,
        label: "看板"
      }, {
        value: "列表",
        icon: <List size={14} />,
        label: "列表"
      }]} /></div>
    {showConfig && <div className="panel workflow-explainer"><h3><GitBranch size={18} />流程模板</h3><p>当前岗位使用以下招聘路径。点击候选人可查看进度、录入面试反馈并保留历史记录。</p><div className="flow-template">{workflow.stages.map((s, i) => <span key={s}><StatusTag kind="stage" value={s} />{i < workflow.stages.length - 1 && <ArrowRight size={14} />}</span>)}</div></div>}
    <div className="pipeline-summary"><span><i className="legend-blue" />{filtered.length} 位候选人</span><span>待处理 <strong>{filtered.filter(c => c.status === "待处理").length}</strong></span><span>已通过 <strong>{filtered.filter(c => c.status === "已通过").length}</strong></span><span>已淘汰 <strong>{filtered.filter(c => c.status === "已淘汰").length}</strong></span><span className="muted">点击候选人查看招聘进度与面试历史</span></div>
    {view === "看板" ? <div className="kanban" aria-label="招聘阶段看板">{workflow.stages.map(stage => {
        const list = filtered.filter(c => c.stage === stage);
        return <section className="kanban-column" key={stage}><div className="kanban-heading"><span aria-hidden="true" /><h2>{stage}</h2><b>{list.length}</b></div><div className="kanban-cards">{list.map(c => <button aria-pressed={detail?.applicationId === c.applicationId} className={`kanban-card ${c.status === "已淘汰" ? "eliminated" : ""}`} key={c.applicationId} onClick={() => setDetail(c)}><div className="kanban-card-top"><Person candidate={c} /><span className="card-ellipsis">···</span></div><p className="kanban-job">{jobs.find(j => j.id === c.jobId)?.title}</p><p className="kanban-meta">{c.education} · {c.recommendation?.resume.experienceYears.value === null ? "工作年限未提供" : `${c.experience} 年经验`}</p>{c.recommendation ? <Tag>见初筛分析</Tag> : <Score value={c.score} />}<div className="kanban-card-footer"><StatusTag value={c.status} /><StatusTag value={c.interview} /></div></button>)}{!list.length && <div className="kanban-empty">暂无候选人</div>}</div></section>;
      })}</div> : <section className="panel list-panel"><Table rowKey="applicationId" dataSource={filtered} scroll={{
        x: 820
      }} locale={{
        emptyText: <EmptyResult />
      }} columns={[{
        title: "候选人",
        render: (_, c) => <Person candidate={c} />
      }, {
        title: "应聘岗位",
        dataIndex: "jobId",
        render: id => jobs.find(j => j.id === id)?.title
      }, {
        title: "当前阶段",
        dataIndex: "stage",
        render: v => <StatusTag kind="stage" value={v} />
      }, {
        title: "处理状态",
        dataIndex: "status",
        render: v => <StatusTag value={v} />
      }, {
        title: "面试状态",
        dataIndex: "interview",
        render: v => <StatusTag value={v} />
      }, {
        title: "操作",
        render: (_, c) => <button className="text-button" onClick={() => setDetail(c)}>查看进度</button>
      }]} pagination={{
        pageSize: 8,
        showSizeChanger: false
      }} /></section>}
    <p className="data-note">看板按岗位申请展示，同一候选人可有多份独立申请。详情中可修改阶段、状态并保留历史。</p><CandidateDrawer candidate={detail} onClose={() => setDetail(null)} initialTab="timeline" /></>;
}
