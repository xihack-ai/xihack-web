"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Starfield } from "./starfield";
import { Sunny } from "./sunny";
import { HomeDemo } from "./home-demo";
import { JOB_KEY, loadJob, type Calibration } from "./workspace/api";

const scoreText = (score?: number | null) => score === 2 ? "✓ 满足" : score === 0 ? "× 不满足" : "△ 无证据";
const scoreClass = (score?: number | null) => score === 2 ? "score-good" : score === 0 ? "score-bad" : "score-muted";
const verdictClass = (verdict: string) => verdict === "推荐" ? "status-success" : verdict === "不推荐" || verdict === "否决" ? "status-error" : "status-warning";
const statusText = (job: Calibration) => job.status === "AWAITING_SPEC_CONFIRMATION" ? "校准中" : job.status === "AWAITING_APPROVAL" ? "待审批" : "已评估";
const statusClass = (job: Calibration) => job.status === "EVALUATED" ? "status-success" : "status-warning";

export default function Home() {
  const [job, setJob] = useState<Calibration | null>(null);
  const [selected, setSelected] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const readSavedJob = () => new Promise<Calibration | null>((resolve, reject) => {
      try {
        const id = localStorage.getItem(JOB_KEY);
        if (!id) resolve(null);
        else loadJob(id).then(resolve, reject);
      } catch (err) { reject(err); }
    });
    readSavedJob().then((value) => { if (value) setJob(value); }).catch(() => setLoadFailed(true));
  }, []);

  const evaluations = job?.evaluations ?? [];
  const current = evaluations.find((item) => item.candidate_id === selected) ?? evaluations[0];

  return (
    <div className="hire-loop-shell landing-page">
      <Starfield />
      <header className="site-header">
        <div className="header-inner">
          <Link href="/" aria-label="Hire Loop 首页">
            <Image src="/hire-loop-logo.png" alt="Hire Loop" width={2170} height={725} priority className="current-logo" />
          </Link>
        </div>
      </header>

      <main className="home-main">
        <section className="hero-copy">
          <h1>先把标准说清楚，<br /><span>再去看人。</span></h1>
          <p>给招聘经理和招聘官用的标准校准工具。把每一句模糊反馈，变成看得见、可审批、可版本化的标准修订。</p>
          <blockquote className="manager-quote">“经理说『都不对』，却说不出哪里不对。”</blockquote>
          <div className="trust-points"><span>人工确认才生效</span><span>以简历原文为证据</span><span>不打黑箱总分</span></div>
          <div className="hero-actions">
            <Link className="brand-button" href="/workspace">开始校准 <span aria-hidden="true">→</span></Link>
            <Link className="secondary-button product-link" href="/workspace">查看产品工作台</Link>
          </div>
        </section>

        <section id="demo-preview" className="demo-panel">
          {!job ? (loadFailed ? <div className="panel-empty"><div><span className="purple-icon">◇</span><h2>无法读取上次的校准任务</h2><p>后端未启动或任务已过期。请在工作台输入 job_id 恢复，或创建新任务。</p><Link className="brand-button" href="/workspace">创建校准任务</Link></div></div> : <HomeDemo />) : <>
          <header className="demo-header">
            <div><h1>{job.job_title}</h1><p>当前标准 v{job.spec_version} · {evaluations.length} 位候选人</p></div>
            <span className={`status-pill ${statusClass(job)}`}>{statusText(job)}</span>
          </header>
          <div className="demo-content">
            <nav className="candidate-list" aria-label="候选人列表">
              {evaluations.map((item, index) => <button key={item.candidate_id} className={current?.candidate_id === item.candidate_id ? "candidate-item selected" : "candidate-item"} onClick={() => setSelected(item.candidate_id)} aria-pressed={current?.candidate_id === item.candidate_id}>
                <span className="candidate-rank">#{index + 1}</span><span className="candidate-info"><strong>{item.name}</strong><small>{item.candidate_id}</small></span>
                <span className={`status-pill ${verdictClass(item.verdict)}`}>{item.verdict}</span>
              </button>)}
              {!evaluations.length && <p className="candidate-list-empty">标准确认后将自动评估候选人。</p>}
            </nav>
            {current ? <article className="candidate-detail">
              <header className="detail-header"><div><h2>{current.name}</h2><p>{current.candidate_id}</p></div><span className={`status-pill ${verdictClass(current.verdict)}`}>{current.verdict}</span></header>
              <div className="criteria-list">{job.criteria.map((criterion) => {
                const score = current.scores[criterion.id];
                const quote = job.evidence.find((item) => item.candidate_id === current.candidate_id && item.criterion_id === criterion.id && item.valid)?.quote;
                return <div className="criteria-item" key={criterion.id}><span className="criterion-type">{criterion.type === "MUST_HAVE" ? "必须" : criterion.type === "NICE_TO_HAVE" ? "加分" : "否决"}</span><span className="criterion-text">{criterion.text}</span><strong className={scoreClass(score)}>{scoreText(score)}</strong>{quote && <blockquote className="criteria-quote">“{quote}”</blockquote>}</div>;
              })}</div>
            </article> : <article className="candidate-detail"><p className="candidate-list-empty">暂无评估中的候选人。</p></article>}
          </div>
          <footer className="demo-footer">{job.change_proposal ? <><div><strong>待处理建议</strong><span>{(job.change_proposal.add ?? []).map((item) => item.text).filter(Boolean).join("；") || "标准变更提案"} · {job.workflow.waiting_for === "human_approval" ? "等待人工确认" : "查看工作台了解详情"}</span></div><Link className="review-link" href="/workspace">查看建议</Link></> : <div><strong>标准状态</strong><span>v{job.spec_version} · {job.workflow.waiting_for ? "等待人工确认" : "无待审批提案"}</span><Link className="review-link" href="/workspace">查看工作台</Link></div>}</footer>
          </>}
        </section>
      </main>
      <Sunny />
    </div>
  );
}
