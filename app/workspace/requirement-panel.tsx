"use client";

import type { RequirementReview, RequirementAnswer } from "./api";

function answerPlaceholder(question: string) {
  if (/必须|优先|硬性|加分/.test(question)) return "例如：优先考虑项，非必须；不满足该项仍可评估其他岗位要求。";
  if (/公司|企业|大厂/.test(question)) return "例如：腾讯、阿里、字节、美团；只认可这份名单，不额外要求企业规模。";
  if (/几年|年限|多少年/.test(question)) return "例如：不设置固定年限，以实际负责过的项目和职责判断。";
  return "请针对本题填写具体要求、职责或证据；不需要该条件可写“非必要”。";
}

export function RequirementPanel({ requirement, onChange, candidatesText, onCandidatesChange, busy, onGenerate, review, answers, rounds, onAnswer, onSubmitAnswers }: { requirement: string; onChange: (value: string) => void; candidatesText: string; onCandidatesChange: (value: string) => void; busy: boolean; onGenerate: (value: string) => void; review: RequirementReview | null; answers: Record<number, string>; rounds: RequirementAnswer[]; onAnswer: (index: number, value: string) => void; onSubmitAnswers: () => void }) {
  return <div className="calibration-columns"><section className="calibration-left">
    <section className="intent-card"><header><span className="purple-icon">✎</span><div><h2>招聘意图</h2><p>来自职位启动沟通</p></div></header><div className="intent-body"><label className="sr-only" htmlFor="hiring-intent">招聘需求</label><textarea id="hiring-intent" placeholder="例如：我们要招聘一名有若干年经验的后端工程师，需要有相关项目经历，能够独立负责核心模块。" value={requirement} disabled={busy} onChange={(event) => onChange(event.target.value)} rows={4} /><footer><span>用日常语言描述需求即可；先回答澄清问题，再生成标准草稿；需求明确时直接生成，确认前请人工核对。</span><button disabled={busy || !requirement.trim()} onClick={() => onGenerate(requirement)}>{busy ? "分析中…" : "分析需求"}</button></footer></div></section>
    <section className="intent-card candidates-input-card"><header><span className="purple-icon">▤</span><div><h2>候选人简历</h2><p>随需求一起提交给后端</p></div></header><div className="intent-body"><label className="sr-only" htmlFor="candidate-resumes">候选人简历</label><textarea id="candidate-resumes" placeholder={"每行一位候选人，格式：姓名｜简历内容\n张三｜5 年后端经验，负责订单服务……\n李四｜3 年后端经验，参与支付网关……"} value={candidatesText} disabled={busy} onChange={(event) => onCandidatesChange(event.target.value)} rows={4} /><footer><span>留空则只创建职位；候选人评估需要简历输入。</span></footer></div></section>
    {review?.status === "BLOCKED" && <section className="loop-form" role="alert"><h2>该需求需要修改</h2><p>{review.reason}</p><p>请修改上方招聘意图，移除敏感筛选条件后重新分析。</p></section>}
    {rounds.length > 0 && <section className="loop-form"><h2>已回答的需求问题</h2>{rounds.map((item, index) => <p key={index}><b>{item.question}</b><br />{item.answer}</p>)}</section>}
    {review?.status === "NEEDS_CLARIFICATION" && <form className="loop-form requirement-clarification" onSubmit={(event) => { event.preventDefault(); onSubmitAnswers(); }}><h2>澄清招聘需求</h2><p>请用人经理逐题回答，HR 可代填。明确职责与证据要求后再生成标准；没有该要求可填写“非必要”。</p>{review.questions.map((item, index) => <div className="clarification-question" key={`${index}-${item.question}`}><label htmlFor={`requirement-answer-${index}`}>{index + 1}. {item.question}</label><div className="loop-actions">{item.options?.map((option) => <button type="button" className="loop-button secondary" key={option} disabled={busy} onClick={() => onAnswer(index, option)}>{option}</button>)}</div><textarea id={`requirement-answer-${index}`} rows={3} value={answers[index] ?? ""} disabled={busy} onChange={(event) => onAnswer(index, event.target.value)} placeholder={answerPlaceholder(item.question)} /></div>)}<button type="submit" className="loop-button primary" disabled={busy || !review.questions.length || review.questions.some((_, index) => !answers[index]?.trim())}>{busy ? "分析中…" : "提交回答并生成标准草稿"}</button><p>提交回答不会确认标准或评估候选人，生成后仍须人工确认。</p></form>}
  </section><aside className="draft-preview"><header><div><small>实时预览</small><h2>招聘标准草稿</h2></div><span>草稿</span></header><p>尚未生成标准。提交需求后，这里会展示后端生成的 Hiring Spec，确认后才进入评估。</p><div className="preview-empty"><span>☑</span><p>生成后按必须项、加分项、否决项分组展示。</p></div></aside></div>;
}
