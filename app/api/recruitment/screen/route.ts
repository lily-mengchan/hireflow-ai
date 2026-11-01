import { readRequest } from "@/src/rag/http";
import { RagError } from "@/src/rag/model";
import { analyzeRequestSchema, analyzeResume } from "@/src/screening/analyze";
export const maxDuration = 240;
export async function POST(request: Request) {
  try {
    const input = analyzeRequestSchema.safeParse(await readRequest(request));
    if (!input.success) return Response.json({ error: "请检查简历文本（40–16000 字）、岗位及沟通字段长度" }, { status: 400 });
    return Response.json(await analyzeResume(input.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof RagError ? error.message : "简历分析未返回有效结构，请重试或检查提取字段" }, { status: error instanceof RagError ? error.status : 422 });
  }
}
