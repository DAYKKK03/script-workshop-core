import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "短视频脚本拆写优化工具",
  description: "面向本地生活商家的抖音短视频脚本拆写 MVP"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
