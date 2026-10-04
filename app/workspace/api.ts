export type Criterion = { id: string; type: "MUST_HAVE" | "NICE_TO_HAVE" | "VETO"; text: string; weight: number };
export type Verdict = "推荐" | "待核实" | "不推荐" | "否决";
export type Judgment = "SATISFIED" | "NOT_SATISFIED" | "NO_EVIDENCE" | "HIT" | "CLEAR" | "UNKNOWN";
export type Evaluation = { candidate_id: string; name: string; scores: Record<string, number | null>; judgments?: Record<string, Judgment>; verdict: Verdict; tier_reason?: string };
export type Recompute = { total_cells: number; recomputed_cells: number; reused_cells: number; candidate_count: number; notice?: string };
export type Candidate = { candidate_id: string; name: string; source_file: string | null; character_count: number; parser_version: string | null; evaluated: boolean };
export type Calibration = {
  job_id: string; job_title: string; requirement?: string;
  status: "AWAITING_SPEC_CONFIRMATION" | "AWAITING_APPROVAL" | "EVALUATED";
  spec_version: number; criteria: Criterion[];
  evidence: { candidate_id: string; criterion_id: string; quote: string; stance: string; valid: boolean }[];
  evaluations: Evaluation[]; tiers: Record<Verdict, number>; risk_flags: string[];
  candidates?: Candidate[];
  change_proposal: { reason?: string; add?: Partial<Criterion>[]; remove?: string[]; update?: Criterion[] } | null;
  allocated_criterion_ids?: string[]; recomputation?: Recompute | null; proposal_impact?: Recompute | null;
  feedback_status?: string | null; feedback_question?: string | null; approval_draft?: Criterion[] | null;
  feedback_id?: string | null;
  feedback_review?: { status: string; reason: string; source_texts: string[]; questions: { question: string; options?: string[] }[] };
  feedback_thread?: { original?: string; rounds?: { questions: { question: string }[]; answers: string[] }[] };
  requirement_revision?: string | null;
  feedback_notes: string[];
  workflow: { next_nodes: string[]; completed_nodes: string[]; waiting_for: "spec_confirmation" | "human_approval" | null; model_mode: "offline_fallback" | "live" | "record" | "replay"; checkpointer: "memory" | "postgres"; history: { node: string; spec_version?: number }[] };
  clarified_requirement: string | null; clarification_questions: string[] | null;
  clarification_responses?: Record<string, { question: string; category: "MUST_HAVE" | "NICE_TO_HAVE" | "NOT_REQUIRED"; answer: string; base_spec_version: number; status: string }>;
};

export const TYPE_LABEL = { MUST_HAVE: "MUST · 必须项", NICE_TO_HAVE: "NICE · 加分项", VETO: "VETO · 否决项" };
export const NODE_LABEL: Record<string, string> = {
  clarify: "需求澄清", generate_spec: "生成标准", spec_confirmation: "确认标准",
  extract_evidence: "抽取证据", validate_evidence: "校验证据", evaluate: "候选人评估",
  interpret_feedback: "解读反馈", bias_risk_check: "风险检查", propose_change: "生成提案",
  human_approval: "人工审批", selective_reeval: "选择性重评",
};

export function proposalDraft(job: Calibration): Criterion[] {
  if (job.approval_draft?.length) return job.approval_draft.map((item) => ({ ...item }));
  const removed = new Set(job.change_proposal?.remove ?? []);
  const updates = new Map((job.change_proposal?.update ?? []).map((item) => [item.id, item]));
  const draft = job.criteria.filter((item) => !removed.has(item.id)).map((item) => ({ ...(updates.get(item.id) ?? item) }));
  const used = new Set([...job.criteria.map((item) => item.id), ...(job.allocated_criterion_ids ?? [])]);
  let next = Math.max(0, ...Array.from(used).filter((id) => /^c\d+$/.test(id)).map((id) => Number(id.slice(1)))) + 1;
  for (const item of job.change_proposal?.add ?? []) {
    while (used.has(`c${next}`)) next++;
    const id = `c${next++}`;
    used.add(id);
    draft.push({ id, type: item.type ?? "NICE_TO_HAVE", text: item.text ?? "", weight: item.weight ?? 2 });
  }
  return draft;
}

export function judgmentFor(evaluation: Evaluation, criterion: Criterion): Judgment {
  const existing = evaluation.judgments?.[criterion.id];
  if (existing) return existing;
  const score = evaluation.scores[criterion.id];
  return criterion.type === "VETO" ? score === 2 ? "HIT" : score === 0 ? "CLEAR" : "UNKNOWN"
    : score === 2 ? "SATISFIED" : score === 0 ? "NOT_SATISFIED" : "NO_EVIDENCE";
}

export const JUDGMENT_LABEL: Record<Judgment, string> = {
  SATISFIED: "✓ 满足", NOT_SATISFIED: "× 不满足", NO_EVIDENCE: "? 无证据",
  HIT: "× 触发一票否决", CLEAR: "✓ 有证据未触发", UNKNOWN: "? 否决条件待核实",
};

export function stepFor(job: Calibration): "spec" | "evaluation" {
  return job.workflow.waiting_for === "spec_confirmation" ? "spec" : "evaluation";
}

export function assertCalibration(value: unknown): asserts value is Calibration {
  const job = value as Calibration | null;
  if (!job || typeof job.job_id !== "string" || !job.workflow || !Array.isArray(job.workflow.next_nodes) || !Array.isArray(job.criteria) || !Array.isArray(job.evaluations)) {
    throw new Error("后端未返回 LangGraph 分步接口合同，请更新并重启 xihack-service。");
  }
}

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000").replace(/\/$/, "");
export const JOB_KEY = "hire-loop.langgraph.job-id";

/** 从后端 checkpoint 读取真实任务快照；失败时抛错，由页面展示空状态，绝不回退到模拟数据。 */
export async function loadJob(id: string): Promise<Calibration> {
  const response = await fetch(`${API_BASE}/calibrations/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`读取任务失败（HTTP ${response.status}）`);
  const value: unknown = await response.json();
  assertCalibration(value);
  return value;
}

export function apiError(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => `${item.loc?.join(".") ?? "输入"}：${item.msg ?? "参数不合法"}`).join("；");
  if (detail && typeof detail === "object" && "message" in detail) return String(detail.message);
  return `请求失败（HTTP ${status}），请刷新 checkpoint 确认当前状态后重试。`;
}

export async function candidateRequest(path: string, body?: FormData | object): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST", cache: "no-store",
      ...(body instanceof FormData ? { body } : body === undefined ? {} : {
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
      signal: AbortSignal.timeout(path.endsWith("/evaluate") ? 600000 : 120000),
    });
  } catch {
    throw new Error("请求中断或超时，请刷新候选人状态后重试。后端可能仍在处理。");
  }
  const value = await response.json().catch(() => { throw new Error("后端未返回 JSON，请检查服务地址。"); });
  if (!response.ok) throw new Error(apiError(value.detail, response.status));
  return value;
}
