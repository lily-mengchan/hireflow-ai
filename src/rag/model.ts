import { digest } from "./chunks";

export class RagError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
export function getModelConfig() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const embeddingApiKey = process.env.RAG_EMBEDDING_API_KEY?.trim() || apiKey;
  const embeddingBaseUrl = (process.env.RAG_EMBEDDING_BASE_URL || baseUrl).replace(/\/+$/, "");
  const dimensions = process.env.RAG_EMBEDDING_DIMENSIONS ? Number(process.env.RAG_EMBEDDING_DIMENSIONS) : undefined;
  const embeddingModel = process.env.RAG_EMBEDDING_MODEL || "text-embedding-3-small";
  const chatModel = process.env.RAG_CHAT_MODEL || "gpt-4o-mini";
  const threshold = Number(process.env.RAG_MIN_SIMILARITY ?? "0.25");
  if (!Number.isFinite(threshold) || threshold < -1 || threshold > 1) throw new RagError("RAG_MIN_SIMILARITY 必须介于 -1 与 1", 503);
  if (!apiKey) throw new RagError("未配置 OPENAI_API_KEY。请在部署平台环境变量或本地 .env.local 配置模型服务，并重新部署或重启服务。", 503);
  if (!embeddingApiKey) throw new RagError("未配置 Embedding 服务密钥", 503);
  if (dimensions !== undefined && (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 8192)) throw new RagError("Embedding 维度配置无效", 503);
  for (const endpoint of [baseUrl, embeddingBaseUrl]) {
    let url: URL;
    try { url = new URL(endpoint); } catch { throw new RagError("模型服务地址配置无效", 503); }
    if (url.username || url.password || url.search || url.hash || !["http:", "https:"].includes(url.protocol)) throw new RagError("模型服务地址配置无效", 503);
  }
  return { apiKey, baseUrl, embeddingApiKey, embeddingBaseUrl, dimensions, embeddingModel, chatModel, threshold, signature: digest(`${embeddingBaseUrl}:${embeddingModel}:${dimensions ?? "default"}:float`) };
}
export type ModelConfig = ReturnType<typeof getModelConfig>;

async function post(config: ModelConfig, path: string, body: object): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000), cache: "no-store" });
  } catch { throw new RagError("模型服务连接失败或超时，请检查网络与 OPENAI_BASE_URL", 502); }
  if (!response.ok) throw new RagError(`模型服务返回 HTTP ${response.status}，请检查密钥、余额及模型名称`, 502);
  try { return await response.json(); } catch { throw new RagError("模型服务返回的内容不是有效 JSON", 502); }
}

export async function embed(config: ModelConfig, inputs: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (let offset = 0; offset < inputs.length; offset += 10) {
    const batch = inputs.slice(offset, offset + 10);
    const response = await post({ ...config, apiKey: config.embeddingApiKey, baseUrl: config.embeddingBaseUrl }, "embeddings", { model: config.embeddingModel, input: batch, encoding_format: "float", ...(config.dimensions ? { dimensions: config.dimensions } : {}) }) as { data?: { index: number; embedding: number[] }[] };
    if (!Array.isArray(response.data) || response.data.length !== batch.length) throw new RagError("Embedding 返回片段数量不匹配", 502);
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    sorted.forEach((item, i) => {
      if (item.index !== i || !Array.isArray(item.embedding) || !item.embedding.length || !item.embedding.every(v => typeof v === "number" && Number.isFinite(v)) || !item.embedding.some(v => v !== 0)) throw new RagError("Embedding 返回无效向量", 502);
      vectors.push(item.embedding);
    });
  }
  if (vectors.some(v => v.length !== vectors[0].length)) throw new RagError("Embedding 返回的向量维度不一致", 502);
  return vectors;
}

export async function complete(config: ModelConfig, system: string, evidence: object) {
  return (await completeMeasured(config, system, evidence)).value;
}
export async function completeMeasured(config: ModelConfig, system: string, evidence: object) {
  const response = await post(config, "chat/completions", {
    model: config.chatModel,
    messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(evidence) }],
    response_format: { type: "json_object" },
  }) as { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const choice = response.choices?.[0];
  if (choice?.finish_reason !== "stop" || !choice.message?.content || choice.message.refusal) throw new RagError("模型未返回完整的可验证回答，请重试", 502);
  try {
    const token = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
    return { value: JSON.parse(choice.message.content) as unknown, usage: { promptTokens: token(response.usage?.prompt_tokens), completionTokens: token(response.usage?.completion_tokens) } };
  } catch { throw new RagError("模型回答不符合 JSON 格式", 502); }
}
