import { RagError } from "./model";
export async function readRequest(request: Request): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new RagError("仅允许本站请求", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) throw new RagError("请求必须为 JSON", 415);
  // Stream and cap the body before parsing, rather than trusting Content-Length.
  const reader = request.body?.getReader();
  if (!reader) throw new RagError("请求内容为空", 400);
  const decoder = new TextDecoder(); let text = "", size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 1500000) { await reader.cancel(); throw new RagError("岗位快照过大", 413); }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  try { const value: unknown = JSON.parse(text); if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
  catch { throw new RagError("请求 JSON 格式无效", 400); }
}
export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof RagError ? error.message : "岗位知识处理失败，请重试或检查岗位数据" }, { status: error instanceof RagError ? error.status : 500 });
}
export function requestJobs(parse: () => import("./types").RagJob[]) {
  try { return parse(); } catch (error) { throw new RagError(error instanceof Error ? error.message : "岗位数据无效", 400); }
}
