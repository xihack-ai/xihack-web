"use client";

import { useState } from "react";
import Link from "next/link";

export type WorkspaceView = "任务概览" | "需求校准" | "招聘标准" | "候选人" | "反馈与审批" | "版本对比" | "决策日志";

const main: { label: WorkspaceView; icon: string; href: string }[] = [
  { label: "需求校准", icon: "✦", href: "/workspace#requirement" },
  { label: "招聘标准", icon: "☑", href: "/workspace#spec" },
  { label: "候选人", icon: "▤", href: "/candidates" },
  { label: "反馈与审批", icon: "◇", href: "/workspace#feedback-review" },
  { label: "版本对比", icon: "⇄", href: "/workspace#history" },
];

const more: { label: WorkspaceView; icon: string; href: string }[] = [
  { label: "任务概览", icon: "▦", href: "/workspace" },
  { label: "决策日志", icon: "◷", href: "/workspace#log" },
];

export function WorkspaceSidebar({ active, jobTitle, version, draft, onNavigate }: {
  active: WorkspaceView;
  jobTitle?: string;
  version?: number;
  draft?: boolean;
  onNavigate?: (view: WorkspaceView) => void;
}) {
  const [open, setOpen] = useState(false);
  const render = ({ label, icon, href }: { label: WorkspaceView; icon: string; href: string }) => {
    const content = <><span aria-hidden="true" className="nav-icon">{icon}</span><span>{label}</span></>;
    const className = active === label ? "active" : "";
    return onNavigate && label !== "候选人"
      ? <button key={label} type="button" className={className} aria-current={active === label ? "page" : undefined} onClick={() => { onNavigate(label); setOpen(false); }}>{content}</button>
      : <Link key={label} href={href} className={className} aria-current={active === label ? "page" : undefined} onClick={() => setOpen(false)}>{content}</Link>;
  };

  return <aside className={`workspace-sidebar ${open ? "nav-open" : ""}`}>
    <div className="sidebar-brand"><Link className="hireloop-wordmark" href="/" aria-label="Hire Loop 首页"><span className="hireloop-mark" aria-hidden="true">⇄</span><strong>Hire Loop</strong></Link><button className="sidebar-menu-toggle" type="button" aria-expanded={open} aria-controls="workspace-nav" onClick={() => setOpen((value) => !value)}>{open ? "关闭导航" : "打开导航"}</button></div>
    <div id="workspace-nav" className="sidebar-content">
      <div className="sidebar-job"><small>正在校准</small><strong title={jobTitle || "尚未创建职位"}>{jobTitle || "尚未创建职位"}</strong><span>{version ? `Spec v${version}` : draft ? "草稿 · 未启用" : "选择或创建职位"}</span></div>
      <nav aria-label="工作台导航"><p className="nav-caption">主流程</p>{main.map(render)}<p className="nav-caption">更多</p>{more.map(render)}</nav>
      <footer>标准由人确认 · 证据可追溯</footer>
    </div>
  </aside>;
}
