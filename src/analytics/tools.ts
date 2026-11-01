import { paramsSchema, type AnalyticsData, type QueryParams, type QueryResult, type QueryRow, type Tool } from "./schema";
import { completionTime, currentOverview, DAY, formalStage, jobStages, passedStage, pendingBusiness, visitedStages } from "./facts";

export function timeRange(p: QueryParams, now: Date): [number, number] {
  const end = now.getTime();
  if (p.period === "all") return [-Infinity, end];
  if (p.period === "last7days" || p.period === "last30days") return [end - (p.period === "last7days" ? 7 : 30) * DAY, end];
  const today = new Date(new Date(end + 8 * 3600000).toISOString().slice(0, 10) + "T00:00:00+08:00").getTime();
  if (p.period === "today") return [today, end];
  const monday = today - (new Date(today + 8 * 3600000).getUTCDay() + 6) % 7 * DAY;
  if (p.period === "thisWeek") return [monday, end];
  if (p.period === "lastWeek") return [monday - 7 * DAY, monday - 1];
  if (!p.from || !p.to || Date.parse(p.from) > Date.parse(p.to) || Date.parse(p.to) > end) throw new Error("请提供有效且不晚于当前时间的起止时间（含时区）");
  return [Date.parse(p.from), Date.parse(p.to)];
}
function inPeriod(at: string | null | undefined, p: QueryParams, now: Date) { if (at && Date.parse(at) > now.getTime()) return false; if (p.period === "all") return true; const [from, to] = timeRange(p, now); return !!at && Date.parse(at) >= from && Date.parse(at) <= to; }
const wait = (at: string | null | undefined, now: Date) => at ? Math.max(0, (now.getTime() - Date.parse(at)) / DAY) : null;
function waiting(days: number | null, p: QueryParams) { return p.waitDays === null || (days !== null && (p.waitComparator === "gt" ? days > p.waitDays : days >= p.waitDays)); }
function scoped(data: AnalyticsData, p: QueryParams) {
  return data.applications.filter(a => (!p.jobId || a.jobId === p.jobId) && (!p.candidate || data.candidates.some(c => c.id === a.candidateId && (c.id === p.candidate || c.name === p.candidate))) && (!p.recommendedOnly || !!a.recommendation?.recommendedAt));
}
function row(data: AnalyticsData, a: AnalyticsData["applications"][number]): QueryRow {
  return { id: a.id, applicationId: a.id, cells: { candidate: data.candidates.find(c => c.id === a.candidateId)!.name, candidateId: a.candidateId, applicationId: a.id, job: data.jobs.find(j => j.id === a.jobId)!.title, stage: a.stage, status: a.status, interview: a.interview } };
}
const listColumns = [{ key: "candidate", title: "候选人" }, { key: "candidateId", title: "候选人编号" }, { key: "job", title: "岗位" }, { key: "stage", title: "当前阶段" }, { key: "status", title: "状态" }];
const metric = (label: string, value: number | null, unit = "份申请") => ({ label, value, unit });
function result(tool: Tool, title: string, now: Date): QueryResult { return { tool, title, answer: "", asOf: now.toISOString(), metrics: [], columns: [], rows: [], notes: [] }; }
function listMetrics(rows: QueryRow[]) { return [metric("匹配申请", rows.length), metric("涉及候选人", new Set(rows.map(r => r.cells.candidateId)).size, "人")]; }

export function getRecruitmentOverview(data: AnalyticsData, _p: QueryParams, now: Date) {
  const o = currentOverview(data), r = result("overview", "招聘总体情况", now);
  r.metrics = [metric("在招岗位", o.openJobs, "个"), metric("候选人总数", o.candidates, "人"), metric("岗位申请", o.applications), metric("待业务复筛", o.pendingBusiness), metric("待安排面试", o.pendingInterviews, "人"), metric("已发 Offer", o.offers, "份")];
  r.answer = `当前有 ${o.candidates} 位候选人、${o.applications} 份岗位申请，${o.openJobs} 个在招岗位。${o.pendingBusiness} 份已推荐申请待业务复筛，${o.pendingInterviews} 人待安排正式面试，已发 Offer ${o.offers} 份。`;
  r.notes = ["候选人按唯一 ID 去重；岗位申请独立统计。", `待安排正式面试共 ${o.pendingInterviewApplications} 份申请，不包含初筛或业务复筛；Offer 仅计当前 Offer 阶段且已通过的申请。`]; return r;
}
export function getCandidatesByStage(data: AnalyticsData, p: QueryParams, now: Date) {
  const r = result("candidates", "候选人进度", now);
  const apps = scoped(data, p).filter(a => (!p.stage || a.stage === p.stage) && (!p.status || a.status === p.status) && (!p.activeOnly || a.status !== "已淘汰") && (!p.interview || a.interview === p.interview) && (!p.formalOnly || formalStage(data, a.jobId, a.stage)) && inPeriod(a.createdAt, p, now));
  r.rows = apps.map(a => row(data, a)); r.metrics = listMetrics(r.rows); r.columns = [...listColumns, { key: "interview", title: "面试状态" }];
  r.answer = `找到 ${apps.length} 份岗位申请，涉及 ${new Set(apps.map(a => a.candidateId)).size} 位候选人。`;
  r.notes = ["同名候选人按唯一 ID 分别展示；同一候选人的不同岗位申请分别统计。", ...(p.period !== "all" ? ["时间筛选按申请创建时间，非阶段通过时间。"] : [])]; return r;
}
export function getPendingBusinessReview(data: AnalyticsData, p: QueryParams, now: Date) {
  const ids = new Set(scoped(data, p).map(a => a.id)), r = result("pendingBusiness", "待业务复筛", now);
  const apps = pendingBusiness(data).filter(a => ids.has(a.id) && inPeriod(a.recommendation!.recommendedAt, p, now) && waiting(wait(a.recommendation!.recommendedAt, now), p));
  r.rows = apps.map(a => ({ ...row(data, a), cells: { ...row(data, a).cells, recommendedAt: a.recommendation!.recommendedAt, waitDays: Number(wait(a.recommendation!.recommendedAt, now)!.toFixed(1)) } }));
  r.columns = [...listColumns, { key: "recommendedAt", title: "HR 推荐时间" }, { key: "waitDays", title: "等待天数" }]; r.metrics = listMetrics(r.rows);
  r.answer = `${apps.length} 份已确认推荐的申请仍在岗位的业务复筛／评审阶段等待反馈，涉及 ${new Set(apps.map(a => a.candidateId)).size} 人。`;
  r.notes = ["仅包含有明确推荐时间、当前仍在岗位流程第 2 阶段且待处理的申请；不把待 HR 审核草稿或无推荐记录的旧数据算作已推荐。", "等待时长从推荐时间起算；各岗位可配置不同复筛阶段。"];
  return r;
}
export function getPendingInterviewFeedback(data: AnalyticsData, p: QueryParams, now: Date) {
  const apps = scoped(data, p), ids = new Set(apps.map(a => a.id)), r = result("pendingFeedback", "待面试反馈", now);
  let unknown = 0, unconfirmed = 0;
  for (const i of data.interviews) {
    const a = apps.find(a => a.id === i.applicationId);
    if (!a || !ids.has(i.applicationId) || !formalStage(data, a.jobId, i.stage) || (p.stage && p.stage !== i.stage)) continue;
    if (i.status === "已安排" && i.scheduledAt && Date.parse(i.scheduledAt) < now.getTime()) unconfirmed++;
    if (i.status !== "已完成" || i.result === "通过" || i.result === "未通过") continue;
    const completed = completionTime(data, i), days = wait(completed?.at, now);
    if (!completed) unknown++;
    if (!waiting(days, p) || !inPeriod(completed?.at, p, now)) continue;
    r.rows.push({ ...row(data, a), id: i.id, cells: { ...row(data, a).cells, round: i.stage, completedAt: completed?.at ?? null, timeBasis: completed?.basis ?? "未记录完成时间", waitDays: days === null ? null : Number(days.toFixed(1)), feedback: i.result ?? "未记录" } });
  }
  r.columns = [...listColumns.slice(0, 3), { key: "round", title: "面试轮次" }, { key: "completedAt", title: "完成／记录时间" }, { key: "timeBasis", title: "计时依据" }, { key: "waitDays", title: "等待天数" }, { key: "feedback", title: "当前面评" }];
  r.metrics = [metric("待明确反馈", r.rows.length, "条面试记录"), metric("涉及候选人", new Set(r.rows.map(row => row.cells.candidateId)).size, "人")];
  r.answer = `找到 ${r.rows.length} 条已确认完成、但尚无明确通过或未通过结果的正式面试记录。`;
  r.notes = ["仅统计已完成的正式面试，待定视为未得到明确结果。预约时间不等于完成时间。", ...(unknown ? [`${unknown} 条记录缺少完成及关联事件时间，无法计算等待天数；指定等待天数或时间区间时不纳入。`] : []), ...(unconfirmed ? [`另有 ${unconfirmed} 条预约已过但尚未确认完成的记录，未据此认定面试已发生。`] : [])]; return r;
}
export function getInterviewStatistics(data: AnalyticsData, p: QueryParams, now: Date) {
  const apps = scoped(data, p), r = result("interviewStats", "面试结果统计", now);
  const groups = new Map<string, { job: string; round: string; records: number; passed: number; failed: number; unknown: number; ids: Set<string> }>(); let missingTime = 0;
  const passedCandidates = new Set<string>(), failedCandidates = new Set<string>();
  for (const i of data.interviews) {
    const a = apps.find(a => a.id === i.applicationId);
    if (!a || !formalStage(data, a.jobId, i.stage) || i.status !== "已完成" || (p.stage && i.stage !== p.stage)) continue;
    const time = completionTime(data, i);
    if (p.period !== "all" && !time) { missingTime++; continue; }
    if (!inPeriod(time?.at, p, now)) continue;
    const key = `${a.jobId}:${i.stage}`, group = groups.get(key) ?? { job: data.jobs.find(j => j.id === a.jobId)!.title, round: i.stage, records: 0, passed: 0, failed: 0, unknown: 0, ids: new Set<string>() };
    group.records++; group.ids.add(a.candidateId); if (i.result === "通过") { group.passed++; passedCandidates.add(a.candidateId); } else if (i.result === "未通过") { group.failed++; failedCandidates.add(a.candidateId); } else group.unknown++; groups.set(key, group);
  }
  let passed = 0, failed = 0, records = 0;
  for (const [key, g] of groups) {
    passed += g.passed; failed += g.failed; records += g.records;
    r.rows.push({ id: key, cells: { job: g.job, round: g.round, records: g.records, candidates: g.ids.size, passed: g.passed, failed: g.failed, unknown: g.unknown, denominator: g.passed + g.failed, rate: g.passed + g.failed ? `${(g.passed / (g.passed + g.failed) * 100).toFixed(1)}%` : "暂无足够数据" } });
  }
  r.metrics = [metric("已完成面试", records, "条"), metric("通过人数", passedCandidates.size, "人"), metric("未通过人数", failedCandidates.size, "人"), metric("明确结果通过率", passed + failed ? Number((passed / (passed + failed) * 100).toFixed(1)) : null, "%")];
  r.columns = [{ key: "job", title: "岗位" }, { key: "round", title: "轮次" }, { key: "records", title: "已完成记录" }, { key: "candidates", title: "涉及人数" }, { key: "passed", title: "通过" }, { key: "failed", title: "未通过" }, { key: "unknown", title: "待定／未知" }, { key: "denominator", title: "分母" }, { key: "rate", title: "通过率" }];
  r.answer = `已完成面试 ${records} 条，其中 ${passedCandidates.size} 人通过（${passed} 条记录）、${failedCandidates.size} 人未通过（${failed} 条记录）。${passed + failed ? `通过率 ${(passed / (passed + failed) * 100).toFixed(1)}%，分母为 ${passed + failed} 条明确结果记录。` : "暂无足够数据计算通过率。"}`;
  r.notes = ["仅使用实际面试记录的明确结果；不由状态流转、当前阶段或评语推算面试通过率。未知／待定结果不进入分母。", "按岗位和轮次分组，同一候选人不同申请的记录分别计算。", ...(missingTime ? [`${missingTime} 条记录无可核实时间，未纳入该时间区间。`] : [])]; return r;
}
export function getRecruitmentConversion(data: AnalyticsData, p: QueryParams, now: Date) {
  const apps = scoped(data, p), r = result("conversion", p.recommendedOnly ? "HR 推荐申请转化" : "招聘阶段记录覆盖与转化", now);
  const sets = Array.from({ length: 5 }, () => new Set<string>()); let formal = 0;
  for (const a of apps) {
    const visited = visitedStages(data, a.id), stages = jobStages(data, a.jobId);
    if (a.recommendation?.recommendedAt) sets[0].add(a.id);
    if (passedStage(data, a.id, stages[1])) sets[1].add(a.id);
    if (visited.has("一面")) sets[2].add(a.id);
    if (visited.has("二面")) sets[3].add(a.id);
    if (passedStage(data, a.id, "Offer")) sets[4].add(a.id);
    if ([...visited].some(stage => formalStage(data, a.jobId, stage))) formal++;
  }
  const labels = ["HR 已推荐", "业务复筛／评审通过", "进入一面", "进入二面", "获得 Offer"];
  r.rows = sets.map((set, i) => {
    const previous = sets[i - 1], retained = previous ? [...set].filter(id => previous.has(id)).length : null;
    return { id: String(i), cells: { stage: labels[i], count: set.size, candidates: new Set(apps.filter(a => set.has(a.id)).map(a => a.candidateId)).size, retained, denominator: previous?.size ?? null, rate: previous?.size ? `${(retained! / previous.size * 100).toFixed(1)}%` : "暂无足够数据" } };
  });
  r.metrics = [metric("分析申请", apps.length), metric("HR 已推荐", sets[0].size), metric("已进入正式面试", formal)];
  r.columns = [{ key: "stage", title: "明确记录阶段" }, { key: "count", title: "申请数" }, { key: "candidates", title: "候选人数" }, { key: "retained", title: "上一步申请中已进入本步" }, { key: "denominator", title: "上一步申请数" }, { key: "rate", title: "可核实转化率" }];
  r.answer = `${p.recommendedOnly ? "已明确推荐的" : "所选范围内"} ${apps.length} 份申请中，${formal} 份有正式面试阶段记录。明确记录：推荐 ${sets[0].size} 份、复筛通过 ${sets[1].size} 份、一面 ${sets[2].size} 份、二面 ${sets[3].size} 份、Offer ${sets[4].size} 份。`;
  r.notes = ["只依据明确的当前阶段、前后状态历史和面试记录计数，不根据更后阶段补造前序经历。推荐必须有明确推荐时间。", "每步转化率＝上一步申请中也有本步证据的申请数／上一步申请数；分母为 0 显示暂无足够数据。不同步骤记录覆盖可能不完整，不能直接相除总人数。", "正式面试按岗位流程中的面试阶段识别，不含业务复筛／作品集评审；计数单位为岗位申请。", ...(sets[0].size === 0 ? ["暂无明确 HR 推荐记录，不能计算从 HR 推荐开始的完整转化率。"] : [])]; return r;
}
export function getRecruitmentBottlenecks(data: AnalyticsData, p: QueryParams, now: Date) {
  const r = result("bottlenecks", "招聘待处理与积压", now), apps = scoped(data, p), business = new Set(pendingBusiness(data).map(a => a.id));
  const threshold = p.waitDays ?? 3;
  for (const job of data.jobs.filter(j => !p.jobId || j.id === p.jobId)) {
    const list = apps.filter(a => a.jobId === job.id), pending = list.filter(a => a.status === "待处理" && a.stage !== "Offer");
    const feedback = getPendingInterviewFeedback(data, { ...p, jobId: job.id, waitDays: threshold }, now).rows.length;
    const stale = pending.filter(a => waiting(wait(a.updatedAt, now), { ...p, waitDays: threshold }));
    r.rows.push({ id: job.id, cells: { job: job.title, pending: pending.length, business: pending.filter(a => business.has(a.id)).length, feedback, stale: stale.length, longest: pending.length ? Number(Math.max(...pending.map(a => wait(a.updatedAt, now)!)).toFixed(1)) : null } });
  }
  r.rows.sort((a, b) => Number(b.cells.pending) - Number(a.cells.pending));
  r.columns = [{ key: "job", title: "岗位" }, { key: "pending", title: "待处理申请" }, { key: "business", title: "待业务复筛" }, { key: "feedback", title: `面评等待${threshold}天阈值` }, { key: "stale", title: `未推进${threshold}天阈值` }, { key: "longest", title: "最长未推进天数" }];
  const first = r.rows[0], tied = first ? r.rows.filter(row => row.cells.pending === first.cells.pending) : [];
  r.answer = first && Number(first.cells.pending) > 0 ? `待处理申请最多的岗位：${tied.slice(0, 5).map(row => row.cells.job).join("、")}${tied.length > 5 ? `等 ${tied.length} 个岗位` : ""}${tied.length > 1 ? "（并列）" : ""}，各 ${first.cells.pending} 份。以下为可核实的积压统计。` : first ? "当前没有待处理申请。" : "暂无可分析的岗位数据。";
  r.metrics = [metric("待处理申请", r.rows.reduce((n, row) => n + Number(row.cells.pending), 0)), metric("未推进申请", r.rows.reduce((n, row) => n + Number(row.cells.stale), 0))];
  r.notes = ["未推进时长依据申请最近更新时间；面评依据明确完成／记录时间。缺少时间的记录不冒充超期。", "分类可能重叠，不应相加作为总人数；只报告记录事实，不推测业务原因。按待处理申请数排序。"];
  return r;
}
const tools = { overview: getRecruitmentOverview, candidates: getCandidatesByStage, pendingBusiness: getPendingBusinessReview, pendingFeedback: getPendingInterviewFeedback, interviewStats: getInterviewStatistics, conversion: getRecruitmentConversion, bottlenecks: getRecruitmentBottlenecks };
export function executeQuery(data: AnalyticsData, tool: Tool, raw: QueryParams, now = new Date()) {
  const p = paramsSchema.parse(raw);
  if (p.jobId && !data.jobs.some(j => j.id === p.jobId)) throw new Error("岗位已不存在，请重新指定当前岗位");
  if (p.stage && !(p.jobId ? jobStages(data, p.jobId) : data.jobs.flatMap(j => jobStages(data, j.id))).includes(p.stage)) throw new Error("该招聘阶段不属于所选岗位流程，请指定有效轮次或阶段");
  if (p.period === "custom" && (!p.from || !p.to)) throw new Error("请补充查询起止日期与时区");
  if (p.period !== "custom" && (p.from || p.to)) throw new Error("时间参数不一致，请重新说明时间范围");
  timeRange(p, now);
  const allowed: Record<Tool, (keyof QueryParams)[]> = {
    overview: [], candidates: ["jobId", "stage", "status", "candidate", "period", "from", "to", "recommendedOnly", "interview", "formalOnly", "activeOnly"],
    pendingBusiness: ["jobId", "candidate", "period", "from", "to", "waitDays", "waitComparator"],
    pendingFeedback: ["jobId", "stage", "candidate", "period", "from", "to", "waitDays", "waitComparator"],
    interviewStats: ["jobId", "stage", "candidate", "period", "from", "to", "recommendedOnly"], conversion: ["jobId", "candidate", "recommendedOnly"], bottlenecks: ["jobId", "waitDays", "waitComparator"],
  };
  const defaults = paramsSchema.parse({});
  for (const key of Object.keys(p) as (keyof QueryParams)[]) if (key !== "limit" && p[key] !== defaults[key] && !allowed[tool].includes(key)) throw new Error(`当前查询不支持该筛选条件，请分别询问招聘概况、阶段进度、面试统计或转化情况`);
  const r = tools[tool](data, p, now), total = r.rows.length;
  r.rows = r.rows.slice(0, p.limit);
  if (total > p.limit) r.notes.push(`共 ${total} 条结果，本次展示前 ${p.limit} 条；统计值使用全部符合条件的记录。`);
  if (p.period !== "all") r.notes.push(`时间区间：${new Date(timeRange(p, now)[0]).toISOString()} 至 ${new Date(timeRange(p, now)[1]).toISOString()}，日期按上海时区解释。`);
  return r;
}
