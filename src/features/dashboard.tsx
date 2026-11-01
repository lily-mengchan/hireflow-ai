"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Progress, Select, Table } from "antd";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, CheckCheck, Clock3, Plus, Sparkles, Users } from "lucide-react";
import { useRecruitment } from "@/src/data/store";
import { selectDashboard } from "@/src/data/selectors";
import { PageHeading, Panel, StatusTag } from "@/src/components/ui";
export default function Dashboard() {
  const { data, jobs, ready } = useRecruitment();
  const summary = selectDashboard(data, ready ? new Date() : new Date("2026-11-01T10:00:00+08:00"));
  const { funnel, trend, activities } = summary;
  const dashboardStats = [
    { title: "候选人总数", value: summary.candidateCount, unit: "人", color: "blue", href: "/candidates" },
    { title: "在招岗位数量", value: summary.openJobCount, unit: "个", color: "purple", href: "/jobs" },
    { title: "待安排面试", value: summary.pendingCount, unit: "人", color: "orange", href: "/pipeline" },
    { title: "已发 Offer", value: summary.offerCount, unit: "份", color: "green", href: "/pipeline" },
  ];
  const [period, setPeriod] = useState("最近 7 天");
  const exportReport = () => {
    const blob = new Blob(["﻿" + "招聘阶段,申请数\n" + funnel.map(f => `${f.name},${f.value}`).join("\n")], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "HireFlow-演示招聘报表.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  return <><PageHeading eyebrow="RECRUITMENT OVERVIEW" title="招聘数据看板" description="掌握招聘进展，聚焦需要推进的下一步。" actions={<><span className="date-range"><CalendarDays size={15} />{trend[0].day} — {trend[6].day}</span><Button icon={<ArrowDownToLine size={15} />} onClick={exportReport}>导出报表</Button></>} />
    <div className="stats-grid">{dashboardStats.map((s, index) => <Link href={s.href} className="stat-card" key={s.title}><div className="stat-top"><span>{s.title}</span><span className={`stat-icon ${s.color}`}>{[<Users key="users" size={19} />, <BriefcaseBusiness key="jobs" size={19} />, <Clock3 key="pending" size={19} />, <CheckCheck key="offers" size={19} />][index]}</span></div><div className="stat-number">{s.value}<span>{s.unit}</span></div><div className="stat-foot"><span>{["人才库中的独立候选人", "当前开放的招聘需求", "等待安排正式面试", "已通过 Offer 阶段"][index]}</span><ArrowUpRight size={14} /></div></Link>)}</div>
    <div className="dashboard-priority"><div><span className="priority-icon"><Clock3 size={18} /></span><div><strong>待安排面试</strong><p>{summary.pendingCount ? `有 ${summary.pendingCount} 位候选人等待下一步安排` : "当前没有待安排的正式面试"}</p></div></div><Link href="/pipeline">查看招聘流程 <ArrowRight size={15} /></Link></div>
    <div className="charts-grid"><Panel title="招聘漏斗" subtitle="按明确阶段记录统计，单位：岗位申请" extra={<span className="subtle-label">累计数据</span>}><div className="funnel">{funnel.map((f) => <div className="funnel-row" key={f.name}><span className="funnel-label">{f.name}</span><div className="funnel-track"><div style={{
                width: `${data.applications.length ? Math.max(5, f.value / data.applications.length * 100) : 0}%`,
                background: ["#447eaf", "#6699c2", "#83acca", "#a1bfd5", "#bed2e2"][funnel.indexOf(f)]
              }}><strong>{f.value.toLocaleString()}</strong></div></div><span className="funnel-percent">{(data.applications.length ? f.value / data.applications.length * 100 : 0).toFixed(1)}%</span></div>)}</div><div className="funnel-summary"><span><i />整体 Offer 转化率</span><strong>{summary.conversion}%</strong></div></Panel>
    <Panel title="招聘趋势" subtitle="了解人才流入与面试安排的变化" extra={<Select aria-label="趋势周期" value={period} onChange={setPeriod} size="small" options={[{
        value: "最近 7 天"
      }, {
        value: "前 7 天"
      }]} />}><div className="chart-legend"><span><i className="legend-blue" />新增候选人</span><span><i className="legend-light" />面试人数</span></div><div className="trend-chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={period === "最近 7 天" ? trend : summary.previousTrend} margin={{
              top: 12,
              right: 10,
              left: -24,
              bottom: 0
            }}><defs><linearGradient id="blueArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0071e3" stopOpacity={0.2} /><stop offset="100%" stopColor="#0071e3" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef1f6" strokeDasharray="4 4" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{
                fill: "#667085",
                fontSize: 13
              }} dy={10} /><YAxis axisLine={false} tickLine={false} tick={{
                fill: "#667085",
                fontSize: 13
              }} /><Tooltip contentStyle={{
                borderRadius: 10,
                borderColor: "#e7ecf3",
                fontSize: 13
              }} /><Area type="monotone" name="新增候选人" dataKey="candidates" stroke="#0071e3" strokeWidth={2.5} fill="url(#blueArea)" /><Area type="monotone" name="面试人数" dataKey="interviews" stroke="#9aa8b8" strokeWidth={2} strokeDasharray="5 4" fill="transparent" /></AreaChart></ResponsiveContainer></div></Panel></div>
    <div className="bottom-grid"><Panel title="各岗位招聘进度" subtitle="聚焦重点岗位，把握招聘节奏" extra={<Link className="panel-link" href="/jobs">全部岗位 <ArrowRight size={14} /></Link>} className="progress-panel"><Table rowKey="id" pagination={false} dataSource={jobs.slice(0, 4)} scroll={{
          x: 580
        }} columns={[{
          title: "岗位名称",
          dataIndex: "title",
          render: (v, r) => <div className="job-name"><span className="job-mini-icon"><BriefcaseBusiness size={17} /></span><span><strong>{v}</strong><small>{r.department} · {r.location}</small></span></div>
        }, {
          title: "候选人",
          dataIndex: "applicants",
          width: 85
        }, {
          title: "录用进度",
          render: (_, r) => <div className="hiring-progress"><span>{r.hired} <small>/ {r.headcount} 人</small></span><Progress percent={Math.round(r.hired / r.headcount * 100)} showInfo={false} size="small" /></div>
        }, {
          title: "状态",
          dataIndex: "status",
          render: v => <StatusTag value={v} />
        }]} /></Panel>
    <Panel title="最近招聘动态" subtitle="团队招聘进展，随时掌握" extra={<span className="live-label"><span />实时动态</span>}><div className="activity-list">{activities.map((a, i) => <div className="activity" key={a.id}><span className={`activity-dot dot-${i}`} /><div><p><strong>{a.name}</strong> {a.action}</p><span>{a.time}</span></div></div>)}</div><Link href="/pipeline" className="activity-more">查看全部招聘进展 <ArrowRight size={14} /></Link></Panel></div>
    <div className="dashboard-note"><Sparkles size={16} /><span>好的招聘，从更清晰的洞察开始。</span><Link href="/assistant">试试 AI 招聘助手 <ArrowUpRight size={14} /></Link><Link href="/jobs"><Plus size={14} />新建岗位</Link></div><p className="data-note">统计来自当前共享数据。候选人按唯一 ID 去重；漏斗按岗位申请历史计数，发放 Offer 指当前处于 Offer 阶段且未淘汰的申请。</p>
  </>;
}
