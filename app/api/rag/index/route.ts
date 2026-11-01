import { parseJobs } from "@/src/rag/chunks";
import { ensureIndex } from "@/src/rag/index";
import { getModelConfig } from "@/src/rag/model";
import { errorResponse, readRequest, requestJobs } from "@/src/rag/http";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    const body = await readRequest(request);
    const jobs = requestJobs(() => parseJobs(body.jobs));
    const index = await ensureIndex(jobs, getModelConfig());
    return Response.json({ corpusVersion: index.corpusVersion, chunks: index.chunks.length, embeddingModel: index.embeddingModel, dimension: index.dimension, createdAt: index.createdAt });
  } catch (error) { return errorResponse(error); }
}
