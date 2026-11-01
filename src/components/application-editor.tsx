"use client";
import { useState } from "react";
import { Input } from "antd";
import { useRecruitment } from "../data/store";
import type { CandidateApplication } from "../types/recruitment";
import type { ExtractedEvent } from "../messages/schema";
import { manualFeedbackSource } from "../messages/manual";
import { inputToIso } from "../messages/time";
import FeedbackEditor from "./feedback-editor";
import "./recruitment-message-entry.css";

export default function ApplicationEditor({ candidate }: { candidate: CandidateApplication }) {
  const { data } = useRecruitment();
  const [eventAt, setEventAt] = useState("");
  const [revision, setRevision] = useState(0);
  const at = inputToIso(eventAt);
  const fields: ExtractedEvent = {
    candidateId: candidate.id, candidateName: candidate.name,
    jobTitle: data.jobs.find(j => j.id === candidate.jobId)?.title ?? null,
    eventType: "面试反馈", completedStage: candidate.stage,
    interviewResult: null, nextStage: null, interviewTime: null,
    timeEvidence: null, interviewer: null, remarks: null, evidence: "手动录入",
  };
  const source = at ? manualFeedbackSource(data, candidate.applicationId, fields, at) : null;
  return <section className="application-editor feedback-ui-entry">
    <h3>录入面试反馈与安排</h3>
    <p className="muted">当前岗位申请：{candidate.applicationId}，保存后同步更新招聘进度和历史。</p>
    <div className="feedback-event-time">
      <label htmlFor="candidate-feedback-at"><span><b aria-hidden="true">*</b> 事件发生时间</span><Input id="candidate-feedback-at" aria-label="手动录入事件发生时间" required type="datetime-local" value={eventAt} onChange={e => setEventAt(e.target.value)} /></label>
      <p>必填 · 上海时间。请先填写事件时间，再录入反馈或安排。</p>
    </div>
    {source && <FeedbackEditor key={`${candidate.applicationId}-${eventAt}-${revision}`} mode="manual" fixedApplicationId={candidate.applicationId} parsed={{ event: source.event, warnings: [] }} input={source.input} onCancel={() => { setRevision(v => v + 1); setEventAt(""); }} />}
  </section>;
}
