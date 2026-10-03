"use client";

import { useEffect, useState } from "react";

const PHASES = ["输入需求", "生成标准", "对照证据", "候选人分档", "提案审批"];
const DURATION = 2800;

/** 首页空状态的循环演示动画：仅展示交互流程，不冒充真实数据。 */
export function HomeDemo() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setPhase((current) => (current + 1) % PHASES.length), DURATION);
    return () => clearInterval(timer);
  }, []);

  return <div className="home-demo">
    <div className="demo-stage">
      {phase === 0 && <section className="demo-block"><div className="demo-field"><p className="demo-typing">“招一个后端工程师，负责核心服务，最好带过团队……”</p></div><p className="demo-hint">用日常语言写下招聘意图即可</p></section>}
      {phase === 1 && <section className="demo-block stagger"><div className="demo-row"><span className="criterion-type">必须</span><span>高并发服务开发经验</span></div><div className="demo-row"><span className="criterion-type">必须</span><span>独立完成核心模块交付</span></div><div className="demo-row"><span className="criterion-type">加分</span><span>带团队经验</span></div><div className="demo-row"><span className="criterion-type">否决</span><span>关键经历无法核实</span></div></section>}
      {phase === 2 && <section className="demo-block stagger"><div className="demo-row"><span className="criterion-type">必须</span><span>高并发服务开发经验</span><b className="score-good">✓ 满足</b></div><blockquote className="demo-quote">“负责订单服务重构，支撑日均百万级请求。”</blockquote><p className="demo-hint">结论必须能定位到简历原文</p></section>}
      {phase === 3 && <section className="demo-block stagger"><div className="demo-row"><strong>林知夏</strong><span className="status-pill status-success">推荐</span></div><div className="demo-row"><strong>沈知行</strong><span className="status-pill status-warning">待核实</span></div><div className="demo-row"><strong>许清和</strong><span className="status-pill status-error">不推荐</span></div></section>}
      {phase === 4 && <section className="demo-block stagger"><div className="demo-row"><b className="demo-primary">待处理建议</b><span>带团队经验　加分项 → <b>必须项</b></span></div><div className="demo-row"><span className="demo-hint">触发反馈：“带过团队的人必须有过硬交付”</span></div><div className="demo-actions"><span className="demo-btn primary">接受</span><span className="demo-btn">编辑</span><span className="demo-btn">拒绝</span></div></section>}
    </div>
    <footer>
      <div className="demo-dots">{PHASES.map((label, index) => <span key={label} className={index === phase ? "active" : ""}>{label}{index === phase && <i className="demo-progress" style={{ animationDuration: `${DURATION}ms` }} />}</span>)}</div>
    </footer>
  </div>;
}
