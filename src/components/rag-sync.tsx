"use client";
import { useEffect } from "react";
import { Button } from "antd";
import { useRecruitment } from "../data/store";
import { jobSnapshot } from "../rag/types";
import { syncIndex, useRagIndex } from "../rag/client";

export default function RagSync() {
  const { jobs, ready, error } = useRecruitment();
  const snapshot = JSON.stringify(jobSnapshot(jobs));
  const index = useRagIndex();
  useEffect(() => {
    // Serverless routes may run in different instances: prewarming here can double costs.
    // Production asks always ensure the current snapshot's index inside their own request.
    if (!ready || error || process.env.NODE_ENV === "production") return;
    const timer = setTimeout(() => { void syncIndex(JSON.parse(snapshot), snapshot); }, 600);
    return () => clearTimeout(timer);
  }, [snapshot, ready, error]);
  const status = index.snapshot === snapshot ? index.status : "idle";
  if (status !== "error") return null;
  return <div className="rag-sync-status">
    <span role="alert" title={index.error}>助手的岗位资料同步失败，请重试。</span>
    <Button size="small" onClick={() => { void syncIndex(jobSnapshot(jobs), snapshot); }}>重新同步</Button>
  </div>;
}
