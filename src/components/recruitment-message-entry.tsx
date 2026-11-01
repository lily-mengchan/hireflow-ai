"use client";
import { useRef, useState } from "react";
import { Alert, App, Button, Input, Table, Tag } from "antd";
import { useRecruitment } from "../data/store";
import { eventSchema, feedbackInputIssue, MAX_FEEDBACK_LENGTH, type MessageInput, type ParsedEvent } from "../messages/schema";
import { messageFingerprint } from "../messages/workflow";
import { createParseCache } from "../messages/parse-cache";
import { inputToIso, shanghaiInput } from "../messages/time";
import FeedbackEditor from "./feedback-editor";
import { ClipboardList, Sparkles, FileText } from "lucide-react";
import "./recruitment-message-entry.css";

type Batch = { input: MessageInput; events: (ParsedEvent & { rowId: string })[]; fingerprint: string };
export default function RecruitmentMessageEntry() {
  const { data, ready, error } = useRecruitment(); const { message } = App.useApp();
  const [text, setText] = useState(""); const [historicalAt, setHistoricalAt] = useState("");
  const [busy, setBusy] = useState(false); const [reused, setReused] = useState(false);
  const [batch, setBatch] = useState<Batch>();
  const cache = useRef(createParseCache<Batch>());
  async function parse() {
    if (busy || !ready || error) return;
    const issue = feedbackInputIssue(text);
    if (issue) { message.warning(issue); return; }
    const at = inputToIso(historicalAt);
    if (!at) { message.error("事件发生时间无效"); return; }
    const key = JSON.stringify([text.trim(), at]);
    const hit = cache.current.get(key);
    if (hit) { setBatch(hit); setReused(true); return; }
    setBusy(true); setBatch(undefined); setReused(false);

    try {
      const response = await fetch("/api/recruitment/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: text.trim(), messageAt: at }), signal: AbortSignal.timeout(120000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "识别失败");
      const input: MessageInput = result.input;
      const events = (result.events as ParsedEvent[]).map((p, i) => ({ event: eventSchema.parse(p.event), warnings: p.warnings, rowId: String(i) }));
      const value: Batch = { input, events, fingerprint: await messageFingerprint(input.message) };
      cache.current.set(key, value, 300000); setBatch(value);
    } catch (e) { message.error(e instanceof Error ? e.message : "识别失败，请重试"); }
    finally { setBusy(false); }
  }
  const recent = data.events.filter(e => e.source).slice(-5).reverse();
  return <section className={`feedback-entry panel ${"feedback-ui-entry"}`}>
    <div className="feedback-entry-heading"><div className={"feedback-ui-heading"}><span className={"feedback-ui-icon"}><ClipboardList size={21} /></span><div><h2>面试反馈录入</h2><p>记录反馈与面试安排，确认后同步招聘进度。</p></div></div><span className={"feedback-ui-badge"}>确认后保存</span></div>
    <div className="feedback-event-time"><label htmlFor="feedback-event-at"><span><b aria-hidden="true">*</b> 事件发生时间</span><Input id="feedback-event-at" aria-label="事件发生时间" required disabled={busy} type="datetime-local" value={historicalAt} onChange={e => { setHistoricalAt(e.target.value); setBatch(undefined); }} /></label><p>必填 · 上海时间，用于确定“明天”“下周一”等相对日期。</p></div>

      <div className="feedback-compose"><div className={"feedback-ui-inputLabel"}><Sparkles size={15} /><span>用一句话记录面试反馈</span></div><Input.TextArea disabled={busy} rows={3} maxLength={MAX_FEEDBACK_LENGTH} showCount value={text} onPaste={e => {
        const replacement = e.currentTarget.selectionEnd - e.currentTarget.selectionStart;
        if (text.length - replacement + e.clipboardData.getData("text").length > MAX_FEEDBACK_LENGTH) { e.preventDefault(); message.warning(`请将反馈精简至 ${MAX_FEEDBACK_LENGTH} 字以内再粘贴`); }
      }} onChange={e => { setText(e.target.value); setBatch(undefined); }} placeholder="例如：张三一面通过，下周一 14:00 安排二面，面试官李经理" aria-label="面试反馈内容" /><div className="feedback-actions"><span>识别结果可编辑，确认后更新招聘记录</span><Button type="primary" icon={<Sparkles size={14} />} loading={busy} disabled={!text.trim() || !inputToIso(historicalAt) || !ready || !!error} onClick={() => { void parse(); }}>识别并填写</Button></div></div>
      {reused && batch && <span className="feedback-reused">已使用刚才的识别结果</span>}
      {batch && !batch.events.length && <Alert type="info" title="未识别到明确的面试记录，请补充轮次或安排，也可在候选人详情中手动录入。" />}
      {batch?.events.map(parsed => <FeedbackEditor key={`${batch.fingerprint}-${batch.input.messageAt}-${parsed.rowId}`} parsed={parsed} input={batch.input} fingerprint={batch.fingerprint} onCancel={() => setBatch(current => current ? { ...current, events: current.events.filter(e => e.rowId !== parsed.rowId) } : undefined)} />)}
    <div className="feedback-recent-heading"><h3>最近面试记录</h3><span>最近 5 条</span></div>
    {recent.length ? <Table size="small" rowKey="id" pagination={false} scroll={{ x: 700 }} dataSource={recent} columns={[
      { title: "候选人 / 岗位", render: (_, e) => <div className="cell-stack"><strong>{data.candidates.find(c => c.id === e.candidateId)?.name}</strong><small>{data.jobs.find(j => j.id === e.jobId)?.title}</small></div> },
      { title: "面试反馈", render: (_, e) => <>{e.source?.confirmed.completedStage ?? "面试安排"} · {e.source?.confirmed.interviewResult ?? "待反馈"}{e.source?.confirmed.nextStage && <small className="feedback-next">下一步：{e.source.confirmed.nextStage}</small>}</> },
      { title: "面试时间 / 面试官", render: (_, e) => <div className="cell-stack"><span>{e.source?.confirmed.interviewTime ? shanghaiInput(new Date(e.source.confirmed.interviewTime)).replace("T", " ") : "未填写"}</span><small>{e.source?.confirmed.interviewer ?? "未填写"}</small></div> },
      { title: "录入方式", render: (_, e) => <Tag>{e.source?.mode === "manual" ? "手动" : "AI 辅助"}</Tag> },
    ]} /> : <div className={"feedback-ui-empty"}><span className={"feedback-ui-emptyIcon"}><FileText size={23} strokeWidth={1.5} /></span><div><strong>暂无面试记录</strong><p>完成反馈录入后，可在这里查看最近记录</p></div></div>}
  </section>;
}
