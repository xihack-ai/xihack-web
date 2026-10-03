"use client";
import { useEffect, useRef } from "react";
const colors=["113,101,232","139,124,246","184,174,255","255,255,255","243,201,77","246,216,110"];
export function Starfield(){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const c=ref.current!,ctx=c.getContext("2d")!; let w=0,h=0,raf=0;
    const reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
    type P={x:number;y:number;r:number;a:number;c:string;p:number;s:number}; let ps:P[]=[];
    const resize=()=>{ w=c.clientWidth; h=c.clientHeight; const dpr=Math.min(devicePixelRatio||1,1.5); c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0); const n=Math.max(800,Math.round(w*h/850)); ps=Array.from({length:n},()=>({x:Math.random()*w,y:Math.random()*h,r:Math.random()<.86?Math.random()*1.3+.3:Math.random()*2.5+1.2,a:Math.random()*.65+.18,c:colors[Math.floor(Math.random()*colors.length)]!,p:Math.random()*6.28,s:Math.random()*.7+.35}));};
    const draw=(t:number)=>{ctx.clearRect(0,0,w,h); for(const p of ps){ const wave=Math.sin((p.x/w)*8+t*.00045+p.p)*22+Math.sin((p.x+p.y)*.007-t*.00025)*10; const tide=Math.sin(t*.00022+p.p)*18; const x=(p.x+t*.006*p.s)%w; const y=(p.y+wave+tide+h)%h; const a=p.a*(.65+.35*Math.sin(t*.001+p.p)**2); ctx.shadowBlur=p.r>1.5?8:0;ctx.shadowColor=`rgba(${p.c},${a})`;ctx.fillStyle=`rgba(${p.c},${a})`; ctx.beginPath();ctx.arc(x,y,p.r,0,Math.PI*2);ctx.fill(); } if(!reduce) raf=requestAnimationFrame(draw);};
    resize(); raf=requestAnimationFrame(draw); addEventListener("resize",resize); return()=>{cancelAnimationFrame(raf);removeEventListener("resize",resize)};
  },[]);
  return <div className="pointer-events-none absolute inset-0 overflow-hidden"><div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 74% 38%,rgba(113,101,232,.29),transparent 42%),radial-gradient(ellipse at 65% 90%,rgba(243,201,77,.3),transparent 35%),radial-gradient(ellipse at 28% 34%,rgba(184,174,255,.25),transparent 48%),linear-gradient(180deg,#f8f6ff 0%,#faf8ff 52%,#fffbed 100%)" }}/><canvas ref={ref} className="absolute inset-0 size-full"/><div className="absolute inset-y-0 left-0 w-[46%] bg-gradient-to-r from-background/20 to-transparent"/></div>
}
