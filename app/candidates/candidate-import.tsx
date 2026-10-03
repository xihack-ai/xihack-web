"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { assertCalibration, candidateRequest, loadJob, type Calibration } from "../workspace/api";
import "./upload.css";

type UploadRow = { key: number; file: File; status: "waiting" | "parsing" | "imported" | "duplicate" | "failed"; message?: string };
type UploadResult = { filename: string; status: "imported" | "duplicate" | "failed"; character_count?: number; error?: string };
const labels = { waiting: "等待上传", parsing: "正在解析", imported: "已导入", duplicate: "重复，已跳过", failed: "解析失败" };

export function CandidateImport({ job, onChange, disabled = false }: { job: Calibration; onChange: (job: Calibration) => void; disabled?: boolean }) {
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const pauseRequested = useRef(false);
  const [evaluating, setEvaluating] = useState(false);
  const [pausing, setPausing] = useState(false);
  const locked = disabled || !!busy;
  const pending = (job.candidates ?? []).filter((candidate) => !candidate.evaluated);
  const waiting = job.workflow.waiting_for;

  function choose(files: File[]) {
    if (locked) return;
    setError(""); setNotice("");
    if (files.length > 50) { setError("每次最多选择 50 份简历。"); return; }
    if (files.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) { setError("每批文件总大小不能超过 50 MB。"); return; }
    setRows(files.map((file) => {
      const message = !/\.(pdf|docx?|rtf)$/i.test(file.name) ? "仅支持 PDF、DOC、DOCX 和 RTF。" : file.size > 10 * 1024 * 1024 ? "单份简历不能超过 10 MB。" : file.size === 0 ? "文件为空。" : undefined;
      return { key: nextKey.current++, file, status: message ? "failed" : "waiting", message };
    }));
  }

  async function upload() {
    if (locked) return;
    const queued = rows.filter((row) => row.status === "waiting");
    setError(""); setNotice("");
    let imported = 0, duplicates = 0, failures = rows.filter((row) => row.status === "failed").length;
    try {
      for (let i = 0; i < queued.length; i++) {
        const row = queued[i];
        setBusy(`解析 ${i + 1}/${queued.length}`);
        setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: "parsing" } : item));
        const body = new FormData(); body.append("files", row.file);
        try {
          const response = await candidateRequest(`/calibrations/${job.job_id}/candidates/upload`, body) as { results: UploadResult[]; calibration: unknown };
          assertCalibration(response.calibration);
          onChange(response.calibration);
          const result = response.results[0];
          if (!result) throw new Error("后端未返回该文件的解析结果。");
          if (result.status === "imported") imported++;
          else if (result.status === "duplicate") duplicates++;
          else failures++;
          setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: result.status, message: result.error ?? `${result.character_count ?? 0} 字` } : item));
        } catch (err) {
          // A network error may happen after the import. Refresh before retrying.
          setRows((current) => current.map((item) => item.key === row.key ? { ...item, status: "waiting", message: "请求未完成，可重试" } : item));
          throw err;
        }
      }
      setNotice(`导入 ${imported} 份 · 重复 ${duplicates} 份 · 失败 ${failures} 份。可查看解析原文后开始评估。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败。");
    } finally {
      try { onChange(await loadJob(job.job_id)); } catch { /* Keep the last successful snapshot. */ }
      setBusy("");
    }
  }

  async function evaluate() {
    if (locked || waiting || !pending.length) return;
    setError(""); setNotice(""); setEvaluating(true); setPausing(false); pauseRequested.current = false;
    let completed = 0;
    try {
      // One candidate per request keeps completed results visible and retries bounded.
      for (const candidate of pending) {
        if (pauseRequested.current) break;
        setBusy(`评估 ${completed + 1}/${pending.length} · ${candidate.name}`);
        const value = await candidateRequest(`/calibrations/${job.job_id}/candidates/evaluate`, { candidate_ids: [candidate.candidate_id] });
        assertCalibration(value); onChange(value); completed++;
      }
      setNotice(pauseRequested.current ? `已暂停，完成 ${completed} 份。点击「开始评估」可继续处理剩余简历。` : `已完成 ${completed} 份简历的评估，使用标准 v${job.spec_version}。`);
    } catch (err) {
      setError(`${err instanceof Error ? err.message : "评估失败。"} 已完成 ${completed} 份，未完成的简历可重试。`);
    } finally {
      try { onChange(await loadJob(job.job_id)); } catch { /* Keep completed evaluations visible. */ }
      setBusy(""); setEvaluating(false); setPausing(false);
    }
  }

  return <section className="resume-import" aria-label="批量上传简历">
    <header><div><h2>批量上传简历</h2><p>一次选择多份简历，解析后按当前招聘标准评估。</p></div><span className="resume-import-count">{pending.length} 份待评估</span></header>
    <div className={`resume-dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(Array.from(event.dataTransfer.files)); }}>
      <span className="resume-upload-icon" aria-hidden="true">↑</span><strong>拖拽简历到这里，或选择文件</strong><p>PDF / Word / RTF · 最多 50 份 · 单份不超过 10 MB · 总计不超过 50 MB</p>
      <input ref={input} className="sr-only" type="file" aria-label="选择简历文件" accept=".pdf,.doc,.docx,.rtf" multiple disabled={locked || waiting === "human_approval"} onChange={(event) => { choose(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <button className="loop-button secondary" disabled={locked || waiting === "human_approval"} onClick={() => input.current?.click()}>选择简历</button>
    </div>
    {!!rows.length && <div className="resume-file-list" aria-label="文件解析进度">{rows.map((row) => <div key={row.key} className={`resume-file-row ${row.status}`}><div><strong>{row.file.name}</strong><small>{Math.max(1, Math.round(row.file.size / 1024))} KB{row.message ? ` · ${row.message}` : ""}</small></div><span>{labels[row.status]}</span></div>)}</div>}
    {waiting === "spec_confirmation" && <p className="resume-hint">可以先上传简历。<Link href="/workspace#spec">确认招聘标准</Link>后才能评估。</p>}
    {waiting === "human_approval" && <p className="resume-hint">请先在<Link href="/workspace#feedback-review">反馈与审批</Link>处理提案，再上传或评估简历。</p>}
    <footer><p>文件在服务端本地解析。扫描版 PDF 需要 OCR，解析失败会单独提示。</p><div><button className="loop-button secondary" disabled={locked || waiting === "human_approval" || !rows.some((row) => row.status === "waiting")} onClick={() => void upload()}>上传并解析</button><button className="loop-button primary" disabled={locked || !!waiting || !pending.length} onClick={() => void evaluate()}>开始评估{pending.length ? `（${pending.length}）` : ""}</button>{evaluating && <button className="loop-button secondary" disabled={pausing} onClick={() => { pauseRequested.current = true; setPausing(true); }}>{pausing ? "当前简历完成后暂停" : "暂停评估"}</button>}</div></footer>
    {busy && <p className="resume-progress" role="status">{busy}…</p>}{notice && <p className="resume-progress" role="status">{notice}</p>}{error && <p className="resume-error" role="alert">{error}</p>}
  </section>;
}
