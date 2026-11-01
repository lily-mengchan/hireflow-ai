import { z } from "zod";
import { digest } from "../rag/chunks";
import { completeMeasured, getModelConfig, RagError } from "../rag/model";
import { createParseCache } from "../messages/parse-cache";
import { MAX_RESUME_TEXT, resumeSchema, hrNotesSchema, screeningJobSchema, semanticSchema, type ScreeningResult, type ResumeProfile } from "./schema";
import { buildDraft, deterministicChecks, jobVersion, redactContacts, resumeFacts } from "./rules";
import { MATCH_PROMPT, RESUME_PROMPT } from "./prompt";
import { preScreeningSchema, validatePreScreening } from "./conditions";

export const analyzeRequestSchema = z.object({ text: z.string().trim().min(40).max(MAX_RESUME_TEXT), job: screeningJobSchema, hrNotes: hrNotesSchema, editedResume: resumeSchema.optional(), preScreening: preScreeningSchema.optional() }).strict();
export function validateResume(profile: ResumeProfile, text: string, allowHr = false) {
  for (const fact of resumeFacts(profile)) {
    if (fact.originalEvidence && !text.includes(fact.originalEvidence)) throw new RagError("人工修改前的原文依据不属于简历文本", 422);
    if (fact.source === "HR_NOTE") { if (!allowHr || fact.evidence !== null) throw new RagError("人工修改字段的来源标记无效", 422); continue; }
    if (fact.value !== null && (!fact.evidence || !text.includes(fact.evidence))) throw new RagError("简历字段缺少有效原文依据，请重试或人工核对", 422);
    if (fact.evidence && !text.includes(fact.evidence)) throw new RagError("简历证据不属于上传文本", 422);
  }
  const compact = (value: string) => value.replace(/\s/g, "").toLowerCase();
  for (const key of ["name", "school", "company"] as const) {
    const fact = profile[key];
    if (fact.source === "RESUME" && fact.value && !compact(fact.evidence ?? "").includes(compact(fact.value))) throw new RagError("姓名、院校或单位与原文不一致，请核对后重试", 422);
  }
}
export function createScreeningAnalyzer(deps: { complete?: typeof completeMeasured; config?: typeof getModelConfig } = {}) {
  const parsedCache = createParseCache<ResumeProfile>();
  const analysisCache = createParseCache<ScreeningResult>();
  const pending = new Map<string, Promise<ScreeningResult>>();
  const pendingProfiles = new Map<string, Promise<ResumeProfile>>();
  const call = deps.complete ?? completeMeasured, config = deps.config ?? getModelConfig;
  return async (raw: unknown) => {
    const input = analyzeRequestSchema.parse(raw);
    try { if (!input.preScreening) throw new Error("请先检查基础条件，未配置条件时请人工确认继续"); validatePreScreening(input.job, input.preScreening); }
    catch (error) { throw new RagError(error instanceof Error ? error.message : "请先检查基础条件", 422); }
    const text = redactContacts(input.text).replace(/\r\n/g, "\n").trim();
    const cfg = config();
    const resumeHash = digest(text), version = jobVersion(input.job);
    const scope = `${cfg.baseUrl}:${cfg.chatModel}:screening-v1`;
    const cachedResume = parsedCache.get(scope + resumeHash);
    const edits = input.editedResume && JSON.stringify(cachedResume) !== JSON.stringify(input.editedResume) ? input.editedResume : undefined;
    const key = digest(scope + JSON.stringify([resumeHash, version, input.hrNotes, edits]));
    const hit = analysisCache.get(key);
    const reused = (result: ScreeningResult) => ({ ...structuredClone(result), usage: { modelCalls: 0, promptTokens: 0, completionTokens: 0, cached: true } });
    if (hit) return reused(hit);
    const existing = pending.get(key); if (existing) return reused(await existing);
    const task = (async () => {
      let modelCalls = 0, promptTokens: number | null = 0, completionTokens: number | null = 0;
      async function invoke(prompt: string, body: object) {
        const response = await call(cfg, prompt, body); modelCalls++;
        promptTokens = promptTokens !== null && response.usage.promptTokens !== null ? promptTokens + response.usage.promptTokens : null;
        completionTokens = completionTokens !== null && response.usage.completionTokens !== null ? completionTokens + response.usage.completionTokens : null;
        return response.value;
      }
      let resume = edits ?? cachedResume;
      if (!resume) {
        const parseKey = scope + resumeHash;
        const shared = pendingProfiles.get(parseKey);
        if (shared) resume = structuredClone(await shared);
        else {
          const parsing = (async () => {
            const profile = resumeSchema.parse(await invoke(RESUME_PROMPT, { text }));
            validateResume(profile, text); parsedCache.set(parseKey, profile, 600000); return profile;
          })();
          pendingProfiles.set(parseKey, parsing);
          try { resume = await parsing; } finally { pendingProfiles.delete(parseKey); }
        }
      } else validateResume(resume, text, !!edits);
      const facts = resumeFacts(resume).filter(f => f.value !== null).map(f => ({ ...f, evidence: f.source === "HR_NOTE" ? String(f.value) : f.evidence }));
      const semantic = semanticSchema.parse(await invoke(MATCH_PROMPT, { jd: input.job.jd, facts }));
      for (const item of semantic.findings) {
        const supporting = facts.find(f => f.evidence?.includes(item.resumeQuote ?? "\u0000"));
        if (!input.job.jd.includes(item.jdQuote) || (item.resumeQuote && !supporting) || (item.assessment !== "待核实" && !item.resumeQuote)) throw new RagError("岗位匹配依据校验失败，请重试或核对简历", 422);
        item.source = supporting?.source ?? "RESUME";
      }
      const checks = deterministicChecks(resume, input.hrNotes, input.job);
      const result: ScreeningResult = { resume, resumeHash, jobVersion: version, analysis: { findings: semantic.findings, checks, draft: buildDraft(resume, input.hrNotes, input.job, checks, semantic.findings) }, usage: { modelCalls, promptTokens, completionTokens, cached: false } };
      analysisCache.set(key, result, 600000); return result;
    })();
    pending.set(key, task);
    try { return structuredClone(await task); } finally { pending.delete(key); }
  };
}
export const analyzeResume = createScreeningAnalyzer();
