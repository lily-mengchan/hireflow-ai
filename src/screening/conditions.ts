import { z } from "zod";

// An explicit business-field catalog prevents arbitrary personal-attribute filters.
export const conditionFields = {
  acceptsLocation: { label: "接受岗位工作地点", type: "boolean" },
  internshipDays: { label: "每周可实习天数", type: "number" },
  internshipMonths: { label: "可实习周期（月）", type: "number" },
  availableAt: { label: "最早到岗日期", type: "date" },
  acceptsTravel: { label: "接受岗位必要出差", type: "boolean" },
  workMode: { label: "可接受的工作方式", type: "enum" },
  qualification: { label: "岗位所需职业资质", type: "enum" },
} as const;
export const operators = { eq: "等于", ne: "不等于", gte: "不少于", lte: "不晚于 / 不多于", gt: "大于 / 晚于", lt: "小于 / 早于" };
export const candidateValueSchema = z.union([z.boolean(), z.number().finite(), z.string().max(100), z.null()]);
export type ConditionValue = z.infer<typeof candidateValueSchema>;
export function validDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export const conditionSchema = z.object({
  conditionId: z.string().min(1).max(100), label: z.string().trim().min(1).max(80),
  fieldKey: z.enum(Object.keys(conditionFields) as [keyof typeof conditionFields, ...Array<keyof typeof conditionFields>]),
  valueType: z.enum(["boolean", "number", "date", "enum"]), operator: z.enum(["eq", "ne", "gte", "lte", "gt", "lt"]),
  expectedValue: candidateValueSchema, required: z.boolean(), enabled: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).strict().superRefine((c, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  if (conditionFields[c.fieldKey].type !== c.valueType) fail("字段与数值类型不一致");
  if (/年龄|性别|婚育|民族|宗教|户籍|出生|颜值/.test(c.label + (c.options ?? []).join(" "))) fail("请仅配置与岗位有关的合法业务条件");
  if (!c.enabled) return;
  if (["boolean", "enum"].includes(c.valueType) && !["eq", "ne"].includes(c.operator)) fail("布尔和枚举仅支持等于或不等于");
  if (c.valueType === "boolean" && typeof c.expectedValue !== "boolean") fail("请选择是或否");
  if (c.valueType === "number" && (typeof c.expectedValue !== "number" || c.expectedValue < 0 || (c.fieldKey === "internshipDays" && c.expectedValue > 7))) fail("数字要求无效");
  if (c.valueType === "date" && !validDate(c.expectedValue)) fail("日期要求无效");
  if (c.valueType === "enum" && (!c.options?.length || new Set(c.options).size !== c.options.length || !c.options.includes(String(c.expectedValue)))) fail("请配置不重复的枚举选项并选择要求值");
});
export const conditionsSchema = z.array(conditionSchema).max(20).superRefine((rows, ctx) => {
  if (new Set(rows.map(c => c.conditionId)).size !== rows.length) ctx.addIssue({ code: "custom", message: "条件 ID 重复" });
});
export type ScreeningCondition = z.infer<typeof conditionSchema>;
export const valuesSchema = z.record(z.string().max(100), candidateValueSchema);
export const checkRowSchema = z.object({ conditionId: z.string(), candidateValue: candidateValueSchema, checkResult: z.enum(["PASS", "FAIL", "UNKNOWN"]), reason: z.string() }).strict();
export const preScreeningSchema = z.object({
  jobId: z.string(), conditionsVersion: z.string().max(40000), conditions: conditionsSchema,
  values: valuesSchema, checkedAt: z.string().datetime(), results: z.array(checkRowSchema).max(20),
  decision: z.enum(["PASS", "FAIL", "UNKNOWN", "UNCONFIGURED"]), overrideReason: z.string().trim().min(3).max(500).nullable(),
}).strict();
export type PreScreening = z.infer<typeof preScreeningSchema>;
export const savedPreScreeningSchema = preScreeningSchema.extend({ applicationId: z.string(), records: z.array(checkRowSchema.extend({
  applicationId: z.string(), jobId: z.string(), conditionsVersion: z.string(), checkedAt: z.string().datetime(), source: z.literal("HR_NOTE"),
})).max(20) });
export function conditionsVersion(conditions: ScreeningCondition[] = []) {
  return JSON.stringify(conditionsSchema.parse(conditions).map(c => ({ ...c })).sort((a,b) => a.conditionId.localeCompare(b.conditionId)));
}
function valueError(c: ScreeningCondition, v: ConditionValue) {
  if (v === null || v === "") return null;
  if (c.valueType === "boolean") return typeof v === "boolean" ? null : "请填写是或否";
  if (c.valueType === "number") return typeof v === "number" && v >= 0 && (c.fieldKey !== "internshipDays" || v <= 7) ? null : "请输入有效数字";
  if (c.valueType === "date") return validDate(v) ? null : "请输入有效日期";
  return typeof v === "string" && c.options?.includes(v) ? null : "请选择有效枚举值";
}
export function evaluateConditions(jobId: string, conditions: ScreeningCondition[] = [], rawValues: Record<string, ConditionValue>, checkedAt = new Date().toISOString()): PreScreening {
  const rows = conditionsSchema.parse(conditions), values = valuesSchema.parse(rawValues);
  const active = rows.filter(c => c.enabled), errors: string[] = [];
  // Multiple restrictions on one field share one actual value; contradictory bounds are rejected.
  const results = active.map(c => {
    const v = values[c.fieldKey] ?? null, issue = valueError(c, v);
    if (issue) errors.push(`${c.label}：${issue}`);
    let pass = false;
    if (v !== null && v !== "" && !issue) {
      const e = c.expectedValue!;
      pass = c.operator === "eq" ? v === e : c.operator === "ne" ? v !== e : c.operator === "gte" ? v >= e : c.operator === "lte" ? v <= e : c.operator === "gt" ? v > e : v < e;
    }
    return { conditionId: c.conditionId, candidateValue: v, checkResult: v === null || v === "" || issue ? "UNKNOWN" as const : pass ? "PASS" as const : "FAIL" as const, reason: issue ?? (v === null || v === "" ? "缺少沟通确认信息" : pass ? "满足岗位要求" : "不满足岗位要求") };
  });
  for (const key of new Set(active.filter(c => c.required).map(c => c.fieldKey))) {
    const group = active.filter(c => c.required && c.fieldKey === key);
    if (group[0].valueType === "enum" && group.some(c => JSON.stringify(c.options) !== JSON.stringify(group[0].options))) errors.push(`${conditionFields[key].label}的枚举选项不一致，请统一配置`);
    const exact = group.find(c => c.operator === "eq");
    const possible = (v: ConditionValue) => group.every(c => c.operator === "eq" ? v === c.expectedValue : c.operator === "ne" ? v !== c.expectedValue : c.operator === "gte" ? v! >= c.expectedValue! : c.operator === "lte" ? v! <= c.expectedValue! : c.operator === "gt" ? v! > c.expectedValue! : v! < c.expectedValue!);
    if (exact && !possible(exact.expectedValue)) errors.push(`${conditionFields[key].label}存在冲突，请修改岗位条件`);
    if (!exact && ["number", "date"].includes(group[0].valueType)) {
      const n = (v: ConditionValue) => typeof v === "number" ? v : Date.parse(String(v)) / 86400000;
      const lower = group.filter(c => ["gte", "gt"].includes(c.operator)).map(c => n(c.expectedValue) + (c.operator === "gt" ? (c.valueType === "date" ? 1 : Number.EPSILON * Math.max(1,n(c.expectedValue))) : 0));
      const upper = group.filter(c => ["lte", "lt"].includes(c.operator)).map(c => n(c.expectedValue) - (c.operator === "lt" ? (c.valueType === "date" ? 1 : Number.EPSILON * Math.max(1,n(c.expectedValue))) : 0));
      if (Math.max(...lower) > Math.min(...upper)) errors.push(`${conditionFields[key].label}上下限冲突，请修改岗位条件`);
    }
    if (!exact && ["boolean", "enum"].includes(group[0].valueType) && !(group[0].valueType === "boolean" ? [true,false] : group[0].options ?? []).some(possible)) errors.push(`${conditionFields[key].label}没有可满足的选项，请修改岗位条件`);
  }
  if (errors.length) throw new Error([...new Set(errors)].join("；"));
  const required = results.filter(r => active.find(c => c.conditionId === r.conditionId)!.required);
  const decision = !active.length ? "UNCONFIGURED" : required.some(r => r.checkResult === "FAIL") ? "FAIL" : required.some(r => r.checkResult === "UNKNOWN") ? "UNKNOWN" : "PASS";
  return { jobId, conditionsVersion: conditionsVersion(rows), conditions: rows, values, checkedAt, results, decision, overrideReason: null };
}
export function validatePreScreening(job: { id: string; screeningConditions?: ScreeningCondition[] }, review?: PreScreening) {
  if (!review) { if (job.screeningConditions?.some(c => c.enabled)) throw new Error("请先检查基础条件"); return; }
  const parsed = preScreeningSchema.parse(review);
  if (parsed.jobId !== job.id || parsed.conditionsVersion !== conditionsVersion(job.screeningConditions) || parsed.conditionsVersion !== conditionsVersion(parsed.conditions)) throw new Error("岗位筛选条件已变更，原核验已过期，请重新检查");
  const current = evaluateConditions(job.id, job.screeningConditions, parsed.values, parsed.checkedAt);
  if (current.decision !== parsed.decision || JSON.stringify(current.results) !== JSON.stringify(parsed.results)) throw new Error("核验结果不一致，请重新检查基础条件");
  if (current.decision !== "PASS" && !parsed.overrideReason) throw new Error("基础条件未通过，请补充信息或填写人工继续原因");
}
