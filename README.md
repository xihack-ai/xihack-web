# AI软件赛道 - HireSpec Loop - 大秦帝国

在线演示：[HireSpec Loop](http://47.243.206.67/workspace?v=20261004-company#requirement)。后端与完整项目说明见 [xihack-ai/xihack-service](https://github.com/xihack-ai/xihack-service/blob/main/PROJECT.md)。团队演示用户名 `demo`，口令由团队另行提供，访问网站无需 clone 或自行配置模型密钥。

创建前需求澄清：先逐题回答，再生成待确认的标准草稿；公司名单和必须／加分类型保留到具体标准。新增调用 `POST /requirements/clarify`；创建职位时传递 `clarification_answers`。修改原始需求会清除旧问答。

2026-10-04：反馈审核明确区分待审批、需补充说明与已拦截。工作台支持经理逐题回答（选项或自由输入）、本次问答历史、审核范围说明及编辑原反馈；删除通用能力替换按钮。新增调用 `POST /calibrations/{job_id}/feedback/answer`，提交当前 feedback_id、base_spec_version、answers 和 created_by。回答后仍需审核及人工审批，不直接修改正式标准或排名。

## 页面

- `/`：产品首页；未读取到任务时展示流程演示动画，有任务时展示后端候选人评估。
- `/workspace`：需求校准、招聘标准（当前标准/版本记录）、候选人、反馈与审批四个视图。
- `/candidates`：带统一侧栏的候选人证据页，读取浏览器保存的任务引用，不回退到模拟评估数据。

## 启动

```bash
npm ci
npm run dev
```

访问终端输出的地址，通常是 <http://localhost:3000>；如果端口被占用，Next.js 会选择其他端口。

工作台需要更新后的后端。在 `xihack-service` 的另一个终端执行：

```bash
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

前端默认请求 `http://127.0.0.1:8000`，可通过 `.env.local` 中的 `NEXT_PUBLIC_API_BASE` 修改；修改后重启前端。后端默认 CORS 允许 localhost/127.0.0.1 的 3000、3001、3002 端口，其他来源需设置 `CORS_ORIGINS`。`REPLAY_ONLY=1` 仍执行真实 LangGraph，但模型走离线回退，不能当作真实模型效果。

若收到「后端未返回 LangGraph 分步接口合同」，需要核对并重启后端。首页和候选人页通过浏览器保存的任务 ID 自动读取 checkpoint；工作台当前任务可点击「刷新 checkpoint」。工作台已删除手动输入 job_id 与「恢复上次任务」入口。

前端 `.env.local` 示例：

```dotenv
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8000
```

模型密钥只能配置在后端 `.env`，不能放在前端 `NEXT_PUBLIC_*` 变量中。前端不直接调用外部模型 API；模型服务配置与调用方式见后端 README。

## 前端调用的 API

前端通过 `NEXT_PUBLIC_API_BASE` 指向后端，默认值为 `http://127.0.0.1:8000`。请求使用 JSON，写请求统一设置 `Content-Type: application/json`，读取任务时使用 `cache: no-store`。

| 页面/功能 | 方法 | 路径 | 调用时机 |
|---|---|---|---|
| 需求校准 | `POST` | `/jobs` | 提交职位名称、招聘需求和候选人简历 |
| 首页、候选人页、工作台刷新 | `GET` | `/calibrations/{job_id}` | 根据浏览器保存的 `job_id` 读取真实 checkpoint |
| 招聘标准 | `POST` | `/calibrations/{job_id}/spec/confirm` | 人工确认或编辑初始标准 |
| 反馈与审批 | `POST` | `/calibrations/{job_id}/feedback` | 提交经理反馈 |
| 反馈与审批 | `POST` | `/calibrations/{job_id}/approval` | 接受、编辑或拒绝变更提案 |
| 招聘标准 / 版本记录 | `GET` | `/calibrations/{job_id}/history` | 加载数据库审计；未配置 PostgreSQL 时返回 `503` |

辅助排查可调用 `GET /health`；当前前端页面没有自动调用该健康检查接口。当前前端也未接入后端独立的 `/api/hiring/*` 接口。

以下 curl 示例采用 macOS/Linux shell 语法。请将 `JOB_ID` 替换为创建响应中的任务 ID，按顺序执行；接口地址不带外部模型服务的 `/v1` 前缀。

### 1. 创建校准任务

前端在需求校准页收集候选人，格式为每行 `姓名｜简历内容`，转换为后端需要的 `name` 和 `resume_text`：

```bash
curl -X POST http://127.0.0.1:8000/jobs \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "后端工程师",
    "requirement": "招聘一名负责核心服务的后端工程师。",
    "candidates": [
      {"name": "候选人姓名", "resume_text": "候选人简历原文"}
    ],
    "require_spec_confirmation": true
  }'
```

`require_spec_confirmation: true` 时，响应状态为 `AWAITING_SPEC_CONFIRMATION`，`workflow.waiting_for` 为 `spec_confirmation`；此时不会抽取证据，也不会评估候选人。

### 2. 读取 checkpoint

```bash
curl http://127.0.0.1:8000/calibrations/JOB_ID
```

前端使用的关键响应字段：

- `criteria`：后端生成的招聘标准。
- `clarified_requirement`、`clarification_questions`：后端 clarify 节点生成的澄清结果。
- `evaluations`、`evidence`：候选人评估和经过校验的简历证据。
- `change_proposal`、`risk_flags`：反馈后的提案或风险拦截。
- `workflow.next_nodes`、`workflow.completed_nodes`、`workflow.waiting_for`：当前 LangGraph checkpoint 状态。
- `workflow.model_mode`：`live` 或 `offline_fallback`。

### 3. 确认或编辑招聘标准

```bash
curl -X POST http://127.0.0.1:8000/calibrations/JOB_ID/spec/confirm \
  -H 'Content-Type: application/json' \
  -d '{
    "criteria": [
      {"id": "C1", "type": "MUST_HAVE", "text": "核心服务开发经验", "weight": 3},
      {"id": "C2", "type": "NICE_TO_HAVE", "text": "带团队经验", "weight": 2}
    ]
  }'
```

确认成功后，后端继续执行 `extract_evidence → validate_evidence → evaluate`，前端转到候选人评估视图。

### 4. 提交反馈并处理提案

```bash
curl -X POST http://127.0.0.1:8000/calibrations/JOB_ID/feedback \
  -H 'Content-Type: application/json' \
  -d '{"text": "更看重团队管理经验。", "created_by": "manager"}'
```

生成提案后，使用以下接口处理：

```bash
# 接受
curl -X POST http://127.0.0.1:8000/calibrations/JOB_ID/approval \
  -H 'Content-Type: application/json' \
  -d '{"action": "accept", "decided_by": "manager"}'

# 编辑后接受：criteria 必须传完整标准集
curl -X POST http://127.0.0.1:8000/calibrations/JOB_ID/approval \
  -H 'Content-Type: application/json' \
  -d '{"action": "edit", "decided_by": "manager", "criteria": [{"id": "C1", "type": "MUST_HAVE", "text": "核心服务开发经验", "weight": 3}]}'

# 拒绝
curl -X POST http://127.0.0.1:8000/calibrations/JOB_ID/approval \
  -H 'Content-Type: application/json' \
  -d '{"action": "reject", "decided_by": "manager"}'
```

反馈状态：`AWAITING_APPROVAL` 表示存在待审批提案；风险反馈不会生成提案；接受或编辑后后端执行选择性重评，拒绝后标准和评估保持不变。

### 5. 查询版本历史

```bash
curl http://127.0.0.1:8000/calibrations/JOB_ID/history
```

响应结构为 `{job_id, spec_versions, feedback, proposals, audit}`。此接口需要 PostgreSQL；未配置数据库时返回 `503`，不会返回演示历史。

### 前端错误处理

- `409 SPEC_CONFIRMATION_REQUIRED`：先调用 `/spec/confirm`，不能直接提交反馈。
- `409`：当前已有提案待审批，先调用 `/approval`。
- `422`：标准字段、类型、ID 或风险校验失败。
- `503`：数据库历史不可用或相关依赖未配置。主流程模型请求失败可能自动 fallback，不能仅凭 HTTP `200` 或配置模式 `live` 判断实际模型调用成功。

## LangGraph 联调边界

- 工作台、首页任务卡片和候选人页的业务数据来自 `xihack-service`，不使用本地模拟评估引擎。首页流程动画是独立的展示内容，不代表真实任务结果。
- `POST /jobs` 固定发送 `require_spec_confirmation: true`，后端图在 `spec_confirmation` interrupt 停止；确认前 `evidence=[]`、`evaluations=[]`。
- `POST /calibrations/{job_id}/spec/confirm` 发送人工编辑后的完整标准，后端以 `Command(resume=...)` 恢复并继续证据抽取、校验、评估。
- Feedback 发送到 `POST /calibrations/{job_id}/feedback`；Proposal 出现后，前端通过 approval 接口恢复 `human_approval` 节点。
- 前端展示后端真实的 `workflow.next_nodes`、`completed_nodes`、`waiting_for`、`checkpointer` 和 checkpoint history。
- Accept / Edit / Reject 的标准应用和候选人重评由后端执行，前端不覆盖排名或证据。提案卡的重评单元格数目前按标准变更数 × 候选人数估算，不是后端实际执行统计。
- 候选人简历由用户在需求校准页手动输入（每行「姓名｜简历内容」）；标准、证据、评估结果以 API 返回为准。首页无任务时显示演示动画，候选人页无任务时显示空状态。
- `memory` checkpointer 适合本地演示，后端重启会丢失；配置 PostgreSQL 后使用 `PostgresSaver`，可跨进程恢复。
- 「招聘标准 → 版本记录」目前使用 checkpoint 版本信息与本会话快照。数据库历史接口返回对象 `{job_id,spec_versions,feedback,proposals,audit}`；现有时间线组件仅按数组提取审计项，完整历史字段和跨会话快照映射尚需完善。
- 前端目前将无提案且无风险的反馈归为「需要澄清」，尚不能准确区分所有「无变更」情况。

后端接口合同见 [xihack-service README](../xihack-service/README.md)。标准确认、反馈、审批和历史查询均位于 `/calibrations/{job_id}/` 路径下，不是独立的顶层 `/spec/confirm`、`/feedback` 或 `/approval` 接口。

## 检查

```bash
npm run lint
npx tsc --noEmit --incremental false
npm run build
node --test app/workspace/api.test.mjs
```

## 候选人批量上传

创建职位后，进入 `/candidates`，多选或拖拽 PDF、DOC、DOCX、RTF，点击「上传并解析」。页面逐文件显示成功、重复或失败，候选人详情可查看解析原文。标准确认后点击「开始评估」，进度按候选人更新，已完成结果保留；「暂停评估」会在当前简历完成后暂停，之后可继续剩余简历。返回工作台时会读取当前职位，支持继续确认标准和提交反馈。

文件解析使用后端 AnyDoc，不需要在前端配置密钥。扫描版 PDF 暂不支持 OCR。每次最多 50 份，单份不超过 10 MiB，总计不超过 50 MiB；前后端都有检查。

同时运行独立预览时，可设置 `HIRESPEC_BUILD_DIR=.next-upload` 隔离构建目录，并用 `NEXT_PUBLIC_API_BASE` 指向对应后端。额外前端端口需要加入后端 `CORS_ORIGINS`。
