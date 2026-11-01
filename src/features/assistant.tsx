"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Input, Tag } from "antd";
import { ArrowRight, BookOpen, FileText, MessageSquare, Paperclip, Plus, Send, Sparkles } from "lucide-react";
import { initialMessages } from "@/src/mocks/data";
import { useRecruitment } from "@/src/data/store";
import { jobSnapshot, ragQuestions, type Citation, type RagAnswer } from "@/src/rag/types";
import { ragRequest } from "@/src/rag/client";

import RecruitmentQueryResult from "@/src/components/recruitment-query-result";
import { analyticsSnapshot, type QueryReply, type QueryResult } from "@/src/analytics/schema";
import type { CandidateApplication } from "@/src/types/recruitment";
import { CandidateDrawer, PageHeading } from "@/src/components/ui";
type Message = {
  role: "assistant" | "user";
  text: string;
  sources: Citation[];
  snapshot?: string;
  query?: QueryResult;
  dataVersion?: string;
};
type Conversation = {
  id: number;
  title: string;
  messages: Message[];
};
export default function Assistant() {
  const { data, candidates, jobs, ready, error: storageError } = useRecruitment();
  const [candidateDetail, setCandidateDetail] = useState<CandidateApplication | null>(null);
  const querySnapshot = useMemo(() => { try { return analyticsSnapshot(data); } catch { return null; } }, [data]);
  const dataVersion = JSON.stringify(querySnapshot);
  const latestDataVersion = useRef(dataVersion);
  useEffect(() => { latestDataVersion.current = dataVersion; }, [dataVersion]);
  const [busy, setBusy] = useState(false);
  const [citation, setCitation] = useState<Citation>();
  const snapshot = JSON.stringify(jobSnapshot(jobs));
  const latestSnapshot = useRef(snapshot);
  const inFlight = useRef(false);
  useEffect(() => { latestSnapshot.current = snapshot; }, [snapshot]);
  const [conversations, setConversations] = useState<Conversation[]>([{
    id: 1,
    title: "开启智能招聘的一天",
    messages: initialMessages.map(m => ({ ...m, sources: [] }))
  }]);
  const [activeId, setActiveId] = useState(1);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const active = conversations.find(c => c.id === activeId)!;
  useEffect(() => {
    end.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }, [active.messages.length]);
  async function send(question = input) {
    if (!question.trim() || inFlight.current || !ready || storageError) return;
    const conversationId = activeId;
    const sentSnapshot = snapshot;
    const sentDataVersion = dataVersion;
    inFlight.current = true;
    setBusy(true);
    setConversations(all => all.map(c => c.id === conversationId ? { ...c, title: c.messages.length === 1 ? question.slice(0, 18) : c.title, messages: [...c.messages, { role: "user", text: question.trim(), sources: [] }] } : c));
    setInput("");
    try {
      if (!querySnapshot) throw new Error("当前招聘记录无法生成有效查询快照，请检查数据关联或记录数量后重试。");
      const routedResponse = await fetch("/api/recruitment/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, snapshot: querySnapshot }), signal: AbortSignal.timeout(120000) });
      const routed = await routedResponse.json() as QueryReply & { error?: string };
      if (!routedResponse.ok) throw new Error(routed.error || "招聘查询失败，请重试");
      let reply: Message;
      if (routed.kind === "knowledge") {
        const response = await ragRequest<RagAnswer>("ask", { question, jobs: jobSnapshot(jobs), topK: 16 });
        const stale = latestSnapshot.current !== sentSnapshot;
        reply = { role: "assistant", text: stale ? "岗位在回答期间已变更，本次结果已丢弃。请重新提问。" : response.answer, sources: stale ? [] : response.sources, snapshot: sentSnapshot };
      } else if (routed.kind === "data") {
        const stale = latestDataVersion.current !== sentDataVersion;
        reply = { role: "assistant", text: stale ? "招聘数据在查询期间已变更，请重新提问以获取最新结果。" : routed.result.answer, sources: [], ...(!stale ? { query: routed.result, dataVersion: sentDataVersion } : {}) };
      } else reply = { role: "assistant", text: routed.message, sources: [] };
      setConversations(all => all.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, reply] } : c));
    } catch (error) {
      setConversations(all => all.map(c => c.id === conversationId ? { ...c, messages: [...c.messages, { role: "assistant", text: error instanceof Error ? error.message : "问答失败，请重试", sources: [] }] } : c));
    } finally { inFlight.current = false; setBusy(false); }
  }
  function newConversation() {
    const id = Date.now();
    setConversations(c => [{
      id,
      title: "新的招聘对话",
      messages: initialMessages.map(m => ({ ...m, sources: [] }))
    }, ...c]);
    setActiveId(id);
    setInput("");
    setAttachments([]);
  }
  return <><PageHeading eyebrow="YOUR AI RECRUITING COPILOT" title="AI 招聘助手" description="查询招聘数据与岗位要求，获取有据可查的回答。" /><div className="chat-workspace"><aside className="chat-sidebar"><Button block icon={<Plus size={16} />} disabled={busy} onClick={newConversation}>新建对话</Button><div className="nav-caption">最近对话</div><div className="conversation-list">{conversations.map(c => <button key={c.id} className={c.id === activeId ? "selected" : ""} onClick={() => {
            setActiveId(c.id);
            setInput("");
            setAttachments([]);
          }}><MessageSquare size={16} /><span>{c.title}</span></button>)}</div></aside><section className="chat-main"><div className="chat-top"><span><span className="assistant-avatar"><Sparkles size={18} /></span><strong>HireFlow AI</strong><Tag color="blue">招聘助手</Tag></span></div><div className="messages"><div className="chat-intro"><span className="intro-spark"><Sparkles size={30} /></span><h2>今天想了解哪些招聘进展？</h2><p>查询数据、跟进人才，或了解岗位要求。</p></div>{active.messages.map((m, i) => <div className={`message ${m.role}`} key={i}><span className={m.role === "assistant" ? "assistant-avatar" : "avatar small"}>{m.role === "assistant" ? <Sparkles size={18} /> : "HR"}</span><div className="message-body"><span className="message-author">{m.role === "assistant" ? "HireFlow AI" : "我"}</span><div className="message-bubble">{m.text}</div>{m.query && <RecruitmentQueryResult result={m.query} onCandidate={id => setCandidateDetail(candidates.find(c => c.applicationId === id) ?? null)} />}{m.dataVersion && m.dataVersion !== dataVersion && <Tag color="orange">招聘数据已更新，请重新查询</Tag>}{m.snapshot && m.snapshot !== snapshot && <Tag color="orange">岗位已更新，请重新提问</Tag>}{!!m.sources.length && <div className="message-sources"><small><BookOpen size={13} />原文引用来源</small>{m.sources.map((item, n) => <button key={item.chunkId + n} onClick={() => { setCitation(item); }}><FileText size={14} />[{n + 1}] {item.jobTitle} / {item.section}<ArrowRight size={12} /></button>)}</div>}</div></div>)}{busy && <p className="muted" role="status">正在查询招聘数据与岗位资料…</p>}<div ref={end} /></div><div className="chat-compose"><div className="suggestions">{["招聘总体情况", "待业务复筛", "待面试反馈", "招聘转化分析", ...ragQuestions.slice(0, 2)].map(s => <button key={s} disabled={busy || !ready} onClick={() => { void send(s); }}>{s}<ArrowRight size={12} /></button>)}</div>{!!attachments.length && <div className="attachments">{attachments.map((f, i) => <Tag key={`${f}-${i}`} closable onClose={() => setAttachments(a => a.filter((_, n) => n !== i))}><Paperclip size={12} />{f}</Tag>)}</div>}<div className="input-box"><Input.TextArea value={input} onChange={e => setInput(e.target.value)} placeholder="询问招聘数据、候选人进度或岗位要求…" autoSize={{
              minRows: 2,
              maxRows: 5
            }} aria-label="招聘助手消息输入框" maxLength={800} onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }} /><div className="compose-tools"><div><input ref={fileInput} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt" onChange={e => {
                  setAttachments(a => [...a, ...Array.from(e.target.files ?? []).map(f => f.name)]);
                  e.target.value = "";
                }} /><button aria-label="选择附件，仅展示文件名" onClick={() => fileInput.current?.click()}><Paperclip size={18} /></button><span>附件仅展示文件名</span></div><Button type="primary" icon={<Send size={16} />} loading={busy} disabled={!input.trim() || !ready || !!storageError} onClick={() => { void send(); }}>发送</Button></div></div><p className="chat-disclaimer">统计依据当前保存的招聘记录；岗位问答可查看原文引用。不处理附件。 Enter 发送 · Shift + Enter 换行</p></div></section></div><Drawer title="岗位原文" open={!!citation} onClose={() => setCitation(undefined)} size={540}>
      {citation && <><h2 className="section-title">{citation.jobTitle}</h2><Tag>{citation.section}</Tag><h3 className="section-title">回答引用</h3><blockquote>{citation.quote}</blockquote><h3 className="section-title">来源原文</h3><div className="jd-content">{citation.content}</div></>}
    </Drawer><CandidateDrawer candidate={candidateDetail} onClose={() => setCandidateDetail(null)} initialTab="timeline" /></>;
}
