import { readRequest } from "@/src/rag/http";
import { RagError } from "@/src/rag/model";
import { feedbackRequestSchema } from "@/src/messages/schema";
import { extractRecruitmentMessage } from "@/src/messages/extract";
export const maxDuration = 120;
export async function POST(request: Request) {
  const receivedAt = new Date().toISOString();
  try {
    const body = await readRequest(request);
    const parsed = feedbackRequestSchema.safeParse(body);
    if (!parsed.success) return Response.json({ error: "请输入 2–800 字反馈；历史时间需带时区，默认上海时区" }, { status: 400 });
    const input = { ...parsed.data, messageAt: parsed.data.messageAt ?? receivedAt };
    return Response.json({ ...await extractRecruitmentMessage(input), input });
  } catch (error) {
    return Response.json({ error: error instanceof RagError ? error.message : "招聘消息解析失败，请重试" }, { status: error instanceof RagError ? error.status : 500 });
  }
}
