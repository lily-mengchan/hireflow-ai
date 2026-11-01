"use client";

import { useState } from "react";
import { Button, Input, Select, Table, Tag } from "antd";
import { FileUp, Search, Users } from "lucide-react";
import { workflows } from "@/src/mocks/data";
import type { CandidateApplication as Candidate } from "@/src/types/recruitment";
import { useRecruitment } from "@/src/data/store";
import { CandidateDrawer, EmptyResult, PageHeading, Person, Score, StatusTag } from "@/src/components/ui";
import { currentOverview } from "@/src/analytics/facts";
import CandidateImport from "@/src/components/candidate-import";
import { formatDate } from "@/src/data/selectors";
export default function Candidates() {
  const { candidates, jobs, data } = useRecruitment();
  const overview = currentOverview(data);
  const [importOpen, setImportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [job, setJob] = useState<string>();
  const [education, setEducation] = useState<string>();
  const [experience, setExperience] = useState<string>();
  const [stage, setStage] = useState<string>();
  const [interview, setInterview] = useState<string>();
  const [detail, setDetail] = useState<Candidate | null>(null);
  const [page, setPage] = useState(1);
  const filtered = candidates.filter(c => `${c.name} ${c.id}`.toLowerCase().includes(search.toLowerCase()) && (!job || c.jobId === job) && (!education || c.education === education) && (!experience || (c.recommendation?.resume.experienceYears.value !== null && (experience === "3–5年" ? c.experience <= 5 : c.experience > 5))) && (!stage || c.stage === stage) && (!interview || c.interview === interview));
  function reset() {
    setSearch("");
    setJob(undefined);
    setEducation(undefined);
    setExperience(undefined);
    setStage(undefined);
    setInterview(undefined);
    setPage(1);
  }
  return <><PageHeading eyebrow="CANDIDATE MANAGEMENT" title="候选人管理" description="集中管理人才资料、岗位申请与推荐记录。" actions={<Button type="primary" icon={<FileUp size={15} />} onClick={() => setImportOpen(true)}>导入候选人</Button>} /><div className="candidate-overview"><div><span className="stat-icon blue"><Users size={23} /></span><div><p>人才库候选人</p><strong>{data.candidates.length}<small>人</small></strong></div></div><div><p>高匹配候选人</p><strong>{new Set(candidates.filter(c => c.score >= 85).map(c => c.id)).size}<small>人 · AI 匹配 ≥ 85 分</small></strong></div><div><p>面试已安排</p><strong>{new Set(candidates.filter(c => c.interview === "已安排" && c.status !== "已淘汰").map(c => c.id)).size}<small>人</small></strong></div><div><p>等待安排面试</p><strong>{overview.pendingInterviews}<small>人</small></strong></div></div><section className="panel list-panel"><div className="list-title"><h2>岗位申请列表 <span>{filtered.length}</span></h2><span className="muted">AI 匹配分数为预置演示数据</span></div><div className="filter-bar wrap"><Input aria-label="搜索候选人" prefix={<Search size={16} />} placeholder="搜索姓名或候选人编号" value={search} onChange={e => {
          setSearch(e.target.value);
          setPage(1);
        }} allowClear /><Select aria-label="候选人岗位筛选" placeholder="全部岗位" allowClear value={job} onChange={v => {
          setJob(v);
          setPage(1);
        }} options={jobs.map(j => ({
          value: j.id,
          label: j.title
        }))} /><Select aria-label="学历筛选" placeholder="全部学历" allowClear value={education} onChange={v => {
          setEducation(v);
          setPage(1);
        }} options={["本科", "硕士"].map(value => ({
          value
        }))} /><Select aria-label="经验筛选" placeholder="工作经验" allowClear value={experience} onChange={v => {
          setExperience(v);
          setPage(1);
        }} options={["3–5年", "5年以上"].map(value => ({
          value
        }))} /><Select aria-label="招聘阶段筛选" placeholder="招聘阶段" allowClear value={stage} onChange={v => {
          setStage(v);
          setPage(1);
        }} options={[...new Set(workflows.flatMap(w => w.stages))].map(value => ({
          value
        }))} /><Select aria-label="面试状态筛选" placeholder="面试状态" allowClear value={interview} onChange={v => {
          setInterview(v);
          setPage(1);
        }} options={["待安排", "已安排", "已完成"].map(value => ({
          value
        }))} /><Button onClick={reset}>重置</Button></div><Table rowKey="applicationId" locale={{
        emptyText: <EmptyResult />
      }} dataSource={filtered} scroll={{
        x: 1440
      }} pagination={{
        current: page,
        onChange: setPage,
        pageSize: 8,
        showSizeChanger: false,
        showTotal: n => `共 ${n} 条岗位申请`
      }} columns={[{
        title: "候选人",
        key: "person",
        width: 165,
        render: (_, c) => <button className="person-button" onClick={() => setDetail(c)}><Person candidate={c} /></button>
      }, {
        title: "应聘岗位",
        dataIndex: "jobId",
        width: 230,
        render: id => <div className="cell-stack"><strong>{jobs.find(j => j.id === id)?.title}</strong><small>{jobs.find(j => j.id === id)?.department}</small></div>
      }, {
        title: "学历 / 工作经验",
        width: 190,
        render: (_, c) => <div className="cell-stack"><span>{c.education} · {c.recommendation?.resume.experienceYears.value === null ? "工作年限未提供" : `${c.experience} 年`}</span><small>{c.school}</small></div>
      }, {
        title: "AI 匹配",
        width: 110,
        dataIndex: "score",
        sorter: (a, b) => a.score - b.score,
        render: (v, c) => c.recommendation ? <Tag>见初筛分析</Tag> : <Score value={v} />
      }, {
        title: "招聘阶段",
        width: 130,
        dataIndex: "stage",
        render: (v, c) => <StatusTag value={c.recommendation && c.stage === workflows.find(w => w.id === jobs.find(j => j.id === c.jobId)?.workflowId)?.stages[c.recommendation.status === "待 HR 审核" ? 0 : 1] && c.status === "待处理" ? c.recommendation.status : v} />
      }, {
        title: "处理状态",
        width: 110,
        dataIndex: "status",
        render: v => <StatusTag value={v} />
      }, {
        title: "面试 / HR 推荐",
        width: 170,
        render: (_, c) => <div className="cell-stack"><StatusTag value={c.interview} />{c.recommendation ? <StatusTag value={data.applications.find(a => a.id === c.applicationId)?.collaboration?.businessReviewStatus === "建议进入面试" ? "待 HR 确认推进" : data.applications.find(a => a.id === c.applicationId)?.collaboration?.businessReviewStatus ?? c.recommendation.status} /> : <small>暂无推荐记录</small>}</div>
      }, {
        title: "最近更新",
        width: 145,
        render: (_, c) => <span className="table-date">{formatDate(data.applications.find(a => a.id === c.applicationId)?.updatedAt ?? c.createdAt)}</span>
      }, {
        title: "操作",
        fixed: "right",
        width: 110,
        render: (_, c) => <button className="text-button" onClick={() => setDetail(c)}>查看详情</button>
      }]} /></section>{importOpen && <CandidateImport open={importOpen} onClose={() => setImportOpen(false)} />}<CandidateDrawer candidate={detail} onClose={() => setDetail(null)} /></>;
}
