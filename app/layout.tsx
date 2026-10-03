import type { Metadata } from "next";
import { Jersey_10, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jersey = Jersey_10({
  variable: "--font-jersey",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "HireLoop",
  description:
      "以简历证据校准招聘标准，通过反馈、变更提案和人工审批，让候选人评估可解释、可追溯。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh-CN"
      className={`${manrope.variable} ${jersey.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
