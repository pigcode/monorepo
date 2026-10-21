# Pigcode M2 Codex Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1 的 provider 基础设施上接入 Codex：通过 `codex app-server --stdio` 的 JSON-RPC 驱动真实会话，映射消息/工具/计划/用量，桥接命令与文件变更审批，支持中断、resume、模型列表、Claude/Codex 并行与基础 provider 切换。

**Architecture:** Codex adapter 每个 provider session 启动一个 `codex app-server --stdio` 子进程；Host 用 NDJSON JSON-RPC 客户端发送 `initialize`/`thread/start`/`turn/start`/`turn/interrupt`，消费 `item/*`、`turn/*`、`thread/tokenUsage/updated` 通知，并把 server request 转成既有 `pending_requests` 审批。Provider 选择与 UI 条件渲染由 capability descriptor 驱动，禁止 `if provider === ...` 散落在 UI。

**Tech Stack:** TypeScript 5.9、Node 22+、Codex CLI `0.163.0` 的 `app-server`、Zod 4、Vitest 4、Playwright 1.64.1。

## Global Constraints

- Codex 只通过 `codex app-server --stdio` 的 NDJSON JSON-RPC 控制；不解析 PTY，不读凭据文件。
- 检测只读：`codex --version` 与 `codex login status`；绝不触发登录。
- 一个 thread 同时最多一个活跃 run；不同 thread 可以跨 provider 并行。
- `message.delta` 只走实时通道；工具、计划、用量、run 终态写入 `thread_events`。
- 审批统一走 `pending_requests` 与 `run.respondApproval`，Codex 的 `accept/acceptForSession/decline/cancel` 映射到既有 `allow-once/allow-for-session/deny`。
- capability descriptor 必须诚实：M2 的 Codex `questions=false`、`fork=false`、`rollback=false`、`checkpoint=false`、`subagents=false`、`mcp=false`。
- 单测全部使用 replay transport，不依赖真实 Codex 账号；真实 Codex 冒烟只在 `PIGCODE_REAL_CODEX=1` 时运行。
- 不引入 HTTP/WebSocket/token；仍使用 MessagePort RPC。
- TypeScript strict；禁止 `any`、`@ts-ignore`、`@ts-expect-error`；文件 ≤500 行；中文注释。

---

## File Structure

```text
frontend/
  apps/host/src/providers/codex/
    protocol.ts                  # JSON-RPC 信封与行 framing
    transport.ts                 # StdioCodexTransport + ReplayCodexTransport
    client.ts                    # request/notify/respond、server request 分发
    normalize.ts                 # Codex 通知/条目 -> ProviderEvent
    driver.ts                    # CodexDriver
    detect.ts                    # codex --version / login status
    models.ts                    # model/list 解析
    fixtures/*.jsonl             # replay frames
  packages/contracts/src/
    commands.ts                  # provider.models、thread.switchProvider
    domain.ts                    # ProviderDetection / ModelInfo（可选）
  apps/host/src/providers/registry.ts
  apps/desktop/src/renderer/src/app.tsx
  packages/ui-composer/src/composer.tsx
  packages/ui-settings/src/provider-page.tsx
  scripts/real-codex-smoke.mjs
  apps/desktop/e2e/m2-real-codex.spec.ts
```

---

### Task 1: Codex JSON-RPC Protocol and Transports

**Files:**
- Create: `frontend/apps/host/src/providers/codex/protocol.ts`
- Create: `frontend/apps/host/src/providers/codex/transport.ts`
- Test: `frontend/apps/host/src/providers/codex/protocol.test.ts`

**Interfaces:**
- Consumes: `node:child_process`、`node:readline`。
- Produces: `CodexTransport`、`StdioCodexTransport`、`ReplayCodexTransport`、`parseCodexLine()`。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证 NDJSON 信封分类。 */
import { describe, expect, it } from "vitest"
import { classifyCodexMessage } from "./protocol"

describe("classifyCodexMessage", () => {
  it("classifies a response", () => {
    expect(classifyCodexMessage({ id: 1, result: {} })).toBe("response")
  })
  it("classifies a notification", () => {
    expect(classifyCodexMessage({ method: "turn/started", params: {} })).toBe("notification")
  })
  it("classifies a server request", () => {
    expect(classifyCodexMessage({ id: 2, method: "item/commandExecution/requestApproval", params: {} })).toBe("request")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/protocol.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 protocol 与 transport**

`protocol.ts`：

```ts
/** Codex app-server 的 NDJSON JSON-RPC 信封。 */
export type CodexIncoming =
  | { kind: "response"; id: number | string; result?: unknown; error?: unknown }
  | { kind: "notification"; method: string; params?: unknown }
  | { kind: "request"; id: number | string; method: string; params?: unknown }

export function classifyCodexMessage(value: unknown): CodexIncoming["kind"] | "unknown" {
  if (typeof value !== "object" || value === null) return "unknown"
  const record = value as Record<string, unknown>
  if (typeof record.method === "string" && "id" in record) return "request"
  if (typeof record.method === "string") return "notification"
  if ("id" in record) return "response"
  return "unknown"
}
```

`transport.ts`：

```ts
/** Codex 子进程的 NDJSON 传输；测试用 replay 实现。 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createInterface } from "node:readline"

export interface CodexTransport {
  send(line: string): void
  onLine(listener: (line: string) => void): () => void
  close(): void
}

export class StdioCodexTransport implements CodexTransport {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly listeners = new Set<(line: string) => void>()

  constructor(command = "codex", args = ["app-server", "--stdio"]) {
    this.child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] })
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      for (const listener of this.listeners) listener(line)
    })
  }

  send(line: string): void {
    this.child.stdin.write(`${line}\n`)
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.child.kill("SIGTERM")
  }
}

export class ReplayCodexTransport implements CodexTransport {
  readonly sent: string[] = []
  private readonly listeners = new Set<(line: string) => void>()

  constructor(private readonly lines: string[]) {}

  send(line: string): void {
    this.sent.push(line)
  }

  onLine(listener: (line: string) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 测试主动推入一条服务端消息。 */
  push(value: unknown): void {
    const line = JSON.stringify(value)
    for (const listener of this.listeners) listener(line)
  }

  close(): void {
    this.listeners.clear()
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/protocol.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/codex
git commit -m "feat(codex): add json-rpc protocol and transports"
```

---

### Task 2: Codex RPC Client

**Files:**
- Create: `frontend/apps/host/src/providers/codex/client.ts`
- Test: `frontend/apps/host/src/providers/codex/client.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `CodexTransport`。
- Produces: `CodexRpcClient.request/notify/onNotification/onServerRequest/respond/close`。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证请求/响应关联、通知分发与 server request 应答。 */
import { describe, expect, it, vi } from "vitest"
import { CodexRpcClient } from "./client"
import { ReplayCodexTransport } from "./transport"

describe("CodexRpcClient", () => {
  it("resolves a request by id", async () => {
    const transport = new ReplayCodexTransport([])
    const client = new CodexRpcClient(transport)
    const pending = client.request("initialize", { clientInfo: { name: "pigcode", version: "0.1.0" } })
    const sent = JSON.parse(transport.sent[0]!)
    transport.push({ id: sent.id, result: { ok: true } })
    await expect(pending).resolves.toEqual({ ok: true })
  })

  it("answers a server request", async () => {
    const transport = new ReplayCodexTransport([])
    const client = new CodexRpcClient(transport)
    const handler = vi.fn(async () => ({ decision: "accept" }))
    client.onServerRequest("item/commandExecution/requestApproval", handler)
    transport.push({ id: 7, method: "item/commandExecution/requestApproval", params: { itemId: "i1" } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handler).toHaveBeenCalledOnce()
    expect(JSON.parse(transport.sent[0]!)).toMatchObject({ id: 7, result: { decision: "accept" } })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/client.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 client**

```ts
/** Codex app-server 的 JSON-RPC 客户端；负责 id 关联与 server request 分发。 */
import type { CodexTransport } from "./transport"

interface Pending {
  resolve(value: unknown): void
  reject(error: Error): void
}

export class CodexRpcClient {
  private nextId = 1
  private readonly pending = new Map<number, Pending>()
  private readonly notificationHandlers = new Map<string, Set<(params: unknown) => void>>()
  private readonly requestHandlers = new Map<string, (params: unknown) => Promise<unknown>>()
  private readonly disposeLine: () => void

  constructor(private readonly transport: CodexTransport) {
    this.disposeLine = transport.onLine((line) => this.handleLine(line))
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.transport.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }))
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`codex request timeout: ${method}`))
      }, 30000)
    })
  }

  notify(method: string, params: unknown): void {
    this.transport.send(JSON.stringify({ jsonrpc: "2.0", method, params }))
  }

  onNotification(method: string, handler: (params: unknown) => void): () => void {
    const set = this.notificationHandlers.get(method) ?? new Set()
    set.add(handler)
    this.notificationHandlers.set(method, set)
    return () => set.delete(handler)
  }

  onServerRequest(method: string, handler: (params: unknown) => Promise<unknown>): void {
    this.requestHandlers.set(method, handler)
  }

  respond(id: number | string, result: unknown): void {
    this.transport.send(JSON.stringify({ jsonrpc: "2.0", id, result }))
  }

  respondError(id: number | string, code: number, message: string): void {
    this.transport.send(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }))
  }

  close(): void {
    this.disposeLine()
    this.transport.close()
  }

  private handleLine(line: string): void {
    let value: unknown
    try {
      value = JSON.parse(line)
    } catch {
      return
    }
    if (typeof value !== "object" || value === null) return
    const record = value as Record<string, unknown>
    if (typeof record.method === "string" && "id" in record) {
      const handler = this.requestHandlers.get(record.method)
      if (!handler) {
        this.respondError(record.id as number | string, -32601, `unsupported request: ${record.method}`)
        return
      }
      void handler(record.params).then(
        (result) => this.respond(record.id as number | string, result),
        (error: unknown) =>
          this.respondError(
            record.id as number | string,
            -32000,
            error instanceof Error ? error.message : String(error),
          ),
      )
      return
    }
    if (typeof record.method === "string") {
      for (const handler of this.notificationHandlers.get(record.method) ?? []) {
        handler(record.params)
      }
      return
    }
    if ("id" in record) {
      const entry = this.pending.get(record.id as number)
      if (!entry) return
      this.pending.delete(record.id as number)
      if (record.error) entry.reject(new Error(JSON.stringify(record.error)))
      else entry.resolve(record.result)
    }
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/client.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/codex
git commit -m "feat(codex): add json-rpc client"
```

---

### Task 3: Codex Detection and Model List

**Files:**
- Create: `frontend/apps/host/src/providers/codex/detect.ts`
- Create: `frontend/apps/host/src/providers/codex/models.ts`
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Test: `frontend/apps/host/src/providers/codex/detect.test.ts`

**Interfaces:**
- Consumes: `codex --version`、`codex login status`、`model/list`。
- Produces: `detectCodex()`、`parseCodexModels()`、`provider.models` 命令。

- [ ] **Step 1: 写失败测试**

```ts
/** 用 fixture 脚本验证 Codex 检测，不依赖真实账号。 */
import { chmod, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { detectCodex } from "./detect"

describe("detectCodex", () => {
  it("parses version and login status", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pigcode-codex-"))
    const bin = join(dir, "codex")
    await writeFile(
      bin,
      `#!/bin/sh
if [ "$1" = "--version" ]; then echo "codex-cli 0.163.0"; exit 0; fi
if [ "$1" = "login" ] && [ "$2" = "status" ]; then echo "Logged in using ChatGPT"; exit 0; fi
exit 1
`,
    )
    await chmod(bin, 0o755)
    const result = await detectCodex({ command: bin })
    expect(result.installed).toBe(true)
    expect(result.version).toContain("0.163.0")
    expect(result.loggedIn).toBe(true)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/detect.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现检测与模型列表**

`detect.ts` 结构与 M1 的 `detectClaude` 相同：候选命令 `codex`、`~/.bun/bin/codex`、`/opt/homebrew/bin/codex`、`/usr/local/bin/codex`；只跑 `--version` 与 `login status`。

`models.ts`：

```ts
/** 把 model/list 的未知响应收窄为 Pigcode 的模型条目。 */
export interface CodexModelInfo {
  id: string
  displayName: string
  isDefault: boolean
}

export function parseCodexModels(value: unknown): CodexModelInfo[] {
  if (typeof value !== "object" || value === null) return []
  const record = value as Record<string, unknown>
  const raw = Array.isArray(record.data) ? record.data : Array.isArray(record.models) ? record.models : []
  const result: CodexModelInfo[] = []
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const model = item as Record<string, unknown>
    const id = typeof model.id === "string" ? model.id : typeof model.model === "string" ? model.model : null
    if (!id) continue
    result.push({
      id,
      displayName:
        typeof model.displayName === "string"
          ? model.displayName
          : typeof model.name === "string"
            ? model.name
            : id,
      isDefault: model.isDefault === true,
    })
  }
  return result
}
```

`commands.ts` 增加：

```ts
"provider.models": z.object({ providerId: z.string().min(1) }),
```

`registry.ts` 的 `detect()` 返回 `{ claude, codex, fake }`；`list()` 包含 CodexDriver；`models(providerId)` 对 codex 调用 app-server `model/list`（Task 4 之后接），对 fake 返回空数组。`rpc/server.ts` 增加 `provider.models` 分支：`return this.ctx.providers.models((parsed as { providerId: string }).providerId)`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/detect.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/codex packages/contracts apps/host/src/providers/registry.ts apps/host/src/rpc/server.ts
git commit -m "feat(codex): add detection and model list parsing"
```

---

### Task 4: Codex Driver and Event Normalization

**Files:**
- Create: `frontend/apps/host/src/providers/codex/normalize.ts`
- Create: `frontend/apps/host/src/providers/codex/driver.ts`
- Create: `frontend/apps/host/src/providers/codex/fixtures/simple.jsonl`
- Test: `frontend/apps/host/src/providers/codex/normalize.test.ts`
- Test: `frontend/apps/host/src/providers/codex/driver.test.ts`

**Interfaces:**
- Consumes: Task 2 的 client、Task 1 的 transport。
- Produces: `CodexDriver`，实现 `ProviderDriver`；`normalizeCodexNotification()`。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证 Codex 通知映射。 */
import { describe, expect, it } from "vitest"
import { normalizeCodexNotification } from "./normalize"

describe("normalizeCodexNotification", () => {
  it("maps agent message deltas", () => {
    const events = normalizeCodexNotification("item/agentMessage/delta", {
      threadId: "t1",
      turnId: "turn1",
      itemId: "i1",
      delta: "OK",
    })
    expect(events).toContainEqual({ type: "message.delta", text: "OK" })
  })

  it("maps completed command execution", () => {
    const events = normalizeCodexNotification("item/completed", {
      threadId: "t1",
      turnId: "turn1",
      item: { id: "i1", type: "commandExecution", command: "echo hi", aggregatedOutput: "hi", exitCode: 0, status: "completed" },
    })
    expect(events).toContainEqual({
      type: "tool.completed",
      toolCallId: "i1",
      name: "Bash",
      output: "hi",
      isError: false,
    })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/normalize.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 normalizer 与 driver**

`normalize.ts` 映射：

- `item/agentMessage/delta` -> `message.delta`。
- `item/completed` item.type `agentMessage` -> `message.completed`（`item.text`）。
- `item/started`/`item/completed` item.type `commandExecution` -> `tool.started`/`tool.completed`（name `Bash`，input `command`，output `aggregatedOutput`）。
- `item/started`/`item/completed` item.type `fileChange` -> `tool.started`/`tool.completed`（name `ApplyPatch`）。
- `turn/plan/updated` -> `plan.updated`。
- `thread/tokenUsage/updated` -> `usage.updated`。
- `turn/completed` -> `run.completed` / `run.failed` / `run.interrupted`，依据 `turn.status`。

`driver.ts`：

```ts
/** Codex adapter：每 session 一个 app-server 子进程。 */
import type { ProviderCapabilities } from "@pigcode/contracts"
import type { ProviderDriver, ProviderRuntime, ProviderSessionHandle } from "../driver"
import { CodexRpcClient } from "./client"
import { StdioCodexTransport, type CodexTransport } from "./transport"
import { normalizeCodexNotification } from "./normalize"

interface CodexSessionState {
  client: CodexRpcClient
  nativeThreadId: string | null
  turnId: string | null
}

export class CodexDriver implements ProviderDriver {
  readonly id = "codex"
  readonly displayName = "Codex"
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    approvals: true,
    questions: false,
    plan: true,
    resume: true,
    fork: false,
    rollback: false,
    checkpoint: false,
    subagents: false,
    mcp: false,
    images: false,
    usage: true,
    modelCatalog: true,
    nativeSessionId: true,
  }

  private readonly sessions = new Map<string, CodexSessionState>()
  private readonly transportFactory: (() => CodexTransport) | undefined

  constructor(options: { transportFactory?: () => CodexTransport } = {}) {
    this.transportFactory = options.transportFactory
  }

  async createSession(input: { threadId: string; cwd: string; nativeSessionId?: string | null; permissionMode?: string; model?: string | null }): Promise<ProviderSessionHandle> {
    const transport = this.transportFactory?.() ?? new StdioCodexTransport()
    const client = new CodexRpcClient(transport)
    await client.request("initialize", {
      clientInfo: { name: "pigcode", title: "Pigcode", version: "0.1.0" },
    })
    const params = {
      cwd: input.cwd,
      approvalPolicy: input.permissionMode === "danger-full-access" ? "never" : "on-request",
      sandbox: input.permissionMode === "read-only" ? "read-only" : input.permissionMode === "danger-full-access" ? "danger-full-access" : "workspace-write",
      ...(input.model ? { model: input.model } : {}),
    }
    const response = input.nativeSessionId
      ? (await client.request("thread/resume", { threadId: input.nativeSessionId, ...params })) as { thread?: { id?: string } }
      : (await client.request("thread/start", params)) as { thread?: { id?: string } }
    const state: CodexSessionState = {
      client,
      nativeThreadId: response.thread?.id ?? input.nativeSessionId ?? null,
      turnId: null,
    }
    this.sessions.set(state.nativeThreadId ?? input.threadId, state)
    return {
      id: `codex_${crypto.randomUUID()}`,
      threadId: input.threadId,
      cwd: input.cwd,
      nativeSessionId: state.nativeThreadId,
      permissionMode: input.permissionMode ?? "workspace-write",
      model: input.model ?? null,
    }
  }

  async send(session: ProviderSessionHandle, input: { text: string; handoff?: string }, runtime: ProviderRuntime): Promise<void> {
    const state = this.sessions.get(session.nativeSessionId ?? session.threadId)
    if (!state?.nativeThreadId) throw new Error("codex thread not started")
    const client = state.client
    const disposers = [
      client.onNotification("item/agentMessage/delta", (params) => emit(runtime, params)),
      client.onNotification("item/completed", (params) => emit(runtime, params)),
      client.onNotification("item/started", (params) => emit(runtime, params)),
      client.onNotification("turn/plan/updated", (params) => emit(runtime, params)),
      client.onNotification("thread/tokenUsage/updated", (params) => emit(runtime, params)),
      client.onNotification("turn/completed", (params) => emit(runtime, params)),
    ]
    client.onServerRequest("item/commandExecution/requestApproval", async (params) =>
      toApprovalResponse(await runtime.requestApproval({ toolName: "Bash", input: params }), "acceptForSession"),
    )
    client.onServerRequest("item/fileChange/requestApproval", async (params) =>
      toApprovalResponse(await runtime.requestApproval({ toolName: "ApplyPatch", input: params }), "acceptForSession"),
    )
    const text = input.handoff ? `${input.handoff}\n\n${input.text}` : input.text
    const started = (await client.request("turn/start", {
      threadId: state.nativeThreadId,
      input: [{ type: "text", text }],
    })) as { turn?: { id?: string } }
    state.turnId = started.turn?.id ?? null
    try {
      await waitForTurn(client, state.turnId)
    } finally {
      for (const dispose of disposers) dispose()
    }
  }

  async interrupt(session: ProviderSessionHandle): Promise<void> {
    const state = this.sessions.get(session.nativeSessionId ?? session.threadId)
    if (!state?.nativeThreadId || !state.turnId) return
    await state.client.request("turn/interrupt", {
      threadId: state.nativeThreadId,
      turnId: state.turnId,
    })
  }

  async dispose(session: ProviderSessionHandle): Promise<void> {
    const keys = [session.nativeSessionId, session.threadId].filter((value): value is string => Boolean(value))
    for (const key of keys) {
      const state = this.sessions.get(key)
      if (!state) continue
      state.client.close()
      this.sessions.delete(key)
    }
  }
}
```

辅助函数 `emit` 调用 `normalizeCodexNotification(method, params)` 并逐条 `runtime.emit`；`waitForTurn` 用 Promise + `turn/completed` 监听；`toApprovalResponse` 映射：

```ts
function toApprovalResponse(decision: ApprovalDecision, sessionDecision: "acceptForSession"): { decision: string } {
  if (decision === "deny") return { decision: "decline" }
  if (decision === "allow-for-session") return { decision: sessionDecision }
  return { decision: "accept" }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/normalize.test.ts apps/host/src/providers/codex/driver.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/codex
git commit -m "feat(codex): add driver and notification normalization"
```

---

### Task 5: Capability-Driven UI and Provider/Model Selection

**Files:**
- Modify: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Modify: `frontend/packages/ui-composer/src/composer.tsx`
- Modify: `frontend/packages/ui-settings/src/provider-page.tsx`
- Modify: `frontend/packages/ui-chat/src/chat-view.tsx`
- Test: `frontend/packages/ui-settings/src/provider-page.test.tsx`

**Interfaces:**
- Consumes: `provider.list`、`provider.detect`、`provider.models`、thread capability。
- Produces: Provider/模型选择器；按 capability 隐藏中断、计划、审批、模型控件。

- [ ] **Step 1: 写失败测试**

在 `provider-page.test.tsx` 增加：

```tsx
it("shows Codex detection", () => {
  render(
    <LocaleProvider locale="zh-CN">
      <ProviderPage
        detection={{
          installed: true,
          version: "codex-cli 0.163.0",
          loggedIn: true,
          authMethod: "ChatGPT",
        }}
        onDetect={async () => {}}
      />
    </LocaleProvider>,
  )
  expect(screen.getByText(/0\.163\.0/)).toBeTruthy()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-settings/src/provider-page.test.tsx`
Expected: FAIL，组件只接受 Claude 字段。

- [ ] **Step 3: 实现 capability 渲染与选择器**

- `ProviderPage` 改为接受 `providers: Array<{ id, displayName, installed, version, loggedIn, authMethod }>`，分别渲染 Claude/Codex 分区。
- `SettingsContainer` 调用 `provider.detect`，把 `claude` 与 `codex` 归一化为数组；调用 `provider.models` 填充模型列表。
- `Thread` 增加 `lastModelId`；`Composer` 的模型菜单从 `models` props 渲染，而不是静态 `composerModels`。
- `ChatViewContainer` 从 `state.providerCapabilities` 读取 capability；`canInterrupt`、`canPlan`、`canApprove` 为 false 时隐藏对应控件。
- `App` 创建线程时用 `provider.default`；线程头增加 provider/model 切换入口，调用 `thread.switchProvider`（Task 6）。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-settings/src/provider-page.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/desktop/src/renderer/src/app.tsx packages/ui-composer packages/ui-settings packages/ui-chat
git commit -m "feat(ui): render providers and models from capabilities"
```

---

### Task 6: Provider Switching and Handoff

**Files:**
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Modify: `frontend/apps/host/src/providers/driver.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Test: `frontend/apps/host/src/providers/switch.test.ts`

**Interfaces:**
- Consumes: 现有 thread/session 存储。
- Produces: `thread.switchProvider` 命令；`UserInput.handoff`；`thread.updated` 事件。

- [ ] **Step 1: 写失败测试**

```ts
it("switches provider and passes a handoff to the next run", async () => {
  const { ctx, thread } = await setup()
  const switched = await ctx.providers.switchProvider(thread.id, "claude", "claude-sonnet")
  expect(switched.providerId).toBe("claude")
  const events = ctx.sessions.read(thread.id, 0)
  const handoff = events.find((event) => event.type === "thread.updated")
  expect(handoff?.payload).toMatchObject({ providerId: "claude" })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/switch.test.ts`
Expected: FAIL，方法不存在。

- [ ] **Step 3: 实现切换与 handoff**

- `thread.switchProvider` schema：`{ threadId, providerId, modelId? }`。
- `providers.switchProvider(threadId, providerId, modelId?)`：更新 thread 的 `lastProviderId`/`lastModelId`，把旧 session 标记 `stopped`，追加 `thread.updated` 事件 payload `{ providerId, modelId, handoff }`。
- `buildHandoff(threadId)`：取最近一条 user message 与 assistant message，生成固定模板文本：
```text
Previous provider: <id>
Last user request: <text>
Last assistant summary: <text>
Continue from here. Do not repeat completed work.
```
- `startRun` 读取最近 handoff，把它作为 `input.handoff` 传给 driver；Claude/Codex driver 把 handoff 放在用户文本之前。
- UI 切换入口：线程头 provider/model 菜单；切换后提示“下一次消息将使用 X”。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/switch.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts apps/host apps/desktop
git commit -m "feat(providers): add provider switching and handoff"
```

---

### Task 7: Parallel Runs Across Providers

**Files:**
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Test: `frontend/apps/host/src/providers/parallel.test.ts`

**Interfaces:**
- Consumes: `activeThreads` 与 per-session driver。
- Produces: 两个 thread 分别用 Claude/Codex 同时运行，互不阻塞。

- [ ] **Step 1: 写失败测试**

```ts
it("runs claude and codex threads in parallel", async () => {
  const { ctx, claudeThread, codexThread } = await setupTwoThreads()
  const a = await ctx.providers.startRun(claudeThread.id, "one")
  const b = await ctx.providers.startRun(codexThread.id, "two")
  await Promise.all([a.done, b.done])
  expect(ctx.providers.getRunStatus(a.runId)).toBe("completed")
  expect(ctx.providers.getRunStatus(b.runId)).toBe("completed")
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/parallel.test.ts`
Expected: FAIL，第二个 thread 的 provider 未注册或串行阻塞。

- [ ] **Step 3: 实现并行**

- `activeThreads` 只限制同一个 thread；不同 thread 允许并发。
- 每个 Codex session 独立 app-server 子进程；Claude 每次 `query()` 独立进程。
- `ProvidersService.cancelAll()` 遍历所有活跃 run。
- 添加 `maxConcurrentRuns`（默认 4）保护；超过时 `startRun` 抛 `TOO_MANY_ACTIVE_RUNS`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/parallel.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers
git commit -m "feat(providers): allow parallel runs across providers"
```

---

### Task 8: Codex Replay Fixtures and Integration Tests

**Files:**
- Create: `frontend/apps/host/src/providers/codex/fixtures/simple.jsonl`
- Create: `frontend/apps/host/src/providers/codex/fixtures/approval.jsonl`
- Create: `frontend/apps/host/src/providers/codex/replay.ts`
- Test: `frontend/apps/host/src/providers/codex/integration.test.ts`

**Interfaces:**
- Consumes: `ReplayCodexTransport`。
- Produces: 录制/回放帧，覆盖 initialize、thread/start、turn/start、deltas、tool、turn/completed。

- [ ] **Step 1: 写失败测试**

```ts
it("replays a codex turn end to end", async () => {
  const events: string[] = []
  const driver = new CodexDriver({ transportFactory: () => replayTransport("fixtures/simple.jsonl") })
  const session = await driver.createSession({ threadId: "t1", cwd: "/tmp", permissionMode: "workspace-write" })
  await driver.send(session, { text: "hello" }, {
    signal: new AbortController().signal,
    emit: (event) => events.push(event.type),
    requestApproval: async () => "allow-once",
  })
  expect(events).toContain("message.delta")
  expect(events).toContain("message.completed")
  expect(events).toContain("run.completed")
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/integration.test.ts`
Expected: FAIL，fixture/replay 缺失。

- [ ] **Step 3: 实现 replay**

`replay.ts` 读取 JSONL 行，按顺序在收到客户端请求时推入对应响应：
- 收到 `initialize` -> 推入 `{"id":<id>,"result":{}}`。
- 收到 `thread/start` -> 推入 `{"id":<id>,"result":{"thread":{"id":"th_native"}}}`。
- 收到 `turn/start` -> 推入 `{"id":<id>,"result":{"turn":{"id":"turn_1"}}}`，随后推入通知：`item/agentMessage/delta`、`item/completed`、`turn/completed`。
- `approval.jsonl` 额外推入 server request `item/commandExecution/requestApproval`，等待 response。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/codex/integration.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers/codex
git commit -m "test(codex): add replay fixtures and integration tests"
```

---

### Task 9: Real Codex Smoke Script

**Files:**
- Create: `frontend/scripts/real-codex-smoke.mjs`
- Create: `frontend/apps/host/src/providers/codex/real-smoke.test.ts`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: 真实 `codex app-server` + 已登录账号。
- Produces: `pnpm real:codex`，仅 `PIGCODE_REAL_CODEX=1` 时运行。

- [ ] **Step 1: 写脚本与测试**

脚本与 M1 的 `real-claude-smoke.mjs` 同构，执行 `pnpm exec vitest run apps/host/src/providers/codex/real-smoke.test.ts`。

`real-smoke.test.ts`：
- `it.skipIf(process.env.PIGCODE_REAL_CODEX !== "1")`。
- `CodexDriver` 连接真实 app-server，prompt `Reply with exactly OK`，`permissionMode: "workspace-write"`。
- 断言收到 `message.completed` 包含 `OK`、`usage.updated`、无 `run.failed`；120s 超时。

- [ ] **Step 2: 运行跳过模式**

Run: `cd frontend && pnpm real:codex`
Expected: 打印 skip，exit 0。

- [ ] **Step 3: 运行真实冒烟**

Run: `cd frontend && PIGCODE_REAL_CODEX=1 pnpm real:codex`
Expected: PASS，一次最小 prompt。

- [ ] **Step 4: 提交**

```bash
cd frontend
git add scripts/real-codex-smoke.mjs apps/host/src/providers/codex/real-smoke.test.ts package.json
git commit -m "test(codex): add gated real smoke test"
```

---

### Task 10: Real Codex E2E

**Files:**
- Create: `frontend/apps/desktop/e2e/m2-real-codex.spec.ts`
- Modify: `frontend/apps/desktop/playwright.config.ts`

**Interfaces:**
- Consumes: 真实 Codex adapter + UI。
- Produces: `PIGCODE_REAL_CODEX=1` 时的端到端验收。

- [ ] **Step 1: 写 E2E**

与 M1 的 `m1-real-claude.spec.ts` 同构：
- `test.skip(process.env.PIGCODE_REAL_CODEX !== "1")`。
- `launchEnv` 注入 `PIGCODE_REAL_CODEX=1`、`PIGCODE_PROVIDER=codex`。
- 创建 `/tmp/pigcode-m2-e2e`，添加项目、新会话、输入 `Reply with exactly OK`，断言用户气泡与 `OK`。
- 超时 180s。

- [ ] **Step 2: 运行跳过模式**

Run: `cd frontend/apps/desktop && pnpm exec playwright test e2e/m2-real-codex.spec.ts`
Expected: skipped。

- [ ] **Step 3: 运行真实 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_REAL_CODEX=1 pnpm exec playwright test e2e/m2-real-codex.spec.ts`
Expected: PASS。

- [ ] **Step 4: 提交**

```bash
cd frontend
git add apps/desktop/e2e apps/desktop/playwright.config.ts
git commit -m "test(e2e): add gated real codex flow"
```

---

### Task 11: Capability Descriptor Integrity and UI Tests

**Files:**
- Create: `frontend/apps/host/src/providers/capabilities.test.ts`
- Modify: `frontend/apps/host/src/providers/claude/driver.ts`
- Modify: `frontend/apps/host/src/providers/codex/driver.ts`
- Modify: `frontend/packages/ui-chat/src/chat-view.tsx`

**Interfaces:**
- Consumes: `ProviderCapabilities`。
- Produces: 每个 provider 的 capability 快照测试；UI 按 capability 隐藏控件。

- [ ] **Step 1: 写失败测试**

```ts
/** 固定 Claude/Codex 的 capability，防止未来静默变化。 */
import { describe, expect, it } from "vitest"
import { ClaudeDriver } from "./claude/driver"
import { CodexDriver } from "./codex/driver"

describe("provider capabilities", () => {
  it("keeps Codex capability flags honest", () => {
    const codex = new CodexDriver().capabilities
    expect(codex.approvals).toBe(true)
    expect(codex.questions).toBe(false)
    expect(codex.fork).toBe(false)
    expect(codex.rollback).toBe(false)
    expect(codex.checkpoint).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/capabilities.test.ts`
Expected: FAIL，模块不存在（驱动的 capabilities 已存在，测试文件待创建）。

- [ ] **Step 3: 实现**

- 按上面的路径创建测试，使用 `./claude/driver` 与 `./codex/driver`。
- `ChatView` 接收 `capabilities` props；`canInterrupt`、`canPlan`、`canApprove` 由 capability 决定。
- `Composer` 的模型菜单只在 `modelCatalog` 为 true 时显示。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/capabilities.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers packages/ui-chat
git commit -m "test(providers): lock capability descriptors"
```

---

### Task 12: Final Verification and Docs

**Files:**
- Modify: `frontend/README.md`
- Test: all

**Interfaces:**
- Consumes: 全部 M2 实现。
- Produces: 可复现的 M2 验收记录。

- [ ] **Step 1: 全量门禁**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS。

- [ ] **Step 2: M0-B 与 M1 回归**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m0-b.spec.ts`
Expected: PASS。

Run: `cd frontend && PIGCODE_REAL_CLAUDE=1 pnpm real:claude`
Expected: PASS（最小 prompt）。

- [ ] **Step 3: 真实 Codex 冒烟**

Run: `cd frontend && PIGCODE_REAL_CODEX=1 pnpm real:codex`
Expected: PASS（最小 prompt）。

- [ ] **Step 4: 更新 README**

增加：

```markdown
## Real Codex smoke

Set `PIGCODE_REAL_CODEX=1` and run:

```bash
pnpm real:codex
```

The test uses the installed and authenticated Codex CLI with a minimal prompt.
It never logs in and never reads credential files.
```

- [ ] **Step 5: 提交**

```bash
cd frontend
git add README.md
git commit -m "docs: document m2 real codex smoke test"
```

---

## Self-Review

**Spec coverage（M2 范围）：**

| Spec 要求 | 对应任务 |
|---|---|
| Codex app-server adapter | Task 1/2/4/8 |
| 规范化事件与工具/计划/用量 | Task 4/8 |
| 审批桥接 | Task 4/5 |
| 中断 | Task 4/7 |
| resume | Task 4 |
| 模型列表 | Task 3/5 |
| capability 驱动 UI | Task 5/11 |
| 并行与 provider 切换 | Task 6/7 |
| replay fixture | Task 8 |
| 真实冒烟/E2E | Task 9/10/12 |
| 不登录/不读凭据 | Global Constraints + Task 3 |

**Placeholder scan:** 无 TBD/TODO；每个任务有具体文件、测试命令与关键代码。

**Type consistency:** `CodexTransport`、`CodexRpcClient`、`CodexDriver`、`normalizeCodexNotification`、`thread.switchProvider`、`UserInput.handoff` 在任务间名称一致。

**Known deferrals（不属于 M2）：**

- Codex questions（`item/tool/requestUserInput`）、fork、rollback、checkpoint、subagents、MCP 注入。
- 真实 Codex E2E 默认跳过，只在显式 env 下运行。
- 工具调用 UI 的完整 diff 视图属于 M3。
```