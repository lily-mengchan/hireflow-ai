"use client";
import { Collapse, Empty, Table } from "antd";
import type { QueryResult } from "../analytics/schema";
import { formatDate } from "../data/selectors";
import "./recruitment-query-result.css";
export default function RecruitmentQueryResult({ result, onCandidate }: { result: QueryResult; onCandidate: (applicationId: string) => void }) {
  return <section className="recruitment-query-result" aria-label={result.title}>
    <div className="query-result-heading"><strong>{result.title}</strong><span>截至 {formatDate(result.asOf)}</span></div>
    <div className="query-metrics">{result.metrics.map(m => <div key={m.label}><span>{m.label}</span><strong>{m.value ?? "—"}<small>{m.value === null ? "暂无足够数据" : m.unit}</small></strong></div>)}</div>
    {!!result.columns.length && <Table size="small" rowKey="id" pagination={false} scroll={{ x: Math.max(550, result.columns.length * 110) }} locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的记录" /> }} dataSource={result.rows} columns={result.columns.map(column => ({ title: column.title, key: column.key, render: (_, row) => {
      const value = row.cells[column.key];
      if (column.key === "candidate" && row.applicationId) return <button className="text-button" onClick={() => onCandidate(row.applicationId!)}>{String(value ?? "查看候选人")}</button>;
      if (/At$/.test(column.key) && typeof value === "string") return formatDate(value);
      return value === null || value === undefined ? "未记录" : String(value);
    } }))} />}
    <Collapse ghost size="small" items={[{ key: "basis", label: "统计口径与数据说明", children: result.notes.map((note, i) => <p key={i}>{note}</p>) }]} />
  </section>;
}
