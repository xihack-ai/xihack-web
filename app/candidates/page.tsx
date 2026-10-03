"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { JOB_KEY, candidateRequest, loadJob, type Calibration, type Candidate, type Verdict } from "../workspace/api";
import { CandidateImport } from "./candidate-import";
import "../workspace/calibration.css";
import "./candidates.css";

const verdictClass = (verdict: Verdict | string) => verdict === "推荐" ? "status-success" : verdict === "不推荐" || verdict === "否决" ? "status-error" : "status-warning";
const scoreText = (score?: number | null) => score === 2 ? "✓ 满足" : score === 0 ? "× 不满足" : "△ 无证据";
const scoreClass = (score?: number | null) => score === 2 ? "status-success" : score === 0 ? "status-error" : "status-warning";
const typeLabel = (type: string) => type === "MUST_HAVE" ? "必须" : type === "NICE_TO_HAVE" ? "加分" : "否决";

function ResumePreview({ jobId, candidateId }: { jobId: string; candidateId: string }) {
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function preview() {
    setBusy(true); setError("");
    try {
      const value = await candidateRequest(`/calibrations/${jobId}/candidates/${candidateId}/resume`) as { resume_text: string };
      setText(value.resume_text);
    } catch (err) { setError(err instanceof Error ? err.message : "无法读取原文。"); }
    finally { setBusy(false); }
  }
  return <section className="resume-preview"><button className="loop-button secondary" disabled={busy} onClick={() => text === null ? void preview() : setText(null)}>{busy ? "正在读取…" : text === null ? "查看解析原文" : "收起原文"}</button>{error && <p role="alert">{error}</p>}{text !== null && <pre>{text}</pre>}</section>;
}

export default function CandidatesPage() {
  const [job, setJob] = useState<Calibration | null>(null);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    let active = true;
    const readSavedJob = () => new Promise<Calibration | null>((resolve, reject) => {
      try {
        const id = localStorage.getItem(JOB_KEY);
        if (!id) resolve(null);
        else loadJob(id).then(resolve, reject);
      } catch (err) { reject(err); }
    });
    readSavedJob().then((value) => {
      if (!active) return;
      if (value) { setJob(value); setState("ready"); }
      else setState("empty");
    }, () => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const evaluations = job?.evaluations ?? [];
  const candidates: Candidate[] = job?.candidates ?? evaluations.map((item) => ({ candidate_id: item.candidate_id, name: item.name, source_file: null, character_count: 0, parser_version: null, evaluated: true }));
  const rankedIds = new Map(evaluations.map((item, index) => [item.candidate_id, index]));
  const directory = [...candidates].sort((a, b) => (rankedIds.get(a.candidate_id) ?? 9999) - (rankedIds.get(b.candidate_id) ?? 9999));
  const current = directory.find((item) => item.candidate_id === selected) ?? directory[0];
  const currentEvaluation = evaluations.find((item) => item.candidate_id === current?.candidate_id);

  return <div className="candidates-app">
    <aside className="workspace-sidebar candidates-sidebar">
      <Link href="/" aria-label="Hire Loop 首页"><Image src="/hire-loop-logo.png" alt="Hire Loop" width={2170} height={725} priority className="current-logo" /></Link>
      <nav aria-label="工作台导航">
        <Link href="/workspace">◇　需求校准</Link><Link href="/workspace#spec">☑　招聘标准</Link><Link className="active" href="/candidates">▤　候选人</Link><Link href="/workspace#feedback-review">✎　反馈与审批</Link>
      </nav>
      <footer>人工确认 · 可追溯</footer>
    </aside>
    <main className="candidates-main">
      <header className="candidates-topbar"><div className="candidates-breadcrumb">Hire Loop　›　主流程　›　<b>候选人</b></div><div className="candidates-top-actions"><span>{job?.job_title ?? "未选择任务"}</span><span className="top-status">{job ? `标准 v${job.spec_version}` : "草稿"}</span><Link href="/workspace">返回工作台</Link></div></header>
      <div className="candidates-content"><header className="candidates-title"><div><h1>候选人</h1><p>上传简历，根据已确认的招聘标准查看评估与原文证据。</p></div>{job && <span className="status-pill status-warning">标准 v{job.spec_version} · {candidates.length} 位候选人 · {evaluations.length} 位已评估</span>}</header>
        {state === "loading" && <section className="candidates-empty-card"><h2>正在读取校准任务…</h2><p>候选人数据来自后端。</p></section>}
        {(state === "empty" || state === "error") && <section className="candidates-empty-card"><h2>{state === "empty" ? "还没有招聘职位" : "无法读取招聘职位"}</h2><p>{state === "empty" ? "先在工作台创建职位，再到这里批量上传简历。" : "请检查后端是否启动，或在工作台创建新职位。"}</p><Link className="loop-button primary" href="/workspace">前往工作台</Link></section>}
        {state === "ready" && job && <CandidateImport job={job} onChange={setJob} />}
        {state === "ready" && !candidates.length && <section className="candidates-empty-card"><h2>还没有候选人</h2><p>在上方选择或拖拽简历，解析成功后会出现在这里。</p></section>}
        {state === "ready" && !!candidates.length && <div className="candidates-grid"><aside className="candidate-directory"><b>候选人列表 · {candidates.length}</b>{directory.map((item, index) => {
          const evaluation = evaluations.find((entry) => entry.candidate_id === item.candidate_id);
          return <button key={item.candidate_id} className={current?.candidate_id === item.candidate_id ? "directory-item active" : "directory-item"} aria-pressed={current?.candidate_id === item.candidate_id} onClick={() => setSelected(item.candidate_id)}><span>#{index + 1}</span><strong>{item.name}<small>{item.source_file ?? "文本简历"}</small></strong><em className={`status-pill ${evaluation ? verdictClass(evaluation.verdict) : "status-warning"}`}>{evaluation?.verdict ?? "待评估"}</em></button>;
        })}</aside>{current && <article className="candidate-report"><header><div><h2>{current.name}</h2><p>{current.character_count ? `${current.character_count} 字 · ` : ""}{current.source_file ?? "文本简历"}</p></div><span className={`status-pill ${currentEvaluation ? verdictClass(currentEvaluation.verdict) : "status-warning"}`}>{currentEvaluation?.verdict ?? "待评估"}</span></header>
          {!currentEvaluation && <p className="candidate-question">简历已导入。{job?.workflow.waiting_for === "spec_confirmation" ? "请先确认招聘标准，再开始评估。" : "可先查看解析原文，再点击上方「开始评估」。"}</p>}
          {currentEvaluation && <div className="report-rows">{job!.criteria.map((criterion) => {
            const quotes = job!.evidence.filter((item) => item.candidate_id === current.candidate_id && item.criterion_id === criterion.id && item.valid);
            return <section key={criterion.id}><div><span>{typeLabel(criterion.type)}</span><strong>{criterion.text}</strong><b className={scoreClass(currentEvaluation.scores[criterion.id])}>{scoreText(currentEvaluation.scores[criterion.id])}</b></div>{quotes.map((item, i) => <blockquote key={i}>“{item.quote}”{item.stance === "against" ? " · 反证" : ""}</blockquote>)}{!quotes.length && <p className="empty-evidence">没有经后端校验的简历原文证据。</p>}</section>;
          })}</div>}
          <ResumePreview key={current.candidate_id} jobId={job!.job_id} candidateId={current.candidate_id} />
        </article>}</div>}
      </div>
    </main>
  </div>;
}
