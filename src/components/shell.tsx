"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { App, ConfigProvider, Modal } from "antd";
import { identities } from "../data/collaboration";
import { useIdentity, selectIdentity } from "../data/identity";
import DataControls from "./data-controls";
import zhCN from "antd/locale/zh_CN";
import { designTheme } from "./design-theme";
import { Bell, BriefcaseBusiness, CircleHelp, GitBranch, LayoutDashboard, Menu, Search, Sparkles, Users, X } from "lucide-react";
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
  const actor = useIdentity();
  const links = actor.role === "hr" ? [...navigation, { href: "/collaboration", title: "招聘协作工作台", icon: Users }] : [{ href: "/interviewer", title: "招聘协作工作台", icon: Users }];
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState(false);
  const [help, setHelp] = useState(false);
  const current = links.find(n => n.href === path);
  return <ConfigProvider locale={zhCN} theme={designTheme}><App><a className="skip-link" href="#main-content">跳转到主要内容</a>
    {mobile && <button className="sidebar-mask" aria-label="关闭导航" onClick={() => setMobile(false)} />}
    <aside className={`sidebar ${mobile ? "open" : ""}`}><Link className="brand" href="/" aria-label="HireFlow AI 智能招聘工作台"><span className="brand-mark"><GitBranch size={21} /></span><span className="brand-copy"><span className="brand-name">HireFlow <b>AI</b></span><small>智能招聘工作台</small></span></Link>
      <div className="workspace"><span className="workspace-logo">H</span><span>招聘工作空间<small>人才与机会，在这里相遇</small></span></div>
      <div className="nav-caption">工作空间</div><nav aria-label="主导航">{links.map(n => <Link key={n.href} aria-current={path === n.href ? "page" : undefined} className={`nav-item ${path === n.href ? "active" : ""}`} href={n.href} onClick={() => setMobile(false)}><n.icon size={19} /><span>{n.title}</span>{n.href === "/assistant" && <span className="ai-badge">AI</span>}{path === n.href && <span className="nav-dot" />}</Link>)}</nav>
      <div className="sidebar-bottom"><button className="help-link" onClick={() => setHelp(true)}><CircleHelp size={18} />使用帮助<span>↗</span></button><div className="user"><span className="avatar">HR</span><span><strong>{actor.name}</strong><small>Demo 登录</small></span><span className="online-dot" /></div></div>
    </aside>
    <div className="app-main"><header className="topbar"><div className="breadcrumb"><button className="mobile-menu icon-button" aria-label="展开导航" onClick={() => setMobile(true)}><Menu size={20} /></button><span>工作台</span><span className="slash">/</span><strong>{current?.title ?? "HireFlow AI"}</strong></div><div className="topbar-actions"><label>Demo 登录 <select aria-label="Demo 登录身份" value={actor.id} onChange={e => selectIdentity(e.target.value)}>{identities.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label><Link className="icon-button" aria-label="搜索候选人" href="/candidates"><Search size={19} /></Link><button className="icon-button notification" aria-label="查看通知" onClick={() => setNotice(true)}><Bell size={19} /><i /></button><span className="topbar-divider" /><span className="avatar small">HR</span></div></header><main id="main-content" className="page-content">{actor.role === "hr" ? <>{children}<DataControls /></> : path === "/interviewer" ? children : <p>当前为业务面试官 Demo 身份，请进入 <Link href="/interviewer">面试官工作台</Link>。</p>}</main><footer className="footer"><span>© 2026 HireFlow AI</span><span>招聘，让每一步清晰有序。</span><span className="footer-status"><span />本地存储 · 仅限模拟数据</span></footer></div>
    <Modal title="招聘通知" open={notice} onCancel={() => setNotice(false)} footer={null}><p className="muted">当前为本地演示环境，暂无新的实时通知。</p><p>你可以前往招聘流程查看候选人的演示进度。</p><Link href="/pipeline" onClick={() => setNotice(false)}>查看招聘流程 →</Link></Modal>
    <Modal title="欢迎使用 HireFlow AI" open={help} onCancel={() => setHelp(false)} footer={null}><p>通过左侧导航浏览数据看板、岗位、候选人、招聘流程和 AI 助手。</p><p>岗位支持新建与编辑；候选人支持筛选和查看详情。岗位与招聘进度会自动保存到此浏览器，刷新后仍保留。页面底部可重置所有演示数据。</p><p>AI 助手使用当前岗位知识库检索和真实模型服务，回答可查看原文引用。附件仅展示文件名，不会上传或解析。</p><button className="text-button" onClick={() => setHelp(false)}><X size={14} /> 我知道了</button></Modal>
  </App></ConfigProvider>;
}
