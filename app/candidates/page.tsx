"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { JOB_KEY, candidateRequest, loadJob, judgmentFor, JUDGMENT_LABEL, type Judgment, type Calibration, type Candidate, type Verdict } from "../workspace/api";
import { CandidateImport } from "./candidate-import";
import { CandidateGaps } from "../workspace/insights";
import { WorkspaceSidebar } from "../workspace/workspace-sidebar";
import "../workspace/calibration.css";
import "../workspace/insights.css";
import "./candidates.css";

const verdictClass = (verdict: Verdict | string) => verdict === "推荐" ? "status-success" : verdict === "不推荐" || verdict === "否决" ? "status-error" : "status-warning";
const judgmentClass = (status: Judgment) => status === "SATISFIED" || status === "CLEAR" ? "status-success" : status === "NOT_SATISFIED" || status === "HIT" ? "status-error" : "status-warning";
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
  const [showUpload, setShowUpload] = useState(false);
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
      if (value) { setJob(value); setShowUpload(!(value.candidates?.length ?? value.evaluations.length)); setState("ready"); }
      else setState("empty");
    }, () => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const evaluations = job?.evaluations ?? [];
  const hasTierReasons = evaluations.some((evaluation) => Boolean(evaluation.tier_reason));
  const candidates: Candidate[] = job?.candidates ?? evaluations.map((item) => ({ candidate_id: item.candidate_id, name: item.name, source_file: null, character_count: 0, parser_version: null, evaluated: true }));
  const rankedIds = new Map(evaluations.map((item, index) => [item.candidate_id, index]));
  const directory = [...candidates].sort((a, b) => (rankedIds.get(a.candidate_id) ?? 9999) - (rankedIds.get(b.candidate_id) ?? 9999));
  const current = directory.find((item) => item.candidate_id === selected) ?? directory[0];
  const currentEvaluation = evaluations.find((item) => item.candidate_id === current?.candidate_id);
  const groups: { label: Verdict | "待评估"; items: Candidate[] }[] = (["推荐", "待核实", "不推荐", "否决", "待评估"] as const).map((label) => ({ label, items: directory.filter((item) => (evaluations.find((entry) => entry.candidate_id === item.candidate_id)?.verdict ?? "待评估") === label) })).filter((group) => group.items.length);

  return <div className="candidates-app">
    <WorkspaceSidebar active="候选人" jobTitle={job?.job_title} version={job?.spec_version} draft={job?.workflow.waiting_for === "spec_confirmation"} />
    <main className="candidates-main">
      <header className="candidates-topbar"><div className="candidates-breadcrumb">Hire Loop　›　主流程　›　<b>候选人</b></div><div className="candidates-top-actions"><span>{job?.job_title ?? "未选择任务"}</span><span className="top-status">{job ? `标准 v${job.spec_version}` : "草稿"}</span><Link href="/workspace">返回工作台</Link></div></header>
      <div className="candidates-content"><header className="candidates-title"><div><small className="page-eyebrow">候选人 × 条款 · 原文证据</small><h1>候选人证据库</h1><p>按已确认的 Spec v{job?.spec_version ?? "—"} 查看分档、逐条判定和简历原文。</p></div>{job && <span className="status-pill status-warning">{candidates.length} 位候选人 · {evaluations.length} 位已评估</span>}</header>
        {state === "loading" && <section className="candidates-empty-card"><h2>正在读取校准任务…</h2><p>候选人数据来自后端。</p></section>}
        {(state === "empty" || state === "error") && <section className="candidates-empty-card"><h2>{state === "empty" ? "还没有招聘职位" : "无法读取招聘职位"}</h2><p>{state === "empty" ? "先在工作台创建职位，再到这里批量上传简历。" : "请检查后端是否启动，或在工作台创建新职位。"}</p><Link className="loop-button primary" href="/workspace">前往工作台</Link></section>}
        {state === "ready" && job && <details className="upload-disclosure" open={showUpload} onToggle={(event) => setShowUpload(event.currentTarget.open)}><summary>＋ 上传 PDF / Word 简历 <span>{candidates.length ? "添加更多候选人" : "先上传简历，再开始评估"}</span></summary><CandidateImport job={job} onChange={setJob} /></details>}
        {state === "ready" && !candidates.length && <section className="candidates-empty-card"><h2>还没有候选人</h2><p>在上方选择或拖拽简历，解析成功后会出现在这里。</p></section>}
        {state === "ready" && !!candidates.length && <div className="candidates-grid"><aside className="candidate-directory"><div className="directory-header"><b>候选人列表 · {candidates.length}</b><details><summary>排序规则</summary><p>{hasTierReasons ? "否决命中进入‘否决’；必须项有明确反证，或所有必须项均无可验证证据，进入本轮‘不推荐’；有部分岗位证据但关键项待核实，进入‘待核实’。逐条‘无证据’不等于‘不满足’。同档按已满足条目的权重及稳定 ID 排序。" : "否决命中、必须项不满足、关键证据待核实分别决定档位；同档按已满足条目的权重及稳定 ID 排序。没有模型总分。"}</p></details></div>{groups.map((group) => <div key={group.label} className="directory-group"><h3>{group.label} <span>{group.items.length}</span></h3>{group.items.map((item) => {
          const evaluation = evaluations.find((entry) => entry.candidate_id === item.candidate_id);
          return <button key={item.candidate_id} className={current?.candidate_id === item.candidate_id ? "directory-item active" : "directory-item"} aria-pressed={current?.candidate_id === item.candidate_id} onClick={() => setSelected(item.candidate_id)}><span>#{directory.indexOf(item) + 1}</span><strong>{item.name}<small>{item.source_file ?? "文本简历"}</small></strong><em className={`status-pill ${evaluation ? verdictClass(evaluation.verdict) : "status-warning"}`}>{evaluation?.verdict ?? "待评估"}</em></button>;
        })}</div>)}</aside>{current && <article className="candidate-report"><header><div><h2>{current.name}</h2><p>{current.character_count ? `${current.character_count} 字 · ` : ""}{current.source_file ?? "文本简历"}</p></div><span className={`status-pill ${currentEvaluation ? verdictClass(currentEvaluation.verdict) : "status-warning"}`}>{currentEvaluation?.verdict ?? "待评估"}</span></header>
          {!currentEvaluation && <p className="candidate-question">简历已导入。{job?.workflow.waiting_for === "spec_confirmation" ? "请先确认招聘标准，再开始评估。" : "可先查看解析原文，再点击上方「开始评估」。"}</p>}
          {currentEvaluation?.tier_reason && <p className="candidate-question">分档依据：{currentEvaluation.tier_reason}</p>}
          {currentEvaluation && <div className="report-rows">{(["MUST_HAVE", "NICE_TO_HAVE", "VETO"] as const).filter((type) => job!.criteria.some((criterion) => criterion.type === type)).map((type) => <div className="report-group" key={type}><h3>{type === "MUST_HAVE" ? "必须项" : type === "NICE_TO_HAVE" ? "加分项" : "否决项"}</h3>{job!.criteria.filter((criterion) => criterion.type === type).map((criterion) => {
            const quotes = job!.evidence.filter((item) => item.candidate_id === current.candidate_id && item.criterion_id === criterion.id && item.valid);
            const status = judgmentFor(currentEvaluation, criterion);
            return <section key={criterion.id}><div><span>{criterion.id} · {typeLabel(criterion.type)}</span><strong>{criterion.text}</strong><b className={judgmentClass(status)}>{JUDGMENT_LABEL[status]}</b></div>{quotes.map((item, i) => <blockquote key={i}>“{item.quote}”<small>{item.stance === "against" ? "反向证据" : "支持证据"} · 原文引用已校验</small></blockquote>)}{!quotes.length && <p className="empty-evidence">没有经后端校验的简历原文证据；请人工核实。</p>}</section>;
          })}</div>)}</div>}
          {currentEvaluation && <CandidateGaps evaluation={currentEvaluation} criteria={job!.criteria} />}
          <ResumePreview key={current.candidate_id} jobId={job!.job_id} candidateId={current.candidate_id} />
        </article>}</div>}
      </div>
    </main>
  </div>;
}
