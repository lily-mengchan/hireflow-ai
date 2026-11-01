import { z } from "zod";
import { conditionsSchema, preScreeningSchema } from "./conditions";

export const MAX_RESUME_TEXT = 16000;
export const factSchema = z.object({ value: z.string().trim().min(1).max(1200).nullable(), evidence: z.string().max(1600).nullable(), originalEvidence: z.string().max(1600).optional(), source: z.enum(["RESUME", "HR_NOTE"]).default("RESUME") }).strict();
export const resumeSchema = z.object({
  name: factSchema, education: factSchema, school: factSchema, company: factSchema,
  experienceYears: z.object({ value: z.preprocess(value => {
    if (typeof value !== "string") return value;
    const explicit = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?:年|years?)?$/i);
    return explicit ? Number(explicit[1]) : value;
  }, z.number().min(0).max(60).nullable()), evidence: z.string().max(1600).nullable(), originalEvidence: z.string().max(1600).optional(), source: z.enum(["RESUME", "HR_NOTE"]).default("RESUME") }).strict(),
  currentBase: factSchema, desiredLocation: factSchema, earliestStart: factSchema,
  skills: z.array(factSchema).max(30), experiences: z.array(factSchema).max(10), projects: z.array(factSchema).max(10),
}).strict();
export const hrNotesSchema = z.object({
  currentBase: z.string().max(100).default(""), desiredLocation: z.string().max(100).default(""),
  acceptsLocation: z.enum(["未确认", "接受", "不接受"]).default("未确认"),
  expectedSalary: z.string().max(100).default(""), earliestStart: z.string().max(100).default(""),
  internshipDays: z.number().min(1).max(7).nullable().default(null), remarks: z.string().max(1000).default(""),
}).strict();
export const screeningJobSchema = z.object({ id: z.string().min(1).max(100), title: z.string().min(1).max(200), jd: z.string().min(1).max(24000), location: z.string().max(200), education: z.string().max(100), experience: z.string().max(100), workflowId: z.string().max(100), screeningConditions: conditionsSchema.optional() }).strict();
export const semanticSchema = z.object({ findings: z.array(z.object({ jdQuote: z.string().min(1).max(500), resumeQuote: z.string().max(800).nullable(), assessment: z.enum(["相关", "不匹配", "待核实"]), source: z.enum(["RESUME", "HR_NOTE"]).default("RESUME") }).strict()).max(8) }).strict();
export const checkSchema = z.object({ label: z.string().max(100), status: z.enum(["符合", "不符合", "待核实", "来源冲突"]), detail: z.string().max(2000) });
export const analysisSchema = z.object({ findings: semanticSchema.shape.findings, checks: z.array(checkSchema).max(30), draft: z.string().max(12000) });
export const usageSchema = z.object({ modelCalls: z.number().int().nonnegative(), promptTokens: z.number().int().nonnegative().nullable(), completionTokens: z.number().int().nonnegative().nullable(), cached: z.boolean() });
export const recommendationSchema = z.object({
  id: z.string().min(1), resumeHash: z.string().regex(/^[a-f0-9]{64}$/), jobVersion: z.string().min(1),
  resume: resumeSchema, hrNotes: hrNotesSchema, analysis: analysisSchema, usage: usageSchema,
  content: z.string().trim().min(1).max(12000), status: z.enum(["待 HR 审核", "待业务复筛"]),
  savedAt: z.string().datetime(), recommendedAt: z.string().datetime().nullable(),
});
export const saveImportSchema = z.object({
  importId: z.string().min(1).max(100), jobId: z.string().min(1), jobVersion: z.string().min(1), resumeHash: z.string().regex(/^[a-f0-9]{64}$/),
  resume: resumeSchema, hrNotes: hrNotesSchema, analysis: analysisSchema, usage: usageSchema,
  content: z.string().trim().min(1).max(12000), recommend: z.boolean(), acknowledged: z.literal(true),
  existingCandidateId: z.string().optional(), newIdentityConfirmed: z.boolean().default(false),
  preScreening: preScreeningSchema.optional(),
}).strict();
export type ResumeProfile = z.infer<typeof resumeSchema>;
export type HrNotes = z.infer<typeof hrNotesSchema>;
export type ScreeningJob = z.infer<typeof screeningJobSchema>;
export type Analysis = z.infer<typeof analysisSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type Recommendation = z.infer<typeof recommendationSchema>;
export type SaveImport = z.infer<typeof saveImportSchema>;
export type ScreeningResult = { resume: ResumeProfile; resumeHash: string; jobVersion: string; analysis: Analysis; usage: Usage };
