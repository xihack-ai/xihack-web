"use client";

import { useMemo, useState } from "react";
import type { Calibration, Criterion } from "./api";
import { TYPE_LABEL } from "./api";

export type Snapshots = Record<number, Criterion[]>;

type DiffRow = { kind: "add" | "mod" | "del"; text: string };

/** 按标准条目的 ID 对比两个版本快照；没有快照的版本不做任何猜测。 */
function diffVersions(before: Criterion[], after: Criterion[]): DiffRow[] {
  const rows: DiffRow[] = [];
  const afterIds = new Set(after.map((item) => item.id));
  for (const item of before) {
    if (!afterIds.has(item.id)) { rows.push({ kind: "del", text: `${item.id} · ${TYPE_LABEL[item.type]} · ${item.text}` }); continue; }
    const next = after.find((entry) => entry.id === item.id)!;
    if (next.text !== item.text || next.type !== item.type) rows.push({ kind: "mod", text: `${item.id} · ${TYPE_LABEL[item.type]} ${item.text} → ${TYPE_LABEL[next.type]} ${next.text}` });
  }
  for (const item of after) if (!before.some((entry) => entry.id === item.id)) rows.push({ kind: "add", text: `${item.id} · ${TYPE_LABEL[item.type]} · ${item.text}` });
  return rows;
}

export function SpecHistory({ job, snapshots, audit }: { job: Calibration; snapshots: Snapshots; audit: unknown }) {
  const [picked, setPicked] = useState<number[]>([]);

  // 审计数据形状由后端决定，这里只做防御性提取，不编造字段。
  const auditList = useMemo<Record<string, unknown>[]>(() => Array.isArray(audit) ? audit as Record<string, unknown>[] : [], [audit]);
  const versions = useMemo(() => {
    const known = new Set<number>([job.spec_version, ...Object.keys(snapshots).map(Number), ...job.workflow.history.map((mark) => mark.spec_version).filter((v): v is number => typeof v === "number")]);
    for (const entry of auditList) if (typeof entry.spec_version === "number") known.add(entry.spec_version);
    return [...known].sort((a, b) => a - b);
  }, [job, snapshots, auditList]);

  function toggle(version: number) {
    setPicked((current) => current.includes(version) ? current.filter((item) => item !== version) : current.length >= 2 ? [current[1], version] : [...current, version]);
  }

  const [left, right] = picked.length === 2 ? [...picked].sort((a, b) => a - b) : [];
  const rows = left !== undefined && right !== undefined && snapshots[left] && snapshots[right] ? diffVersions(snapshots[left], snapshots[right]) : null;

  return <div className="version-panel">
    <div className="version-list">{versions.map((version) => {
      const entry = auditList.find((item) => item.spec_version === version);
      return <button key={version} className={`version-item ${picked.includes(version) ? "selected" : ""}`} aria-pressed={picked.includes(version)} onClick={() => toggle(version)}>
        <b>v{version}</b>
        <p className="version-summary">{version === 1 ? "初始 Hiring Spec 生成" : "审批通过后更新标准"}</p>
        <p className="version-meta">触发反馈：{job.feedback_notes[version - 2] ?? (version === 1 ? "需求与澄清补充" : "—")}</p>
        <p className="version-meta">审批人：{typeof entry?.decided_by === "string" ? entry.decided_by : "需数据库审计"} · 时间：{typeof entry?.created_at === "string" ? entry.created_at : "需数据库审计"}</p>
        <span className="version-note">{snapshots[version] ? "本会话已保存快照，可参与对比" : "本会话未保存该版本快照，暂无法对比"}</span>
      </button>;
    })}</div>
    <p className="loop-note">勾选两个版本查看条目差异。快照在本页面会话内捕获（创建、确认、审批前后的完整标准集）；跨会话的历史快照需要配置 PostgreSQL 后从审计接口读取。</p>
    {picked.length === 2 && (rows ? <div className="version-diff">{rows.length ? rows.map((row, index) => <p key={index} className={`diff-row diff-${row.kind}`}>{row.kind === "add" ? "＋" : row.kind === "del" ? "－" : "±"} {row.text}</p>) : <p className="diff-row diff-empty">两个版本之间没有条目差异。</p>}</div> : <p className="loop-note">选中的版本缺少快照，无法对比。</p>)}
    {picked.length !== 2 && <p className="loop-note">已选择 {picked.length}/2 个版本。</p>}
  </div>;
}
