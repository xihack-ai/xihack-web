"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import "./workflow.css";
import "./calibration.css";
import { RequirementPanel } from "./requirement-panel";
import { CandidateImport } from "../candidates/candidate-import";
import { SpecHistory, type Snapshots } from "./spec-history";
import { apiError, API_BASE, assertCalibration, Calibration, Criterion, JOB_KEY, NODE_LABEL, proposalDraft, stepFor, TYPE_LABEL, Verdict } from "./api";

const API = API_BASE;
const TIERS: Verdict[] = ["推荐", "待核实", "不推荐", "否决"];
type View = "需求校准" | "招聘标准" | "候选人" | "反馈与审批";

async function request(path: string, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(120000), cache: "no-store",
    });
  } catch {
    throw new Error(`无法连接 ${API} 或请求超时。请检查后端启动、CORS 和模型耗时；写请求可能已经执行，请先刷新 checkpoint，不要盲目重复提交。`);
  }
  const value = await response.json().catch(() => { throw new Error("后端没有返回 JSON，请检查 API 地址。"); });
  if (!response.ok) throw new Error(apiError(value.detail, response.status));
  return value;
}

function CriteriaEditor({ value, onChange, disabled }: { value: Criterion[]; onChange: (value: Criterion[]) => void; disabled: boolean }) {
  function update(index: number, patch: Partial<Criterion>) { onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  return <div className="loop-spec-table"><table><thead><tr><th>ID</th><th>类型</th><th>标准</th><th>权重</th></tr></thead><tbody>{value.map((item, index) => <tr key={item.id}>
    <td>{item.id}</td><td><select disabled={disabled} aria-label={`${item.id} 类型`} value={item.type} onChange={(event) => update(index, { type: event.target.value as Criterion["type"] })}>{Object.entries(TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></td>
    <td><input disabled={disabled} aria-label={`${item.id} 标准`} value={item.text} onChange={(event) => update(index, { text: event.target.value })} /></td>
    <td><input disabled={disabled} aria-label={`${item.id} 权重`} type="number" min={1} max={3} value={item.weight} onChange={(event) => update(index, { weight: Number(event.target.value) })} /></td>
  </tr>)}</tbody></table></div>;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [view, setView] = useState<View>("需求校准");
  const [specTab, setSpecTab] = useState<"当前标准" | "版本记录">("当前标准");
  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState("");
  const [candidatesText, setCandidatesText] = useState("");
  const [job, setJob] = useState<Calibration | null>(null);
  const [draft, setDraft] = useState<Criterion[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshots>({});
  const [selected, setSelected] = useState("");
  const [tier, setTier] = useState<Verdict | "全部">("全部");
  const [feedback, setFeedback] = useState("");
  const [clarifyNote, setClarifyNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [databaseHistory, setDatabaseHistory] = useState<unknown>(null);
  const step = job ? stepFor(job) : "task";

  // 支持从其他页面用 /workspace#spec 等锚点直达对应视图。
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash;
      if (hash === "#spec") setView("招聘标准");
      else if (hash === "#candidate-evaluations") setView("候选人");
      else if (hash === "#feedback-review") setView("反馈与审批");
    };
    void Promise.resolve().then(async () => {
      applyHash();
      try {
        const id = localStorage.getItem(JOB_KEY);
        if (id) receive(await request(`/calibrations/${encodeURIComponent(id)}`));
      } catch (err) { setError(err instanceof Error ? err.message : "无法读取当前职位。"); }
    });
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);
  const selectedEvaluation = job?.evaluations.find((item) => item.candidate_id === selected);
  const waiting = job?.workflow.waiting_for;

  function receive(value: unknown) {
    assertCalibration(value);
    setJob(value); setTitle(value.job_title); setDraft(value.criteria.map((item) => ({ ...item }))); setEditing(false);
    setSelected((id) => value.evaluations.some((item) => item.candidate_id === id) ? id : value.evaluations[0]?.candidate_id ?? "");
    // 只存任务引用，Spec/证据/审批状态的事实来源始终是后端 checkpoint。
    try { localStorage.setItem(JOB_KEY, value.job_id); } catch { /* 存储禁用时仍可手动恢复。 */ }
  }

  async function operation(label: string, task: () => Promise<void>) {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await task(); } catch (err) { setError(err instanceof Error ? err.message : "请求失败"); }
    finally { setBusy(""); }
  }

  /** 解析手动输入的简历：每行一位候选人，格式「姓名｜简历内容」；没有输入就提交空列表，绝不用模拟简历充数。 */
  function parseCandidates(text: string) {
    return text.split("\n").map((line) => line.split(/[｜|]/)).filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join("｜").trim()).map((parts) => ({ name: parts[0].trim(), resume_text: parts.slice(1).join("｜").trim() }));
  }

  async function create(resolvedRequirement: string) {
    await operation("生成标准", async () => {
      const result = await request("/jobs", { title: title.trim() || "未命名职位", requirement: resolvedRequirement.trim(), candidates: parseCandidates(candidatesText), require_spec_confirmation: true });
      assertCalibration(result);
      setSnapshots((current) => ({ ...current, [result.spec_version]: result.criteria.map((item) => ({ ...item })) }));
      receive(result); setTier("全部"); setView("招聘标准"); setSpecTab("当前标准");
      setNotice("标准已生成并停在确认步骤；确认前不抽证据、不评估候选人。");
    });
  }

  async function restore(id: string) {
    if (!id.trim()) { setError("请提供 job_id。"); return; }
    await operation("读取 checkpoint", async () => { receive(await request(`/calibrations/${encodeURIComponent(id.trim())}`)); setView(job ? view : "招聘标准"); setNotice("已从后端 checkpoint 读取流程状态。"); });
  }

  async function confirm() {
    if (!job || waiting !== "spec_confirmation") return;
    await operation("确认标准", async () => { receive(await request(`/calibrations/${job.job_id}/spec/confirm`, { criteria: draft })); router.push("/candidates"); });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!job || waiting || !feedback.trim()) return;
    await operation("解读反馈", async () => {
      const result = await request(`/calibrations/${job.job_id}/feedback`, { text: feedback.trim(), created_by: "manager-demo" });
      assertCalibration(result); receive(result); setFeedback("");
      if (result.workflow.waiting_for === "human_approval") { setClarifyNote(""); setNotice("反馈已生成变更提案，等待人工确认。"); }
      else if (result.risk_flags.length) { setClarifyNote(""); setNotice("该反馈未进入 Hiring Spec。"); }
      else { setClarifyNote("这条反馈没有形成标准变更提案。请给出更具体、可核验的能力描述。"); setNotice(""); }
    });
  }

  async function decide(action: "accept" | "edit" | "reject") {
    if (!job || waiting !== "human_approval") return;
    await operation("恢复审批节点", async () => {
      const result = await request(`/calibrations/${job.job_id}/approval`, { action, ...(action === "edit" ? { criteria: draft } : {}), decided_by: "manager-demo" });
      assertCalibration(result);
      // 审批前后各存一份完整标准集，作为版本对比的真实快照。
      setSnapshots((current) => ({ ...current, [job.spec_version]: job.criteria.map((item) => ({ ...item })), [result.spec_version]: result.criteria.map((item) => ({ ...item })) }));
      const changed = result.evaluations.filter((item) => job.evaluations.find((old) => old.candidate_id === item.candidate_id)?.verdict !== item.verdict).length;
      receive(result); setTier("全部"); setDatabaseHistory(null);
      setNotice(action === "reject" ? "提案已拒绝，标准和评估保持不变。" : `Spec v${job.spec_version} → v${result.spec_version} · ${changed} 人档位变化。`);
    });
  }

  function startNew() {
    if (job && !window.confirm("离开当前任务并创建新任务？已有 checkpoint 不会删除，可用 job_id 恢复。")) return;
    try { localStorage.removeItem(JOB_KEY); } catch { /* The current view still resets. */ }
    setJob(null); setDraft([]); setFeedback(""); setClarifyNote(""); setEditing(false); setError(""); setNotice(""); setDatabaseHistory(null); setView("需求校准"); setTitle(""); setRequirement(""); setCandidatesText("");
    // 空状态下点击也要有反馈:定位到招聘意图输入框。
    requestAnimationFrame(() => document.getElementById("hiring-intent")?.focus());
  }

  const proposal = job?.change_proposal ?? null;
  const reviewStatus = !job ? "无变更" : proposal && waiting === "human_approval" ? "待审批" : job.risk_flags.length ? "已拦截" : clarifyNote ? "需要澄清" : "无变更";
  const reviewStatusClass = reviewStatus === "待审批" ? "status-warning" : reviewStatus === "已拦截" ? "status-error" : reviewStatus === "需要澄清" ? "status-warning" : "status-success";
  const proposalType = !proposal ? "—" : proposal.add?.length && proposal.remove?.length ? "条目增删" : proposal.add?.length ? "新增条目" : proposal.remove?.length ? "删除条目" : "无变更";
  const impactedCells = proposal ? ((proposal.add?.length ?? 0) + (proposal.remove?.length ?? 0)) * job!.evaluations.length : 0;

  return <div className="workspace-app"><aside className="workspace-sidebar"><Link href="/" aria-label="Hire Loop 首页"><Image src="/hire-loop-logo.png" alt="Hire Loop" width={2170} height={725} priority style={{ width: 168, height: "auto" }} /></Link><nav aria-label="工作台导航">{([["需求校准", "◇"], ["招聘标准", "☑"], ["候选人", "▤"], ["反馈与审批", "✎"]] as const).map(([label, icon]) => <button key={label} className={view === label ? "active" : ""} aria-current={view === label ? "page" : undefined} onClick={() => { if (label === "候选人") { router.push("/candidates"); return; } setView(label); }}>{icon}　{label}</button>)}</nav><footer>人工确认 · 可追溯</footer></aside><main className="loop-page">
    <header className="loop-header">
      <div className="workspace-breadcrumb">Hire Loop　›　<b>{view}</b></div>
      <span className="loop-mode">{job?.job_title ?? title ?? "未命名职位"} · {job ? `v${job.spec_version}` : "草稿 · 未启用"}</span>
      <div className="loop-header-actions"><button className="loop-button secondary" disabled={!job || !!busy} onClick={() => { setView("招聘标准"); setSpecTab("版本记录"); }}>版本记录</button></div>
    </header>
    <div className="loop-main">
      {error && <p className="loop-error" role="alert">{error}</p>}{notice && <p className="loop-summary" role="status">{notice}</p>}
      {busy && <p className="loop-note" role="status">{busy}中… 等待后端执行结果。</p>}

      {view === "需求校准" && <section id="requirement">
        <header className="calibration-heading"><div><h1>需求校准</h1><p>{job ? "当前任务的招聘意图与澄清结果。" : "将你的招聘意图转化为可执行的招聘标准。"}</p></div><button className="loop-button secondary" disabled={!!busy} onClick={startNew}>新建职位</button></header>
        {!job ? <RequirementPanel requirement={requirement} onChange={setRequirement} candidatesText={candidatesText} onCandidatesChange={setCandidatesText} busy={!!busy} onGenerate={(value) => { setRequirement(value); void create(value); }} /> : <section className="loop-form">
          <div className="loop-titlebar"><div><h1>{job.job_title}</h1><p>Spec v{job.spec_version} · thread_id = job_id</p><code>{job.job_id}</code></div><button className="loop-button secondary" disabled={!!busy} onClick={() => void restore(job.job_id)}>刷新 checkpoint</button></div>
          <div className="loop-node-track" aria-label="已完成的图节点">{job.workflow.completed_nodes.map((node) => <span key={node} className="complete">✓ {NODE_LABEL[node] ?? node}</span>)}{job.workflow.waiting_for && <span className="waiting">⏸ {NODE_LABEL[job.workflow.waiting_for]} · 等待人工操作</span>}</div>
          {job.clarified_requirement && <p className="loop-note">澄清后的需求：{job.clarified_requirement}</p>}
          {!!job.clarification_questions?.length && <ul className="loop-note">{job.clarification_questions.map((question, i) => <li key={i}>待核实问题：{question}</li>)}</ul>}
          <p className="loop-note">Checkpoint：{job.workflow.checkpointer} · 下一节点：{job.workflow.next_nodes.join(", ") || "END"}</p>
        </section>}
      </section>}

      {view === "招聘标准" && <section id="spec">
        {!job ? <div className="loop-form"><h2>尚未生成招聘标准</h2><p className="loop-note">先在「需求校准」提交需求，生成后的标准在这里查看、编辑并确认。</p><button className="loop-button primary" onClick={() => setView("需求校准")}>前往需求校准</button></div> : <>
          <div className="spec-tabs" role="tablist"><button role="tab" aria-selected={specTab === "当前标准"} className={specTab === "当前标准" ? "active" : ""} onClick={() => setSpecTab("当前标准")}>当前标准</button><button role="tab" aria-selected={specTab === "版本记录"} className={specTab === "版本记录" ? "active" : ""} onClick={() => setSpecTab("版本记录")}>版本记录</button></div>
          {specTab === "当前标准" && <div className="loop-form">
            {waiting === "spec_confirmation" ? <><div className="loop-intro"><p>等待确认 · SPEC_CONFIRMATION</p><h1>确认 Spec v{job.spec_version}</h1><span>确认标准后，前往候选人页上传简历并开始评估。</span></div>{!!job.clarification_questions?.length && <div className="loop-form"><h2>后端澄清问题</h2><p className="loop-note">由 clarify 节点生成。标准已按澄清后的需求拟定，如有出入请直接在下方修改标准后再确认。</p>{job.clarification_questions.map((question, i) => <p className="loop-note" key={i}>澄清问题：{question}</p>)}</div>}<CriteriaEditor value={draft} onChange={setDraft} disabled={!!busy} /><button className="loop-button primary" disabled={!!busy || !draft.length || draft.some((item) => !item.text.trim())} onClick={() => void confirm()}>确认招聘标准 v{job.spec_version}</button></> : <>
              <div className="loop-intro"><p>已生效 · SPEC v{job.spec_version}</p><h1>当前招聘标准</h1><span>{job.job_title}</span></div>
              <div className="loop-spec-table"><table><tbody>{job.criteria.map((item) => <tr key={item.id}><td>{item.id}</td><td>{TYPE_LABEL[item.type]}</td><td>{item.text}</td></tr>)}</tbody></table></div>
              <button className="loop-button secondary" onClick={() => router.push("/candidates")}>查看候选人评估</button>
            </>}
          </div>}
          {specTab === "版本记录" && <div className="loop-form">
            <div className="loop-intro"><p>SPEC HISTORY</p><h1>版本记录</h1><span>对比标准条目如何变化、由哪条反馈触发。</span></div>
            <SpecHistory job={job} snapshots={snapshots} audit={databaseHistory} />
            <button className="loop-button secondary" disabled={!!busy} onClick={() => void operation("读取数据库审计", async () => { setDatabaseHistory(await request(`/calibrations/${job.job_id}/history`)); })}>加载完整数据库审计（需 PG）</button>
            {databaseHistory !== null && <details className="loop-spec-table"><summary>审计原始数据</summary><pre className="loop-json">{JSON.stringify(databaseHistory, null, 2)}</pre></details>}
          </div>}
        </>}
      </section>}

      {view === "候选人" && <section id="candidate-evaluations">
        {job && <CandidateImport job={job} onChange={receive} disabled={!!busy} />}
        {!job || step === "spec" ? <div className="loop-form"><h2>还没有可评估的候选人</h2><p className="loop-note">在「需求校准」提交需求、在「招聘标准」确认标准后，候选人评估结果会出现在这里。</p><button className="loop-button primary" onClick={() => setView(job ? "招聘标准" : "需求校准")}>{job ? "前往招聘标准" : "前往需求校准"}</button></div> : <>
          <div className="loop-tier-tabs">{(["全部", ...TIERS] as const).map((label) => <button key={label} className={tier === label ? "active" : ""} onClick={() => { setTier(label); const first = job.evaluations.find((item) => label === "全部" || item.verdict === label); setSelected(first?.candidate_id ?? ""); }}>{label} {label === "全部" ? job.evaluations.length : job.tiers[label] ?? 0}</button>)}</div>
          <section className="loop-evaluation-grid">
            <nav className="loop-candidates" aria-label="候选人列表">{TIERS.map((group) => {
              const rows = job.evaluations.filter((item) => item.verdict === group && (tier === "全部" || tier === group));
              return rows.length ? <div key={group}><h3>{group}</h3>{rows.map((item) => <button key={item.candidate_id} aria-pressed={selected === item.candidate_id} className={`loop-candidate ${selected === item.candidate_id ? "active" : ""}`} onClick={() => setSelected(item.candidate_id)}><strong>{item.name}</strong><span>{item.verdict}</span></button>)}</div> : null;
            })}{!selected && <p className="loop-note">此分组暂无候选人。</p>}</nav>
            <article className="loop-evidence">{selectedEvaluation ? <><header><h2>{selectedEvaluation.name}</h2><span className="loop-badge">{selectedEvaluation.verdict}</span></header>{job.criteria.map((item) => {
              const score = selectedEvaluation.scores[item.id];
              const evidence = job.evidence.filter((ev) => ev.candidate_id === selected && ev.criterion_id === item.id && ev.valid);
              return <section key={item.id} className="loop-evidence-row"><div><span>{item.id} · {TYPE_LABEL[item.type]}</span><h3>{item.text}</h3><strong>{score === 2 ? "✓ 满足" : score === 0 ? "× 不满足" : "? 无证据"}</strong></div>{evidence.map((ev, i) => <blockquote key={i} className="loop-quote">“{ev.quote}” · {ev.stance === "against" ? "反证" : "支持"}</blockquote>)}{!evidence.length && <p className="loop-empty-evidence">没有经后端校验的简历原文证据。</p>}</section>;
            })}</> : <p className="loop-note">选择候选人查看证据。</p>}</article>
          </section>
        </>}
      </section>}

      {view === "反馈与审批" && <section id="feedback-review">
        {!job ? <div className="loop-form"><h2>还没有可校准的任务</h2><p className="loop-note">完成候选人评估后，在这里提交经理反馈并处理标准变更提案。</p><button className="loop-button primary" onClick={() => setView("需求校准")}>前往需求校准</button></div> : <>
          <div className="loop-form"><h2>经理反馈</h2><p className="loop-note">反馈由后端解读，可能生成标准变更提案、风险拦截或澄清请求。</p><form onSubmit={submit}><label className="sr-only" htmlFor="feedback-input">经理反馈</label><div className="loop-feedback-row"><input id="feedback-input" value={feedback} disabled={!!busy || !!waiting} onChange={(event) => setFeedback(event.target.value)} placeholder="更看重团队管理经验。" /><button className="loop-button primary" disabled={!!busy || !!waiting || !feedback.trim()}>{waiting ? "请先处理提案" : busy ? "分析中…" : "提交反馈"}</button></div></form><div className="loop-feedback-shortcuts"><button type="button" disabled={!!busy || !!waiting} onClick={() => setFeedback("更看重团队管理经验。")}>团队经验</button><button type="button" disabled={!!busy || !!waiting} onClick={() => setFeedback("年轻一点，有冲劲。")}>风险案例</button></div></div>
          <section className="loop-proposal">
            <header><h2>变更提案</h2><span className={`status-pill ${reviewStatusClass}`}>{reviewStatus}</span></header>
            {reviewStatus === "待审批" && proposal && <>
              <p>{proposal.reason}</p>
              <div className="review-meta"><span>变更类型：{proposalType}</span><span>影响范围：重评 {impactedCells} 个单元格（{(proposal.add?.length ?? 0) + (proposal.remove?.length ?? 0)} 项标准变化 × {job.evaluations.length} 位候选人）</span></div>
              <div className="loop-diff"><div><small>BEFORE · 当前已生效标准</small>{job.criteria.map((item) => <p key={item.id}>{item.id} · {TYPE_LABEL[item.type]} · {item.text}</p>)}{(proposal.remove ?? []).map((id) => <p key={id} className="diff-del">－ {id} · {job.criteria.find((item) => item.id === id)?.text}</p>)}</div><span aria-hidden="true">→</span><div><small>AFTER · 待确认的变更</small>{(proposal.add ?? []).map((item, i) => <p key={i} className="diff-add">＋ {TYPE_LABEL[item.type ?? "NICE_TO_HAVE"]} · {item.text}</p>)}{(proposal.remove ?? []).map((id) => <p key={id} className="diff-del">－ {id} · {job.criteria.find((item) => item.id === id)?.text}</p>)}</div></div>
              {editing && <><p className="loop-note">编辑完整标准集，包含提案新增/删除；保存会直接批准。未变化标准请保留原 ID。</p><CriteriaEditor value={draft} onChange={setDraft} disabled={!!busy} /></>}
              <div className="loop-actions"><button className="loop-button primary" disabled={!!busy || (editing && draft.some((item) => !item.text.trim()))} onClick={() => void decide(editing ? "edit" : "accept")}>{editing ? "保存并接受" : "接受"}</button><button className="loop-button secondary" disabled={!!busy} onClick={() => { setEditing(!editing); setDraft(proposalDraft(job)); }}>{editing ? "取消编辑" : "编辑"}</button><button className="loop-button secondary" disabled={!!busy} onClick={() => void decide("reject")}>拒绝</button></div>
            </>}
            {reviewStatus === "已拦截" && <><p>后端风险检查：{job.risk_flags.join("、")}。该反馈没有进入 Hiring Spec。</p><div className="loop-actions">{["学习能力", "主动性", "适应快节奏"].map((label) => <button key={label} className="loop-button secondary" disabled={!!busy} onClick={() => { setFeedback(`更看重${label}，请结合具体项目证据核验。`); }}>{label}</button>)}</div></>}
            {reviewStatus === "需要澄清" && <p>{clarifyNote}</p>}
            {reviewStatus === "无变更" && <p className="loop-note">当前没有待处理的变更提案。提交反馈后，提案会显示在这里。</p>}
          </section>
        </>}
      </section>}
    </div>
  </main></div>;
}
