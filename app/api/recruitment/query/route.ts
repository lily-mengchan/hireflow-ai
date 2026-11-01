import { z } from "zod";
import { readRequest } from "@/src/rag/http";
import { RagError } from "@/src/rag/model";
import { snapshotSchema } from "@/src/analytics/schema";
import { routeIntent } from "@/src/analytics/router";
import { executeQuery } from "@/src/analytics/tools";
export const maxDuration = 120;
const requestSchema = z.object({ question: z.string().trim().min(2).max(800), snapshot: snapshotSchema }).strict();
export async function POST(request: Request) {
  const now = new Date();
  try {
    const body = requestSchema.safeParse(await readRequest(request));
    if (!body.success) return Response.json({ error: "查询问题或招聘快照无效，请检查当前本地数据后重试" }, { status: 400 });
    const { question, snapshot } = body.data;
    const routed = await routeIntent(question, snapshot.jobs, now);
    if (routed.intent.kind !== "data") return Response.json(routed.intent, { headers: { "Cache-Control": "no-store" } });
    try {
      const result = executeQuery(snapshot, routed.intent.tool, routed.intent.params, now);
      return Response.json({ kind: "data", result, routing: routed.routing }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) { return Response.json({ kind: "clarify", message: e instanceof Error ? e.message : "查询条件不明确，请重新说明" }); }
  } catch (error) { return Response.json({ error: error instanceof RagError ? error.message : "招聘查询暂时不可用，请重试" }, { status: error instanceof RagError ? error.status : 500 }); }
}
