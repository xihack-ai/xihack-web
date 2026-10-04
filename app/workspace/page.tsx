"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import "./workflow.css";
import "./calibration.css";
import "./insights.css";
import { RequirementPanel } from "./requirement-panel";
import { CandidateImport } from "../candidates/candidate-import";
import { SpecHistory, type Snapshots } from "./spec-history";
import { Overview, DecisionLog, StandardGroups } from "./insights";
import { WorkspaceSidebar, type WorkspaceView } from "./workspace-sidebar";
import type { RequirementReview, RequirementAnswer } from "./api";
import { apiError, API_BASE, assertCalibration, Calibration, Criterion, JOB_KEY, NODE_LABEL, proposalDraft, stepFor, TYPE_LABEL, Verdict, judgmentFor, JUDGMENT_LABEL } from "./api";

const API = API_BASE;
const TIERS: Verdict[] = ["推荐", "待核实", "不推荐", "否决"];
type View = WorkspaceView;
type ChangeReceipt = { beforeVersion: number; afterVersion: number; moved: { name: string; before: Verdict; after: Verdict }[]; recomputed: number; reused: number };
type ClarificationChoice = "MUST_HAVE" | "NICE_TO_HAVE" | "NOT_REQUIRED";
const CLARIFICATION_LABEL: Record<ClarificationChoice, string> = { MUST_HAVE: "必须项", NICE_TO_HAVE: "满意项（加分项）", NOT_REQUIRED: "非必要" };

class RequestError extends Error {
  constructor(message: string, public detail: { code?: string; questions?: RequirementReview["questions"] }) { super(message); }
}

async function request(path: string, body?: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(path.endsWith("/approval") ? 600000 : 120000), cache: "no-store",
    });
  } catch {
    throw new Error(`无法连接 ${API} 或请求超时。请检查后端启动、CORS 和模型耗时；写请求可能已经执行，请先刷新 checkpoint，不要盲目重复提交。`);
  }
  const value = await response.json().catch(() => { throw new Error("后端没有返回 JSON，请检查 API 地址。"); });
  if (!response.ok) throw new RequestError(apiError(value.detail, response.status), value.detail ?? {});
  return value;
}

function CriteriaEditor({ value, onChange, disabled, allocatedIds = [] }: { value: Criterion[]; onChange: (value: Criterion[]) => void; disabled: boolean; allocatedIds?: string[] }) {
  function update(index: number, patch: Partial<Criterion>) { onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item)); }
  function add() {
    const used = new Set([...allocatedIds, ...value.map((item) => item.id)]);
    let number = Math.max(0, ...[...used].filter((id) => /^c\d+$/.test(id)).map((id) => Number(id.slice(1)))) + 1;
    while (used.has(`c${number}`)) number++;
    onChange([...value, { id: `c${number}`, type: "NICE_TO_HAVE", text: "", weight: 2 }]);
  }
  return <div className="loop-spec-table"><table><thead><tr><th>ID</th><th>类型</th><th>标准</th><th>权重</th><th>操作</th></tr></thead><tbody>{value.map((item, index) => <tr key={item.id}>
    <td>{item.id}</td><td><select disabled={disabled} aria-label={`${item.id} 类型`} value={item.type} onChange={(event) => update(index, { type: event.target.value as Criterion["type"] })}>{Object.entries(TYPE_LABEL).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></td>
    <td><input disabled={disabled} aria-label={`${item.id} 标准`} value={item.text} onChange={(event) => update(index, { text: event.target.value })} /></td>
    <td><input disabled={disabled} aria-label={`${item.id} 权重`} type="number" min={1} max={3} value={item.weight} onChange={(event) => update(index, { weight: Number(event.target.value) })} /></td>
    <td><button type="button" className="criterion-remove" disabled={disabled || value.length <= 1} aria-label={`移除 ${item.id}`} onClick={() => onChange(value.filter((_, i) => i !== index))}>移除</button></td>
  </tr>)}</tbody></table><div className="criterion-editor-actions"><button type="button" className="loop-button secondary" disabled={disabled} onClick={add}>＋ 新增标准</button><span>移除只修改草稿；确认或审批后才生效。至少保留一条标准。</span></div></div>;
}

export default function WorkspacePage() {
  const router = useRouter();
  const [view, setView] = useState<View>("任务概览");
  const [specTab, setSpecTab] = useState<"当前标准" | "版本记录">("当前标准");
  const [title, setTitle] = useState("");
  const [requirement, setRequirement] = useState("");
  const [requirementReview, setRequirementReview] = useState<RequirementReview | null>(null);
  const [requirementAnswers, setRequirementAnswers] = useState<Record<number, string>>({});
  const [requirementRounds, setRequirementRounds] = useState<RequirementAnswer[]>([]);
  const [requirementEditing, setRequirementEditing] = useState(false);
  const [manualEditing, setManualEditing] = useState(false);
  const [manualRequirement, setManualRequirement] = useState("");
  const [candidatesText, setCandidatesText] = useState("");
  const [job, setJob] = useState<Calibration | null>(null);
  const [draft, setDraft] = useState<Criterion[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshots>({});
  const [selected, setSelected] = useState("");
  const [tier, setTier] = useState<Verdict | "全部">("全部");
  const [feedback, setFeedback] = useState("");
  const [feedbackCandidateId, setFeedbackCandidateId] = useState("");
  const [feedbackDecision, setFeedbackDecision] = useState<"通过" | "不合适" | "待定" | "">("");
  const [clarifyNote, setClarifyNote] = useState("");
  const [feedbackAnswers, setFeedbackAnswers] = useState<Record<number, string>>({});
  const [clarificationDrafts, setClarificationDrafts] = useState<Record<number, { category: ClarificationChoice | ""; answer: string }>>({});
  const [targetQuestion, setTargetQuestion] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [databaseHistory, setDatabaseHistory] = useState<unknown>(null);
  const [restoreId, setRestoreId] = useState("");
  const [receipt, setReceipt] = useState<ChangeReceipt | null>(null);
  const step = job ? stepFor(job) : "task";

  // 支持从其他页面用 /workspace#spec 等锚点直达对应视图。
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash;
      if (hash === "#spec") setView("招聘标准");
      else if (hash === "#requirement") setView("需求校准");
      else if (hash === "#candidate-evaluations") setView("候选人");
      else if (hash === "#feedback-review" || hash === "#feedback-questions") setView("反馈与审批");
      else if (hash === "#history") setView("版本对比");
      else if (hash === "#log") setView("决策日志");
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
  useEffect(() => {
    if (view !== "反馈与审批" || window.location.hash !== "#feedback-questions") return;
    const frame = requestAnimationFrame(() => document.getElementById(targetQuestion === null ? "feedback-questions" : `clarification-question-${targetQuestion}`)?.scrollIntoView({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [view, job?.job_id, targetQuestion]);
  const selectedEvaluation = job?.evaluations.find((item) => item.candidate_id === selected);
  useEffect(() => {
    if (requirementReview?.status !== "NEEDS_CLARIFICATION") return;
    const frame = requestAnimationFrame(() => {
      document.querySelector(".requirement-clarification")?.scrollIntoView({ block: "start", behavior: "smooth" });
      document.getElementById("requirement-answer-0")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requirementReview]);
  const waiting = job?.workflow.waiting_for;

  function receive(value: unknown) {
    setFeedbackAnswers({});
    assertCalibration(value);
    setJob(value); setTitle(value.job_title); setRequirement(value.requirement ?? ""); setDraft(value.criteria.map((item) => ({ ...item }))); setEditing(false); setRestoreId(value.job_id);
    setClarificationDrafts(Object.fromEntries(Object.entries(value.clarification_responses ?? {}).map(([index, response]) => [Number(index), { category: response.category, answer: response.answer }])));
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

  function editRequirement(value: string) {
    setRequirement(value); setRequirementReview(null); setRequirementAnswers({}); setRequirementRounds([]); setError("");
  }

  async function create(resolvedRequirement: string, answers: RequirementAnswer[] = []) {
    await operation("分析需求", async () => {
      const review = await request("/requirements/clarify", { requirement: resolvedRequirement.trim(), answers }) as RequirementReview;
      if (!["SAFE", "BLOCKED", "NEEDS_CLARIFICATION"].includes(review.status) || !Array.isArray(review.questions)) throw new Error("需求澄清响应格式无效，请检查后端版本。");
      setRequirementReview(review); setRequirementRounds(answers); setRequirementAnswers({});
      if (review.status !== "SAFE") { setView("需求校准"); return; }
      let result: unknown;
      try {
        result = await request("/jobs", { title: title.trim() || "未命名职位", requirement: resolvedRequirement.trim(), clarification_answers: answers, candidates: parseCandidates(candidatesText), require_spec_confirmation: true });
      } catch (err) {
        // A later generation gate may discover another ambiguity. Keep it in
        // the answer workflow instead of flattening questions into an alert.
        if (err instanceof RequestError && err.detail.code === "NEEDS_CLARIFICATION" && err.detail.questions?.length) {
          setRequirementReview({ status: "NEEDS_CLARIFICATION", reason: err.message, questions: err.detail.questions }); return;
        }
        throw err;
      }
      assertCalibration(result);
      setDatabaseHistory(null); setReceipt(null); setSnapshots({ [result.spec_version]: result.criteria.map((item) => ({ ...item })) });
      receive(result); setTier("全部"); setView("招聘标准"); setSpecTab("当前标准");
      setRequirementReview(null); setRequirementAnswers({}); setRequirementRounds([]);
      setNotice("标准已生成并停在确认步骤；确认前不抽证据、不评估候选人。");
    });
  }

  async function restore(id: string) {
    if (!id.trim()) { setError("请提供 job_id。"); return; }
    await operation("读取 checkpoint", async () => {
      const restored = await request(`/calibrations/${encodeURIComponent(id.trim())}`);
      assertCalibration(restored);
      if (restored.job_id !== job?.job_id) { setSnapshots({}); setDatabaseHistory(null); setReceipt(null); }
      receive(restored); setView("任务概览"); setNotice("已从后端 checkpoint 读取流程状态。");
    });
  }

  async function confirm() {
    if (!job || waiting !== "spec_confirmation") return;
    await operation("确认标准", async () => { receive(await request(`/calibrations/${job.job_id}/spec/confirm`, { criteria: draft })); router.push("/candidates"); });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!job || waiting || !feedback.trim() || (feedbackCandidateId && !feedbackDecision)) return;
    await operation("解读反馈", async () => {
      const candidate = job.evaluations.find((item) => item.candidate_id === feedbackCandidateId);
      const feedbackText = candidate ? `候选人 ${candidate.name}（ID: ${candidate.candidate_id}）：${feedbackDecision}。原因：${feedback.trim()}` : feedback.trim();
      const result = await request(`/calibrations/${job.job_id}/feedback`, { text: feedbackText, created_by: "manager-demo" });
      assertCalibration(result); receive(result); setFeedback(""); setFeedbackCandidateId(""); setFeedbackDecision("");
      if (result.workflow.waiting_for === "human_approval") { setClarifyNote(""); setNotice("反馈已生成变更提案，等待人工确认。"); }
      else if (result.risk_flags.length) { setClarifyNote(""); setNotice("该反馈未进入 Hiring Spec。"); }
      else if (result.feedback_status === "NEEDS_CLARIFICATION") { setClarifyNote(result.feedback_question ?? "哪项岗位要求没有得到证明？"); setNotice(""); }
      else { setClarifyNote(""); setNotice("没有新的标准变更，当前版本与排名保持不变。"); }
    });
  }

  async function submitClarification(index: number) {
    if (!job || waiting) return;
    const item = clarificationDrafts[index];
    if (!item?.category || (item.category !== "NOT_REQUIRED" && !item.answer.trim())) { setError("请选择类型；必须项和满意项还需填写具体、可验证的岗位要求。"); return; }
    await operation("处理澄清问题", async () => {
      const result = await request(`/calibrations/${job.job_id}/clarification-feedback`, {
        question_index: index, category: item.category, answer: item.category === "NOT_REQUIRED" ? "" : item.answer.trim(),
        base_spec_version: job.spec_version, created_by: "manager-demo",
      });
      assertCalibration(result); receive(result);
      if (result.workflow.waiting_for === "human_approval") setNotice("已生成标准变更提案。请在下方核对差异并接受、编辑或拒绝；当前标准尚未改变。");
      else if (result.feedback_status === "BLOCKED") setNotice("该要求被风险检查拦截，未写入招聘标准。请改写为岗位相关要求后重新提交。");
      else if (result.feedback_status === "NEEDS_CLARIFICATION") setNotice(result.feedback_question || "请补充更具体的岗位要求。");
      else if (item.category === "NOT_REQUIRED") setNotice("已记录为非必要；标准与候选人排序不变。");
      else setNotice("当前没有产生新提案；标准与候选人排序不变。");
    });
  }

  async function answerRequirement() {
    if (!requirementReview || requirementReview.status !== "NEEDS_CLARIFICATION") return;
    const answers = requirementReview.questions.map((item, index) => ({ question: item.question, answer: requirementAnswers[index]?.trim() ?? "" }));
    if (answers.some((item) => !item.answer)) { setError("请逐题填写回答；没有该要求可明确写“非必要”。"); return; }
    await create(requirement, [...requirementRounds, ...answers]);
  }

  async function answerFeedback() {
    if (!job || waiting || !job.feedback_id) return;
    const questions = job.feedback_review?.questions?.length ? job.feedback_review.questions : [{ question: job.feedback_question || clarifyNote, options: [] }];
    const answers = questions.map((_, index) => feedbackAnswers[index]?.trim() || "");
    if (answers.some((answer) => !answer)) return;
    await operation("处理澄清回答", async () => {
      const result = await request(`/calibrations/${job.job_id}/feedback/answer`, {
        feedback_id: job.feedback_id, base_spec_version: job.spec_version, answers, created_by: "manager-demo",
      });
      assertCalibration(result); receive(result);
      setNotice(result.feedback_status === "PENDING_APPROVAL" ? "回答已形成修改提议，请审核后接受。标准与排名尚未改变。" : result.feedback_status === "BLOCKED" ? "回答包含受限条件，请修改原反馈。" : result.feedback_status === "NEEDS_CLARIFICATION" ? "还需要补充说明，请回答下面的问题。" : "已处理回答，未产生新标准修改。");
    });
  }

  async function reanalyzeRequirement() {
    if (!job || waiting !== "spec_confirmation" || !requirement.trim()) return;
    await operation("重新分析招聘意图", async () => {
      const result = await request(`/calibrations/${job.job_id}/requirement/reanalyze`, {
        requirement: requirement.trim(), base_spec_version: job.spec_version,
      });
      assertCalibration(result); receive(result); setRequirementEditing(false);
      setSnapshots({ [result.spec_version]: result.criteria.map((item) => ({ ...item })) });
      setView("招聘标准"); setSpecTab("当前标准");
      setNotice("已根据修订后的招聘意图生成新草稿；原草稿保留，可凭原 job_id 恢复。请重新核对标准再确认。");
    });
  }

  function openManualEditor() {
    if (!job || waiting) return;
    setDraft(job.criteria.map((item) => ({ ...item })));
    setManualRequirement(job.requirement ?? "");
    setManualEditing(true); setView("招聘标准"); setSpecTab("当前标准");
  }

  async function submitManualProposal() {
    if (!job || waiting || !manualEditing) return;
    await operation("提交人工修订提案", async () => {
      const result = await request(`/calibrations/${job.job_id}/spec/manual-proposal`, {
        criteria: draft, base_spec_version: job.spec_version,
        requirement: manualRequirement.trim(), created_by: "manager-demo",
      });
      assertCalibration(result); receive(result); setDraft(proposalDraft(result));
      setManualRequirement(result.requirement_revision ?? result.requirement ?? "");
      setManualEditing(false); setView("反馈与审批");
      setNotice("人工修订已生成待审批提案。当前招聘意图、标准与排名尚未改变，请核对后接受或拒绝。");
    });
  }

  async function decide(action: "accept" | "edit" | "reject") {
    if (!job || waiting !== "human_approval") return;
    await operation("恢复审批节点", async () => {
      const result = await request(`/calibrations/${job.job_id}/approval`, { action, ...(action === "edit" ? { criteria: draft } : {}), base_spec_version: job.spec_version, decided_by: "manager-demo" });
      assertCalibration(result);
      // 审批前后各存一份完整标准集，作为版本对比的真实快照。
      setSnapshots((current) => ({ ...current, [job.spec_version]: job.criteria.map((item) => ({ ...item })), [result.spec_version]: result.criteria.map((item) => ({ ...item })) }));
      const changed = result.evaluations.filter((item) => job.evaluations.find((old) => old.candidate_id === item.candidate_id)?.verdict !== item.verdict).length;
      setReceipt(action === "reject" ? null : { beforeVersion: job.spec_version, afterVersion: result.spec_version, moved: result.evaluations.flatMap((item) => { const previous = job.evaluations.find((old) => old.candidate_id === item.candidate_id); return previous && previous.verdict !== item.verdict ? [{ name: item.name, before: previous.verdict, after: item.verdict }] : []; }), recomputed: result.recomputation?.recomputed_cells ?? 0, reused: result.recomputation?.reused_cells ?? 0 });
      receive(result); setTier("全部"); setDatabaseHistory(null);
      if (action !== "reject" && !Object.values(job.clarification_responses ?? {}).some((response) => response.status === "PENDING_APPROVAL")) setView("任务概览");
      setNotice(action === "reject" ? "提案已拒绝，标准和评估保持不变。" : `Spec v${job.spec_version} → v${result.spec_version} · ${changed} 人档位变化。${result.recomputation ? `重评 ${result.recomputation.recomputed_cells} 项，复用 ${result.recomputation.reused_cells} 项判定。` : ""}`);
    });
  }

  async function saveDraft() {
    if (!job || waiting !== "human_approval") return;
    await operation("保存提议草稿", async () => {
      receive(await request(`/calibrations/${job.job_id}/proposal/edit`, { criteria: draft, base_spec_version: job.spec_version,
        ...(job.requirement_revision != null ? { requirement: manualRequirement.trim() } : {}) }));
      setNotice("编辑草稿已保存，当前标准与排名保持不变。请审核后点击接受。");
    });
  }

  function startNew() {
    setRequirementReview(null); setRequirementAnswers({}); setRequirementRounds([]);
    if (job && !window.confirm("离开当前任务并创建新任务？已有 checkpoint 不会删除，可用 job_id 恢复。")) return;
    try { localStorage.removeItem(JOB_KEY); } catch { /* The current view still resets. */ }
    setJob(null); setDraft([]); setFeedback(""); setFeedbackCandidateId(""); setFeedbackDecision(""); setClarifyNote(""); setClarificationDrafts({}); setTargetQuestion(null); setEditing(false); setManualEditing(false); setRequirementEditing(false); setManualRequirement(""); setError(""); setNotice(""); setDatabaseHistory(null); setSnapshots({}); setReceipt(null); setRestoreId(""); setView("需求校准"); setTitle(""); setRequirement(""); setCandidatesText("");
  }

  const proposal = job?.change_proposal ?? null;
  const reviewStatus = !job ? "无变更" : proposal && waiting === "human_approval" ? "待审批" : job.risk_flags.length ? "已拦截" : job.feedback_status === "NEEDS_CLARIFICATION" ? "需要澄清" : "无变更";
  const reviewStatusClass = reviewStatus === "待审批" ? "status-warning" : reviewStatus === "已拦截" ? "status-error" : reviewStatus === "需要澄清" ? "status-warning" : "status-success";
  const proposalType = job?.approval_draft ? "人工编辑草稿" : proposal?.update?.length ? "修改现有条目" : !proposal ? "—" : proposal.add?.length && proposal.remove?.length ? "条目增删" : proposal.add?.length ? "新增条目" : proposal.remove?.length ? "删除条目" : "无变更";
  const manualChanged = !!job && (manualRequirement.trim() !== (job.requirement ?? "") || JSON.stringify(draft) !== JSON.stringify(job.criteria));
  const impactedCells = job?.proposal_impact?.recomputed_cells;
  const feedbackCandidate = job?.evaluations.find((item) => item.candidate_id === feedbackCandidateId);

  function navigate(destination: View) { if (destination === "候选人") router.push("/candidates"); else setView(destination); }

  return <div className="workspace-app"><WorkspaceSidebar active={view} jobTitle={job?.job_title} version={job?.spec_version} draft={!job || waiting === "spec_confirmation"} onNavigate={navigate} /><main className="loop-page">
    <header className="loop-header">
      <div className="workspace-breadcrumb">Hire Loop　›　<b>{view}</b></div>
      <span className="loop-mode">{job?.job_title || title || "未命名职位"} · {job ? `v${job.spec_version}` : "草稿 · 未启用"}</span>
      <div className="loop-header-actions"><button className="loop-button secondary" disabled={!job || !!busy} onClick={() => setView("版本对比")}>版本记录</button></div>
    </header>
    <div className="loop-main">
      {error && <p className="loop-error" role="alert">{error}</p>}{notice && <p className="loop-summary" role="status">{notice}</p>}
      {busy && <p className="loop-note" role="status">{busy}中… 等待后端执行结果。</p>}

      {view === "任务概览" && <><Overview job={job} navigate={navigate} /><form className="loop-restore-form" onSubmit={(event) => { event.preventDefault(); void restore(restoreId); }}><label htmlFor="restore-job-id">按 job_id 恢复任务</label><input id="restore-job-id" value={restoreId} onChange={(event) => setRestoreId(event.target.value)} placeholder="输入已有职位的 job_id" /><button className="loop-button secondary" disabled={!!busy || !restoreId.trim()}>读取 checkpoint</button></form>{receipt && <section className="change-receipt"><h2>审批结果 · v{receipt.beforeVersion} → v{receipt.afterVersion}</h2><p>重评 {receipt.recomputed} 项，复用 {receipt.reused} 项判定；{receipt.moved.length} 人的档位发生变化。</p>{receipt.moved.map((item, index) => <p key={`${item.name}-${index}`}>{item.name}：{item.before} → {item.after}</p>)}<p className="loop-note">仅展示本次操作前后的档位变化；历史排名需从对应版本的完整评估重建。</p></section>}</>}

      {view === "需求校准" && <section id="requirement">
        <header className="calibration-heading"><div><h1>需求校准</h1><p>{job ? "当前任务的招聘意图与澄清结果。" : "将你的招聘意图转化为可执行的招聘标准。"}</p></div><button className="loop-button secondary" disabled={!!busy} onClick={startNew}>新建职位</button></header>
        {!job ? <><div className="loop-restore-form"><label htmlFor="new-job-title">职位名称</label><input id="new-job-title" value={title} disabled={!!busy} onChange={(event) => setTitle(event.target.value)} placeholder="例如：后端工程师（高并发方向）" /></div><RequirementPanel requirement={requirement} onChange={editRequirement} candidatesText={candidatesText} onCandidatesChange={setCandidatesText} busy={!!busy} review={requirementReview} answers={requirementAnswers} rounds={requirementRounds} onAnswer={(index, value) => setRequirementAnswers((current) => ({ ...current, [index]: value }))} onSubmitAnswers={() => void answerRequirement()} onGenerate={(value) => { void create(value, requirementRounds); }} /></> : <div className="calibration-columns calibration-existing">
          <div className="calibration-left"><section className="intent-card"><header><span className="purple-icon" aria-hidden="true">✦</span><div><h2>你的招聘意图</h2><p>{job.job_title} · 来自职位启动沟通</p></div></header><div className="intent-body">{requirementEditing && waiting === "spec_confirmation" ? <><label htmlFor="revised-requirement">修订招聘意图</label><textarea id="revised-requirement" value={requirement} disabled={!!busy} rows={5} onChange={(event) => setRequirement(event.target.value)} /><p className="calibration-intent-hint">重新分析会生成新草稿并保留当前草稿；原有候选人文本会复制到新草稿，确认前不会评估。</p><div className="loop-actions"><button type="button" className="loop-button primary" disabled={!!busy || !requirement.trim() || requirement.trim() === job.requirement} onClick={() => void reanalyzeRequirement()}>重新分析需求</button><button type="button" className="loop-button secondary" disabled={!!busy} onClick={() => { setRequirementEditing(false); setRequirement(job.requirement ?? ""); }}>取消</button></div></> : <><p className="calibration-intent-text">{job.requirement || job.clarified_requirement || "已建立招聘标准"}</p><p className="calibration-intent-hint">AI 将意图整理成标准；尚不明确的部分由 HR 确认。</p><button type="button" className="loop-button secondary" disabled={!!busy || waiting === "human_approval"} onClick={() => { if (waiting === "spec_confirmation") { setRequirement(job.requirement ?? ""); setRequirementEditing(true); } else openManualEditor(); }}>{waiting === "spec_confirmation" ? "修改原始需求" : "修订招聘意图与标准"}</button></>}</div></section>
            {job.clarified_requirement && job.clarified_requirement !== (job.requirement || job.clarified_requirement) && <p className="clarification-notice"><b>已整理的需求</b>{job.clarified_requirement}</p>}
            <section className="calibration-open-questions"><div className="calibration-open-heading"><div><strong>澄清问题</strong><p>让我们明确什么才是“合适”。逐题反馈后，经审批才会更新标准。</p></div><span>{Object.values(job.clarification_responses ?? {}).filter((item) => ["APPROVED", "NOT_REQUIRED"].includes(item.status)).length} / {job.clarification_questions?.length ?? 0} 已处理</span></div>{job.clarification_questions?.length ? job.clarification_questions.map((question, i) => <div className="calibration-open-row" key={i}><span className="question-index">{String(i + 1).padStart(2, "0")}</span><span>{question}</span><small>{job.clarification_responses?.[String(i)]?.status === "APPROVED" ? "已纳入标准" : job.clarification_responses?.[String(i)]?.status === "NOT_REQUIRED" ? "非必要" : job.clarification_responses?.[String(i)]?.status === "PENDING_APPROVAL" ? "待审批" : "待澄清"}</small><button type="button" className="loop-button secondary" onClick={() => { setTargetQuestion(i); setView("反馈与审批"); window.location.hash = "feedback-questions"; }}>修改 →</button></div>) : <p className="calibration-intent-hint">当前没有待核实问题。若经理提出新要求，请前往反馈与审批。</p>}</section>
            <details className="calibration-technical"><summary>查看流程技术记录</summary><div className="loop-node-track" aria-label="已完成的图节点">{job.workflow.completed_nodes.map((node) => <span key={node} className="complete">✓ {NODE_LABEL[node] ?? node}</span>)}{job.workflow.waiting_for && <span className="waiting">⏸ {NODE_LABEL[job.workflow.waiting_for]} · 等待人工操作</span>}</div><p>job_id：{job.job_id} · checkpoint：{job.workflow.checkpointer} · 下一节点：{job.workflow.next_nodes.join(", ") || "END"}</p><button type="button" className="loop-button secondary" disabled={!!busy} onClick={() => void restore(job.job_id)}>刷新 checkpoint</button></details>
          </div>
          <aside className="draft-preview"><header><div><small>实时预览</small><h2>招聘标准 v{job.spec_version}</h2></div><span>{waiting === "spec_confirmation" ? "待确认" : "已启用"}</span></header><p>{waiting === "spec_confirmation" ? "这里展示 AI 草稿；可到招聘标准页移除、改写或新增条款，再人工确认。" : "这里展示已生效版本；修订需提交提案并审批。"}</p>{(["MUST_HAVE", "NICE_TO_HAVE", "VETO"] as const).map((type) => <div key={type} className={`preview-group ${type === "NICE_TO_HAVE" ? "plus" : type === "VETO" ? "veto" : ""}`}><header><b>{type === "MUST_HAVE" ? "必须项" : type === "NICE_TO_HAVE" ? "加分项" : "否决项"}</b><span>{job.criteria.filter((item) => item.type === type).length} 项标准</span></header><ul>{job.criteria.filter((item) => item.type === type).map((item) => <li key={item.id}><span>✓</span>{item.text}</li>)}</ul></div>)}<button type="button" className="loop-button secondary" onClick={() => setView("招聘标准")}>查看完整标准 →</button></aside>
        </div>}
      </section>}

      {view === "招聘标准" && <section id="spec">
        {!job ? <div className="loop-form"><h2>尚未生成招聘标准</h2><p className="loop-note">先在「需求校准」提交需求，生成后的标准在这里查看、编辑并确认。</p><button className="loop-button primary" onClick={() => setView("需求校准")}>前往需求校准</button></div> : <>
          <div className="spec-tabs" role="tablist"><button role="tab" aria-selected={specTab === "当前标准"} className={specTab === "当前标准" ? "active" : ""} onClick={() => setSpecTab("当前标准")}>当前标准</button><button role="tab" aria-selected={specTab === "版本记录"} className={specTab === "版本记录" ? "active" : ""} onClick={() => setSpecTab("版本记录")}>版本记录</button></div>
          {specTab === "当前标准" && <div className="loop-form">
            {waiting === "spec_confirmation" ? <><div className="loop-intro"><p>等待确认 · SPEC_CONFIRMATION</p><h1>确认 Spec v{job.spec_version}</h1><span>可以修改类型、文字和权重，也可以移除或新增标准；确认后才进入评估。</span></div>{!!job.clarification_questions?.length && <div className="loop-form"><h2>待澄清的问题</h2><p className="loop-note">先审核初始草稿；确认后可从「需求校准」逐题进入「问题澄清反馈」，经提案审批再更新标准。</p>{job.clarification_questions.map((question, i) => <p className="loop-note" key={i}>{i + 1}. {question}</p>)}</div>}<CriteriaEditor value={draft} onChange={setDraft} disabled={!!busy} allocatedIds={job.allocated_criterion_ids} /><button className="loop-button primary" disabled={!!busy || !draft.length || draft.some((item) => !item.text.trim())} onClick={() => void confirm()}>确认招聘标准 v{job.spec_version}</button></> : <>
              <div className="loop-intro"><p>已生效 · SPEC v{job.spec_version}</p><h1>当前招聘标准</h1><span>{job.job_title}</span></div>
              {manualEditing ? <div className="manual-spec-editor"><label htmlFor="manual-requirement">招聘意图修订</label><textarea id="manual-requirement" rows={4} value={manualRequirement} disabled={!!busy} onChange={(event) => setManualRequirement(event.target.value)} /><p className="loop-note">可修改原始需求和下方条款。提交后仅产生待审批提案，批准后才发布新版并重评受影响条款。</p><CriteriaEditor value={draft} onChange={setDraft} disabled={!!busy} allocatedIds={job.allocated_criterion_ids} /><div className="loop-actions"><button type="button" className="loop-button primary" disabled={!!busy || !manualChanged || !manualRequirement.trim() || !draft.length || draft.some((item) => !item.text.trim())} onClick={() => void submitManualProposal()}>提交修订提案</button><button type="button" className="loop-button secondary" disabled={!!busy} onClick={() => { setManualEditing(false); setDraft(job.criteria.map((item) => ({ ...item }))); }}>取消编辑</button></div></div> : <><div className="loop-spec-table"><table><tbody>{job.criteria.map((item) => <tr key={item.id}><td>{item.id}</td><td>{TYPE_LABEL[item.type]}</td><td>{item.text}</td></tr>)}</tbody></table></div><StandardGroups criteria={job.criteria} /><div className="loop-actions"><button className="loop-button primary" disabled={!!busy || !!waiting} onClick={openManualEditor}>修改／取消标准</button><button className="loop-button secondary" onClick={() => router.push("/candidates")}>查看候选人评估</button></div></>}
            </>}
          </div>}
          {specTab === "版本记录" && <div className="loop-form">
            <div className="loop-intro"><p>SPEC HISTORY</p><h1>版本记录</h1><span>对比标准条目如何变化、由哪条反馈触发。</span></div>
            <SpecHistory key={job.job_id} job={job} snapshots={snapshots} audit={databaseHistory} />
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
              const status = judgmentFor(selectedEvaluation, item);
              const evidence = job.evidence.filter((ev) => ev.candidate_id === selected && ev.criterion_id === item.id && ev.valid);
              return <section key={item.id} className="loop-evidence-row"><div><span>{item.id} · {TYPE_LABEL[item.type]}</span><h3>{item.text}</h3><strong>{JUDGMENT_LABEL[status]}</strong></div>{evidence.map((ev, i) => <blockquote key={i} className="loop-quote">“{ev.quote}” · {ev.stance === "against" ? "反证" : "支持"}</blockquote>)}{!evidence.length && <p className="loop-empty-evidence">没有经后端校验的简历原文证据。</p>}</section>;
            })}</> : <p className="loop-note">选择候选人查看证据。</p>}</article>
          </section>
        </>}
      </section>}

      {view === "版本对比" && <section id="history"><div className="loop-form"><div className="loop-intro"><p>SPEC HISTORY</p><h1>版本对比</h1><span>选择两个版本，对比标准定义、类型和权重。</span></div>{job ? <><SpecHistory key={job.job_id} job={job} snapshots={snapshots} audit={databaseHistory} /><button className="loop-button secondary" disabled={!!busy} onClick={() => void operation("读取数据库历史", async () => { setDatabaseHistory(await request(`/calibrations/${job.job_id}/history`)); })}>加载数据库历史（需 PostgreSQL）</button></> : <p className="loop-note">请先创建或恢复职位。</p>}</div></section>}

      {view === "决策日志" && <section id="log"><div className="loop-form">{job ? <><DecisionLog value={databaseHistory} notes={[]} /><button className="loop-button secondary" disabled={!!busy} onClick={() => void operation("读取数据库审计", async () => { setDatabaseHistory(await request(`/calibrations/${job.job_id}/history`)); })}>加载数据库审计（需 PostgreSQL）</button></> : <p className="loop-note">请先创建或恢复职位。</p>}</div></section>}

      {view === "反馈与审批" && <section id="feedback-review">
        <header className="calibration-heading"><div><p className="feedback-step">{job ? `SPEC v${job.spec_version} · ${waiting === "human_approval" ? "待审批" : "已启用"}` : "招聘标准校准"}</p><h1>反馈与审批</h1><p>反馈先变成建议，经你审批后才修改招聘标准；规则变化后只重评受影响的部分。</p></div></header>
        {!job ? <div className="loop-form"><h2>还没有可校准的任务</h2><p className="loop-note">完成候选人评估后，在这里提交经理反馈并处理标准变更提案。</p><button className="loop-button primary" onClick={() => setView("需求校准")}>前往需求校准</button></div> : <>
          <div className="loop-form feedback-workflow"><div className="feedback-heading"><span className="feedback-step">01 · 候选人反馈</span><h2>经理反馈</h2><p>选择一位候选人并说明取舍，或直接提交适用于整个职位的标准反馈。</p></div><form onSubmit={submit}>
            {!!job.evaluations.length && <div className="feedback-candidate-picker"><label htmlFor="feedback-candidate">反馈对象</label><select id="feedback-candidate" value={feedbackCandidateId} disabled={!!busy || !!waiting} onChange={(event) => { setFeedbackCandidateId(event.target.value); setFeedbackDecision(""); }}><option value="">整个职位 · 标准反馈</option>{job.evaluations.map((item) => <option key={item.candidate_id} value={item.candidate_id}>{item.name} · {item.verdict}</option>)}</select></div>}
            {feedbackCandidate && <><div className="feedback-decision" role="group" aria-label="候选人取舍">{(["通过", "不合适", "待定"] as const).map((decision) => <button type="button" key={decision} aria-pressed={feedbackDecision === decision} className={feedbackDecision === decision ? "selected" : ""} disabled={!!busy || !!waiting} onClick={() => setFeedbackDecision(decision)}>{decision}</button>)}</div><div className="feedback-evidence-summary"><b>{feedbackCandidate.name} · 当前档位：{feedbackCandidate.verdict}</b><span>{job.criteria.filter((item) => ["SATISFIED", "CLEAR"].includes(judgmentFor(feedbackCandidate, item))).length} 项已有正向证据 · {job.criteria.filter((item) => ["NO_EVIDENCE", "UNKNOWN"].includes(judgmentFor(feedbackCandidate, item))).length} 项待核实</span><button type="button" onClick={() => router.push("/candidates")}>查看逐条证据 →</button></div></>}
            <label htmlFor="feedback-input">{feedbackCandidate ? `对 ${feedbackCandidate.name} 的具体理由` : "反馈理由"}</label><textarea id="feedback-input" rows={4} value={feedback} disabled={!!busy || !!waiting} onChange={(event) => setFeedback(event.target.value)} placeholder="例如：他只参与了项目，但我们需要独立负责上线的人。" /><div className="feedback-submit"><p>反馈先由后端检查，再形成可审批的标准修改建议；提交不会直接改排名。</p><button className="loop-button primary" disabled={!!busy || !!waiting || !feedback.trim() || (!!feedbackCandidateId && !feedbackDecision)}>{waiting ? "请先处理提案" : busy ? "分析中…" : "提交反馈"}</button></div>
          </form><div className="loop-feedback-shortcuts"><button type="button" disabled={!!busy || !!waiting} onClick={() => setFeedback("更看重团队管理经验，需有具体管理行为的证据。")}>团队经验</button><button type="button" disabled={!!busy || !!waiting} onClick={() => setFeedback("年轻一点，有冲劲。")}>风险案例</button></div></div>
          <section id="feedback-questions" className="loop-form clarification-workflow"><div className="feedback-heading"><span className="feedback-step">02 · 问题澄清反馈</span><h2>逐条确认待核实问题</h2><p>选择问题在招聘中的重要性。必须项与满意项需要写成能从简历中验证的具体要求；提交后仍须审批提案。</p></div>{waiting === "spec_confirmation" && <p className="loop-note">请先前往「招聘标准」确认初始 Spec，再逐题提交澄清反馈。</p>}{!job.clarification_questions?.length ? <p className="loop-note">当前职位没有待核实问题。</p> : job.clarification_questions.map((question, index) => {
            const saved = job.clarification_responses?.[String(index)];
            const current = clarificationDrafts[index] ?? { category: "" as const, answer: "" };
            const locked = !!busy || !!waiting;
            return <article id={`clarification-question-${index}`} className="clarification-question" key={index}><div className="clarification-question-heading"><span className="question-index">{String(index + 1).padStart(2, "0")}</span><h3>{question}</h3><small>{saved?.status === "APPROVED" ? `已纳入 Spec v${job.spec_version}` : saved?.status === "NOT_REQUIRED" ? "非必要 · 已记录" : saved?.status === "PENDING_APPROVAL" ? "提案待审批" : saved?.status === "BLOCKED" ? "已拦截 · 可修改" : saved?.status === "REJECTED" ? "已驳回 · 可修改" : saved?.status === "NEEDS_CLARIFICATION" ? "需补充说明" : saved?.status === "NO_CHANGE" ? "没有产生新提案" : "待澄清"}</small></div>
              <div className="clarification-options" role="group" aria-label={`问题 ${index + 1} 的类型`}>{(["MUST_HAVE", "NICE_TO_HAVE", "NOT_REQUIRED"] as const).map((category) => <button type="button" key={category} aria-pressed={current.category === category} className={current.category === category ? "selected" : ""} disabled={locked} onClick={() => setClarificationDrafts((drafts) => ({ ...drafts, [index]: { category, answer: category === "NOT_REQUIRED" ? "" : drafts[index]?.answer ?? "" } }))}>{CLARIFICATION_LABEL[category]}</button>)}</div>
              {current.category && current.category !== "NOT_REQUIRED" && <label className="clarification-answer">具体要求<input value={current.answer} disabled={locked} onChange={(event) => setClarificationDrafts((drafts) => ({ ...drafts, [index]: { category: current.category, answer: event.target.value } }))} placeholder="例如：独立负责过生产环境上线，能说明负责范围与证据" /></label>}
              <div className="clarification-question-footer"><span>{current.category === "NOT_REQUIRED" ? "不新增该要求；已有标准若需删除，请另提变更并审批。" : "模型提出最小修改；接受前 Spec 与排名保持不变。"}</span><button type="button" className="loop-button secondary" disabled={locked || !current.category || (current.category !== "NOT_REQUIRED" && !current.answer.trim())} onClick={() => void submitClarification(index)}>{saved ? "更新反馈" : "提交本题"}</button></div>
            </article>;
          })}</section>
          <section className="loop-proposal">
            <details className="loop-note"><summary>查看审核范围</summary><p>明确按候选人的年龄、性别、婚育、民族、宗教、种族、残障、外貌筛选时拦截；业务背景中出现这些词不会仅因关键词拦截。混合反馈需修改后重新审核。</p><p>大厂、指定公司、学历、专业、学校背景不会仅因关键词被拦截；范围或岗位必要性不明时向经理澄清。主动性、有冲劲、快节奏等模糊要求同样先追问。明确岗位相关要求生成提议，批准后才生效。这是产品审核规则，不代表法律合规结论。</p></details>
            <header><div><span className="feedback-step">03 · 提案与审批</span><h2>变更提案</h2></div><span className={`status-pill ${reviewStatusClass}`}>{reviewStatus}</span></header>
            {reviewStatus === "待审批" && proposal && <>
              <p>{proposal.reason}</p>
              {job.requirement_revision && <div className="requirement-diff"><small>招聘意图修订 · 尚未生效</small><p><b>当前：</b>{job.requirement}</p><p><b>提议：</b>{job.requirement_revision}</p></div>}
              <div className="review-meta"><span>变更类型：{proposalType}</span><span>影响范围：{impactedCells === undefined ? "后端尚未返回" : `重评 ${impactedCells} 项，复用 ${job.proposal_impact?.reused_cells ?? 0} 项判定`}</span></div>
              <p className="loop-note">重评数量为候选人 × 条款的逻辑单元，不代表模型请求次数或耗时。</p>
              <div className="loop-diff"><div><small>BEFORE · 当前已生效标准</small>{job.criteria.map((item) => <p key={item.id} className={proposalDraft(job).some((next) => next.id === item.id) ? "" : "diff-del"}>{item.id} · {TYPE_LABEL[item.type]} · {item.text} · 权重 {item.weight}</p>)}</div><span aria-hidden="true">→</span><div><small>AFTER · 待确认完整标准 · 尚未生效</small>{proposalDraft(job).map((item) => {
                const old = job.criteria.find((entry) => entry.id === item.id);
                const changed = !old || old.text !== item.text || old.type !== item.type || old.weight !== item.weight;
                return <p key={item.id} className={changed ? "diff-add" : ""}>{changed ? (old ? "↻ " : "＋ ") : ""}{item.id} · {TYPE_LABEL[item.type]} · {item.text} · 权重 {item.weight}</p>;
              })}</div></div>
              {editing && <><p className="loop-note">保存只更新草稿；随后点击接受才生效。未变化标准请保留原 ID。</p>{job.requirement_revision != null && <label className="proposal-requirement-edit">修订后的招聘意图<textarea rows={3} value={manualRequirement} disabled={!!busy} onChange={(event) => setManualRequirement(event.target.value)} /></label>}<CriteriaEditor value={draft} onChange={setDraft} disabled={!!busy} allocatedIds={job.allocated_criterion_ids} /></>}
              <div className="loop-actions"><button className="loop-button primary" disabled={!!busy || (editing && (!draft.length || draft.some((item) => !item.text.trim()) || (job.requirement_revision != null && !manualRequirement.trim())))} onClick={() => void (editing ? saveDraft() : decide("accept"))}>{editing ? "保存草稿" : "接受"}</button><button className="loop-button secondary" disabled={!!busy} onClick={() => { setEditing(!editing); setDraft(proposalDraft(job)); setManualRequirement(job.requirement_revision ?? job.requirement ?? ""); }}>{editing ? "取消编辑" : "编辑"}</button><button className="loop-button secondary" disabled={!!busy} onClick={() => void decide("reject")}>拒绝</button></div>
            </>}
            {reviewStatus === "已拦截" && <><p>拦截原因：{job.feedback_review?.reason || job.risk_flags.join("、")}。该反馈没有进入 Hiring Spec。</p><p>原反馈：{job.feedback_thread?.original || job.feedback_review?.source_texts?.join("；") || "历史反馈未保存原文，请查看决策日志。"}</p><button type="button" className="loop-button secondary" disabled={!!busy || !!waiting} onClick={() => { setFeedback(job.feedback_thread?.original || job.feedback_review?.source_texts?.[0] || ""); setFeedbackCandidateId(""); setFeedbackDecision(""); document.getElementById("feedback-input")?.focus(); setNotice("请编辑原反馈并重新提交；系统不会自动替换你的真实意图。"); }}>编辑原反馈</button></>}
            {reviewStatus === "需要澄清" && <form onSubmit={(event) => { event.preventDefault(); void answerFeedback(); }}><p>请提出反馈的用人经理回答，HR可代填。回答不会直接修改标准。</p><p>原反馈：{job.feedback_thread?.original || "请结合本次反馈补充说明"}</p>{(job.feedback_thread?.rounds || []).map((round, index) => <details key={index}><summary>第{index + 1}轮回答</summary>{round.questions.map((question, i) => <p key={i}>{question.question}：{round.answers[i]}</p>)}</details>)}{(job.feedback_review?.questions?.length ? job.feedback_review.questions : [{ question: job.feedback_question || clarifyNote, options: [] }]).map((question, index) => <div className="clarification-question" key={index}><label htmlFor={`feedback-answer-${index}`}>{index + 1}. {question.question}</label><div className="loop-actions">{question.options?.map((option) => <button type="button" className="loop-button secondary" key={option} disabled={!!busy} onClick={() => setFeedbackAnswers((values) => ({ ...values, [index]: option }))}>{option}</button>)}</div><textarea id={`feedback-answer-${index}`} rows={3} placeholder="选择选项或填写自己的回答，可补充具体要求和证据" value={feedbackAnswers[index] || ""} disabled={!!busy} onChange={(event) => setFeedbackAnswers((values) => ({ ...values, [index]: event.target.value }))} /></div>)}<button className="loop-button primary" disabled={!!busy || !!waiting || !job.feedback_id || (job.feedback_review?.questions?.length ? job.feedback_review.questions : [{}]).some((_, index) => !feedbackAnswers[index]?.trim())}>提交回答并继续</button></form>}
            {reviewStatus === "无变更" && <p className="loop-note">当前没有待处理的变更提案。提交反馈后，提案会显示在这里。</p>}
          </section>
        </>}
      </section>}
    </div>
  </main></div>;
}
