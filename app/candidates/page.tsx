"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { JOB_KEY, loadJob, type Calibration, type Verdict } from "../workspace/api";
import "../workspace/calibration.css";
import "./candidates.css";

const verdictClass = (verdict: Verdict | string) => verdict === "推荐" ? "status-success" : verdict === "不推荐" || verdict === "否决" ? "status-error" : "status-warning";
const scoreText = (score?: number | null) => score === 2 ? "✓ 满足" : score === 0 ? "× 不满足" : "△ 无证据";
const scoreClass = (score?: number | null) => score === 2 ? "status-success" : score === 0 ? "status-error" : "status-warning";
const typeLabel = (type: string) => type === "MUST_HAVE" ? "必须" : type === "NICE_TO_HAVE" ? "加分" : "否决";

export default function CandidatesPage() {
  const [job, setJob] = useState<Calibration | null>(null);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    const readSavedJob = () => new Promise<Calibration | null>((resolve, reject) => {
      try {
        const id = localStorage.getItem(JOB_KEY);
        if (!id) resolve(null);
        else loadJob(id).then(resolve, reject);
      } catch (err) { reject(err); }
    });
    readSavedJob().then((value) => {
      if (value) { setJob(value); setState("ready"); }
      else setState("empty");
    }, () => setState("error"));
  }, []);

  const evaluations = job?.evaluations ?? [];
  const current = evaluations.find((item) => item.candidate_id === selected) ?? evaluations[0];

  return <div className="candidates-app">
    <aside className="workspace-sidebar candidates-sidebar">
      <Link href="/" aria-label="Hire Loop 首页"><Image src="/hire-loop-logo.png" alt="Hire Loop" width={2170} height={725} priority className="current-logo" /></Link>
      <div className="sidebar-job"><small>正在校准</small><strong>{job?.job_title ?? "未选择任务"}</strong><span>{job ? `v${job.spec_version}` : "草稿"}</span></div>
      <nav aria-label="工作台导航">
        <Link href="/workspace">◇　需求校准</Link><Link href="/workspace#spec">☑　招聘标准</Link><Link className="active" href="/candidates">▤　候选人</Link><Link href="/workspace#feedback-review">✎　反馈与审批</Link>
      </nav>
      <footer>人工确认 · 可追溯</footer>
    </aside>
    <main className="candidates-main">
      <header className="candidates-topbar"><div className="candidates-breadcrumb">Hire Loop　›　主流程　›　<b>候选人</b></div><div className="candidates-top-actions"><span>{job?.job_title ?? "未选择任务"}</span><span className="top-status">{job ? `标准 v${job.spec_version}` : "草稿"}</span><Link href="/workspace">返回工作台</Link></div></header>
      <div className="candidates-content"><header className="candidates-title"><div><h1>候选人</h1><p>根据当前 Hiring Spec 查看候选人证据，不使用黑箱总分。</p></div>{job && <span className="status-pill status-warning">当前标准 v{job.spec_version} · {evaluations.length} 位候选人</span>}</header>
        {state === "loading" && <section className="candidates-empty-card"><h2>正在读取校准任务…</h2><p>候选人数据来自后端 checkpoint。</p></section>}
        {(state === "empty" || state === "error") && <section className="candidates-empty-card"><h2>{state === "empty" ? "还没有校准任务" : "无法读取校准任务"}</h2><p>{state === "empty" ? "在工作台创建招聘需求并确认标准后，这里显示候选人评估结果。" : "后端未启动或任务已过期。请检查工作台中的 job_id，或创建新任务。"}</p><Link className="loop-button primary" href="/workspace">前往工作台</Link></section>}
        {state === "ready" && !evaluations.length && <section className="candidates-empty-card"><h2>暂无候选人</h2><p>该任务创建时未提交简历。确认标准后，提交的简历将进入证据评估。</p></section>}
        {state === "ready" && !!evaluations.length && <div className="candidates-grid"><aside className="candidate-directory"><b>候选人列表</b>{evaluations.map((item, index) => <button key={item.candidate_id} className={current?.candidate_id === item.candidate_id ? "directory-item active" : "directory-item"} onClick={() => setSelected(item.candidate_id)}><span>#{index + 1}</span><strong>{item.name}<small>{item.candidate_id}</small></strong><em className={`status-pill ${verdictClass(item.verdict)}`}>{item.verdict}</em></button>)}</aside>{current && <article className="candidate-report"><header><div><h2>{current.name}</h2><p>{current.candidate_id}</p></div><span className={`status-pill ${verdictClass(current.verdict)}`}>{current.verdict}</span></header><div className="report-rows">{job!.criteria.map((criterion) => {
          const quotes = job!.evidence.filter((item) => item.candidate_id === current.candidate_id && item.criterion_id === criterion.id && item.valid);
          return <section key={criterion.id}><div><span>{typeLabel(criterion.type)}</span><strong>{criterion.text}</strong><b className={scoreClass(current.scores[criterion.id])}>{scoreText(current.scores[criterion.id])}</b></div>{quotes.map((item, i) => <blockquote key={i}>“{item.quote}”{item.stance === "against" ? " · 反证" : ""}</blockquote>)}{!quotes.length && <p className="empty-evidence">没有经后端校验的简历原文证据。</p>}</section>;
        })}</div></article>}</div>}
      </div>
    </main>
  </div>;
}
