"use client";

import { useState } from "react";
import { App, Button, Descriptions, Drawer, Form, Input, InputNumber, Modal, Select, Table, Tabs, Tag } from "antd";
import { BriefcaseBusiness, FileText, Plus, Search } from "lucide-react";
import { workflows } from "@/src/mocks/data";
import type { JobSummary as Job } from "@/src/types/recruitment";
import { recruitmentActions, useRecruitment } from "@/src/data/store";
import { selectHiredCount } from "@/src/data/selectors";
import { EmptyResult, PageHeading, StatusTag } from "@/src/components/ui";
import JobConditions from "@/src/components/job-conditions";
import { evaluateConditions } from "@/src/screening/conditions";
export default function Jobs() {
  const { jobs, data, ready } = useRecruitment();
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [editing, setEditing] = useState<Job | "new" | null>(null);
  const [selectedDetail, setDetail] = useState<Job | null>(null);
  const detail = jobs.find(j => j.id === selectedDetail?.id) ?? null;
  const [form] = Form.useForm<Job>();
  const {
    message
  } = App.useApp();
  const filtered = jobs.filter(j => `${j.title} ${j.id}`.toLowerCase().includes(search.toLowerCase()) && (!department || j.department === department) && (!status || j.status === status));
  function openEditor(job: Job | "new") {
    setEditing(job);
    form.resetFields();
    form.setFieldsValue(job === "new" ? {
      department: "研发部",
      location: "上海",
      type: "全职",
      education: "本科",
      experience: "3–5年",
      headcount: 1,
      status: "招聘中",
      workflowId: "standard"
    } : job);
  }
  function save(values: Job) {
    try {
      recruitmentActions.saveJob(values, editing !== "new" && editing ? editing.id : undefined);
      setEditing(null);
      message.success("岗位已保存，刷新后仍会保留");
    } catch (error) { message.error(error instanceof Error ? error.message : "保存失败，请检查浏览器存储权限"); }
  }
  return <><PageHeading eyebrow="JOB MANAGEMENT" title="岗位管理" description="管理招聘需求、岗位要求与招聘进度。" actions={<Button type="primary" icon={<Plus size={16} />} disabled={!ready} onClick={() => openEditor("new")}>新建岗位</Button>} /><div className="mini-stats">{[{
        label: "全部岗位",
        value: jobs.length
      }, {
        label: "招聘中",
        value: jobs.filter(j => j.status === "招聘中").length
      }, {
        label: "计划招聘",
        value: jobs.reduce((n, j) => n + j.headcount, 0)
      }, {
        label: "已录用",
        value: selectHiredCount(data)
      }].map(s => <div key={s.label}><span>{s.label}</span><strong>{s.value}<small>{s.label.includes("招聘") && s.label !== "招聘中" ? "人" : s.label === "已录用" ? "人" : "个"}</small></strong></div>)}</div>
    <section className="panel list-panel"><div className="list-title"><h2>岗位列表 <span>{jobs.length}</span></h2><span className="muted">按最新保存的岗位信息展示</span></div><div className="filter-bar"><Input prefix={<Search size={16} />} placeholder="搜索岗位名称或编号" aria-label="搜索岗位" value={search} onChange={e => setSearch(e.target.value)} allowClear /><Select placeholder="全部部门" aria-label="按部门筛选" allowClear value={department} onChange={setDepartment} options={[...new Set(jobs.map(j => j.department))].map(value => ({
          value
        }))} /><Select placeholder="全部状态" aria-label="按岗位状态筛选" allowClear value={status} onChange={setStatus} options={["招聘中", "已暂停", "已结束"].map(value => ({
          value
        }))} /><Button onClick={() => {
          setSearch("");
          setDepartment(undefined);
          setStatus(undefined);
        }}>重置</Button><span className="filter-count">共 {filtered.length} 个岗位</span></div><Table rowKey="id" dataSource={filtered} locale={{
        emptyText: <EmptyResult />
      }} scroll={{
        x: 1150
      }} pagination={{
        defaultPageSize: 6,
        showSizeChanger: false,
        showTotal: total => `共 ${total} 条岗位`
      }} columns={[{
        title: "岗位名称",
        dataIndex: "title",
        width: 280,
        render: (v, r) => <div className="job-name"><span className="job-mini-icon"><BriefcaseBusiness size={19} /></span><span><button className="table-name" onClick={() => setDetail(r)}>{v}</button><small>{r.id} · {r.salary} · {r.type}</small></span></div>
      }, {
        title: "所属部门",
        dataIndex: "department"
      }, {
        title: "工作地点",
        dataIndex: "location"
      }, {
        title: "招聘人数",
        dataIndex: "headcount",
        render: v => `${v} 人`
      }, {
        title: "候选人",
        dataIndex: "applicants",
        render: v => <strong className="blue-text">{v}</strong>
      }, {
        title: "岗位状态",
        dataIndex: "status",
        render: v => <StatusTag value={v} />
      }, {
        title: "创建日期",
        dataIndex: "created"
      }, {
        title: "操作",
        fixed: "right",
        width: 120,
        render: (_, r) => <div className="table-actions"><button onClick={() => setDetail(r)}>详情</button><button onClick={() => openEditor(r)}>编辑</button></div>
      }]} /></section>
    <Modal title={<div className="modal-title"><BriefcaseBusiness size={21} />{editing === "new" ? "新建岗位" : "编辑岗位"}</div>} open={!!editing} onCancel={() => setEditing(null)} width={760} footer={<><Button onClick={() => setEditing(null)}>取消</Button><Button type="primary" onClick={() => form.submit()}>保存岗位</Button></>}><p className="muted">完善岗位信息，清晰传达你对下一位团队成员的期待。</p><Form form={form} layout="vertical" onFinish={save} requiredMark="optional"><div className="form-section-label">基本信息</div><div className="form-grid"><Form.Item name="title" label="岗位名称" rules={[{
            required: true,
            whitespace: true,
            message: "请输入岗位名称"
          }]}><Input placeholder="例如：高级前端工程师" maxLength={50} /></Form.Item><Form.Item name="department" label="所属部门" rules={[{
            required: true
          }]}><Select options={["研发部", "产品部", "设计部", "人力资源部", "市场部"].map(value => ({
              value
            }))} /></Form.Item><Form.Item name="location" label="工作地点" rules={[{
            required: true,
            whitespace: true
          }]}><Input maxLength={40} /></Form.Item><Form.Item name="headcount" label="招聘人数" rules={[{
            required: true
          }]}><InputNumber min={1} max={999} precision={0} suffix="人" style={{
              width: "100%"
            }} /></Form.Item><Form.Item name="salary" label="薪资范围" rules={[{
            required: true,
            whitespace: true,
            message: "请输入薪资范围"
          }]}><Input placeholder="例如：25–40K / 月" maxLength={40} /></Form.Item><Form.Item name="type" label="用工类型"><Select options={["全职", "实习", "兼职", "外包"].map(value => ({
              value
            }))} /></Form.Item><Form.Item name="education" label="学历要求"><Select options={["不限", "大专", "本科", "硕士", "博士"].map(value => ({
              value
            }))} /></Form.Item><Form.Item name="experience" label="工作经验"><Select options={["不限", "应届生", "1–3年", "3–5年", "5–10年", "10年以上"].map(value => ({
              value
            }))} /></Form.Item><Form.Item name="status" label="岗位状态"><Select options={["招聘中", "已暂停", "已结束"].map(value => ({
              value
            }))} /></Form.Item><Form.Item name="workflowId" label="招聘流程模板"><Select disabled={editing !== "new" && !!editing && editing.applicants > 0} options={workflows.map(w => ({
              value: w.id,
              label: w.name
            }))} /></Form.Item></div><div className="form-section-label"><FileText size={16} />岗位描述 JD</div><Form.Item name="jd" label="岗位职责与任职要求" rules={[{
          required: true,
          whitespace: true,
          message: "请填写岗位描述"
        }]}><Input.TextArea rows={8} maxLength={10000} showCount placeholder="描述岗位职责、任职要求及加分项…" /></Form.Item><div className="form-section-label">基础筛选条件</div><Form.Item name="screeningConditions" rules={[{ validator: async (_, rows) => { try { evaluateConditions("form", rows, {}); } catch (e) { throw new Error(e instanceof Error ? e.message : "请修正筛选条件"); } } }]}><JobConditions /></Form.Item><p className="data-note">岗位保存在此浏览器，刷新后保留。岗位 JD 及基本要求会提交至服务端和模型服务，用于智能问答。</p></Form></Modal>
    <Drawer title="岗位详情" open={!!detail} onClose={() => setDetail(null)} size={680} extra={detail && <Button type="primary" onClick={() => openEditor(detail)}>编辑岗位</Button>}>{detail && <><div className="job-detail-title"><span className="job-mini-icon"><BriefcaseBusiness size={25} /></span><div><h2>{detail.title}</h2><p className="muted">{detail.id} · 创建于 {detail.created}</p></div></div><div className="detail-tags"><StatusTag value={detail.status} /><Tag>{detail.department}</Tag><Tag>{detail.location}</Tag></div><Tabs items={[{
          key: "basic",
          label: "岗位信息",
          children: <><Descriptions column={2} items={[{
              key: "salary",
              label: "薪资范围",
              children: detail.salary
            }, {
              key: "type",
              label: "用工类型",
              children: detail.type
            }, {
              key: "education",
              label: "学历要求",
              children: detail.education
            }, {
              key: "experience",
              label: "经验要求",
              children: detail.experience
            }, {
              key: "headcount",
              label: "招聘人数",
              children: detail.headcount
            }, {
              key: "applicants",
              label: "候选人数",
              children: detail.applicants
            }]} /><h3 className="section-title">岗位描述 JD</h3><div className="jd-content">{detail.jd}</div></>
        }, {
          key: "flow",
          label: "招聘流程",
          children: <><p className="muted">{workflows.find(w => w.id === detail.workflowId)?.name} · 按岗位关联独立流程模板</p><div className="workflow-vertical">{workflows.find(w => w.id === detail.workflowId)?.stages.map((s, i) => <div key={s}><span>{i + 1}</span><strong>{s}</strong><Tag>人工评估</Tag></div>)}</div></>
        }]} /></>}</Drawer>
  </>;
}
