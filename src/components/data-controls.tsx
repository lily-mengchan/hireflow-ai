"use client";
import { Alert, App, Button, Popconfirm } from "antd";
import { recruitmentActions, useRecruitment } from "../data/store";
import RagSync from "./rag-sync";

export default function DataControls() {
  const { ready, error } = useRecruitment();
  const { message } = App.useApp();
  function reset() {
    try { recruitmentActions.reset(); message.success("已恢复初始演示数据，所有页面已同步"); }
    catch { message.error("无法重置：请检查浏览器本地存储权限或可用空间"); }
  }
  return <div className="data-controls">
    <span>{ready ? "共享演示数据 · 自动保存到此浏览器" : "正在加载本地演示数据…"}</span>
    <Popconfirm title="重置所有演示数据？" description="将清除本浏览器中的岗位和招聘进度修改，恢复初始样本。" onConfirm={reset} okText="重置数据" cancelText="取消"><Button size="small" disabled={!ready}>重置演示数据</Button></Popconfirm>
    {error && <Alert type="warning" showIcon title={error} />}
    <RagSync />
  </div>;
}
