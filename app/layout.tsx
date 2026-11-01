import type { Metadata } from "next";
import Shell from "@/src/components/shell";
import { Suspense } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "HireFlow AI · 招聘数据看板",
    template: "%s · HireFlow AI"
  },
  description: "HireFlow AI 招聘管理后台 · 本地 Mock 演示",
  icons: {
    icon: { url: "/logo.png", type: "image/png" },
    shortcut: "/logo.png",
    apple: "/logo.png"
  }
};
export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <html lang="zh-CN"><body><Suspense fallback={<div className="loading-state" role="status">HireFlow AI · 正在加载招聘工作台…</div>}><Shell>{children}</Shell></Suspense></body></html>;
}
