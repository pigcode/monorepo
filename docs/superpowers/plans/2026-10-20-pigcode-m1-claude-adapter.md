# Pigcode M1 Claude Code Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M0 的 fake provider 替换为真实 Claude Code adapter：检测已安装 CLI、流式驱动真实会话、持久化工具调用与用量、把审批请求送到 UI 并回传、支持中断与恢复，并保留 replay fixture 让 CI 不依赖真实账号。

**Architecture:** Host 通过官方 `@anthropic-ai/claude-agent-sdk` 的 `query()` 驱动已安装的 Claude Code CLI；SDK 负责进程、stream-json、权限回调和 resume。Host 把 SDK 消息规范化为 `ProviderEvent`，再写成线程事件；`canUseTool` 通过 `ProviderRuntime.requestApproval()` 变成持久化的 `approval.requested`，UI 的决议经 RPC 回到同一个等待中的 Promise。真实 Claude 只在显式环境变量下跑冒烟测试，单测全部使用 replay fixture。

**Tech Stack:** TypeScript 5.9、Node 22+、`@anthropic-ai/claude-agent-sdk@0.3.304`、better-sqlite3 13、Zod 4、Vitest 4、Playwright 1.64.1。

## Global Constraints

- Node `>=22`，`pnpm@10.28.2`；所有包 ESM，包名 `@pigcode/*`。
- TypeScript `strict`；禁止 `any`、`@ts-ignore`、`@ts-expect-error`；每个文件 ≤500 行；中文注释。
- 不实现自研 agent loop；Claude 的执行与工具循环由 Claude Code CLI 负责。
- 检测只读：`claude --version` 与 `claude auth status`；绝不触发登录、绝不读取凭据文件。
- 一个 thread 同时最多一个活跃 run；重复 `run.start` 返回 `RUN_ALREADY_ACTIVE`。
- 所有模型可见事实写入 `thread_events`；`message.delta` 只走实时通道。
- 审批请求必须持久化到 `pending_requests`；Host 重启后把未完成请求标记为 `orphaned`，不能静默丢弃。
- Claude 的 questions 在 M1 标记为 `questions: false`；`AskUserQuestion` 暂不支持可视化回答，遇到时返回明确错误。M2/M5 再补。
- 真实 Claude 冒烟测试只在 `PIGCODE_REAL_CLAUDE=1` 时运行；默认单测使用 replay fixture。
- 不引入新的 HTTP/WebSocket/token；仍使用 MessagePort RPC。
- 提交使用 Conventional Commits；每个任务先写失败测试。

---

## File Structure

```text
frontend/
  packages/contracts/src/
    domain.ts                     # ProviderSession、PendingRequest、RunStatus
    events.ts                     # tool/usage/session/run.interrupted 事件
    commands.ts                   # provider.detect、run.respondApproval、run.answerQuestion
  apps/host/src/
    storage/migrations.ts         # migration 2：provider_sessions、pending_requests
    storage/pending-request-store.ts
    storage/run-store.ts
    providers/driver.ts           # ProviderRuntime 扩展
    providers/registry.ts         # run 生命周期、provider session、审批路由
    providers/fake.ts             # 适配新 runtime 契约
    providers/claude/detect.ts    # 只读检测与 auth status
    providers/claude/normalize.ts # SDKMessage -> ProviderEvent
    providers/claude/driver.ts    # Claude Agent SDK adapter
    providers/claude/fixtures/*.jsonl
    rpc/server.ts                 # provider.*、run.respondApproval、run.answerQuestion
  packages/ui-chat/src/
    approval-card.tsx             # 已存在，补 waiting/decision 状态
  apps/desktop/src/renderer/src/
    app.tsx                       # onApproval 接线、provider 状态
  packages/ui-settings/src/
    provider-page.tsx             # 真实 Claude 检测状态
  scripts/
    real-claude-smoke.mjs         # 显式真实冒烟
  apps/desktop/e2e/
    m1-real-claude.spec.ts        # PIGCODE_REAL_CLAUDE=1 时运行
```

---

### Task 1: Contracts, Migration, and Provider Commands

**Files:**
- Modify: `frontend/packages/contracts/src/domain.ts`
- Modify: `frontend/packages/contracts/src/events.ts`
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/storage/migrations.ts`
- Create: `frontend/apps/host/src/storage/pending-request-store.ts`
- Create: `frontend/apps/host/src/storage/run-store.ts`
- Test: `frontend/apps/host/src/storage/migration-v2.test.ts`

**Interfaces:**
- Consumes: M0 的 contracts 与 SQLite storage。
- Produces: `ProviderSession`、`PendingRequest`、`provider_sessions`/`pending_requests` 表、`run.interrupted`/`session.started`/`tool.*`/`usage.updated` 事件、`provider.detect`/`run.respondApproval` 命令。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/storage/migration-v2.test.ts`：

```ts
/** 验证 migration 2 创建 provider_sessions 与 pending_requests。 */
import { describe, expect, it } from "vitest"
import { openDatabase } from "./database"

describe("migration v2", () => {
  it("creates provider session and pending request tables", () => {
    const db = openDatabase(":memory:")
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as Array<{ name: string }>
    const names = tables.map((row) => row.name)
    expect(names).toContain("provider_sessions")
    expect(names).toContain("pending_requests")
    expect(db.pragma("user_version", { simple: true })).toBe(2)
    db.close()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/storage/migration-v2.test.ts`
Expected: FAIL，表不存在或 user_version 为 1。

- [ ] **Step 3: 添加 contracts 与 migration**

`packages/contracts/src/domain.ts` 增加：

```ts
/** 一个 provider 原生会话的持久记录。 */
export const providerSessionSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  providerId: z.string().min(1),
  nativeSessionId: z.string().nullable(),
  cwd: z.string().min(1),
  status: z.enum(["active", "stopped", "orphaned"]),
  createdAt: z.string().datetime(),
  stoppedAt: z.string().datetime().nullable(),
})

/** 待审批/待回答请求的持久状态。 */
export const pendingRequestSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  kind: z.enum(["approval", "question"]),
  providerRequestId: z.string().nullable(),
  payload: z.unknown(),
  status: z.enum(["pending", "resolved", "orphaned"]),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
})

export type ProviderSession = z.infer<typeof providerSessionSchema>
export type PendingRequest = z.infer<typeof pendingRequestSchema>
```

`packages/contracts/src/events.ts` 增加事件类型：

```ts
"session.started",
"run.interrupted",
"usage.updated",
```

以及 provider 事件：

```ts
z.object({ type: z.literal("session.started"), nativeSessionId: z.string() }),
z.object({ type: z.literal("tool.started"), toolCallId: z.string(), name: z.string(), input: z.unknown() }),
z.object({ type: z.literal("tool.completed"), toolCallId: z.string(), name: z.string(), output: z.unknown(), isError: z.boolean() }),
z.object({ type: z.literal("usage.updated"), usage: z.unknown() }),
```

`packages/contracts/src/commands.ts` 增加：

```ts
"provider.detect": z.object({}),
"provider.list": z.object({}),
"run.respondApproval": z.object({
  threadId: z.string().min(1),
  runId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(["allow-once", "allow-for-session", "deny"]),
}),
"run.answerQuestion": z.object({
  threadId: z.string().min(1),
  runId: z.string().min(1),
  requestId: z.string().min(1),
  answers: z.array(z.string()),
}),
```

`apps/host/src/storage/migrations.ts` 追加第二段 migration：

```ts
`
CREATE TABLE IF NOT EXISTS provider_sessions (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  provider_id TEXT NOT NULL,
  native_session_id TEXT,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  stopped_at TEXT
);

CREATE TABLE IF NOT EXISTS pending_requests (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL,
  provider_request_id TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_requests_thread_status
  ON pending_requests(thread_id, status);
`,
```

`apps/host/src/storage/pending-request-store.ts`：

```ts
/** 持久化待审批请求；Host 重启时统一标记 orphaned。 */
import type { PendingRequest } from "@pigcode/contracts"
import type { PigcodeDatabase } from "./database"

export class PendingRequestStore {
  constructor(private readonly db: PigcodeDatabase) {}

  create(input: Omit<PendingRequest, "status" | "resolvedAt">): PendingRequest {
    const request: PendingRequest = { ...input, status: "pending", resolvedAt: null }
    this.db
      .prepare(
        `INSERT INTO pending_requests
         (id, thread_id, run_id, kind, provider_request_id, payload_json, status, created_at, resolved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        request.id,
        request.threadId,
        request.runId,
        request.kind,
        request.providerRequestId,
        JSON.stringify(request.payload),
        request.status,
        request.createdAt,
        request.resolvedAt,
      )
    return request
  }

  resolve(id: string): void {
    this.db
      .prepare(`UPDATE pending_requests SET status = 'resolved', resolved_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id)
  }

  orphanAll(): number {
    return this.db
      .prepare(`UPDATE pending_requests SET status = 'orphaned', resolved_at = ? WHERE status = 'pending'`)
      .run(new Date().toISOString()).changes
  }

  listPending(threadId: string): PendingRequest[] {
    const rows = this.db
      .prepare(`SELECT * FROM pending_requests WHERE thread_id = ? AND status = 'pending' ORDER BY created_at ASC`)
      .all(threadId) as Array<Record<string, string | null>>
    return rows.map((row) => ({
      id: row.id!,
      threadId: row.thread_id!,
      runId: row.run_id!,
      kind: row.kind as PendingRequest["kind"],
      providerRequestId: row.provider_request_id,
      payload: JSON.parse(row.payload_json!),
      status: row.status as PendingRequest["status"],
      createdAt: row.created_at!,
      resolvedAt: row.resolved_at,
    }))
  }
}
```

`apps/host/src/storage/run-store.ts`：

```ts
/** 创建并更新 run 行；状态变化与事件写入保持同步调用。 */
import type { PigcodeDatabase } from "./database"
import type { RunStatus } from "@pigcode/contracts"

export class RunStore {
  constructor(private readonly db: PigcodeDatabase) {}

  create(input: {
    id: string
    threadId: string
    providerSessionId: string
    status: RunStatus
    startedAt: string
  }): void {
    this.db
      .prepare(
        `INSERT INTO runs (id, thread_id, provider_session_id, status, started_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(input.id, input.threadId, input.providerSessionId, input.status, input.startedAt)
  }

  setStatus(runId: string, status: RunStatus, error?: { code: string; message: string }): void {
    this.db
      .prepare(
        `UPDATE runs SET status = ?, completed_at = ?, error_code = ?, error_message = ?
         WHERE id = ?`,
      )
      .run(
        status,
        status === "running" || status === "waiting-approval" ? null : new Date().toISOString(),
        error?.code ?? null,
        error?.message ?? null,
        runId,
      )
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/storage/migration-v2.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts apps/host/src/storage
git commit -m "feat(host): add provider sessions and pending request storage"
```

---

### Task 2: Provider Runtime Contract and Run Lifecycle

**Files:**
- Modify: `frontend/apps/host/src/providers/driver.ts`
- Modify: `frontend/apps/host/src/providers/fake.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Test: `frontend/apps/host/src/providers/registry.test.ts`

**Interfaces:**
- Consumes: Task 1 的 store 与事件。
- Produces: `ProviderRuntime`、`providers.startRun()` 返回 `{ runId, done }`、`providers.respondApproval()`、run 状态迁移。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证 startRun 写入 user/run 事件、驱动 fake provider 并完成 run。 */
import { Context } from "cordis"
import { describe, expect, it } from "vitest"
import { apply as projects } from "../services/projects"
import { apply as sessions } from "../services/sessions"
import { apply as storage } from "../services/storage"
import { apply as threads } from "../services/threads"
import { apply as providers } from "./registry"

async function setup() {
  const ctx = new Context()
  await ctx.plugin(storage, { path: ":memory:" })
  await ctx.plugin(projects)
  await ctx.plugin(threads)
  await ctx.plugin(sessions)
  await ctx.plugin(providers)
  const project = ctx.projects.add("/tmp/pigcode-m1")
  const thread = ctx.threads.create(project.id, "M1", "fake")
  return { ctx, thread }
}

describe("providers.startRun", () => {
  it("persists the user message and completes the run", async () => {
    const { ctx, thread } = await setup()
    const { runId, done } = await ctx.providers.startRun(thread.id, "hello")
    await done
    const events = ctx.sessions.read(thread.id, 0)
    expect(events.some((event) => event.type === "message.completed" && event.payload?.role === "user")).toBe(true)
    expect(events.some((event) => event.type === "run.completed")).toBe(true)
    expect(ctx.providers.getRunStatus(runId)).toBe("completed")
    await ctx.fiber.dispose()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/registry.test.ts`
Expected: FAIL，`startRun` 仍返回 `{ runId }`，`getRunStatus` 不存在。

- [ ] **Step 3: 扩展 driver 与 registry**

`providers/driver.ts`：

```ts
/** 审批决议；UI 只提交这三种。 */
export type ApprovalDecision = "allow-once" | "allow-for-session" | "deny"

export interface ApprovalRequest {
  toolName: string
  input: unknown
  title?: string
  displayName?: string
  description?: string
  blockedPath?: string
  suggestions?: unknown
}

export interface ProviderRuntime {
  signal: AbortSignal
  emit(event: ProviderEvent): void
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>
}
```

同时扩展会话输入/句柄：

```ts
export interface ProviderSessionHandle {
  id: string
  threadId: string
  cwd: string
  nativeSessionId: string | null
  permissionMode: string
  model: string | null
}

export interface CreateSessionInput {
  threadId: string
  cwd: string
  nativeSessionId?: string | null
  permissionMode?: string
  model?: string | null
}
```

`send(session, input, runtime)` 替代原来的 `emit` 参数。

`providers/registry.ts`：

- `inject = ["threads", "sessions", "storage"]`.
- `ProvisionSessionStore`/`RunStore`/`PendingRequestStore` 从 `ctx.storage.db` 构造。
- `startRun`：
  1. 检查该 thread 是否有活跃 run，有则抛 `RUN_ALREADY_ACTIVE`。
  2. 创建 runId、run 行、provider session 行。
  3. 追加 `message.completed`（role user）与 `run.started`。
  4. 异步执行 `driver.send(...)`；把 `providerEvent` 映射为 thread event。
  5. 维护 `activeRuns: Map<runId, { controller, done }>`。
  6. 返回 `{ runId, done }`。
- `rpc/server.ts` 的 `run.start` 改为 `const { runId } = await this.ctx.providers.startRun(...); return { runId }`；`run.interrupt` 改为调用 `this.ctx.providers.cancelRun(runId)`。
- `respondApproval(threadId, runId, requestId, decision)`：查找 pending 请求的 resolver，resolve，追加 `approval.resolved`，更新 run 状态。
- `getRunStatus(runId)`：从 `activeRuns` 或 runs 表读取。
- `cancelRun(runId)`：abort controller。
- 把 `tool.started`/`tool.completed`/`usage.updated`/`message.completed`/`run.completed`/`run.failed` 写成事件。
- `run.started` 的 payload 包含 `providerId`、`providerSessionId`。

FakeProviderDriver 适配：
```ts
async send(_session, _input, runtime) {
  runtime.emit({ type: "run.started" })
  runtime.emit({ type: "message.delta", text: "Hello" })
  ...
  runtime.emit({ type: "message.completed", text: "Hello from fake provider" })
  runtime.emit({ type: "run.completed" })
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/registry.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers
git commit -m "feat(host): add provider runtime and run lifecycle"
```

---

### Task 3: Claude Detection and Auth Status

**Files:**
- Create: `frontend/apps/host/src/providers/claude/detect.ts`
- Create: `frontend/apps/host/src/providers/claude/detect.test.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`

**Interfaces:**
- Consumes: `node:child_process`、`claude --version`、`claude auth status`。
- Produces: `detectClaude()` 返回 `{ installed, version, loggedIn, authMethod, subscriptionType }`。

- [ ] **Step 1: 写失败测试**

```ts
/** 用 fixture 脚本验证检测解析，不依赖真实账号。 */
import { mkdtemp, writeFile, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { detectClaude } from "./detect"

describe("detectClaude", () => {
  it("parses version and auth status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pigcode-claude-"))
    const bin = join(dir, "claude")
    await writeFile(
      bin,
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo "2.1.304 (Claude Code)"; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  echo '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}'; exit 0
fi
exit 1
`,
    )
    await chmod(bin, 0o755)
    const result = await detectClaude({ command: bin })
    expect(result.installed).toBe(true)
    expect(result.version).toContain("2.1.304")
    expect(result.loggedIn).toBe(true)
    expect(result.subscriptionType).toBe("pro")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/detect.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 detect**

`detect.ts`：

```ts
/** 只读检测 Claude Code：版本与 auth status，不触发登录。 */
import { execFile } from "node:child_process"
import { homedir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)

export interface ClaudeDetection {
  installed: boolean
  command: string
  version: string | null
  loggedIn: boolean
  authMethod: string | null
  subscriptionType: string | null
  error: string | null
}

/** 运行两个只读命令；超时或非零退出都归为未安装/未登录。 */
export async function detectClaude(options: { command?: string } = {}): Promise<ClaudeDetection> {
  const candidates = options.command
    ? [options.command]
    : [
        "claude",
        join(homedir(), ".bun/bin/claude"),
        "/opt/homebrew/bin/claude",
        "/usr/local/bin/claude",
      ]
  for (const command of candidates) {
    const detection = await probe(command)
    if (detection.installed) return detection
  }
  return {
    installed: false,
    command: options.command ?? "claude",
    version: null,
    loggedIn: false,
    authMethod: null,
    subscriptionType: null,
    error: "claude executable not found",
  }
}

async function probe(command: string): Promise<ClaudeDetection> {
  const base: ClaudeDetection = {
    installed: false,
    command,
    version: null,
    loggedIn: false,
    authMethod: null,
    subscriptionType: null,
    error: null,
  }
  try {
    const version = await exec(command, ["--version"], { timeout: 5000 })
    base.installed = true
    base.version = version.stdout.trim()
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error)
    return base
  }
  try {
    const status = await exec(command, ["auth", "status"], { timeout: 5000 })
    const parsed = JSON.parse(status.stdout) as {
      loggedIn?: boolean
      authMethod?: string
      subscriptionType?: string
    }
    base.loggedIn = parsed.loggedIn === true
    base.authMethod = parsed.authMethod ?? null
    base.subscriptionType = parsed.subscriptionType ?? null
  } catch (error) {
    base.error = error instanceof Error ? error.message : String(error)
  }
  return base
}
```

`registry.ts` 增加 `detect()` 方法，返回 `{ claude: ClaudeDetection, fake: { installed: true } }`；`rpc/server.ts` 增加 `provider.detect` 与 `provider.list` 分支。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/detect.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/claude apps/host/src/providers/registry.ts apps/host/src/rpc/server.ts
git commit -m "feat(claude): add read-only detection and auth status"
```

---

### Task 4: Claude SDK Adapter and Message Normalization

**Files:**
- Modify: `frontend/apps/host/package.json`
- Create: `frontend/apps/host/src/providers/claude/normalize.ts`
- Create: `frontend/apps/host/src/providers/claude/driver.ts`
- Create: `frontend/apps/host/src/providers/claude/fixtures/simple.jsonl`
- Test: `frontend/apps/host/src/providers/claude/normalize.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/claude-agent-sdk` 的 `SDKMessage`、`Options`、`Query`。
- Produces: `ClaudeDriver`、`normalizeSdkMessage()`。

- [ ] **Step 1: 写失败测试**

`normalize.test.ts` 用 fixture 验证：
- `stream_event` text_delta -> `message.delta`。
- `assistant` tool_use -> `tool.started`。
- `user` tool_result -> `tool.completed`。
- `result` -> `usage.updated` + `run.completed`。

```ts
import { describe, expect, it } from "vitest"
import { normalizeSdkMessage } from "./normalize"

describe("normalizeSdkMessage", () => {
  it("maps text deltas", () => {
    const events = normalizeSdkMessage({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "OK" } },
      session_id: "s1",
      uuid: "u1",
    } as never)
    expect(events).toContainEqual({ type: "message.delta", text: "OK" })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/normalize.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 安装 SDK 并实现 normalizer/driver**

`apps/host/package.json` 增加 `"@anthropic-ai/claude-agent-sdk": "0.3.304"`，运行 `pnpm --dir frontend install`。

`normalize.ts`：

```ts
/** 把 Claude Agent SDK 消息映射为 Pigcode 规范化事件。 */
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { ProviderEvent } from "@pigcode/contracts"

export interface NormalizeState {
  streamedText: string
  toolNames: Map<string, string>
}

export function createNormalizeState(): NormalizeState {
  return { streamedText: "", toolNames: new Map() }
}

/** 一条 SDK 消息可能产生零到多个事件。 */
export function normalizeSdkMessage(message: SDKMessage, state: NormalizeState): ProviderEvent[] {
  const events: ProviderEvent[] = []
  if (message.type === "system" && message.subtype === "init") {
    events.push({ type: "session.started", nativeSessionId: message.session_id })
    return events
  }
  if (message.type === "stream_event") {
    const event = message.event
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      state.streamedText += event.delta.text
      events.push({ type: "message.delta", text: event.delta.text })
    }
    return events
  }
  if (message.type === "assistant") {
    for (const block of message.message.content) {
      if (block.type === "tool_use") {
        state.toolNames.set(block.id, block.name)
        events.push({ type: "tool.started", toolCallId: block.id, name: block.name, input: block.input })
      }
    }
    return events
  }
  if (message.type === "user") {
    for (const block of message.message.content) {
      if (typeof block === "object" && block !== null && block.type === "tool_result") {
        events.push({
          type: "tool.completed",
          toolCallId: block.tool_use_id,
          name: state.toolNames.get(block.tool_use_id) ?? "tool",
          output: block.content,
          isError: block.is_error === true,
        })
      }
    }
    return events
  }
  if (message.type === "result") {
    if (message.is_error) {
      events.push({ type: "run.failed", message: message.subtype })
    } else {
      if (message.result.trim().length > 0) {
        events.push({ type: "message.completed", text: message.result })
      }
      events.push({ type: "usage.updated", usage: { modelUsage: message.modelUsage, totalCostUsd: message.total_cost_usd } })
      events.push({ type: "run.completed" })
    }
  }
  return events
}
```

`driver.ts`：

```ts
/** Claude Code adapter；SDK 负责进程、流式与权限回调。 */
import { query, type Options, type PermissionUpdate, type Query } from "@anthropic-ai/claude-agent-sdk"
import type { ProviderCapabilities } from "@pigcode/contracts"
import type { ApprovalDecision, ProviderDriver, ProviderRuntime, ProviderSessionHandle } from "../driver"
import { createNormalizeState, normalizeSdkMessage } from "./normalize"

export type ClaudeQueryFn = (params: { prompt: string; options: Options }) => Query

export interface ClaudeDriverOptions {
  queryFn?: ClaudeQueryFn
  executable?: string
}

export class ClaudeDriver implements ProviderDriver {
  readonly id = "claude"
  readonly displayName = "Claude Code"
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    approvals: true,
    questions: false,
    plan: true,
    resume: true,
    fork: false,
    rollback: false,
    checkpoint: false,
    subagents: true,
    mcp: true,
    images: true,
    usage: true,
    modelCatalog: true,
    nativeSessionId: true,
  }

  private readonly queryFn: ClaudeQueryFn
  private readonly executable: string | undefined

  constructor(options: ClaudeDriverOptions = {}) {
    this.queryFn = options.queryFn ?? query
    this.executable = options.executable
  }

  async createSession(input: { threadId: string; cwd: string; nativeSessionId?: string | null; permissionMode?: string; model?: string | null }): Promise<ProviderSessionHandle> {
    return {
      id: `claude_${crypto.randomUUID()}`,
      threadId: input.threadId,
      cwd: input.cwd,
      nativeSessionId: input.nativeSessionId ?? null,
      permissionMode: input.permissionMode ?? "workspace-write",
      model: input.model ?? null,
    }
  }
      permissionMode: input.permissionMode ?? "workspace-write",
    }
  }

  async send(session: ProviderSessionHandle, input: { text: string }, runtime: ProviderRuntime): Promise<void> {
    const state = createNormalizeState()
    const queryStream = this.queryFn({
      prompt: input.text,
      options: {
        cwd: session.cwd,
        resume: session.nativeSessionId ?? undefined,
        includePartialMessages: true,
        ...(this.executable ? { pathToClaudeCodeExecutable: this.executable } : {}),
        permissionMode: mapPermissionMode(session.permissionMode),
        ...(session.permissionMode === "danger-full-access" ? { allowDangerouslySkipPermissions: true } : {}),
        canUseTool: async (toolName, toolInput, options) => {
          const decision = await runtime.requestApproval({
            toolName,
            input: toolInput,
            title: options.title,
            displayName: options.displayName,
            description: options.description,
            blockedPath: options.blockedPath,
            suggestions: options.suggestions,
          })
          return toPermissionResult(decision, toolName, options.suggestions)
        },
      },
    })
    try {
      for await (const message of queryStream) {
        for (const event of normalizeSdkMessage(message, state)) runtime.emit(event)
      }
    } catch (error) {
      runtime.emit({ type: "run.failed", message: error instanceof Error ? error.message : String(error) })
    }
  }

  async interrupt(session: ProviderSessionHandle): Promise<void> {}

  async dispose(session: ProviderSessionHandle): Promise<void> {}
}

function mapPermissionMode(mode: string): Options["permissionMode"] {
  switch (mode) {
    case "read-only":
      return "plan"
    case "danger-full-access":
      return "bypassPermissions"
    case "plan":
      return "plan"
    default:
      return "default"
  }
}

function toPermissionResult(
  decision: ApprovalDecision,
  toolName: string,
  suggestions: PermissionUpdate[] | undefined,
): { behavior: "allow"; updatedPermissions?: PermissionUpdate[] } | { behavior: "deny"; message: string } {
  if (decision === "deny") return { behavior: "deny", message: "用户拒绝了这次工具调用" }
  if (decision === "allow-for-session") {
    return {
      behavior: "allow",
      updatedPermissions: suggestions ?? [
        { type: "addRules", rules: [{ toolName }], behavior: "allow", destination: "session" },
      ],
    }
  }
  return { behavior: "allow" }
}
```

> SDK 的类型对 `updatedPermissions` 有精确联合类型；实现时按 `PermissionUpdate[]` 断言，禁止使用 `any`。`interrupt` 需要在运行时持有当前 `Query`，在 Task 8 补。

fixture `simple.jsonl` 至少包含：`system/init`、`stream_event` text_delta、`assistant` text、`result` success。测试读取 fixture 并逐行 `normalizeSdkMessage`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/normalize.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/package.json pnpm-lock.yaml apps/host/src/providers/claude
git commit -m "feat(claude): add agent sdk adapter and message normalizer"
```

---

### Task 5: Permission Bridge and Pending Requests

**Files:**
- Create: `frontend/apps/host/src/providers/claude/permissions.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Test: `frontend/apps/host/src/providers/claude/permissions.test.ts`
- Test: `frontend/apps/host/src/rpc/approval.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `PendingRequestStore`、Task 2 的 `ProviderRuntime`。
- Produces: `requestApproval()`、`respondApproval()`；`approval.requested`/`approval.resolved` 事件；run 状态 `waiting-approval`。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证审批请求持久化、RPC 决议与 resolver 完成。 */
import { Context } from "cordis"
import { describe, expect, it } from "vitest"
import { apply as providers } from "../providers/registry"
import { apply as projects } from "../services/projects"
import { apply as sessions } from "../services/sessions"
import { apply as storage } from "../services/storage"
import { apply as threads } from "../services/threads"

describe("approval bridge", () => {
  it("resolves a pending approval", async () => {
    const ctx = new Context()
    await ctx.plugin(storage, { path: ":memory:" })
    await ctx.plugin(projects)
    await ctx.plugin(threads)
    await ctx.plugin(sessions)
    await ctx.plugin(providers)
    const project = ctx.projects.add("/tmp/pigcode-m1")
    const thread = ctx.threads.create(project.id, "M1", "fake")
    ctx.storage.db
      .prepare(
        `INSERT INTO runs (id, thread_id, provider_session_id, status, started_at)
         VALUES (?, ?, ?, 'running', ?)`,
      )
      .run("run-1", thread.id, "ps-1", new Date().toISOString())
    const pending = ctx.providers.requestApproval(thread.id, "run-1", {
      toolName: "Bash",
      input: { command: "echo hi" },
    })
    ctx.providers.respondApproval(thread.id, "run-1", pending.requestId, "allow-once")
    await expect(pending.decision).resolves.toBe("allow-once")
    await ctx.fiber.dispose()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/permissions.test.ts`
Expected: FAIL，方法不存在。

- [ ] **Step 3: 实现审批桥**

`permissions.ts`：

```ts
/** 审批请求的等待表；id 与持久化行一致。 */
import type { ApprovalDecision, ApprovalRequest } from "../driver"

export interface Waiter {
  threadId: string
  runId: string
  resolve(decision: ApprovalDecision): void
  reject(error: Error): void
}

export class ApprovalBridge {
  private readonly waiters = new Map<string, Waiter>()

  wait(id: string, waiter: Waiter): Promise<ApprovalDecision> {
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { ...waiter, resolve, reject })
    })
  }

  resolve(id: string, decision: ApprovalDecision): boolean {
    const waiter = this.waiters.get(id)
    if (!waiter) return false
    this.waiters.delete(id)
    waiter.resolve(decision)
    return true
  }

  rejectAll(error: Error): void {
    for (const waiter of this.waiters.values()) waiter.reject(error)
    this.waiters.clear()
  }
}
```

`registry.ts`：
- `requestApproval(threadId, runId, request)` 生成 `id`，写 `pending_requests` 行，追加 `approval.requested` 事件，设置 run 状态 `waiting-approval`，返回 `{ requestId, decision }`；`decision` 由 `bridge.wait` 完成。
- `respondApproval` 查找 waiter，resolve，`pending.resolve(id)`，追加 `approval.resolved`，run 状态回 `running`。
- `canUseTool` 的 `requestId` 传给 UI；`payload` 包含 toolName、input、title、description、blockedPath、suggestions。
- `rpc/server.ts` 增加 `run.respondApproval` 分支。
- Host 启动时 `pending.orphanAll()`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/permissions.test.ts apps/host/src/rpc/approval.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers apps/host/src/rpc
git commit -m "feat(claude): bridge approvals through pending requests"
```

---

### Task 6: Wire Approvals and Provider Status into the UI

**Files:**
- Modify: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Modify: `frontend/packages/ui-chat/src/chat-view.tsx`
- Modify: `frontend/packages/ui-settings/src/provider-page.tsx`
- Test: `frontend/packages/ui-chat/src/chat-view.test.tsx`
- Test: `frontend/packages/ui-settings/src/provider-page.test.tsx`

**Interfaces:**
- Consumes: `run.respondApproval`、`provider.detect`。
- Produces: 审批按钮提交命令；Provider 页显示 Claude 安装/登录状态。

- [ ] **Step 1: 写失败测试**

在 `chat-view.test.tsx` 增加：

```tsx
it("submits an approval decision", async () => {
  const onApproval = vi.fn()
  render(
    <LocaleProvider locale="zh-CN">
      <ChatView
        thread={thread}
        events={[
          {
            seq: 1,
            threadId: "t1",
            runId: "run_1",
            type: "approval.requested",
            payload: { id: "req-1", title: "允许运行命令吗？", command: "echo hi" },
            schemaVersion: 1,
            createdAt: "2026-10-20T00:00:00.000Z",
          },
        ]}
        onStart={() => {}}
        onInterrupt={() => {}}
        onApproval={onApproval}
      />
    </LocaleProvider>,
  )
  await userEvent.click(screen.getByRole("button", { name: "允许一次" }))
  expect(onApproval).toHaveBeenCalledWith("req-1", "allow-once")
})
```

`provider-page.test.tsx`：

```tsx
/** 验证 Claude 检测状态展示。 */
it("shows the detected Claude status", () => {
  render(
    <LocaleProvider locale="zh-CN">
      <ProviderPage
        detection={{ installed: true, version: "2.1.304", loggedIn: true, authMethod: "claude.ai" }}
        onDetect={async () => {}}
      />
    </LocaleProvider>,
  )
  expect(screen.getByText(/2\.1\.304/)).toBeTruthy()
  expect(screen.getByText(/claude\.ai/)).toBeTruthy()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-chat/src/chat-view.test.tsx packages/ui-settings/src/provider-page.test.tsx`
Expected: FAIL，props/视图缺失。

- [ ] **Step 3: 接线**

`app.tsx` 的 `ChatViewContainer`：
```ts
onApproval={(requestId, decision) => {
  const runId = [...state.events].reverse().find((event) => event.runId !== null)?.runId
  if (!runId || !state.activeThreadId) return
  void deps.connection
    .call("run.respondApproval", {
      threadId: state.activeThreadId,
      runId,
      requestId,
      decision,
    })
    .catch((error: unknown) => deps.store.update({ error: messageOf(error) }))
}}
```
`provider-page.tsx` 接收 `detection`/`onDetect`，显示版本、登录方式、订阅类型；设置页用 `connection.call("provider.detect", {})` 拉取。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-chat/src/chat-view.test.tsx packages/ui-settings/src/provider-page.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/desktop/src/renderer/src/app.tsx packages/ui-chat packages/ui-settings
git commit -m "feat(ui): wire approvals and claude provider status"
```

---

### Task 7: Session Resume and Host Restart Orphans

**Files:**
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Modify: `frontend/apps/host/src/entry.ts`
- Create: `frontend/apps/host/src/providers/claude/session-store.ts`
- Test: `frontend/apps/host/src/providers/resume.test.ts`

**Interfaces:**
- Consumes: `provider_sessions`、`pending_requests`。
- Produces: `createSession` 复用 native session id；Host 启动时 orphan pending 请求、把 running run 标记 interrupted。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证第二次 run 复用 native session id。 */
it("resumes the same native session", async () => {
  const { ctx, thread } = await setup()
  const first = await ctx.providers.startRun(thread.id, "first")
  await first.done
  const second = await ctx.providers.startRun(thread.id, "second")
  await second.done
  const sessions = ctx.providers.listSessions(thread.id)
  expect(sessions).toHaveLength(1)
  expect(sessions[0]?.nativeSessionId).toBe("native-1")
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/resume.test.ts`
Expected: FAIL，重复创建 session 或 native id 为空。

- [ ] **Step 3: 实现 session 复用与 orphan 清理**

- `ProviderSessionStore` 读取 thread 最近一个 `status='active'` 的 session；存在则复用，不存在则插入。
- `ClaudeDriver.createSession` 接收 `nativeSessionId`；`send` 传 `resume`。
- `entry.ts` 在 `createHostApp` 后调用 `ctx.providers.recoverAfterRestart()`：`pending.orphanAll()`，把 `runs.status='running'` 更新为 `interrupted`，把 `provider_sessions.status='active'` 更新为 `orphaned`。
- `thread.subscribe` 的 snapshot 加入 `pendingRequests`（从 `pending_requests` 读取）。
- 测试用 fake driver 模拟 native session id。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/resume.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers apps/host/src/entry.ts
git commit -m "feat(claude): resume native sessions and orphan stale approvals"
```

---

### Task 8: Interrupt, Process Cleanup, and One Active Run

**Files:**
- Modify: `frontend/apps/host/src/providers/claude/driver.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Test: `frontend/apps/host/src/providers/interrupt.test.ts`

**Interfaces:**
- Consumes: `AbortController`、SDK `Query.interrupt()`。
- Produces: `providers.cancelRun()`；`run.interrupted` 事件；Host 退出时 abort 所有活跃 run。

- [ ] **Step 1: 写失败测试**

```ts
it("interrupts an active fake run", async () => {
  const { ctx, thread } = await setup()
  const { runId, done } = await ctx.providers.startRun(thread.id, "long")
  ctx.providers.cancelRun(runId)
  await done
  expect(ctx.providers.getRunStatus(runId)).toBe("interrupted")
  const events = ctx.sessions.read(thread.id, 0)
  expect(events.some((event) => event.type === "run.interrupted")).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/interrupt.test.ts`
Expected: FAIL，`cancelRun`/`run.interrupted` 缺失。

- [ ] **Step 3: 实现**

- `DriverSessionState` 持有 `AbortController` 和当前 `Query`；`ClaudeDriver.send` 在收到 abort 时调用 `queryStream.interrupt()` 并停止消费。
- `ProvidersService.cancelRun(runId)` 触发 controller.abort()；追加 `run.interrupted`；run 状态 `interrupted`。
- `ProvidersService.startRun` 检查 `activeRuns` 中是否已有该 thread 的 run，有则抛 `RUN_ALREADY_ACTIVE`。
- Host 退出时 `providers.cancelAll()`。
- `FakeProviderDriver` 支持 long run（延迟或循环），用于中断测试。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/interrupt.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers
git commit -m "feat(claude): support interrupt and run cleanup"
```

---

### Task 9: Replay Fixtures and Integration Tests

**Files:**
- Create: `frontend/apps/host/src/providers/claude/fixtures/simple.jsonl`
- Create: `frontend/apps/host/src/providers/claude/fixtures/tool-approval.jsonl`
- Create: `frontend/apps/host/src/providers/claude/replay.ts`
- Test: `frontend/apps/host/src/providers/claude/driver.test.ts`

**Interfaces:**
- Consumes: `ClaudeQueryFn` 注入。
- Produces: replay `queryFn`，按 fixture 逐条 yield SDKMessage；测试不依赖真实 CLI。

- [ ] **Step 1: 写失败测试**

```ts
/** 用 replay query 驱动 driver，验证事件顺序与审批。 */
import { describe, expect, it } from "vitest"
import { ClaudeDriver } from "./driver"
import { replayQuery } from "./replay"

describe("ClaudeDriver", () => {
  it("emits deltas, tool events, usage, and completion", async () => {
    const events: string[] = []
    const driver = new ClaudeDriver({ queryFn: replayQuery("fixtures/simple.jsonl") })
    const session = await driver.createSession({ threadId: "t1", cwd: "/tmp" })
    await driver.send(session, { text: "hello" }, {
      signal: new AbortController().signal,
      emit: (event) => events.push(event.type),
      requestApproval: async () => "allow-once",
    })
    expect(events).toContain("message.delta")
    expect(events).toContain("message.completed")
    expect(events).toContain("usage.updated")
    expect(events).toContain("run.completed")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/driver.test.ts`
Expected: FAIL，replay/fixture 缺失。

- [ ] **Step 3: 实现 replay 与 fixtures**

`replay.ts`：

```ts
/** 从 JSONL fixture 回放 SDKMessage。 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk"
import type { Query } from "@anthropic-ai/claude-agent-sdk"
import type { ClaudeQueryFn } from "./driver"

export function replayQuery(file: string): ClaudeQueryFn {
  return () => {
    const path = file.startsWith("/") ? file : join(import.meta.dirname, file)
    const messages = readFileSync(path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SDKMessage)
    return (async function* () {
      for (const message of messages) yield message
    })() as unknown as Query
  }
}
```

fixtures：
- `simple.jsonl`：`system/init`、`stream_event` text_delta "OK"、`assistant` text "OK"、`result` success with `modelUsage`/`total_cost_usd`。
- `tool-approval.jsonl`：`assistant` tool_use "Bash"、`user` tool_result "hi"、`result` success。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/driver.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/claude
git commit -m "test(claude): add replay fixtures and driver integration tests"
```

---

### Task 10: Real Claude Smoke Script

**Files:**
- Create: `frontend/scripts/real-claude-smoke.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: built Host package / ClaudeDriver.
- Produces: `pnpm real:claude`，只有 `PIGCODE_REAL_CLAUDE=1` 时执行；否则打印 skip 并退出 0。

- [ ] **Step 1: 写脚本**

```js
/** 真实 Claude 冒烟：跑一个最小 prompt，验证流式、结果和用量。 */
import { spawnSync } from "node:child_process"

if (process.env.PIGCODE_REAL_CLAUDE !== "1") {
  console.log("skip: set PIGCODE_REAL_CLAUDE=1 to run the real Claude smoke test")
  process.exit(0)
}

const result = spawnSync(
  "pnpm",
  ["--dir", "apps/host", "exec", "vitest", "run", "src/providers/claude/real-smoke.test.ts"],
  { stdio: "inherit", env: { ...process.env, PIGCODE_REAL_CLAUDE: "1" } },
)
process.exit(result.status ?? 1)
```

`apps/host/src/providers/claude/real-smoke.test.ts`：
- 仅当 `PIGCODE_REAL_CLAUDE=1` 时运行；否则 `it.skip`。
- 用真实 `query` 驱动 `ClaudeDriver`，prompt `Reply with exactly OK`，`permissionMode: "dontAsk"`；断言 `message.completed` 文本包含 `OK`，并收到 `usage.updated`。
- 超时 120s；不测试工具调用，避免额外额度。

- [ ] **Step 2: 运行（跳过模式）**

Run: `cd frontend && pnpm real:claude`
Expected: 打印 skip，exit 0。

- [ ] **Step 3: 运行真实冒烟（显式）**

Run: `cd frontend && PIGCODE_REAL_CLAUDE=1 pnpm real:claude`
Expected: PASS；只消耗一次最小 prompt。

- [ ] **Step 4: 提交**

```bash
cd frontend
git add scripts/real-claude-smoke.mjs apps/host/src/providers/claude/real-smoke.test.ts package.json
git commit -m "test(claude): add gated real smoke test"
```

---

### Task 11: Real E2E (Gated)

**Files:**
- Create: `frontend/apps/desktop/e2e/m1-real-claude.spec.ts`
- Modify: `frontend/apps/desktop/playwright.config.ts`

**Interfaces:**
- Consumes: 真实 Host + Claude adapter + UI。
- Produces: `PIGCODE_REAL_CLAUDE=1` 时的端到端验收；默认跳过。

- [ ] **Step 1: 写 E2E**

```ts
/** 真实 Claude 端到端：新建线程、发 OK、看到流式与完成。 */
import { _electron as electron, expect, test } from "@playwright/test"

test.skip(process.env.PIGCODE_REAL_CLAUDE !== "1", "set PIGCODE_REAL_CLAUDE=1")

test("real claude answers OK", async () => {
  const app = await electron.launch({ args: ["."], env: { ...process.env, PIGCODE_REAL_CLAUDE: "1" } })
  const page = await app.firstWindow()
  await page.getByRole("button", { name: "添加项目" }).first().click()
  await page.getByLabel("项目路径").fill("/tmp/pigcode-m1-e2e")
  await page.getByRole("button", { name: "添加", exact: true }).click()
  await expect(page.getByText("pigcode-m1-e2e", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "新会话" }).first().click()
  await expect(page.locator(".tiptap")).toHaveAttribute("contenteditable", "true")
  await page.getByRole("textbox").fill("Reply with exactly OK")
  await page.keyboard.press("Enter")
  await expect(page.locator(".msg-user").filter({ hasText: "Reply with exactly OK" })).toBeVisible()
  await expect(page.getByText("OK", { exact: true })).toBeVisible({ timeout: 120_000 })
  await app.close()
})
```

- [ ] **Step 2: 运行（跳过模式）**

Run: `cd frontend/apps/desktop && pnpm exec playwright test e2e/m1-real-claude.spec.ts`
Expected: skipped。

- [ ] **Step 3: 运行真实 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_REAL_CLAUDE=1 pnpm exec playwright test e2e/m1-real-claude.spec.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
cd frontend
git add apps/desktop/e2e apps/desktop/playwright.config.ts
git commit -m "test(e2e): add gated real claude flow"
```

---

### Task 12: Final Verification and Docs

**Files:**
- Modify: `frontend/README.md`
- Modify: `docs/superpowers/specs/2026-10-20-pigcode-architecture-design.md`（只更新 M1 验收状态，不改设计）
- Test: all

**Interfaces:**
- Consumes: 全部 M1 实现。
- Produces: 可复现的 M1 验收记录；README 说明真实冒烟命令。

- [ ] **Step 1: 运行全量门禁**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS。

- [ ] **Step 2: 运行 M0-B E2E 回归**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m0-b.spec.ts`
Expected: PASS。

- [ ] **Step 3: 运行真实 Claude 冒烟**

Run: `cd frontend && PIGCODE_REAL_CLAUDE=1 pnpm real:claude`
Expected: PASS（一次最小 prompt）。

- [ ] **Step 4: 更新 README 与验收记录**

README 增加：

```markdown
## Real Claude smoke

Set `PIGCODE_REAL_CLAUDE=1` and run:

```bash
pnpm real:claude
```

The test uses the installed and authenticated Claude Code CLI with a minimal
prompt. It never logs in and never reads credential files.
```

- [ ] **Step 5: 提交**

```bash
cd frontend
git add README.md
git commit -m "docs: document m1 real claude smoke test"
```

---

## Self-Review

**Spec coverage（M1 范围）：**

| Spec 要求 | 对应任务 |
|---|---|
| Claude 检测与认证状态 | Task 3 |
| Claude 流式会话 | Task 4/9 |
| 工具调用与用量 | Task 4/9 |
| 审批请求持久化与 UI 回传 | Task 5/6 |
| 中断 | Task 8 |
| 会话恢复 | Task 7 |
| Host 重启 orphan 清理 | Task 7 |
| replay fixture 与 CI | Task 9 |
| 真实冒烟（显式） | Task 10/11/12 |
| 不触发登录/不读凭据 | Global Constraints + Task 3 |

**Placeholder scan:** 无 TBD/TODO；每个任务有具体文件、测试命令与关键代码。

**Type consistency:** `ProviderRuntime`、`ApprovalDecision`、`ProviderSession`、`PendingRequest`、`ClaudeDriver`、`normalizeSdkMessage` 在任务间名称一致；`startRun` 返回 `{ runId, done }`，RPC 只返回 `{ runId }`。

**Known deferrals（不属于 M1）：**

- Claude questions（`AskUserQuestion`）暂不支持，`capabilities.questions=false`。
- Codex adapter（M2）。
- 原生 fork/rollback、checkpoint、终端、diff（M2/M3）。
- 真实审批 E2E：M1 单测覆盖审批桥；真实 E2E 只跑无工具的 OK prompt，避免额外额度与危险命令。
```