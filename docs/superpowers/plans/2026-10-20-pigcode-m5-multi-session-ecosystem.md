# Pigcode M5 Multi-Session & Ecosystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 v1.0 的最后一组能力：多 tab、多会话并行与队列、后台状态、子 agent 时间线、MCP bridge、GitHub PR、浏览器预览、定时任务，以及 provider 切换的原生 fork 优先策略。多会话真实测试固定使用 Codex 的 `gpt-6.1-sol` 模型（用户所说的 6.1sol）。

**Architecture:** Host 继续以 thread 为会话边界；`providers` 服务增加全局运行队列与 `run.list` 状态查询，Renderer 为每个打开线程维护独立事件、流式文本与运行状态。UI 增加线程 tab 栏；后台线程的事件通过现有 MessagePort 推送。MCP bridge 由 capability 插件注册工具：Claude 使用 SDK 进程内 MCP server，Codex 使用 per-thread stdio bridge 子进程加 Host 侧 Unix domain socket。PR 通过 `gh` CLI，预览通过 Electron 受限子窗口，定时任务持久化到 SQLite 并在 Host 启动时重新装载。

**Tech Stack:** TypeScript 5.9、Electron 40、Cordis 4.0.0-rc.11、Zod 4、React 19、Vitest 4、Playwright 1.64.1、Codex app-server、`@modelcontextprotocol/sdk@1.32.1`。

## Global Constraints

- 仍使用 Electron `utilityProcess` + MessagePort；不引入 HTTP server、WebSocket、端口或 token 握手。
- MCP 的跨进程通信只允许 stdio 与 Unix domain socket（Windows 使用 named pipe 路径规则，由 Node `net` 处理）；不监听 TCP 端口。
- 插件仍是 Host 内受信运行；MCP 工具调用必须带 thread 作用域，不能跨线程共享可变注册。
- PR 集成只通过 `gh` CLI，不读取或保存 GitHub token；`gh` 不存在或未登录时返回可读错误。
- 浏览器预览只允许 `http://localhost`、`http://127.0.0.1`、`http://[::1]`（以及 https 等价地址）；外网 URL 一律拒绝。
- 定时任务只支持固定间隔（秒），不引入 cron 解析依赖；Host 重启后从 SQLite 恢复，错过执行时间时只补跑一次。
- 真实 Codex 测试只在 `PIGCODE_REAL_CODEX=1` 时运行，模型通过 `PIGCODE_CODEX_MODEL=gpt-6.1-sol` 指定；默认跳过，不消耗额度。
- 真实 Claude 测试仍由 `PIGCODE_REAL_CLAUDE=1` 控制；M4 结束时账号配额未恢复，不阻塞 M5 的确定性验收。
- TypeScript strict；禁止 `any`、`@ts-ignore`、`@ts-expect-error`；单文件 ≤500 行；中文注释。
- 每个任务先写失败测试，再实现，再跑定向测试与 `pnpm typecheck`；最后统一跑全量 `pnpm test`、`pnpm lint`、`pnpm typecheck` 和 E2E。
- 不破坏 M0–M4 的现有测试与视觉基线；需要改基线时说明原因。

---

## File Structure

```text
frontend/
  packages/contracts/src/
    commands.ts                 # run.list、thread.unsubscribe、pr.*、schedule.*
    events.ts                   # run.queued、subagent payload、parentToolUseId
    domain.ts                   # 子 agent / MCP / PR / schedule 类型
  packages/client-runtime/src/
    store.ts                    # 每线程 ThreadViewState、openThreadIds
    connection.ts               # 多线程订阅、每线程 cursor、重连恢复
  packages/ui-shell/src/
    thread-tabs.tsx             # 多 tab 与运行状态
  packages/ui-chat/src/
    subagent-card.tsx           # 子 agent 可折叠时间线
    message-list.tsx            # 接入 subagent 事件
  packages/ui-workbench/src/
    preview-panel.tsx           # 本地 URL 预览
    pr-panel.tsx                # PR 创建/状态
  packages/ui-settings/src/
    schedules-page.tsx          # 定时任务管理
  apps/host/src/
    providers/registry.ts       # 队列、run.list、取消排队
    providers/driver.ts         # fork 输入、MCP 配置输入
    providers/switching.ts      # 原生 fork 优先
    providers/claude/normalize.ts
    providers/claude/driver.ts
    providers/codex/normalize.ts
    providers/codex/driver.ts
    services/mcp-bridge.ts      # 工具注册、thread 作用域、socket server
    services/github.ts          # gh CLI 封装
    services/schedules.ts       # 持久化定时任务
    storage/migrations.ts       # migration 4: schedules
    rpc/server.ts               # 新命令分支
    mcp/stdio-bridge.mjs        # Codex stdio MCP 桥
  apps/desktop/src/
    main/preview.ts             # 受限预览子窗口
    preload/index.ts            # previewOpen/previewClose
    renderer/src/app.tsx        # tab 容器、活动线程切换
    renderer/src/workbench.tsx  # preview/pr tab
  apps/desktop/e2e/
    m5-multi-session.spec.ts
    m5-real-codex.spec.ts       # PIGCODE_REAL_CODEX=1 时运行
  apps/host/src/providers/
    multi-session.real.test.ts  # 真实 Codex 两线程并行
  frontend/docs/
    m5-ecosystem.md
```

---

### Task 1: Per-Thread Client State and Multi-Subscription

**Files:**
- Modify: `frontend/packages/client-runtime/src/store.ts`
- Modify: `frontend/packages/client-runtime/src/connection.ts`
- Modify: `frontend/packages/client-runtime/src/index.ts`
- Test: `frontend/packages/client-runtime/src/store.test.ts`
- Test: `frontend/packages/client-runtime/src/connection.test.ts`
- Test: `frontend/apps/host/src/rpc/subscribe.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ThreadViewState {
    events: ThreadEvent[]
    streamingText: string
    status: "idle" | "queued" | "running" | "waiting-approval" | "completed" | "failed" | "interrupted"
    pendingApprovals: number
    lastError: string | null
  }
  ```
- `AppState` 增加 `threadStates: Record<string, ThreadViewState>`、`openThreadIds: string[]`；保留 `events`/`streamingText` 作为活动线程镜像，避免一次性改所有调用方。
- `Connection.openThread(threadId)`、`closeThread(threadId)`、`startRun(threadId, text)`；内部维护 `Map<threadId, cursor>`。
- `thread.unsubscribe` 命令用于关闭 tab 时释放 Host 监听器。

- [ ] **Step 1: 写失败测试**

`store.test.ts` 增加：两个线程各自 addEvent/appendDelta，活动线程切换后 `events`/`streamingText` 镜像正确；`closeThread` 删除状态并选择下一个活动线程。

`connection.test.ts` 增加：同时 open 两个线程；`thread.event` 按 `threadId` 路由；重连后两个游标都从上次 seq 继续；`startRun` 使用传入的 threadId。

`subscribe.test.ts` 增加：连续订阅同一线程不会累积重复监听器；`thread.unsubscribe` 后不再收到该线程事件。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/client-runtime/src/store.test.ts packages/client-runtime/src/connection.test.ts apps/host/src/rpc/subscribe.test.ts`

Expected: FAIL，缺少多线程 API。

- [ ] **Step 3: 实现 store**

在 `store.ts` 增加 `ThreadViewState`、`openThread`、`closeThread`、`setActiveThread`、`setThreadStatus`、`setThreadError`。`addEvent` 按 `threadId` 写入对应 state：

```ts
const previous = state.threadStates[threadId] ?? emptyThreadState()
const events = previous.events.some((item) => item.seq === event.seq)
  ? previous.events
  : [...previous.events, event]
const status = statusAfterEvent(previous.status, event)
```

`run.started` → running，`run.queued` → queued，`approval.requested` → waiting-approval（pendingApprovals+1），`approval.resolved` → running 且计数减一，终态 → completed/failed/interrupted。`addEvent` 仍更新活动镜像。

- [ ] **Step 4: 实现 connection 与 Host unsubscribe**

`Connection`：

```ts
private readonly subscriptions = new Map<string, number>()
async openThread(threadId: string): Promise<void> {
  if (!this.client) throw new Error("host not connected")
  this.subscriptions.set(threadId, 0)
  await this.subscribe(threadId, 0)
}
async closeThread(threadId: string): Promise<void> {
  this.subscriptions.delete(threadId)
  if (this.client) await this.client.call("thread.unsubscribe", { threadId })
}
async startRun(threadId: string, text: string): Promise<void> {
  await this.client?.call("run.start", { threadId, text })
}
```

`handleNotification` 的 `thread.event` 用 `event.threadId` 更新对应 cursor；`thread.delta` 路由给 `onDelta`。`attach` 重连时遍历 subscriptions 重新订阅。

`RpcServer` 用 `Map<threadId, () => void>` 保存订阅；同一线程再次订阅先释放旧的；新增 `thread.unsubscribe` 分支。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run packages/client-runtime/src/store.test.ts packages/client-runtime/src/connection.test.ts apps/host/src/rpc/subscribe.test.ts && pnpm --dir packages/client-runtime typecheck && pnpm --dir apps/host typecheck`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add packages/client-runtime/src apps/host/src/rpc
git commit -m "feat(client): track state and subscriptions per thread"
```

---

### Task 2: Multi-Tab Shell and Background Status

**Files:**
- Create: `frontend/packages/ui-shell/src/thread-tabs.tsx`
- Modify: `frontend/packages/ui-shell/src/index.ts`
- Modify: `frontend/packages/ui-chat/src/chat-view.tsx`
- Modify: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Modify: `frontend/packages/ui-primitives/src/locale/messages.zh-CN.ts`
- Modify: `frontend/packages/ui-primitives/src/locale/messages.en-US.ts`
- Test: `frontend/packages/ui-shell/src/thread-tabs.test.tsx`
- Test: `frontend/apps/desktop/e2e/m5-multi-session.spec.ts`（Task 11 完成端到端）

**Interfaces:**
- `ThreadTabsProps`：`threads`、`openThreadIds`、`activeThreadId`、`statusByThread`、`onActivate`、`onClose`。
- `ChatViewProps` 增加 `tabs?: ReactNode`，在 `.panel-top` 之前渲染。

- [ ] **Step 1: 写失败测试**

`thread-tabs.test.tsx`：打开两个线程，点击第二个触发 `onActivate`；运行中显示 `role="status"` 或 `data-status="running"`；点击关闭触发 `onClose` 且不触发 `onActivate`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-shell/src/thread-tabs.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现组件与容器**

`ThreadTabs` 使用 `role="tablist"`，每个 tab 是 `role="tab"`，状态点用 `data-status`，关闭按钮有 `aria-label`。第 2 个及以后 tab 显示标题；活动 tab 有 `aria-selected`。

`App.tsx`：
- `WorkspaceSidebar.onOpenThread` 调用 `deps.connection.openThread(threadId)` 与 `store.openThread(threadId)`，再 `store.setActiveThread(threadId)`。
- `onNewThread` 创建后自动打开 tab。
- `ChatViewContainer` 读取 `state.threadStates[activeThreadId]`，构造 `ThreadTabs` 传给 `ChatView`。
- 关闭 tab 调 `connection.closeThread`，若关闭的是活动 tab，激活相邻 tab。
- 后台线程完成或等待审批时 tab 显示状态；状态文案走 locale。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-shell/src/thread-tabs.test.tsx && pnpm test && pnpm lint && pnpm typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-shell packages/ui-chat packages/ui-primitives apps/desktop/src/renderer
git commit -m "feat(ui): add multi-thread tabs and background status"
```

---

### Task 3: Global Run Queue and Status Query

**Files:**
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/packages/contracts/src/events.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Test: `frontend/apps/host/src/providers/parallel.test.ts`
- Test: `frontend/apps/host/src/providers/queue.test.ts`

**Interfaces:**
- `run.list` 返回 `{ runs: Array<{ runId, threadId, status, queuedAt? }> }`。
- `run.start` 在并发上限达到时返回 `runId` 并排队，不抛 `TOO_MANY_ACTIVE_RUNS`；队列上限 `maxQueuedRuns`（默认 32）满时才抛错。
- 新事件 `run.queued`；`cancelRun` 支持取消排队中的 run。

- [ ] **Step 1: 写失败测试**

`queue.test.ts`：`maxConcurrentRuns: 1` 时启动两个线程，第二个状态为 `queued`、事件含 `run.queued`；第一个完成后第二个自动启动并完成。取消排队 run 后状态为 `interrupted`，不会执行。同一线程重复 start 仍拒绝。

更新 `parallel.test.ts` 中“超过上限被拒绝”的用例为“进入队列”。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/queue.test.ts apps/host/src/providers/parallel.test.ts`

Expected: FAIL，当前直接抛 `TOO_MANY_ACTIVE_RUNS`。

- [ ] **Step 3: 实现队列**

在 registry 中把“创建 run + 启动 execute”拆成 `createRun` 与 `launchRun`：

```ts
interface QueuedRun {
  run: ActiveRun
  input: UserInput
  resolve: () => void
}
const queued: QueuedRun[] = []
const maxQueuedRuns = config.maxQueuedRuns ?? 32
```

`startRun`：
- `activeThreads` 包含运行中与排队中的 thread，保证同一线程只有一个 run；
- 有空位立即 `launchRun`；否则 `runs.create({ status: "queued" })`、`append("run.queued")`、push；
- 返回 `{ runId, done }`，`done` 在最终终态时 resolve。

`finishRun` 末尾调用 `pump()`：`while (activeRuns.size < maxConcurrentRuns && queued.length > 0)` 取队首 `launchRun`。

`cancelRun`：
- 若在 `queued` 中，移除、`runs.setStatus("interrupted")`、append `run.interrupted`、释放 thread、resolve；
- 运行中沿用现状。

`run.list` 返回 `activeRuns` 与 `queued` 的 runId/threadId/status。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/queue.test.ts apps/host/src/providers/parallel.test.ts && pnpm --dir apps/host typecheck && pnpm lint`

Expected: PASS，registry 仍 ≤500 行；超限时抽取 `run-queue.ts`。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts packages/host/src/providers apps/host/src/rpc
git commit -m "feat(runs): queue parallel sessions and expose status"
```

---

### Task 4: Subagent Timeline

**Files:**
- Modify: `frontend/packages/contracts/src/events.ts`
- Modify: `frontend/apps/host/src/providers/claude/driver.ts`
- Modify: `frontend/apps/host/src/providers/claude/normalize.ts`
- Modify: `frontend/apps/host/src/providers/codex/normalize.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Create: `frontend/packages/ui-chat/src/subagent-card.tsx`
- Modify: `frontend/packages/ui-chat/src/message-list.tsx`
- Test: `frontend/apps/host/src/providers/claude/normalize.test.ts`
- Test: `frontend/apps/host/src/providers/codex/normalize.test.ts`
- Test: `frontend/packages/ui-chat/src/subagent-card.test.tsx`

**Interfaces:**
- `subagent.started` payload：`{ toolCallId, name, description?, model?, parentToolUseId? }`。
- `subagent.completed` payload：`{ toolCallId, output?, isError, status }`。
- `message.delta` / `message.completed` / `tool.started` / `tool.completed` 增加可选 `parentToolUseId`，用于把子 agent 内容归入父卡片。

- [ ] **Step 1: 写失败测试**

Claude normalize：构造 `parent_tool_use_id` 非空的 assistant/user 消息与 Task tool_use/result，期望 `subagent.started`、带 parent 的 `message.completed`、`subagent.completed`。

Codex normalize：构造 `item/started` / `item/completed` 的 `subAgentActivity`，`kind: "started"` 与 `"completed"` 分别产生事件。

子 agent UI：传入包含 parent 的事件，卡片默认折叠，点击后显示子消息；父 run 仍只产生一次 `run.completed`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/normalize.test.ts apps/host/src/providers/codex/normalize.test.ts packages/ui-chat/src/subagent-card.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现归一化**

Claude：
- `ClaudeDriver` 的 `query()` options 增加 `forwardSubagentText: true`。
- `NormalizeState` 增加 `subagents: Map<string, { name: string; description?: string }>`。
- assistant 消息中 `tool_use.name` 为 `Task` 或 `Agent` 时，emit `subagent.started`，并把 toolCallId 记入 map。
- `parent_tool_use_id` 非空时，文本/工具事件带 `parentToolUseId`；`message.completed` 不再冒充主助手消息，payload 带 parent。
- 遇到对应 `tool_result` 时 emit `subagent.completed`，`isError` 取 `block.is_error`。

Codex：
- `normalizeItem` 增加 `subAgentActivity`：`kind === "started"` → `subagent.started`；`completed`/`interrupted` → `subagent.completed`；其他 kind 忽略。
- `collabToolCall` 若出现，也映射为 `subagent.started`（receiverThreadIds 逐个）。

registry 的 `handleProviderEvent` 增加 `subagent.started` / `subagent.completed` 分支，写入线程事件；`parentToolUseId` 原样放入 payload。

- [ ] **Step 4: 实现 UI**

`SubagentCard` 使用 `<details>`，标题显示 name + 状态；子事件（message/tool）按 seq 渲染为紧凑行。`MessageList` 遇到 `subagent.started` 渲染卡片，并跳过带 `parentToolUseId` 的顶层消息/工具卡（它们已在子卡片内）。父 run 的 `run.completed` 仍正常结束。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude apps/host/src/providers/codex packages/ui-chat && pnpm typecheck && pnpm lint`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add packages/contracts apps/host/src/providers packages/ui-chat
git commit -m "feat(agents): show subagent timelines"
```

---

### Task 5: MCP Bridge Core and Plugin SDK

**Files:**
- Modify: `frontend/packages/plugin-sdk/src/host.ts`
- Modify: `frontend/packages/plugin-sdk/src/manifest.ts`
- Create: `frontend/apps/host/src/services/mcp-bridge.ts`
- Create: `frontend/apps/host/src/mcp/stdio-bridge.mjs`
- Modify: `frontend/apps/host/src/kernel/app.ts` / `frontend/scripts/build-host.mjs`
- Modify: `frontend/apps/host/src/storage/migrations.ts`（如需要 tool 记录）
- Test: `frontend/apps/host/src/services/mcp-bridge.test.ts`

**Interfaces:**
- Plugin SDK：
  ```ts
  export interface McpToolDefinition {
    name: string
    description: string
    inputSchema: Record<string, unknown>
  }
  export interface McpBridgeApi {
    registerTool(pluginId: string, tool: McpToolDefinition, handler: (input: unknown) => Promise<unknown>): () => void
    listTools(): McpToolDefinition[]
  }
  ```
  `PluginHostContext` 增加 `mcp: McpBridgeApi`。
- Host 服务 `mcpBridge`：
  ```ts
  interface McpBridgeService {
    listTools(threadId: string): McpToolDefinition[]
    callTool(threadId: string, name: string, input: unknown): Promise<unknown>
    createSocketServer(): Promise<{ socketPath: string; close(): Promise<void> }>
    claudeServer(threadId: string): McpSdkServerConfigWithInstance | null
    codexConfig(threadId: string): Record<string, unknown> | null
  }
  ```

- [ ] **Step 1: 写失败测试**

`mcp-bridge.test.ts`：注册工具后 `listTools` 包含它；`callTool` 返回 handler 结果；注销后消失；未知工具抛错；两个线程调用同一工具时 handler 收到对应 `threadId`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/mcp-bridge.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现工具注册与 Claude server**

`mcp-bridge.ts` 维护 `Map<pluginId, Map<name, { tool, handler }>>`。`claudeServer(threadId)` 用 `createSdkMcpServer({ name: "pigcode", version: "0.1.0", tools })` 生成 server；每个 tool 的 handler 调用 `callTool(threadId, name, input)`。若没有工具返回 `null`。

`PluginHostContext.mcp` 由 kernel 在加载 Host 插件前注入；`plugins.ts` 的插件 context 需要能拿到它。若 Cordis 服务注入更自然，注册 `ctx.provide("mcp", api)` 并由 SDK 的 `PluginHostContext` 转发。

- [ ] **Step 4: 实现 Unix socket 服务与 stdio 桥**

Host `mcpBridge.createSocketServer()`：
- `net.createServer` 监听 `process.platform === "win32" ? "\\\\.\\pipe\\pigcode-mcp-<pid>" : join(tmpdir(), "pigcode-mcp-<pid>.sock")`；
- 连接首行 `{ type: "hello", token }`；token 由 `randomUUID()` 生成，映射到 threadId；
- 接收 `{ type: "tools/list" }` 与 `{ type: "tools/call", name, arguments }`，返回对应 JSON；连接断开时清理。

`apps/host/src/mcp/stdio-bridge.mjs`：
- 从 `PIGCODE_MCP_SOCKET` 连接 `net`，发送 hello；
- 读 stdin 的 NDJSON MCP 消息；
- `initialize` 返回 protocolVersion/capabilities/serverInfo；
- `tools/list` 转发到 socket；
- `tools/call` 转发并返回 `{ content: [{ type: "text", text: JSON.stringify(result) }] }`；
- `ping` 返回 `{}`；未知方法返回 JSON-RPC error。

构建脚本把 `stdio-bridge.mjs` 复制到 `out/host/mcp/stdio-bridge.mjs`，Host 通过 `new URL("./mcp/stdio-bridge.mjs", import.meta.url)` 定位。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/mcp-bridge.test.ts && pnpm --dir apps/host typecheck && pnpm lint`

Expected: PASS；同时手动跑一次 `node apps/host/src/mcp/stdio-bridge.mjs` 的协议冒烟（无 socket 时应返回可读错误）。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add packages/plugin-sdk apps/host/src/services/mcp-bridge.ts apps/host/src/mcp scripts/build-host.mjs
git commit -m "feat(mcp): add thread-scoped bridge and plugin tools"
```

---

### Task 6: MCP Provider Injection and Sample

**Files:**
- Modify: `frontend/apps/host/src/providers/driver.ts`
- Modify: `frontend/apps/host/src/providers/claude/driver.ts`
- Modify: `frontend/apps/host/src/providers/codex/driver.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Create: `frontend/examples/capability-clock/package.json`
- Create: `frontend/examples/capability-clock/index.mjs`
- Test: `frontend/apps/host/src/providers/claude/driver.test.ts`
- Test: `frontend/apps/host/src/providers/codex/driver.test.ts`
- Test: `frontend/apps/host/src/services/sample-mcp.test.ts`

**Interfaces:**
- `CreateSessionInput` 增加 `mcp?: { claudeServer?: unknown; codexConfig?: Record<string, unknown> }`。
- Claude `query()` options 增加 `mcpServers`；Codex `thread/start`/`thread/resume` params 增加 `config`。

- [ ] **Step 1: 写失败测试**

Claude driver：注入 fake MCP server，断言 `query` 收到 `mcpServers`。Codex driver：注入 fake config，断言 `thread/start` 的 `config.mcp_servers.pigcode` 存在，且 resume 也带 config。

Sample：安装 `capability-clock`，启用后 `ctx.mcpBridge.listTools(threadId)` 含 `clock_now`；调用返回 ISO 时间；停用后工具消失。`provider capabilities` 的 `mcp` 对 Claude/Codex 均为 true。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/driver.test.ts apps/host/src/providers/codex/driver.test.ts apps/host/src/services/sample-mcp.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现 provider 注入**

registry 在 `startRun` 调 `driver.createSession` 前：
```ts
const mcpBridge = ctx.reflect.get("mcpBridge") as McpBridgeService | undefined
const mcp = mcpBridge
  ? { claudeServer: mcpBridge.claudeServer(threadId), codexConfig: mcpBridge.codexConfig(threadId) }
  : undefined
```
把 `mcp` 放入 `CreateSessionInput`。

Claude driver：
```ts
const queryOptions = {
  ...,
  ...(input.mcp?.claudeServer ? { mcpServers: { pigcode: input.mcp.claudeServer } } : {}),
}
```
Codex driver：`createThreadParams` 合并 `config: input.mcp?.codexConfig`；resume 同样传入。

- [ ] **Step 4: 实现样例**

`capability-clock/index.mjs`：
```js
export function apply(ctx) {
  return ctx.mcp.registerTool(
    "pigcode-capability-clock",
    { name: "clock_now", description: "Return the current ISO time", inputSchema: { type: "object", properties: {} } },
    async () => ({ now: new Date().toISOString() }),
  )
}
```

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/claude/driver.test.ts apps/host/src/providers/codex/driver.test.ts apps/host/src/services/sample-mcp.test.ts && pnpm test && pnpm lint && pnpm typecheck`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add apps/host/src/providers examples/capability-clock apps/host/src/services/sample-mcp.test.ts
git commit -m "feat(mcp): inject plugin tools into claude and codex"
```

---

### Task 7: GitHub PR Integration

**Files:**
- Create: `frontend/apps/host/src/services/github.ts`
- Modify: `frontend/apps/host/src/services/git.ts`（当前分支辅助）
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Create: `frontend/packages/ui-workbench/src/pr-panel.tsx`
- Modify: `frontend/packages/ui-workbench/src/right-panel.tsx`
- Modify: `frontend/packages/ui-workbench/src/index.ts`
- Modify: `frontend/apps/desktop/src/renderer/src/workbench.tsx`
- Modify: locale files
- Test: `frontend/apps/host/src/services/github.test.ts`
- Test: `frontend/packages/ui-workbench/src/pr-panel.test.tsx`

**Interfaces:**
- 命令 `pr.status({ threadId })` 返回 `{ number, url, state, title, headRefName, baseRefName } | null`。
- 命令 `pr.create({ threadId, title, body?, base? })` 返回同结构。
- `GhRunner = (args: string[], cwd: string) => Promise<string>`，默认 `execFile("gh", args, { cwd })`；测试注入 fake。

- [ ] **Step 1: 写失败测试**

`github.test.ts`：fake runner 断言 `gh pr create` 参数含 `--title`/`--body`/`--json`；`gh pr view` 返回解析后的对象；`gh` 不存在时抛 `GH_NOT_AVAILABLE`；未登录时抛出可读错误。UI 测试：空状态、创建表单、状态徽标。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/github.test.ts packages/ui-workbench/src/pr-panel.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现 Host 服务**

`github.ts`：
```ts
export class GhNotAvailableError extends Error { readonly code = "GH_NOT_AVAILABLE" }
export class GithubService {
  constructor(private readonly run: GhRunner = defaultGhRunner) {}
  async status(threadId: string): Promise<PullRequestInfo | null>
  async create(threadId: string, input: { title: string; body?: string; base?: string }): Promise<PullRequestInfo>
}
```
`status` 先 `git rev-parse --abbrev-ref HEAD`，再 `gh pr view <branch> --json number,url,state,title,headRefName,baseRefName`；无 PR 返回 null。`create` 调 `gh pr create --head <branch> --title ... --body ... --json ...`。所有 `gh` 调用带 `cwd = resolveThreadCwd(...)`。

- [ ] **Step 4: 实现 UI 与 RPC**

右栏增加 `pr` tab；`PrPanel` 输入标题/描述，调用 `pr.create`；状态卡显示 number/state/url（`shell.openExternal` 由 native bridge 或普通 `<a target="_blank">`）。`WorkbenchPanel` 激活 `pr` tab 时调用 `pr.status`。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/github.test.ts packages/ui-workbench/src/pr-panel.test.tsx && pnpm typecheck && pnpm lint`

Expected: PASS。真实 `gh` 不联网测试，只在有登录态时手动验证。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add apps/host/src/services/github.ts apps/host/src/rpc packages/contracts packages/ui-workbench apps/desktop/src/renderer
git commit -m "feat(git): create and inspect github pull requests"
```

---

### Task 8: Local Browser Preview

**Files:**
- Create: `frontend/apps/desktop/src/main/preview.ts`
- Modify: `frontend/apps/desktop/src/main/index.ts`
- Modify: `frontend/apps/desktop/src/preload/index.ts`
- Modify: `frontend/apps/desktop/src/renderer/src/global.d.ts`
- Create: `frontend/packages/ui-workbench/src/preview-panel.tsx`
- Modify: `frontend/packages/ui-workbench/src/right-panel.tsx`
- Modify: `frontend/apps/desktop/src/renderer/src/workbench.tsx`
- Test: `frontend/apps/desktop/src/main/preview.test.ts`
- Test: `frontend/packages/ui-workbench/src/preview-panel.test.tsx`

**Interfaces:**
- `isAllowedPreviewUrl(value: string): boolean` 只允许 loopback http/https。
- preload：`previewOpen(url: string): Promise<{ id: string }>`、`previewClose(id?: string): void`。
- IPC：`pigcode:preview-open`、`pigcode:preview-close`。

- [ ] **Step 1: 写失败测试**

`preview.test.ts`：允许 `http://localhost:3000`、`http://127.0.0.1`、`https://[::1]:8443`；拒绝 `https://example.com`、`file://`、`javascript:`、空串。UI 测试：非法 URL 显示错误，合法 URL 调用 `previewOpen`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/desktop/src/main/preview.test.ts packages/ui-workbench/src/preview-panel.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现主进程窗口**

`preview.ts`：
```ts
const windows = new Map<string, BrowserWindow>()
export function openPreview(url: string): { id: string } {
  if (!isAllowedPreviewUrl(url)) throw new Error("PREVIEW_URL_NOT_ALLOWED")
  const id = randomUUID()
  const window = new BrowserWindow({
    width: 1100, height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  window.loadURL(url)
  windows.set(id, window)
  window.on("closed", () => windows.delete(id))
  return { id }
}
```
`index.ts` 注册 IPC；`preload` 暴露 typed API。

- [ ] **Step 4: 实现 UI**

`PreviewPanel`：URL 输入（默认 `http://localhost:3000`）、打开按钮、错误提示；不内嵌 iframe，点击后由 Electron 子窗口打开。右栏增加 `preview` tab。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run apps/desktop/src/main/preview.test.ts packages/ui-workbench/src/preview-panel.test.tsx && pnpm typecheck && pnpm lint`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add apps/desktop/src/main apps/desktop/src/preload packages/ui-workbench apps/desktop/src/renderer
git commit -m "feat(preview): open loopback urls in a sandboxed window"
```

---

### Task 9: Scheduled Tasks

**Files:**
- Modify: `frontend/apps/host/src/storage/migrations.ts`
- Create: `frontend/apps/host/src/services/schedules.ts`
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Modify: `frontend/apps/host/src/kernel/app.ts` / `frontend/scripts/build-host.mjs`
- Create: `frontend/packages/ui-settings/src/schedules-page.tsx`
- Modify: `frontend/packages/ui-settings/src/settings-view.tsx`
- Modify: `frontend/packages/ui-settings/src/settings-nav.tsx`
- Modify: `frontend/packages/ui-shell/src/settings-sidebar.tsx`
- Modify: locale files
- Test: `frontend/apps/host/src/services/schedules.test.ts`
- Test: `frontend/packages/ui-settings/src/schedules-page.test.tsx`

**Interfaces:**
- Migration 4：
  ```sql
  CREATE TABLE schedules (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    prompt TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL,
    enabled INTEGER NOT NULL,
    next_run_at TEXT NOT NULL,
    last_run_at TEXT,
    last_run_id TEXT,
    created_at TEXT NOT NULL
  );
  ```
- 命令：`schedule.list`、`schedule.create`、`schedule.update`、`schedule.delete`、`schedule.runNow`。
- `SchedulesService` 支持 `start()`/`stop()`，内部用 `setTimeout` 链，避免重叠。

- [ ] **Step 1: 写失败测试**

`schedules.test.ts` 用 `vi.useFakeTimers()`：创建每 60 秒任务后推进 60 秒，`providers.startRun` 被调用一次；线程忙时跳过并保留 next；Host 重建后用同一 DB 恢复任务，`next_run_at` 保留；`delete` 后不再触发。UI 测试：列表、创建、启停、删除。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/schedules.test.ts packages/ui-settings/src/schedules-page.test.tsx`

Expected: FAIL。

- [ ] **Step 3: 实现服务**

`SchedulesService`：
- `list()` 从 SQLite 读取并按 `next_run_at` 排序；
- `create({ threadId, prompt, intervalSeconds, enabled })` 计算 `nextRunAt = now + interval`；
- `arm(schedule)` 用 `setTimeout`；触发时若 `providers` 可用且线程无活动 run，调用 `startRun`，更新 `lastRunAt`/`nextRunAt`；若线程忙，只更新 next；
- `start()` 在 Host 启动时读取全部 enabled 任务，过期的立即补跑一次后重排；
- `stop()` 清理所有 timer；`ctx.effect(() => () => stop())`。

Kernel 在 `entry.ts` 中启动 schedules（在其他 core 服务之后）；build profile 增加 `core.schedules`。

- [ ] **Step 4: 实现 UI**

设置增加 `schedules` 分区；`SchedulesPage` 列出线程选择、prompt、间隔秒数、启停、删除、立即运行。所有文案走 locale。

- [ ] **Step 5: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/schedules.test.ts packages/ui-settings/src/schedules-page.test.tsx && pnpm test && pnpm lint && pnpm typecheck`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add apps/host/src/storage apps/host/src/services/schedules.ts apps/host/src/kernel apps/host/src/rpc packages/contracts packages/ui-settings packages/ui-shell scripts/build-host.mjs
git commit -m "feat(schedules): persist and run interval tasks"
```

---

### Task 10: Native Fork First, Handoff Fallback

**Files:**
- Modify: `frontend/apps/host/src/providers/driver.ts`
- Modify: `frontend/apps/host/src/providers/claude/driver.ts`
- Modify: `frontend/apps/host/src/providers/codex/driver.ts`
- Modify: `frontend/apps/host/src/providers/switching.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Test: `frontend/apps/host/src/providers/switch.test.ts`
- Test: `frontend/apps/host/src/providers/codex/driver.test.ts`

**Interfaces:**
- `CreateSessionInput` 增加 `forkFromNativeSessionId?: string`。
- Claude：`query` options `resume: forkFromNativeSessionId, forkSession: true`。
- Codex：`thread/fork` 请求 `{ threadId: forkFromNativeSessionId, ...params }`，使用返回的新 thread id。
- `switchProvider` 在同一 provider 且存在 active native session 时创建 fork；跨 provider 仍用 handoff。

- [ ] **Step 1: 写失败测试**

fake driver 记录 `createSession` 入参：同一 provider 切换时收到 `forkFromNativeSessionId`，且没有 handoff；跨 provider 时收到 handoff，不传 fork。Codex driver 测试断言调用 `thread/fork` 而不是 `thread/resume`。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/switch.test.ts apps/host/src/providers/codex/driver.test.ts`

Expected: FAIL。

- [ ] **Step 3: 实现**

`switchProvider`：
- 读取 active session；若 `active.providerId === providerId` 且 `active.nativeSessionId`，设置 `forkFrom`；
- 否则生成增强 handoff（最近 3 条 user/assistant 文本 + 最近工具名）；
- 写入 `thread.updated` 的 `handoff` 或 `forkFromNativeSessionId`；
- registry `startRun` 读取 pending fork/handoff，传给 `createSession`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/switch.test.ts apps/host/src/providers/codex/driver.test.ts && pnpm test && pnpm lint && pnpm typecheck`

Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/providers
git commit -m "feat(providers): prefer native fork on provider switch"
```

---

### Task 11: Multi-Session E2E and Real Codex `gpt-6.1-sol`

**Files:**
- Create: `frontend/apps/host/src/providers/multi-session.real.test.ts`
- Create: `frontend/scripts/real-codex-multi.mjs`
- Modify: `frontend/package.json`（`real:codex:multi`）
- Create: `frontend/apps/desktop/e2e/m5-multi-session.spec.ts`
- Create: `frontend/apps/desktop/e2e/m5-real-codex.spec.ts`
- Modify: `frontend/apps/host/src/providers/fake.ts`（可选慢速模式）

**Interfaces:**
- 真实测试从 `PIGCODE_CODEX_MODEL` 读取模型，默认 `gpt-6.1-sol`；两个线程并行运行，prompt 为 `Reply with exactly OK-1` / `OK-2`，断言各自收到对应文本且两个 run 都完成。
- E2E 使用 fake provider（确定性）覆盖 tab 切换、后台状态、关闭 tab；真实 Codex E2E 仅在 `PIGCODE_REAL_CODEX=1` 时运行。

- [ ] **Step 1: 写失败测试**

`multi-session.real.test.ts` 在 `PIGCODE_REAL_CODEX !== "1"` 时 `it.skipIf`。测试建立真实 storage/projects/threads/sessions/providers，创建两个 codex thread，`Promise.all` 启动两个 run，等待 done，断言两条 assistant 文本。

Playwright `m5-multi-session.spec.ts`：添加项目、创建两个线程、两个 tab 都打开；在第一个发送后切到第二个，确认第一个 tab 显示 running/queued，完成后切回看到结果；关闭 tab 不崩溃。使用 `PIGCODE_FAKE_DELAY_MS=800` 让 fake provider 有可观察的运行窗口。

- [ ] **Step 2: 运行确定性测试确认失败**

Run: `cd frontend && PIGCODE_FAKE_DELAY_MS=800 pnpm vitest run apps/host/src/providers/multi-session.real.test.ts`（跳过）以及 `cd apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m5-multi-session.spec.ts`
Expected: 前者 skip；后者 FAIL（tab/后台状态未实现）。

- [ ] **Step 3: 实现真实 Codex 测试与脚本**

```ts
const model = process.env.PIGCODE_CODEX_MODEL ?? "gpt-6.1-sol"
const driver = new CodexDriver()
// 两个 thread 各自 startRun；等待 done；断言 message.completed 文本
```
`scripts/real-codex-multi.mjs` 以 `PIGCODE_REAL_CODEX=1` 和 `PIGCODE_CODEX_MODEL=gpt-6.1-sol` 运行该 vitest 文件。

- [ ] **Step 4: 实现 E2E 与 fake 延迟**

`FakeProviderDriver` 增加可选 `delayMs`（从 `PIGCODE_FAKE_DELAY_MS` 读取），在 send 中 `await new Promise(resolve => setTimeout(resolve, delayMs))`。E2E 通过 tab 状态与文本断言验证后台运行。

- [ ] **Step 5: 运行真实 Codex 多会话测试**

Run:
```bash
cd frontend
PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6.1-sol pnpm real:codex:multi
```
Expected: PASS，两个线程均完成，文本分别包含 `OK-1` 与 `OK-2`；记录耗时与模型。若账号额度不足，记录原始错误并保留确定性测试通过事实。

- [ ] **Step 6: 提交**

```bash
cd frontend
git add apps/host/src/providers/multi-session.real.test.ts scripts/real-codex-multi.mjs package.json apps/desktop/e2e apps/host/src/providers/fake.ts
git commit -m "test(sessions): cover parallel sessions with codex 6.1 sol"
```

---

### Task 12: Documentation and Final Verification

**Files:**
- Create: `frontend/docs/m5-ecosystem.md`
- Modify: `frontend/README.md`
- Modify: `frontend/docs/plugin-authoring.md`（MCP tool 示例）
- Test: full gates + E2E

**Interfaces:**
- 文档包括：多 tab/队列、子 agent、MCP 工具注册、PR、预览限制、定时任务、真实 Codex 测试命令与 `gpt-6.1-sol`。

- [ ] **Step 1: 写文档**

`m5-ecosystem.md` 覆盖：
- 多会话：tab、后台状态、队列上限、取消；
- 子 agent：Claude/Codex 事件差异；
- MCP：capability 插件注册工具、Claude/Codex 注入方式、thread 隔离；
- PR：`gh` 前置条件与命令；
- 预览：仅 loopback；
- 定时任务：间隔语义、重启恢复、Host 退出期间不触发；
- 真实测试：`PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6.1-sol pnpm real:codex:multi`。

- [ ] **Step 2: 运行全量门禁**

Run:
```bash
cd frontend
pnpm test
pnpm lint
pnpm typecheck
```
Expected: 全部通过；真实 provider 测试按环境变量跳过。

- [ ] **Step 3: 运行 E2E**

Run:
```bash
cd frontend/apps/desktop
PIGCODE_E2E=1 pnpm exec playwright test e2e/m0-b.spec.ts e2e/m3-workbench.spec.ts e2e/m4-plugins.spec.ts e2e/m5-multi-session.spec.ts
```
Expected: 全部通过。视觉基线如有变化，更新并说明原因。

- [ ] **Step 4: 运行真实 Codex 多会话**

Run:
```bash
cd frontend
PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6.1-sol pnpm real:codex:multi
```
Expected: PASS。记录两个线程的完成顺序、耗时与文本。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add docs README.md
git commit -m "docs: document multi-session and ecosystem features"
```

---

## M5 Acceptance Checklist

- [ ] 多个会话并行运行，超过上限时进入队列；UI 显示运行中/排队/等待审批/完成/失败状态。
- [ ] 后台线程完成或请求审批时，非活动 tab 有可见状态提示。
- [ ] 子 agent 在时间线中可展开/折叠，父 run 只结束一次。
- [ ] Claude 与 Codex 都能看到 capability 插件注册的 MCP 工具；工具调用按 thread 隔离。
- [ ] 能通过 `gh` 创建 PR 并在右栏看到状态；未安装/未登录时有可读错误。
- [ ] 预览只允许 loopback URL，且在沙箱子窗口中打开。
- [ ] 定时任务在 Host 运行期间触发，重启后从 SQLite 恢复，不重复并发执行同一线程。
- [ ] 同一 provider 切换优先原生 fork；跨 provider 使用增强 handoff。
- [ ] 真实 Codex 两个线程并行测试使用 `gpt-6.1-sol` 并通过。
- [ ] `pnpm test`、`pnpm lint`、`pnpm typecheck`、M0–M5 E2E 全部通过。
