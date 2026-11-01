"use client";
import { useState } from "react";
import { Alert, App, Button, Checkbox, Collapse, Input, Select, Tag } from "antd";
import { ArrowRight } from "lucide-react";
import { recruitmentActions, useRecruitment } from "../data/store";
import { deriveEventType, type ExtractedEvent, type MessageInput, type ParsedEvent } from "../messages/schema";
import { matchApplications, messageFingerprint, proposeChange } from "../messages/workflow";
import { manualFeedbackSource } from "../messages/manual";
import { inputToIso, shanghaiInput } from "../messages/time";
import { workflows } from "../mocks/data";

export default function FeedbackEditor({ parsed, input, fingerprint, mode = "ai", fixedApplicationId, onCancel }: {
  parsed: ParsedEvent; input: MessageInput; fingerprint?: string; mode?: "ai" | "manual"; fixedApplicationId?: string; onCancel?: () => void;
}) {
  const { data, ready } = useRecruitment(); const { message } = App.useApp();
  const matched = matchApplications(data, parsed.event);
  const [applicationId, setApplicationId] = useState<string | undefined>(() => fixedApplicationId ?? (matched.requiresSelection ? undefined : matched.options[0]?.id));
  const [event, setEvent] = useState<ExtractedEvent>(parsed.event);
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const [receiptId, setReceiptId] = useState<string>();
  const application = matched.options.find(a => a.id === applicationId);
  const job = data.jobs.find(j => j.id === application?.jobId);
  const stages = workflows.find(w => w.id === job?.workflowId)?.stages ?? [];
  const plan = application ? proposeChange(data, application, event, new Date()) : null;
  const saved = data.events.find(e => e.id === (receiptId ?? (fingerprint ? `MSG-${fingerprint}-${applicationId}` : undefined)));
  const warnings = mode === "manual" ? [] : [...new Set([...parsed.warnings, ...matched.warnings])];
  const changed = JSON.stringify(event) !== JSON.stringify(parsed.event);
  const needsNote = mode === "ai" && (warnings.length > 0 || changed);
  function field<K extends keyof ExtractedEvent>(key: K, value: ExtractedEvent[K]) {
    setEvent(current => { const next = { ...current, [key]: value }; return { ...next, eventType: deriveEventType(next) }; });
    setAcknowledged(false);
  }
  async function confirm() {
    if (!application || !plan || plan.errors.length || busy) return;
    setBusy(true);
    try {
      const source = mode === "manual" ? manualFeedbackSource(data, application.id, event, input.messageAt) : { input, event: parsed.event };
      const confirmed = mode === "manual" ? source.event : event;
      const committed = await recruitmentActions.confirmMessage({ message: source.input, original: source.event, event: confirmed, applicationId: application.id,
        expected: { stage: application.stage, status: application.status, interview: application.interview, updatedAt: application.updatedAt },
        acknowledged, mode, confirmationNote: note.trim() || (mode === "manual" ? "HR 手动填写并确认" : "HR 核对识别结果并确认") });
      const id = `MSG-${await messageFingerprint(source.input.message)}-${application.id}`;
      setReceiptId(id);
      message.success(committed.events.some(e => e.id === id) ? "面试记录已保存，招聘进度已更新" : "已处理");
    } catch (error) { message.error(error instanceof Error ? error.message : "保存失败，请重试"); }
    finally { setBusy(false); }
  }
  return <article className="feedback-editor">
    <div className="feedback-result-heading"><h3>{parsed.event.candidateName ?? "待确认候选人"}<span>{job?.title ?? parsed.event.jobTitle ?? "请选择岗位申请"}</span></h3><Tag color={mode === "manual" ? "default" : "blue"}>{mode === "manual" ? "手动填写" : "识别结果 · 可修改"}</Tag></div>
    {saved ? <><Alert type="success" showIcon title="面试记录已保存" description="相同记录再次提交不会重复更新。" /><Button className="feedback-continue" onClick={onCancel}>继续录入</Button></> : <fieldset disabled={busy} className="feedback-fields">
      {!!warnings.length && <Alert type="warning" showIcon title="需要核对" description={warnings.join("；")} />}
      {mode === "ai" && <label>候选人及岗位申请<Select disabled={busy} aria-label="选择候选人岗位申请" placeholder="核对候选人身份并选择申请" value={applicationId} onChange={v => { setApplicationId(v); setAcknowledged(false); }} options={matched.options.map(a => ({ value: a.id, label: `${data.candidates.find(c => c.id === a.candidateId)?.name}（${a.candidateId}） · ${data.jobs.find(j => j.id === a.jobId)?.title} · ${a.id}` }))} /></label>}
      {!matched.options.length && <Alert type="info" title="未找到对应的岗位申请，请核实候选人信息后重新填写。" />}
      <div className="feedback-form-grid">
        <label>面试阶段<Select disabled={busy} value={event.completedStage} placeholder="仅安排面试时可留空" allowClear onChange={v => field("completedStage", v ?? null)} options={stages.map(value => ({ value }))} /></label>
        <label>面试结果<Select disabled={busy || !event.completedStage} value={event.interviewResult} placeholder="选择结果" allowClear onChange={v => field("interviewResult", v ?? null)} options={["通过", "未通过", "待定"].map(value => ({ value }))} /></label>
        <label>下一阶段<Select disabled={busy} value={event.nextStage} placeholder="无后续安排可留空" allowClear onChange={v => field("nextStage", v ?? null)} options={stages.map(value => ({ value }))} /></label>
        <label>面试时间<Input disabled={busy} aria-label="面试时间" type="datetime-local" value={event.interviewTime && Number.isFinite(Date.parse(event.interviewTime)) ? shanghaiInput(new Date(event.interviewTime)) : ""} onChange={e => field("interviewTime", inputToIso(e.target.value))} /></label>
        <label>面试官<Input disabled={busy} value={event.interviewer ?? ""} placeholder="填写面试官" maxLength={100} onChange={e => field("interviewer", e.target.value.trim() || null)} /></label>
      </div>
      <label>备注<Input.TextArea disabled={busy} rows={2} value={event.remarks ?? ""} maxLength={500} placeholder="面试评价、未通过原因或后续事项" onChange={e => field("remarks", e.target.value || null)} /></label>
      {application && plan && <div className="feedback-state-comparison"><div><small>当前状态</small><strong>{application.stage} · {application.status}</strong><span>{application.interview}</span></div><ArrowRight size={18} /><div><small>建议状态</small><strong>{plan.target.stage} · {plan.target.status}</strong><span>{plan.target.interview}</span></div></div>}
      {!!plan?.errors.length && <Alert type="error" showIcon title="请完善或核实后保存" description={plan.errors.join("；")} />}
      {mode === "ai" && <Collapse ghost size="small" items={[{ key: "evidence", label: "查看原文依据", children: <><blockquote>{parsed.event.evidence}</blockquote><p className="muted">{parsed.event.timeEvidence ? `时间原文：${parsed.event.timeEvidence}；` : ""}参考时间：{shanghaiInput(new Date(input.messageAt)).replace("T", " ")}（上海）</p></> }]} />}
      {needsNote && <label>核对说明<Input disabled={busy} value={note} maxLength={1000} placeholder="请说明缺失信息或修改字段的核对依据" onChange={e => setNote(e.target.value)} /></label>}
      <Checkbox disabled={busy} checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)}>已确认候选人、岗位和反馈内容</Checkbox>
      <div className="feedback-actions"><Button type="primary" loading={busy} disabled={!ready || !application || !!plan?.errors.length || !acknowledged || (needsNote && !note.trim())} onClick={() => { void confirm(); }}>确认保存</Button><Button disabled={busy} onClick={onCancel}>取消</Button></div>
    </fieldset>}
  </article>;
}
