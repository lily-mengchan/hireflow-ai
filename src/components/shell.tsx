"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { App, ConfigProvider, Modal } from "antd";
import DataControls from "./data-controls";
import zhCN from "antd/locale/zh_CN";
import { ArrowUpRight, Bell, BriefcaseBusiness, ChevronDown, CircleHelp, GitBranch, LayoutDashboard, Menu, Search, Sparkles, Users, X } from "lucide-react";
const navigation = [{
  href: "/",
  title: "招聘数据看板",
  icon: LayoutDashboard
}, {
  href: "/jobs",
  title: "岗位管理",
  icon: BriefcaseBusiness
}, {
  href: "/candidates",
  title: "候选人管理",
  icon: Users
}, {
  href: "/pipeline",
  title: "招聘流程",
  icon: GitBranch
}, {
  href: "/assistant",
  title: "AI 招聘助手",
  icon: Sparkles
}];
export default function Shell({
  children
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState(false);
  const [help, setHelp] = useState(false);
  const current = navigation.find(n => n.href === path);
  return <ConfigProvider locale={zhCN} theme={{
    token: {
      colorPrimary: "#2f6bff",
      colorText: "#182230",
      colorTextSecondary: "#667085",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif',
      borderRadius: 9,
      controlHeight: 38
    },
    components: {
      Table: {
        headerBg: "#f8fafc",
        headerColor: "#667085",
        cellPaddingBlock: 18
      },
      Button: {
        primaryShadow: "0 3px 7px #2f6bff18"
      }
    }
  }}><App>
    {mobile && <button className="sidebar-mask" aria-label="关闭导航" onClick={() => setMobile(false)} />}
    <aside className={`sidebar ${mobile ? "open" : ""}`}><Link className="brand" href="/"><span className="brand-mark"><GitBranch size={25} /></span><span>HireFlow <b>AI</b><small>智能招聘 · 高效协作</small></span></Link>
      <div className="workspace"><span className="workspace-logo">H</span><span>HireFlow 工作空间<small>演示企业 · HR 工作台</small></span><ChevronDown size={14} /></div>
      <div className="nav-caption">工作台 <span>WORKSPACE</span></div><nav>{navigation.map(n => <Link key={n.href} className={`nav-item ${path === n.href ? "active" : ""}`} href={n.href} onClick={() => setMobile(false)}><n.icon size={19} /><span>{n.title}</span>{n.href === "/assistant" && <span className="ai-badge">AI</span>}{path === n.href && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-bottom"><div className="assistant-promo"><span className="promo-icon"><Sparkles size={20} /></span><strong>让招聘，快人一步</strong><p>把重复工作交给 AI，<br />把时间留给合适的人。</p><Link href="/assistant">探索 AI 招聘助手 <ArrowUpRight size={15} /></Link></div><button className="help-link" onClick={() => setHelp(true)}><CircleHelp size={18} />使用帮助<span>↗</span></button><div className="user"><span className="avatar">HR</span><span><strong>演示 HR</strong><small>招聘管理员</small></span><span className="online-dot" /></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="展开导航" onClick={() => setMobile(true)}><Menu size={20} /></button><span>工作台</span><span className="slash">/</span><strong>{current?.title ?? "HireFlow AI"}</strong></div><div className="topbar-actions"><span className="demo-chip"><span />Mock 演示环境</span><Link className="icon-button" aria-label="搜索候选人" href="/candidates"><Search size={19} /></Link><button className="icon-button notification" aria-label="查看通知" onClick={() => setNotice(true)}><Bell size={19} /><i /></button><span className="topbar-divider" /><span className="avatar small">HR</span></div></header><main className="page-content"><DataControls />{children}</main><footer className="footer"><span>© 2026 HireFlow AI</span><span>让每一次相遇，都成为更好的开始。</span><span className="footer-status"><span />所有数据均为演示数据</span></footer></div>
    <Modal title="招聘通知" open={notice} onCancel={() => setNotice(false)} footer={null}><p className="muted">当前为本地演示环境，暂无新的实时通知。</p><p>你可以前往招聘流程查看候选人的演示进度。</p><Link href="/pipeline" onClick={() => setNotice(false)}>查看招聘流程 →</Link></Modal>
    <Modal title="欢迎使用 HireFlow AI" open={help} onCancel={() => setHelp(false)} footer={null}><p>通过左侧导航浏览数据看板、岗位、候选人、招聘流程和 AI 助手。</p><p>岗位支持新建与编辑；候选人支持筛选和查看详情。岗位与招聘进度会自动保存到此浏览器，刷新后仍保留。顶部可重置所有演示数据。</p><p>AI 助手使用当前岗位知识库检索和真实模型服务，回答可查看原文引用。附件仅展示文件名，不会上传或解析。</p><button className="text-button" onClick={() => setHelp(false)}><X size={14} /> 我知道了</button></Modal>
  </App></ConfigProvider>;
}
