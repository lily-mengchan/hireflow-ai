import { parseJobs } from "@/src/rag/chunks";
import { ensureIndex } from "@/src/rag/index";
import { getModelConfig, RagError } from "@/src/rag/model";
import { answerQuestion } from "@/src/rag/answer";
import { errorResponse, readRequest, requestJobs } from "@/src/rag/http";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    const body = await readRequest(request);
    if (typeof body.question !== "string" || !body.question.trim() || body.question.length > 2000) throw new RagError("请输入不超过 2000 字的问题", 400);
    const topK = body.topK === undefined ? 16 : body.topK;
    if (!Number.isInteger(topK) || Number(topK) < 1 || Number(topK) > 24) throw new RagError("Top K 必须为 1–24 的整数", 400);
    const jobs = requestJobs(() => parseJobs(body.jobs));
    const config = getModelConfig();
    const index = await ensureIndex(jobs, config);
    return Response.json(await answerQuestion(body.question.trim(), index, config, Number(topK)));
  } catch (error) { return errorResponse(error); }
}
