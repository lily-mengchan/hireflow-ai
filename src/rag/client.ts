"use client";
import { useSyncExternalStore } from "react";
import type { RagJob } from "./types";

type IndexState = { snapshot: string; status: "idle" | "syncing" | "ready" | "error"; chunks?: number; model?: string; error?: string };
const initial: IndexState = { snapshot: "", status: "idle" };
let state = initial;
const listeners = new Set<() => void>();
function publish(next: IndexState) { state = next; listeners.forEach(l => l()); }
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function useRagIndex() { return useSyncExternalStore(subscribe, () => state, () => initial); }
export async function ragRequest<T>(path: string, body: object): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/rag/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) }); }
  catch { throw new Error("知识库请求失败或超时，请重试"); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "知识库请求失败");
  return result as T;
}
export async function syncIndex(jobs: RagJob[], snapshot: string) {
  publish({ snapshot, status: "syncing" });
  try {
    const response = await ragRequest<{ chunks: number; embeddingModel: string }>("index", { jobs });
    if (state.snapshot === snapshot) publish({ snapshot, status: "ready", chunks: response.chunks, model: response.embeddingModel });
  } catch (error) {
    if (state.snapshot === snapshot) publish({ snapshot, status: "error", error: error instanceof Error ? error.message : "索引同步失败" });
  }
}
