"use client";
import { useState } from "react";
import type { Calibration, Criterion } from "./api";
import { TYPE_LABEL } from "./api";
import { diffCriteria, historySnapshots, parseHistory } from "./history-data";
export type Snapshots = Record<number, Criterion[]>;
export function SpecHistory({ job, snapshots, audit }: { job: Calibration; snapshots: Snapshots; audit: unknown }) {
  const [picked, setPicked] = useState<number[]>([]);
  const history = parseHistory(audit);
  const known = { ...snapshots, ...historySnapshots(audit), [job.spec_version]: job.criteria };
  const versions = Object.keys(known).map(Number).sort((a, b) => b - a);
  function toggle(version: number) { setPicked((current) => current.includes(version) ? current.filter((v) => v !== version) : [...current.slice(-1), version]); }
  const [left, right] = [...picked].sort((a, b) => a - b);
  const rows = picked.length === 2 && known[left] && known[right] ? diffCriteria(known[left], known[right]) : null;
  return <div className="version-panel"><p className="loop-note">选择两个版本，查看类型、定义和权重变化。{audit === null ? "加载数据库历史可恢复旧版本。" : "历史版本来自后端记录。"}</p>
    <div className="version-list">{versions.map((version) => {
      const row = history.spec_versions.find((entry) => entry.version === version);
      const proposal = row?.source_proposal_id ? history.proposals.find((entry) => entry.id === row.source_proposal_id) : undefined;
      const feedback = proposal ? history.feedback.find((entry) => entry.id === proposal.feedback_id) : undefined;
      return <button key={version} className={`version-item ${picked.includes(version) ? "selected" : ""}`} aria-pressed={picked.includes(version)} onClick={() => toggle(version)}><b>v{version}{version === job.spec_version ? " · 当前" : ""}</b><p>{known[version].length} 条标准</p><p className="version-meta">{typeof feedback?.text === "string" ? feedback.text : "未记录关联反馈"}</p><p className="version-meta">{typeof proposal?.decided_by === "string" ? proposal.decided_by : "未记录审批人"} · {typeof row?.created_at === "string" ? row.created_at : "未加载时间"}</p></button>;
    })}</div>
    {picked.length !== 2 ? <p className="loop-note">已选择 {picked.length}/2 个版本。{versions.length === 1 ? "当前只加载了一个版本；如已有历史，请加载数据库历史。" : ""}</p> : rows === null ? <p>所选版本快照不可用，请重新选择。</p> : <div className="version-diff"><h3>v{left} → v{right}</h3>{rows.length ? rows.map((row, i) => <div key={i} className={`diff-row diff-${row.kind}`}><b>{row.kind === "add" ? "新增" : row.kind === "del" ? "删除" : "修改"} · {(row.after ?? row.before)!.id}</b>{row.before && <p>之前：{TYPE_LABEL[row.before.type]} · {row.before.text} · 权重 {row.before.weight}</p>}{row.after && <p>之后：{TYPE_LABEL[row.after.type]} · {row.after.text} · 权重 {row.after.weight}</p>}</div>) : <p>两个版本没有条目变化。</p>}</div>}
  </div>;
}
