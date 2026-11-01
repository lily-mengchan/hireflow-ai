import type { Application, InterviewRecord, Job, RecruitmentData, RecruitmentEvent } from "../types/recruitment";
import { eventSchema, messageSchema, type Confirmation } from "../messages/schema";
import { matchApplications, messageFingerprint, proposeChange } from "../messages/workflow";
import { workflows } from "../mocks/data";
import { createSeed } from "../mocks/seed";
import { recommendationSchema, resumeSchema, saveImportSchema, type SaveImport } from "../screening/schema";
import { jobVersion, redactContacts } from "../screening/rules";

export const STORAGE_KEY = "hireflow-ai:recruitment:v1";
export type StorageAdapter = Pick<Storage, "getItem" | "setItem">;
export type JobInput = Omit<Job, "id" | "created">;
export type ApplicationChange = Pick<Application, "stage" | "status" | "interview"> & { note: string };

function assert(condition: unknown, message = "本地演示数据格式不正确，请重置演示数据"): asserts condition {
  if (!condition) throw new Error(message);
}
function record(value: unknown): asserts value is Record<string, unknown> { assert(value !== null && typeof value === "object" && !Array.isArray(value)); }
function strings(row: Record<string, unknown>, keys: string[]) { keys.forEach(key => assert(typeof row[key] === "string")); }
function date(value: unknown) { assert(typeof value === "string" && Number.isFinite(Date.parse(value))); }
function number(value: unknown, min: number, max = Infinity) { assert(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max); }
function progress(value: unknown) {
  record(value); strings(value, ["stage"]);
  assert(["待处理", "已通过", "已淘汰"].includes(String(value.status)));
  assert(["待安排", "已安排", "已完成"].includes(String(value.interview)));
}

/** Validate untrusted localStorage including relationships, not just JSON syntax. */
export function validateData(value: unknown): asserts value is RecruitmentData {
  record(value); assert(value.version === 1, "本地数据版本不兼容，请重置演示数据");
  for (const key of ["jobs", "candidates", "applications", "interviews", "events"]) {
    const rows = value[key]; assert(Array.isArray(rows)); const ids = new Set();
    rows.forEach(row => { record(row); strings(row, ["id"]); assert(row.id && !ids.has(row.id)); ids.add(row.id); });
  }
  const data = value as unknown as RecruitmentData;
  data.jobs.forEach(j => {
    const row = j as unknown as Record<string, unknown>;
    strings(row, ["title", "department", "location", "salary", "type", "education", "experience", "jd", "workflowId"]);
    assert(j.title.trim() && j.jd.trim()); date(j.created); number(j.headcount, 1, 999); assert(Number.isInteger(j.headcount));
    assert(["招聘中", "已暂停", "已结束"].includes(j.status)); assert(workflows.some(w => w.id === j.workflowId));
  });
  data.candidates.forEach(c => { strings(c as unknown as Record<string, unknown>, ["name", "education", "school", "company", "summary"]); date(c.createdAt); number(c.experience, 0); assert(Array.isArray(c.skills) && c.skills.every(s => typeof s === "string")); });
  data.candidates.forEach(c => {
    if (c.resumeProfile !== undefined) assert(resumeSchema.safeParse(c.resumeProfile).success);
    if (c.resumeHashes !== undefined) assert(Array.isArray(c.resumeHashes) && c.resumeHashes.every(h => /^[a-f0-9]{64}$/.test(h)));
  });
  const pairs = new Set<string>();
  data.applications.forEach(a => {
    strings(a as unknown as Record<string, unknown>, ["candidateId", "jobId"]); progress(a); date(a.createdAt); date(a.updatedAt); number(a.score, 0, 100);
    const job = data.jobs.find(j => j.id === a.jobId); assert(job && data.candidates.some(c => c.id === a.candidateId));
    assert(workflows.find(w => w.id === job.workflowId)!.stages.includes(a.stage));
    const pair = JSON.stringify([a.candidateId, a.jobId]); assert(!pairs.has(pair)); pairs.add(pair);
    if (a.recommendation !== undefined) assert(recommendationSchema.safeParse(a.recommendation).success);
  });
  data.interviews.forEach(i => {
    strings(i as unknown as Record<string, unknown>, ["applicationId", "stage", "note"]);
    if (i.scheduledAt === null) assert(i.status === "已完成"); else date(i.scheduledAt);
    assert(["已安排", "已完成"].includes(i.status)); assert(data.applications.some(a => a.id === i.applicationId));
    if (i.interviewer !== undefined && i.interviewer !== null) assert(typeof i.interviewer === "string");
    if (i.result !== undefined && i.result !== null) assert(["通过", "未通过", "待定"].includes(i.result));
    if (i.recordedAt !== undefined) date(i.recordedAt);
    if (i.completedAt !== undefined && i.completedAt !== null) date(i.completedAt);
    if (i.sourceEventId !== undefined) assert(data.events.some(e => e.id === i.sourceEventId && e.applicationId === i.applicationId));
  });
  data.events.forEach(e => {
    strings(e as unknown as Record<string, unknown>, ["jobId", "title", "note"]); date(e.occurredAt);
    assert(["job-created", "job-updated", "application-created", "application-updated"].includes(e.type)); assert(data.jobs.some(j => j.id === e.jobId));
    if (e.applicationId !== undefined) { const a = data.applications.find(a => a.id === e.applicationId); assert(a && a.jobId === e.jobId && a.candidateId === e.candidateId); }
    if (e.before !== undefined) progress(e.before); if (e.after !== undefined) progress(e.after);
    if (e.source !== undefined) {
      assert(e.source.mode === undefined || e.source.mode === "ai" || e.source.mode === "manual");
      record(e.source); assert(typeof e.source.fingerprint === "string" && /^[a-f0-9]{64}$/.test(e.source.fingerprint));
      assert(messageSchema.safeParse(e.source.message).success && eventSchema.safeParse(e.source.original).success && eventSchema.safeParse(e.source.confirmed).success);
      assert(typeof e.source.confirmationNote === "string");
      assert(e.source.message.message.includes(e.source.original.evidence));
    }
    if (e.interviewChanges !== undefined) assert(Array.isArray(e.interviewChanges) && e.interviewChanges.every(c => c && c.after && c.after.applicationId === e.applicationId));
  });
}

/** Storage writes precede publication: a quota/permission error never pretends to save. */
export class RecruitmentRepository {
  constructor(private storage: StorageAdapter, private clock = () => new Date(), private id = () => crypto.randomUUID()) {}
  load(): RecruitmentData {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return this.reset();
    const data: unknown = JSON.parse(raw); validateData(data); return data;
  }
  private persist(data: RecruitmentData) { validateData(data); this.storage.setItem(STORAGE_KEY, JSON.stringify(data)); return data; }
  reset() { return this.persist(createSeed(this.clock())); }
  saveImport(raw: SaveImport) {
    const input = saveImportSchema.parse(raw), data = this.load();
    // A retry of the same confirmation returns the existing atomic commit.
    if (data.events.some(e => e.id === `IMPORT-${input.importId}`)) return data;
    const job = data.jobs.find(j => j.id === input.jobId);
    assert(job && job.status === "招聘中", "目标岗位已暂停、结束或删除，请重新选择");
    assert(jobVersion(job) === input.jobVersion, "岗位 JD 或条件已更新，请重新生成评语后再保存");
    assert(input.resume.name.value?.trim(), "请确认候选人姓名后再保存");
    const exact = data.candidates.filter(c => c.resumeHashes?.includes(input.resumeHash));
    const sameName = data.candidates.filter(c => c.name.trim() === input.resume.name.value!.trim());
    const candidate = input.existingCandidateId ? data.candidates.find(c => c.id === input.existingCandidateId) : undefined;
    assert(!input.existingCandidateId || candidate, "候选人已不存在，请重新选择");
    assert(!exact.length || (exact.length === 1 && candidate?.id === exact[0].id), "该简历已导入，请选择已有候选人，不能重复创建");
    assert(candidate || !sameName.length || input.newIdentityConfirmed, "存在同名候选人，请选择已有记录或确认是不同的人");
    const now = this.clock().toISOString();
    const candidateId = candidate?.id ?? `C-${this.id()}`;
    const stages = workflows.find(w => w.id === job.workflowId)!.stages;
    assert(stages.length > 1, "该岗位尚未配置复筛阶段");
    const existing = data.applications.find(a => a.candidateId === candidateId && a.jobId === job.id);
    assert(!existing || (existing.recommendation?.status === "待 HR 审核" && existing.stage === stages[0] && existing.status === "待处理"), "候选人已有该岗位申请，请在详情中查看进度，不能覆盖招聘历史");
    const resume = input.resume;
    if (!candidate) data.candidates.push({ id: candidateId, name: resume.name.value!.trim(), education: resume.education.value ?? "未提供", school: resume.school.value ?? "未提供", company: resume.company.value ?? "未提供", experience: resume.experienceYears.value ?? 0, skills: resume.skills.map(s => s.value).filter((s): s is string => !!s), summary: resume.experiences.map(s => s.value).filter(Boolean).join("；") || "经历待核实", createdAt: now, resumeProfile: resume, resumeHashes: [input.resumeHash] });
    else candidate.resumeHashes = [...new Set([...(candidate.resumeHashes ?? []), input.resumeHash])];
    const application: Application = {
      ...(existing ?? {}), id: existing?.id ?? `APP-${this.id()}`, candidateId, jobId: job.id,
      stage: input.recommend ? stages[1] : stages[0], status: "待处理", interview: "待安排", score: 0,
      createdAt: existing?.createdAt ?? now, updatedAt: now,
      recommendation: { id: input.importId, resumeHash: input.resumeHash, jobVersion: input.jobVersion, resume, hrNotes: input.hrNotes, analysis: input.analysis, usage: input.usage, content: redactContacts(input.content), status: input.recommend ? "待业务复筛" : "待 HR 审核", savedAt: now, recommendedAt: input.recommend ? now : null },
    };
    data.applications = existing ? data.applications.map(a => a.id === existing.id ? application : a) : [...data.applications, application];
    data.events.push({ id: `IMPORT-${input.importId}`, applicationId: application.id, candidateId, jobId: job.id, type: existing ? "application-updated" : "application-created", occurredAt: now, title: input.recommend ? "HR 确认推荐 · 待业务复筛" : "简历导入 · 待 HR 审核", note: "结构化简历、沟通信息和推荐草稿已保存；来源分别保留，未自动发送。", ...(existing ? { before: { stage: existing.stage, status: existing.status, interview: existing.interview } } : {}), after: { stage: application.stage, status: application.status, interview: application.interview } });
    return this.persist(data);
  }
  async confirmMessage(input: Confirmation) {
    const message = messageSchema.parse(input.message);
    const original = eventSchema.parse(input.original);
    const event = eventSchema.parse(input.event);
    assert(input.acknowledged && typeof input.confirmationNote === "string" && input.confirmationNote.trim() && input.confirmationNote.length <= 1000, "请勾选确认并填写人工核对说明");
    assert(message.message.includes(original.evidence) && event.evidence === original.evidence, "原文证据不一致，请重新解析");
    const fingerprint = await messageFingerprint(message.message);
    // Read only after asynchronous hashing, then commit all records with one setItem.
    const data = this.load();
    const eventId = `MSG-${fingerprint}-${input.applicationId}`;
    if (data.events.some(e => e.id === eventId)) return data;
    const matched = matchApplications(data, original);
    const application = matched.options.find(a => a.id === input.applicationId);
    assert(application, "没有可确认的匹配申请，请核实身份和岗位");
    assert(input.expected && ["stage", "status", "interview", "updatedAt"].every(key => application[key as keyof Application] === input.expected[key as keyof Confirmation["expected"]]), "申请状态已变化，请重新核对后确认");
    const now = this.clock();
    const proposal = proposeChange(data, application, event, now);
    assert(!proposal.errors.length, proposal.errors.join("；"));
    const before = { stage: application.stage, status: application.status, interview: application.interview };
    const interviewChanges: NonNullable<RecruitmentEvent["interviewChanges"]> = [];
    function saveInterview(stage: string, status: "已完成" | "已安排") {
      const existing = data.interviews.find(i => i.applicationId === application!.id && i.stage === stage && i.status === "已安排")
        ?? (status === "已完成" ? data.interviews.find(i => i.applicationId === application!.id && i.stage === stage && i.status === "已完成") : undefined);
      const record: InterviewRecord = {
        id: existing?.id ?? `INT-${eventId}-${stage}`, applicationId: application!.id, stage, status,
        scheduledAt: status === "已安排" ? event.interviewTime : existing?.scheduledAt ?? (!event.nextStage ? event.interviewTime : null),
        interviewer: status === "已安排" || !event.nextStage ? event.interviewer ?? existing?.interviewer ?? null : existing?.interviewer ?? null,
        result: status === "已完成" ? event.interviewResult : null,
        note: event.remarks ?? input.confirmationNote.trim(), recordedAt: now.toISOString(), sourceEventId: eventId,
        completedAt: status === "已完成" ? existing?.completedAt ?? message.messageAt : null,
      };
      interviewChanges.push({ before: existing ? structuredClone(existing) : null, after: structuredClone(record) });
      data.interviews = existing ? data.interviews.map(i => i.id === existing.id ? record : i) : [...data.interviews, record];
    }
    if (event.completedStage) saveInterview(event.completedStage, "已完成");
    if (proposal.target.interview === "已安排") saveInterview(proposal.target.stage, "已安排");
    Object.assign(application, proposal.target, { updatedAt: now.toISOString() });
    data.events.push({ id: eventId, applicationId: application.id, candidateId: application.candidateId, jobId: application.jobId,
      type: "application-updated", occurredAt: now.toISOString(), title: `面试记录：${before.stage}（${before.status}）→ ${application.stage}（${application.status}）`,
      note: input.confirmationNote.trim(), before, after: proposal.target, interviewChanges,
      source: { mode: input.mode ?? "ai", fingerprint, message, original, confirmed: event, confirmationNote: input.confirmationNote.trim() } });
    return this.persist(data);
  }
  saveJob(input: JobInput, jobId?: string) {
    const data = this.load(); const now = this.clock().toISOString();
    const existing = jobId ? data.jobs.find(j => j.id === jobId) : undefined;
    assert(!jobId || existing, "岗位已不存在，请重新选择");
    assert(!existing || existing.workflowId === input.workflowId || !data.applications.some(a => a.jobId === jobId), "该岗位已有申请，请保留原流程模板，以免历史阶段失效");
    const job: Job = { ...input, title: input.title.trim(), jd: input.jd.trim(), id: existing?.id ?? `JOB-${this.id()}`, created: existing?.created ?? now.slice(0, 10) };
    data.jobs = existing ? data.jobs.map(j => j.id === job.id ? job : j) : [job, ...data.jobs];
    data.events.push({ id: `EV-${this.id()}`, jobId: job.id, type: existing ? "job-updated" : "job-created", occurredAt: now, title: existing ? "岗位信息已更新" : "创建岗位", note: existing ? `岗位状态：${existing.status} → ${job.status}` : `岗位状态：${job.status}` });
    return this.persist(data);
  }
  updateApplication(applicationId: string, change: ApplicationChange) {
    const data = this.load(); const application = data.applications.find(a => a.id === applicationId);
    assert(application, "申请已不存在，请重新选择"); assert(change.note.trim(), "请填写本次变更说明"); progress(change);
    const now = this.clock().toISOString();
    const before = { stage: application.stage, status: application.status, interview: application.interview };
    const after = { stage: change.stage, status: change.status, interview: change.interview };
    assert(JSON.stringify(before) !== JSON.stringify(after), "状态没有变化，无需重复保存");
    Object.assign(application, after, { updatedAt: now });
    const event: RecruitmentEvent = { id: `EV-${this.id()}`, applicationId, candidateId: application.candidateId, jobId: application.jobId, type: "application-updated", occurredAt: now, title: `${before.stage}（${before.status}）→ ${after.stage}（${after.status}） · 面试${before.interview} → ${after.interview}`, note: change.note.trim(), before, after };
    data.events.push(event);
    if (change.interview !== "待安排") {
      const scheduled = data.interviews.find(i => i.applicationId === applicationId && i.stage === change.stage && i.status === "已安排");
      if (scheduled && change.interview === "已完成") { scheduled.status = "已完成"; scheduled.note = change.note.trim(); scheduled.completedAt = now; scheduled.recordedAt = now; scheduled.sourceEventId = event.id; }
      else if (!scheduled && (before.stage !== after.stage || before.interview !== after.interview)) data.interviews.push({ id: `INT-${this.id()}`, applicationId, stage: change.stage, scheduledAt: change.interview === "已完成" ? null : now, status: change.interview, note: change.note.trim(), ...(change.interview === "已完成" ? { completedAt: now, recordedAt: now, sourceEventId: event.id } : {}) });
    }
    return this.persist(data);
  }
}
