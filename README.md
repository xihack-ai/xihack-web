# Hire Loop 前端 Demo

## 页面

- `/`：Hire Loop 首页静态预览，展示产品定位和候选人卡片。
- `/workspace`：真实 LangGraph 工作台，展示「创建任务 → LangGraph 生成 Spec 并暂停 → 人工确认 → 证据/评估 → 反馈 → Proposal interrupt → Accept / Edit / Reject → checkpoint 恢复」。

## 启动

```bash
npm ci
npm run dev
```

访问终端输出的地址，通常是 <http://localhost:3000>；如果端口被占用，Next.js 会选择其他端口。

工作台需要更新后的后端。在 `xihack-service` 的另一个终端执行：

```bash
REPLAY_ONLY=1 .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

前端默认请求 `http://127.0.0.1:8000`，可通过 `.env.local` 中的 `NEXT_PUBLIC_API_BASE` 修改；修改后重启前端。后端默认 CORS 允许 localhost/127.0.0.1 的 3000、3001、3002 端口，其他来源需设置 `CORS_ORIGINS`。`REPLAY_ONLY=1` 仍执行真实 LangGraph，但模型走离线回退，不能当作真实模型效果。

若收到「后端未返回 LangGraph 分步接口合同」，需要重启后端加载新接口。可用任务 ID 或「恢复上次任务」读取当前 checkpoint，不需要重新创建职位。

## LangGraph 联调边界

- `/workspace`、首页和 `/candidates` 均只读取真实 `xihack-service` 返回；项目不包含本地评估引擎或模拟数据文件。
- `POST /jobs` 固定发送 `require_spec_confirmation: true`，后端图在 `spec_confirmation` interrupt 停止；确认前 `evidence=[]`、`evaluations=[]`。
- `POST /calibrations/{job_id}/spec/confirm` 发送人工编辑后的完整标准，后端以 `Command(resume=...)` 恢复并继续证据抽取、校验、评估。
- Feedback 发送到 `POST /calibrations/{job_id}/feedback`；Proposal 出现后，前端通过 approval 接口恢复 `human_approval` 节点。
- 前端展示后端真实的 `workflow.next_nodes`、`completed_nodes`、`waiting_for`、`checkpointer` 和 checkpoint history。
- Accept / Edit / Reject 全部由后端 LangGraph 决定；前端不计算排名、不伪造重算比例、不覆盖后端证据。
- 项目不包含 mock 数据：候选人简历由用户在需求校准页手动输入（每行「姓名｜简历内容」）；标准、证据、评估结果全部以 API 返回为准，无任务时页面展示空状态。
- `memory` checkpointer 适合本地演示，后端重启会丢失；配置 PostgreSQL 后使用 `PostgresSaver`，可跨进程恢复。
- 历史按钮先展示 checkpoint 图轨迹；完整数据库审计仍需要 PostgreSQL。

后端接口合同见 `xihack-service/README.md`，核心调用为 `/jobs`、`/calibrations/{job_id}`、`/spec/confirm`、`/feedback`、`/approval`。

## 检查

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
```
