"use client";
import type { Calibration, Criterion, Evaluation } from "./api";
import { TYPE_LABEL, judgmentFor } from "./api";
import { parseHistory } from "./history-data";
const stages = ["需求校准", "招聘标准", "候选人", "反馈与审批"] as const;
const events: Record<string, string> = { FEEDBACK_SUBMITTED: "提交经理反馈", EVALUATED: "完成候选人评估", PROPOSAL_PENDING_APPROVAL: "生成待审批提案", PROPOSAL_BLOCKED: "反馈被风险检查拦截", PROPOSAL_EMPTY: "反馈未产生变更", PROPOSAL_DECIDED: "人工处理提案", SPEC_CREATED: "建立招聘标准", SPEC_UPDATED: "更新招聘标准", JOB_CREATED: "创建职位" };
const labels: Record<string, string> = { PENDING_APPROVAL: "待审批", NEEDS_CLARIFICATION: "需要澄清", APPROVED: "已批准", REJECTED: "已拒绝", BLOCKED: "已拦截", NO_CHANGE: "无变更", EMPTY: "无变更" };
export function Overview({ job, navigate }: { job: Calibration | null; navigate: (view: typeof stages[number]) => void }) {
  return <section><div className="insight-heading"><span>招聘需求持续校准</span><h1>{job?.job_title ?? "开始一次清晰的招聘协作"}</h1><p>{job ? "让标准、证据与反馈围绕同一个职位推进。" : "先说清岗位，再确认标准；每次反馈都留下可审查的修改。"}</p></div>
    <div className="insight-metrics">{[{name:"已评估候选人",value:job?.evaluations.length ?? "—"},{name:"标准条目",value:job?.criteria.length ?? "—"},{name:"标准版本",value:job ? `v${job.spec_version}` : "未创建"},{name:"待审批提案",value:job ? (job.workflow.waiting_for === "human_approval" ? 1 : 0) : "—"}].map((item)=><article key={item.name}><small>{item.name}</small><strong>{item.value}</strong></article>)}</div>
    <div className="insight-journey">{stages.map((view,i)=><button key={view} onClick={()=>navigate(view)}><b>0{i+1}</b><h3>{view}</h3><p>{["把模糊意图转成可核验要求","人工确认必须项、加分项与否决项","逐条检查证据与需要核实的缺口","审查提案，让标准随反馈迭代"][i]}</p><span>进入 →</span></button>)}</div>
    {job && <div className="insight-columns"><article className="loop-form"><h2>候选人分布</h2>{(["推荐","待核实","不推荐","否决"] as const).map(tier=>{const count=job.evaluations.filter(e=>e.verdict===tier).length;return <div className="distribution-row" key={tier}><span>{tier}</span><meter min={0} max={Math.max(job.evaluations.length,1)} value={count}/><b>{count} 人</b></div>})}<p className="loop-note">来自当前版本评估，分布不代表招聘准确率。</p></article><article className="loop-form"><h2>下一步</h2><p>{job.workflow.waiting_for === "spec_confirmation" ? "标准已生成，等待人工确认。" : job.workflow.waiting_for === "human_approval" ? "有一条标准变更提案等待处理。" : "查看候选人证据，提交具体反馈。"}</p><button className="loop-button primary" onClick={()=>navigate(job.workflow.waiting_for === "spec_confirmation" ? "招聘标准" : job.workflow.waiting_for === "human_approval" ? "反馈与审批" : "候选人")}>继续处理 →</button><p className="loop-note">模型模式：{{live:"在线",record:"录制",replay:"回放",offline_fallback:"离线回退（不可用于真实评估）"}[job.workflow.model_mode]} · {job.workflow.checkpointer === "postgres" ? "状态保存于数据库" : "状态仅保存在当前后端进程"}</p></article></div>}
  </section>;
}
export function DecisionLog({ value, notes }: { value: unknown; notes: string[] }) {
  const h=parseHistory(value);
  return <section><h2>决策日志</h2><p className="loop-note">追溯标准为什么变，以及谁处理了提案。</p>{value === null ? <><p>加载数据库历史，查看跨会话的审批与事件。</p>{notes.map((note,i)=><p key={i} className="loop-quote">{note}</p>)}</> : h.audit.length ? <ol className="decision-timeline">{[...h.audit].reverse().map((e,i)=><li key={String(e.id??i)}><b>{events[String(e.event_type)]??String(e.event_type??"事件")}</b><small>{String(e.created_at??"时间未记录")} · {String(e.actor??"操作人未记录")}</small><details><summary>查看事件详情</summary><pre className="loop-json">{JSON.stringify(e.payload??{},null,2)}</pre></details></li>)}</ol> : <p>后端暂无审计事件。</p>}
    <h3>提案记录</h3>{h.proposals.length ? [...h.proposals].reverse().map((p,i)=>{const body=p.proposal as Record<string,unknown>|undefined;const feedback=h.feedback.find(f=>f.id===p.feedback_id);return <article className="loop-quote" key={String(p.id??i)}><b>{labels[String(p.status)]??String(p.status??"状态未知")} · v{String(p.from_version??"?")}</b><p>{String(body?.reason??feedback?.text??"未记录修改原因")}</p><small>{String(p.decided_by??"未记录审批人")} · {String(p.decided_at??p.created_at??"时间未记录")}</small></article>}) : <p className="loop-note">{value===null ? "请先加载数据库历史。" : "尚未记录提案。"}</p>}
  </section>;
}
export function CandidateGaps({ evaluation, criteria }: { evaluation: Evaluation; criteria: Criterion[] }) {
 const unknown=criteria.filter(c=>["NO_EVIDENCE","UNKNOWN"].includes(judgmentFor(evaluation,c)));
 const failed=criteria.filter(c=>["NOT_SATISFIED","HIT"].includes(judgmentFor(evaluation,c)));
 return <div className="insight-columns candidate-summary"><div><h3>需要核实 · {unknown.length} 项</h3>{unknown.length ? unknown.map(c=><p key={c.id}>{c.text}<small>{c.type==="VETO" ? "否决条件尚未排除，需要进一步核实。" : "请补充具体项目、承担职责及结果的证据。"}</small></p>) : <p>当前没有无证据条目。</p>}</div><div><h3>明确缺口 / 否决命中 · {failed.length} 项</h3>{failed.length ? failed.map(c=><p key={c.id}>{c.text}</p>) : <p>当前未记录明确缺口或否决命中。</p>}<p className="loop-note">无证据不等于不具备能力；仍需人工核实。</p></div></div>;
}
export function StandardGroups({ criteria }: { criteria: Criterion[] }) {
 return <div className="standard-groups">{(["MUST_HAVE","NICE_TO_HAVE","VETO"] as const).map(type=><article key={type} className={`standard-group group-${type}`}><h3>{TYPE_LABEL[type]}</h3>{criteria.filter(c=>c.type===type).map(c=><div key={c.id}><small>{c.id} · 权重 {c.weight}</small><p>{c.text}</p></div>)}{!criteria.some(c=>c.type===type)&&<p className="loop-note">当前未设置此类标准。</p>}</article>)}</div>;
}
