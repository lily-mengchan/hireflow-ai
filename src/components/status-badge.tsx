import { Tag } from "antd";

export type StatusTone = "progress" | "pending" | "success" | "failure" | "neutral" | "confirmation" | "stage";
const tones: Record<string, StatusTone> = {
  "招聘中": "progress", "进行中": "progress", "已安排": "progress",
  "待处理": "pending", "待安排": "pending", "待业务复筛": "pending", "待反馈": "pending",
  "已通过": "success", "通过": "success", "已完成": "success", "完成": "success",
  "未通过": "failure", "不通过": "failure", "已淘汰": "failure", "淘汰": "failure",
  "已结束": "neutral", "结束": "neutral", "已暂停": "neutral", "暂停": "neutral",
  "待确认": "confirmation", "待定": "confirmation", "未确认": "confirmation", "待 HR 审核": "confirmation",
};
const stages = new Set(["HR 初筛", "业务复筛", "作品集评审", "一面", "二面", "HR 面", "Offer"]);

/** Presentation only. Exact matching keeps “未通过” distinct from “通过”. */
export function statusTone(value: string, kind?: "stage" | "state"): StatusTone {
  return kind === "stage" || (!kind && stages.has(value)) ? "stage" : tones[value] ?? "neutral";
}
export default function StatusBadge({ value, kind, current }: { value: string; kind?: "stage" | "state"; current?: boolean }) {
  const tone = statusTone(value, kind);
  return <Tag className={`status-badge status-tag badge-${tone}${current ? " badge-current" : ""}`} data-status-tone={tone} aria-label={`${current ? "当前" : ""}${tone === "stage" ? "招聘阶段" : "状态"}：${value}`}><span className="badge-marker" aria-hidden="true" />{value}</Tag>;
}
