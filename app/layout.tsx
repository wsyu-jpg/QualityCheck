import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 文案质检",
  description: "小红书与公众号文案违禁词检测、AI 批注建议和一键改写工作台"
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
