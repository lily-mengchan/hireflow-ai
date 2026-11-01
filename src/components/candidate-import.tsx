"use client";
import { useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Drawer, Input, InputNumber, Select, Space, Spin, Steps, Tag, Upload } from "antd";
import { FileUp, Copy, CheckCircle2 } from "lucide-react";
import { recruitmentActions, useRecruitment } from "../data/store";
import { extractPdf } from "../screening/pdf";
import { hrNotesSchema, type HrNotes, type ResumeProfile, type ScreeningResult, type ScreeningJob, type Usage } from "../screening/schema";
import { copyRecommendation, jobVersion, redactContacts } from "../screening/rules";
import "./candidate-import.css";
import PreScreeningForm from "./pre-screening";
import { evaluateConditions, validatePreScreening, type ConditionValue, type PreScreening } from "../screening/conditions";

const noteLabels = { currentBase: "目前 Base 地", desiredLocation: "意向工作地点", expectedSalary: "期望薪资", earliestStart: "最早可到岗时间", remarks: "其他沟通备注" } as const;
const profileLabels = { name: "姓名", education: "学历", school: "院校", company: "最近工作单位", currentBase: "简历 Base 地", desiredLocation: "简历意向地点", earliestStart: "简历到岗时间" } as const;
export function ScreeningChecks({ analysis }: { analysis: ScreeningResult["analysis"] }) {
  return <div className="screening-checks">{analysis.checks.map((c, i) => <div key={i}><Tag color={c.status === "符合" ? "green" : c.status === "待核实" ? "gold" : "red"}>{c.status}</Tag><strong>{c.label}</strong><p>{c.detail}</p></div>)}{analysis.findings.map((f, i) => <div key={`semantic-${i}`}><Tag color={f.assessment === "相关" ? "blue" : "gold"}>{f.assessment}</Tag><strong>岗位经验关联</strong><p>JD：{f.jdQuote}</p><p>依据（{f.source}）：{f.resumeQuote ?? "无明确依据，待核实"}</p></div>)}</div>;
}
export default function CandidateImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, ready, error } = useRecruitment(); const { message } = App.useApp();
  const [step, setStep] = useState(0), [busy, setBusy] = useState(false), [reading, setReading] = useState(false);
  const [text, setText] = useState(""), [fileName, setFileName] = useState("");
  const [jobId, setJobId] = useState<string>();
  const [notes, setNotes] = useState<HrNotes>(() => hrNotesSchema.parse({}));
  const [conditionValues, setConditionValues] = useState<Record<string, ConditionValue>>({});
  const [preScreening, setPreScreening] = useState<PreScreening>();
  const [resume, setResume] = useState<ResumeProfile>(); const [result, setResult] = useState<ScreeningResult>();
  const [stale, setStale] = useState(false), [content, setContent] = useState("");
  const [identity, setIdentity] = useState("new"), [differentPerson, setDifferentPerson] = useState(false), [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState<{ candidateId: string; applicationId: string }>();
  const [usage, setUsage] = useState<Usage>({ modelCalls: 0, promptTokens: 0, completionTokens: 0, cached: false });
  const importId = useRef<string>("");
  const job = data.jobs.find(j => j.id === jobId);
  const snapshot: ScreeningJob | undefined = job && { id: job.id, title: job.title, jd: job.jd, location: job.location, education: job.education, experience: job.experience, workflowId: job.workflowId, screeningConditions: job.screeningConditions };
  let canAnalyze = false;
  try { if (job && preScreening) { validatePreScreening(job, preScreening); canAnalyze = true; } } catch { /* The form explains stale or incomplete checks. */ }
  const validResult = !!result && !stale && !!snapshot && result.jobVersion === jobVersion(snapshot) && canAnalyze;
  const duplicates = data.candidates.filter(c => c.resumeHashes?.includes(result?.resumeHash ?? "") || (resume?.name.value && c.name === resume.name.value));
  function invalidate() { setStale(true); setConfirmed(false); setSaved(undefined); importId.current = ""; }
  function note<K extends keyof HrNotes>(key: K, value: HrNotes[K]) { setNotes(n => ({ ...n, [key]: value })); invalidate(); }
  async function upload(file: File) {
    setReading(true); setText(""); setResult(undefined); setResume(undefined); invalidate();
    try { setText(redactContacts(await extractPdf(file))); setFileName(file.name); message.success("PDF 文本已在本地提取"); }
    catch (e) { setFileName(""); message.error(e instanceof Error ? e.message : "PDF 提取失败，请检查文件"); }
    finally { setReading(false); }
    return false;
  }
  async function generate() {
    if (!snapshot || !text || busy) return;
    if (!canAnalyze || !preScreening) { message.warning("请先完成基础条件检查，或人工确认继续分析"); setStep(0); return; }
    setBusy(true); setConfirmed(false);
    try {
      const response = await fetch("/api/recruitment/screen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, job: snapshot, hrNotes: notes, preScreening, ...(resume ? { editedResume: resume } : {}) }), signal: AbortSignal.timeout(180000) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || "分析失败");
      const next = value as ScreeningResult;
      setResult(next); setResume(next.resume); setContent(next.analysis.draft); setStale(false); setStep(1);
      setUsage(old => ({ modelCalls: old.modelCalls + next.usage.modelCalls, promptTokens: old.promptTokens === null || next.usage.promptTokens === null ? null : old.promptTokens + next.usage.promptTokens, completionTokens: old.completionTokens === null || next.usage.completionTokens === null ? null : old.completionTokens + next.usage.completionTokens, cached: next.usage.cached }));
      importId.current = crypto.randomUUID();
    } catch (e) { message.error(e instanceof Error ? e.message : "分析失败，请重试"); }
    finally { setBusy(false); }
  }
  function editProfile(key: keyof typeof profileLabels, value: string) {
    setResume(r => r ? { ...r, [key]: { value: value.trim() || null, evidence: null, originalEvidence: r[key].originalEvidence ?? r[key].evidence ?? undefined, source: "HR_NOTE" } } : r); invalidate();
  }
  function save(recommend: boolean) {
    if (!validResult || !resume || !result || !job || !confirmed) return;
    try {
      const committed = recruitmentActions.saveImport({ importId: importId.current, jobId: job.id, jobVersion: result.jobVersion, resumeHash: result.resumeHash, resume, hrNotes: notes, preScreening, analysis: result.analysis, usage, content, recommend, acknowledged: true, ...(identity !== "new" ? { existingCandidateId: identity } : {}), newIdentityConfirmed: differentPerson });
      const event = committed.events.find(e => e.id === `IMPORT-${importId.current}`)!;
      setSaved({ candidateId: event.candidateId!, applicationId: event.applicationId! }); setStep(3);
      message.success(recommend ? "已确认推荐，等待业务复筛" : "已保存，等待 HR 审核");
    } catch (e) { message.error(e instanceof Error ? e.message : "保存失败"); }
  }
  async function copy() {
    if (!saved || !job) return;
    try { await navigator.clipboard.writeText(copyRecommendation(saved.candidateId, job.title, content, notes)); message.success("推荐内容已复制"); }
    catch { message.error("无法访问剪贴板，请允许浏览器复制权限后重试"); }
  }
  const disabled = busy || reading;
  return <Drawer title="导入候选人" open={open} onClose={disabled ? undefined : onClose} closable={!disabled} maskClosable={!disabled} size={960} destroyOnHidden={false}>
      <div className="candidate-import"><Steps size="small" current={step} items={[{ title: "简历与沟通" }, { title: "解析与匹配" }, { title: "推荐评语" }, { title: "保存结果" }]} />
      {error && <Alert type="error" title={error} />}
      {(busy || reading) && <div className="screening-progress" role="status"><Spin size="small" /><span>{reading ? "正在读取简历文本…" : "正在分析岗位匹配并生成推荐评语…"}</span></div>}
      {step === 0 && <><div className="screening-section"><h3>上传简历</h3><Upload.Dragger accept=".pdf,application/pdf" showUploadList={false} disabled={disabled} beforeUpload={upload}><FileUp size={30} /><p>点击或拖拽上传 PDF 简历</p><small>不超过 5 MB、20 页；仅支持文本型 PDF</small></Upload.Dragger>{fileName && <p className="screening-file">{fileName} · 已提取 {text.length} 字</p>}<p className="muted">PDF 仅在浏览器读取，分析时仅发送提取文本。此演示环境请只导入模拟简历，不保存联系方式。</p></div>
        <div className="screening-section"><h3>目标招聘岗位</h3><Select disabled={disabled} value={jobId} onChange={v => { setJobId(v); setConditionValues({}); setPreScreening(undefined); invalidate(); }} placeholder="选择当前招聘岗位" options={data.jobs.filter(j => j.status === "招聘中").map(j => ({ value: j.id, label: `${j.title} · ${j.location}` }))} />{job && <details><summary>查看当前岗位 JD</summary><pre>{job.jd}</pre></details>}</div>
        <div className="screening-section"><h3>初步沟通信息 <Tag>HR_NOTE</Tag></h3><p className="muted">均为选填，与简历信息分别保留；不一致时会提示核实。</p><div className="screening-grid">{Object.entries(noteLabels).filter(([key]) => key !== "remarks").map(([key, label]) => <label key={key}>{label}<Input disabled={disabled} value={notes[key as keyof typeof noteLabels]} maxLength={100} onChange={e => note(key as keyof typeof noteLabels, e.target.value)} /></label>)}<label>是否接受目标工作地点<Select disabled={disabled} value={notes.acceptsLocation} onChange={v => note("acceptsLocation", v)} options={["未确认", "接受", "不接受"].map(value => ({ value }))} /></label><label>每周可实习天数<InputNumber disabled={disabled} min={1} max={7} value={notes.internshipDays} onChange={v => note("internshipDays", v)} placeholder="适用于实习岗位" /></label></div><label>其他沟通备注<Input.TextArea disabled={disabled} rows={2} maxLength={1000} value={notes.remarks} onChange={e => note("remarks", e.target.value)} /></label></div>
        {job && <PreScreeningForm key={job.id} jobId={job.id} conditions={job.screeningConditions} values={conditionValues} review={preScreening} disabled={disabled} onValues={values => { setConditionValues(values); invalidate(); if (preScreening) { try { setPreScreening(evaluateConditions(job.id, job.screeningConditions, values)); } catch { setPreScreening(undefined); } } }} onReview={review => { setPreScreening(review); invalidate(); }} />}
        <Button type="primary" loading={busy || reading} disabled={!canAnalyze || !text || !job || !ready || !!error || reading} onClick={() => { void generate(); }}>生成推荐评语</Button></>}
      {step === 1 && resume && result && <><div className="screening-section"><h3>简历结构化信息</h3><p className="muted">RESUME 为原文提取；人工修改字段标记为 HR_NOTE，修改后须重新分析。</p><div className="screening-grid">{Object.entries(profileLabels).map(([key, label]) => { const fact = resume[key as keyof typeof profileLabels]; return <label key={key}>{label} <Tag color={fact.source === "RESUME" ? "blue" : "default"}>{fact.source}</Tag><Input disabled={busy} value={fact.value ?? ""} placeholder="未提供" maxLength={key === "name" ? 100 : 300} onChange={e => editProfile(key as keyof typeof profileLabels, e.target.value)} />{(fact.evidence || fact.originalEvidence) && <small>原文：{fact.evidence ?? fact.originalEvidence}</small>}</label>; })}<label>明确工作年限 <Tag>{resume.experienceYears.source}</Tag><InputNumber disabled={busy} min={0} max={60} value={resume.experienceYears.value} onChange={v => { setResume(r => r ? { ...r, experienceYears: { value: v, source: "HR_NOTE", evidence: null, originalEvidence: r.experienceYears.originalEvidence ?? r.experienceYears.evidence ?? undefined } } : r); invalidate(); }} /><small>{resume.experienceYears.evidence ?? "未明确提供，不根据日期推算"}</small></label></div>
          {(["skills", "experiences", "projects"] as const).map(key => <div className="screening-fact-list" key={key}><h4>{{ skills: "技术技能", experiences: "工作 / 实习经历", projects: "项目经历" }[key]}</h4>{resume[key].map((fact, i) => <label key={i}><Tag>{fact.source}</Tag><Input.TextArea disabled={busy} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={1200} value={fact.value ?? ""} onChange={e => { setResume(r => r ? { ...r, [key]: r[key].map((f, at) => at === i ? { value: e.target.value.trim() || null, source: "HR_NOTE", evidence: null, originalEvidence: f.originalEvidence ?? f.evidence ?? undefined } : f) } : r); invalidate(); }} />{(fact.evidence || fact.originalEvidence) && <small>原文：{fact.evidence ?? fact.originalEvidence}</small>}</label>)}{!resume[key].length && <p className="muted">未提取到明确依据</p>}</div>)}
        </div><div className="screening-section"><h3>岗位匹配分析</h3><p className="muted">依据当前选中岗位 JD，区分不符合、信息缺失与来源冲突；不生成录用概率。</p><ScreeningChecks analysis={result.analysis} /></div>
        {!validResult && <Alert type="warning" title="信息或岗位要求已变更，请重新分析后继续" />}
        <Space wrap><Button disabled={busy} onClick={() => setStep(0)}>返回修改沟通 / 岗位</Button><Button loading={busy} onClick={() => { void generate(); }}>重新分析与生成</Button><Button type="primary" disabled={!validResult || !resume.name.value || busy} onClick={() => setStep(2)}>编辑推荐评语</Button></Space></>}
      {step === 2 && result && resume && <><div className="screening-section"><h3>推荐评语草稿</h3><p className="muted">请核对事实及待确认事项，内容不会自动发送。</p><Input.TextArea aria-label="推荐评语" rows={16} maxLength={12000} value={content} onChange={e => { setContent(e.target.value); setConfirmed(false); }} /></div>
        <div className="screening-section"><h3>候选人身份核对</h3>{duplicates.length > 0 && <Alert type="warning" title="发现相同简历或同名记录，请人工核对唯一编号" description={duplicates.map(c => `${c.name}（${c.id}）`).join("；")} />}<Select showSearch optionFilterProp="label" value={identity} onChange={v => { setIdentity(v); setConfirmed(false); }} options={[{ value: "new", label: "创建新候选人" }, ...data.candidates.map(c => ({ value: c.id, label: `${c.name}（${c.id}） · ${c.school}` }))]} />{identity === "new" && duplicates.length > 0 && <Checkbox checked={differentPerson} onChange={e => { setDifferentPerson(e.target.checked); setConfirmed(false); }}>已核对，同名但属于不同的人（完全相同简历仍不能重复创建）</Checkbox>}<p className="muted">关联已有候选人不会覆盖其基本资料；本次解析与沟通信息保存在目标岗位申请中。</p></div>
        {!validResult && <Alert type="warning" title="岗位条件已变更，请返回重新分析" />}
        <Checkbox checked={confirmed} onChange={e => setConfirmed(e.target.checked)}>已核对候选人身份、事实、来源冲突及推荐内容</Checkbox><div className="screening-footer"><Button onClick={() => setStep(1)}>返回核对</Button><Button disabled={!confirmed || !validResult || !content.trim() || !ready || !!error} onClick={() => save(false)}>保存待 HR 审核</Button><Button type="primary" disabled={!confirmed || !validResult || !content.trim() || !ready || !!error} onClick={() => save(true)}>确认推荐并保存</Button></div></>}
      {step === 3 && saved && <div className="screening-success"><CheckCircle2 size={42} /><h3>候选人记录已保存</h3><p>候选人编号：{saved.candidateId}</p><p>岗位申请：{saved.applicationId}</p><p>当前状态：{data.applications.find(a => a.id === saved.applicationId)?.recommendation?.status}</p><Input.TextArea readOnly rows={10} value={content} /><Space><Button icon={<Copy size={14} />} onClick={() => { void copy(); }}>复制推荐内容</Button><Button type="primary" onClick={onClose}>完成</Button></Space></div>}
      {result && <p className="screening-usage">本次导入累计成功模型调用 {usage.modelCalls} 次 · 输入 Token {usage.promptTokens ?? "服务未返回"} · 输出 Token {usage.completionTokens ?? "服务未返回"}{usage.cached ? " · 本次复用缓存" : ""}</p>}
    </div>
  </Drawer>;
}
