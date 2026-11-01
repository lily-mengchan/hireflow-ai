import { complete, getModelConfig, RagError } from "../rag/model";
import { workflows } from "../mocks/data";
import { compactExtractionSchema, deriveEventType, extractionSchema, feedbackInputIssue, messageSchema, type MessageInput, type ParsedEvent } from "./schema";
import { extractionPrompt } from "./prompt";
import { resolveMessageTime } from "./time";

export function validateExtraction(value: unknown, input: MessageInput): ParsedEvent[] {
  const compact = compactExtractionSchema.safeParse(value);
  const result = extractionSchema.safeParse(compact.success ? { events: compact.data.events.map(event => ({ ...event, eventType: deriveEventType(event), interviewTime: null })) } : value);
  if (!result.success) throw new RagError("模型输出不符合招聘事件结构，请重试", 502);
  return result.data.events.map(raw => {
    const event = { ...raw }; const warnings: string[] = [];
    if (!input.message.includes(event.evidence)) throw new RagError("原文证据校验失败，已阻止使用该解析结果", 502);
    for (const key of ["candidateId", "candidateName", "jobTitle", "interviewer", "timeEvidence"] as const) {
      if (event[key] && !event.evidence.includes(event[key]!)) { warnings.push(`${{ candidateId: "候选人编号", candidateName: "姓名", jobTitle: "岗位", interviewer: "面试官", timeEvidence: "时间依据" }[key]}缺少原文依据，请核实`); event[key] = null; }
    }
    const explicitId = event.evidence.match(/\bHF-[\w-]+\b/i)?.[0];
    if (explicitId) event.candidateId = explicitId;
    const aliases: Record<string, RegExp> = { "一面": /一面|第一轮|首轮|初面/, "二面": /二面|第二轮/, "HR 面": /HR面|人事面/i, "HR 初筛": /HR初筛|人事初筛/i, "业务复筛": /业务复筛|业务复试/, "作品集评审": /作品集评审|作品评审/, "Offer": /offer|录用通知/i };
    for (const key of ["completedStage", "nextStage"] as const) {
      const stage = event[key];
      if (stage && !(aliases[stage]?.test(event.evidence.replace(/\s/g, "")) ?? event.evidence.includes(stage))) {
        event[key] = null; warnings.push(`${key === "completedStage" ? "面试阶段" : "下一阶段"}缺少原文依据，请人工确认`);
      }
    }
    const negative = /未通过|不通过|没通过|没有通过|不合格|没过|淘汰|不过/.test(event.evidence);
    const positive = /通过|过了|合格/.test(event.evidence.replace(/未通过|不通过|没有通过|没通过|不合格/g, ""));
    if ((negative && positive) || (event.interviewResult === "通过" && negative) || (event.interviewResult === "未通过" && !negative) || (event.interviewResult === "通过" && !positive)) {
      event.interviewResult = null; warnings.push("面试结果存在冲突或缺少明确依据，请人工确认");
    }
    const resolved = resolveMessageTime(event.timeEvidence, input.messageAt);
    if (event.interviewTime && event.interviewTime !== resolved && event.timeEvidence) warnings.push("面试日期已重新校验；无法确定时请人工补齐");
    event.interviewTime = resolved;
    if (resolved && event.timeEvidence && !/\d{4}|周|星期|月|日|今天|明天|后天|昨天/.test(event.timeEvidence)) warnings.push("未写日期，暂按事件当天解释，请确认面试时间");
    if (!event.jobTitle) warnings.push("未明确岗位，请核实申请记录");
    if (event.nextStage && event.nextStage !== "Offer" && !resolved) warnings.push("面试日期或时刻不明确，请人工补齐");
    return { event, warnings };
  });
}

type ExtractionResult = { events: ParsedEvent[]; skipped: boolean };
export function createFeedbackExtractor(dependencies: { complete?: typeof complete; config?: typeof getModelConfig; now?: () => number } = {}) {
  const cache = new Map<string, { result: ExtractionResult; expires: number }>();
  const pending = new Map<string, Promise<ExtractionResult>>();
  const clock = dependencies.now ?? Date.now;
  return async (input: MessageInput): Promise<ExtractionResult> => {
    const parsed = messageSchema.parse(input);
    if (feedbackInputIssue(parsed.message)) return { events: [], skipped: true };
    const config = (dependencies.config ?? getModelConfig)();
    const key = JSON.stringify([config.baseUrl, config.chatModel, extractionPrompt, parsed]);
    const hit = cache.get(key);
    if (hit && hit.expires > clock()) return structuredClone(hit.result);
    const active = pending.get(key);
    if (active) return structuredClone(await active);
    const task = (async () => {
      const value = await (dependencies.complete ?? complete)(config, extractionPrompt, { ...parsed, stages: [...new Set(workflows.flatMap(w => w.stages))] });
      return { events: validateExtraction(value, parsed), skipped: false };
    })();
    pending.set(key, task);
    try {
      const result = await task;
      cache.set(key, { result, expires: clock() + 300000 });
      while (cache.size > 100) cache.delete(cache.keys().next().value!);
      return structuredClone(result);
    } finally { pending.delete(key); }
  };
}
export const extractRecruitmentMessage = createFeedbackExtractor();
