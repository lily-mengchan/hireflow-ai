import { getModelConfig } from "@/src/rag/model";
import { connection } from "next/server";
export async function GET() {
  await connection();
  try { const config = getModelConfig(); return Response.json({ configured: true, embeddingModel: config.embeddingModel, chatModel: config.chatModel }); }
  catch { return Response.json({ configured: false, message: "请配置部署平台环境变量或本地 .env.local 中的模型服务，并重新部署或重启服务" }); }
}
