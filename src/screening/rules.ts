import type { Analysis, HrNotes, ResumeProfile, ScreeningJob } from "./schema";

// Browser/server identical, contains only fields that affect the selected job analysis.
export function jobVersion(job: ScreeningJob) { return JSON.stringify([job.id, job.title, job.jd, job.location, job.education, job.experience, job.workflowId]); }
export function redactContacts(text: string) { return text.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[邮箱已移除]").replace(/(?:\+?86[- ]?)?1[3-9]\d{9}/g, "[电话已移除]"); }
export function resumeFacts(resume: ResumeProfile) { return [resume.name, resume.education, resume.school, resume.company, resume.experienceYears, resume.currentBase, resume.desiredLocation, resume.earliestStart, ...resume.skills, ...resume.experiences, ...resume.projects]; }
export function deterministicChecks(resume: ResumeProfile, hr: HrNotes, job: ScreeningJob): Analysis["checks"] {
  const checks: Analysis["checks"] = [];
  const rank = (text: string) => /博士|ph\.?d|doctor/i.test(text) ? 4 : /硕士|研究生|master/i.test(text) ? 3 : /本科|学士|bachelor/i.test(text) ? 2 : /大专|专科|associate/i.test(text) ? 1 : null;
  const actual = rank(resume.education.value ?? ""), required = rank(job.education);
  checks.push({ label: "学历条件", status: /不限/.test(job.education) ? "符合" : actual === null || required === null ? "待核实" : actual >= required ? "符合" : "不符合", detail: `岗位：${job.education}；候选人：${resume.education.value ?? "未提供"}。JD 的额外条件仍需 HR 核对。` });
  const minimum = /不限|应届/.test(job.experience) ? 0 : Number(job.experience.match(/\d+/)?.[0] ?? NaN);
  checks.push({ label: "工作年限", status: !Number.isFinite(minimum) || resume.experienceYears.value === null ? "待核实" : resume.experienceYears.value >= minimum ? "符合" : "不符合", detail: `岗位：${job.experience}；明确提供年限：${resume.experienceYears.value ?? "未提供"}。未根据时间跨度臆算工作年限。` });
  checks.push({ label: "工作地点意愿", status: hr.acceptsLocation === "接受" ? "符合" : hr.acceptsLocation === "不接受" ? "不符合" : "待核实", detail: `目标地点：${job.location}；HR 确认：${hr.acceptsLocation}；意向地点：${hr.desiredLocation || resume.desiredLocation.value || "未提供"}` });
  for (const fact of resumeFacts(resume).filter(f => f.source === "HR_NOTE" && f.originalEvidence)) checks.push({ label: "简历字段人工修订", status: "来源冲突", detail: `RESUME 原文：${fact.originalEvidence}；HR_NOTE 修订：${fact.value ?? "未提供"}。原文与修订分别保留，请核对。` });
  // Check clear mandatory conditions in the actual JD as well as job form fields.
  // Bonus/preference clauses are deliberately not treated as rejection criteria.
  let requiredSection = false;
  for (const line of job.jd.split(/\n/)) {
    if (/^(?:任职要求|任职资格|岗位要求|基本要求)/.test(line.trim())) { requiredSection = true; continue; }
    if (/^(?:岗位职责|工作职责|加分项|工作条件|优先条件)/.test(line.trim())) { requiredSection = false; continue; }
    if (!requiredSection) continue;
    for (const clause of line.split(/[，,；;]/).filter(s => !/优先|加分|不限/.test(s))) {
      const education = clause.match(/(博士|硕士|本科|学士|大专|专科).{0,12}(?:学历|学位|以上)/);
      if (education) {
        const degree = rank(education[1])!;
        checks.push({ label: "JD 明确学历", status: actual === null ? "待核实" : actual >= degree ? "符合" : "不符合", detail: `JD 原文：${clause.trim()}；候选人：${resume.education.value ?? "未提供"}` });
      }
      const years = clause.match(/(\d+)\s*年(?:以上)?.{0,12}(?:经验|经历)/);
      if (years) checks.push({ label: "JD 明确年限", status: resume.experienceYears.value === null ? "待核实" : resume.experienceYears.value >= Number(years[1]) ? "符合" : "不符合", detail: `JD 原文：${clause.trim()}；候选人明确年限：${resume.experienceYears.value ?? "未提供"}` });
    }
  }
  for (const key of ["currentBase", "desiredLocation", "earliestStart"] as const) {
    const label = { currentBase: "目前 Base 地", desiredLocation: "意向工作地点", earliestStart: "最早可到岗时间" }[key];
    const original = resume[key].value, note = hr[key];
    if (original && note && original.trim() !== note.trim()) checks.push({ label, status: "来源冲突", detail: `RESUME／提取字段：${original}；HR_NOTE／沟通：${note}。两者已分别保留，请人工核实。` });
    else if (!original && !note) checks.push({ label, status: "待核实", detail: "简历与 HR 沟通均未提供。" });
  }
  return checks;
}
export function buildDraft(resume: ResumeProfile, hr: HrNotes, job: ScreeningJob, checks: Analysis["checks"], findings: Analysis["findings"]) {
  const background = [resume.education.value && `学历：${resume.education.value}`, resume.school.value && `院校：${resume.school.value}`, resume.company.value && `最近单位：${resume.company.value}`, resume.experienceYears.value !== null && `明确工作年限：${resume.experienceYears.value} 年`].filter(Boolean).join("；") || "基本背景信息待补充";
  const related = findings.filter(f => f.assessment === "相关" && f.resumeQuote).map(f => `• ${f.source === "HR_NOTE" ? "HR 核对依据" : "简历依据"}：${f.resumeQuote}\n  对应 JD：${f.jdQuote}`).join("\n") || "暂未取得明确的岗位相关经历依据，请业务部门进一步核实。";
  const communication = communicationText(hr) || "HR 暂未补充沟通确认信息。";
  const risks = checks.filter(c => c.status !== "符合").map(c => `• ${c.label}（${c.status}）：${c.detail}`).join("\n");
  const semanticRisks = findings.filter(f => f.assessment !== "相关").map(f => `• ${f.assessment}：${f.jdQuote}${f.resumeQuote ? `；简历：${f.resumeQuote}` : "（简历未提供明确依据）"}`).join("\n");
  return `推荐评语｜${job.title}\n${resume.name.value ?? "候选人姓名待确认"}：${background}。\n\n岗位相关经历与匹配依据\n${related}\n\nHR 沟通结论\n${communication}\n\n待核实事项\n${[risks, semanticRisks].filter(Boolean).join("\n") || "请业务部门核验经历真实性及实际能力。"}\n\n建议面试关注\n围绕以上 JD 条件，核实候选人的实际职责、具体贡献及可复述的项目案例。\n仅供 HR 和业务部门复筛参考，不代表录用或淘汰决定。`;
}
export function communicationText(hr: HrNotes) {
  return [["目前 Base", hr.currentBase], ["意向地点", hr.desiredLocation], ["接受岗位地点", hr.acceptsLocation === "未确认" ? "" : hr.acceptsLocation], ["期望薪资", hr.expectedSalary], ["最早到岗", hr.earliestStart], ["每周可实习", hr.internshipDays ? `${hr.internshipDays} 天` : ""], ["其他沟通", hr.remarks]].filter(([, value]) => value).map(([label, value]) => `${label}：${value}`).join("；");
}
export function copyRecommendation(candidateId: string, jobTitle: string, content: string, notes: HrNotes) {
  return redactContacts(`候选人编号：${candidateId}\n目标岗位：${jobTitle}\n\n${content}\n\n沟通结论（HR_NOTE）：${communicationText(notes) || "未补充"}`);
}
