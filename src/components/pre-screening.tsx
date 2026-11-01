"use client";
import { Alert, Button, Input, Popconfirm, Tag } from "antd";
import { useState } from "react";
import { ConditionInput } from "./job-conditions";
import { conditionFields, conditionsVersion, evaluateConditions, operators, type ConditionValue, type PreScreening, type ScreeningCondition } from "../screening/conditions";
export default function PreScreeningForm({ jobId, conditions = [], values, review, disabled, onValues, onReview }: {
  jobId:string; conditions?:ScreeningCondition[]; values:Record<string,ConditionValue>; review?:PreScreening; disabled:boolean;
  onValues:(values:Record<string,ConditionValue>)=>void; onReview:(review:PreScreening)=>void;
}) {
  const [error,setError]=useState(""); const [reason,setReason]=useState("");
  const active=conditions.filter(c=>c.enabled), stale=review && review.conditionsVersion !== conditionsVersion(conditions);
  const fields=[...new Map(active.map(c=>[c.fieldKey,c])).values()];
  function check(overrideReason?:string) { try { const next=evaluateConditions(jobId,conditions,values); onReview({...next,overrideReason:overrideReason ?? null});setError(""); } catch(e) {setError(e instanceof Error?e.message:"请修正条件");} }
  return <section className="screening-section pre-screening"><h3>岗位基础条件核验 <Tag>本地规则 · 零 Token</Tag></h3>
    {!active.length && <Alert type="info" showIcon title="未配置筛选条件" description="此岗位没有启用的筛选条件，不代表已核验通过。请确认后继续分析。"/>}
    <div className="screening-grid">{fields.map(c=><div className="condition-field" key={c.fieldKey}>{conditionFields[c.fieldKey].label}<ConditionInput condition={{...c,label:conditionFields[c.fieldKey].label}} value={values[c.fieldKey] ?? null} disabled={disabled} onChange={v=>{onValues({...values,[c.fieldKey]:v});setReason("");setError("");}}/></div>)}</div>
    {active.map(c=>{const result=!stale && review?.results.find(r=>r.conditionId===c.conditionId);return <div className="condition-summary" key={c.conditionId}><div><strong>{c.label}</strong><Tag>{c.required?"必要":"偏好"}</Tag><p>岗位要求：{operators[c.operator]} {typeof c.expectedValue === "boolean" ? c.expectedValue?"是":"否":String(c.expectedValue ?? "未配置")}</p></div><div>{result ? <><Tag color={result.checkResult === "PASS" ? "green" : result.checkResult === "FAIL" ? "red" : "gold"}>{result.checkResult}</Tag><small>{result.reason}</small></>:<Tag>待核验</Tag>}</div></div>;})}
    {stale && <Alert type="warning" title="岗位条件已变更，原核验已过期，请重新检查"/>}
    {error && <Alert type="error" title={error}/>}
    <div className="pre-screening-actions"><Button disabled={disabled} onClick={()=>check()}>检查基础条件</Button>{review && !stale && <Tag>{review.decision === "UNCONFIGURED"?"未配置筛选条件":review.decision}</Tag>}</div>
    {review && !stale && review.decision !== "PASS" && <div className="condition-override"><p className="muted">{review.decision === "FAIL" ? "必要条件不满足，已暂停 AI 分析。" : review.decision === "UNKNOWN" ? "信息不足，请补充后重新检查。" : "请确认无预设条件，继续分析的原因。"} 不会自动淘汰候选人。</p><Input.TextArea aria-label="人工继续原因" disabled={disabled} maxLength={500} rows={2} placeholder="如需继续，请填写人工核对原因（至少 3 字）" value={reason} onChange={e=>setReason(e.target.value)}/><Popconfirm title="人工确认继续分析？" description="仍保留原核验结果及操作原因，不会将不符合改为通过。" onConfirm={()=>check(reason.trim())} okText="确认继续" cancelText="取消"><Button disabled={disabled || reason.trim().length<3} className="feedback-continue">人工确认继续分析</Button></Popconfirm>{review.overrideReason && <Alert type="warning" title="已人工确认继续" description={review.overrideReason}/>}</div>}
    {review?.decision === "PASS" && !stale && <p className="muted">必要条件满足，可以继续 AI 分析。普通偏好仅作提示。</p>}
  </section>;
}
