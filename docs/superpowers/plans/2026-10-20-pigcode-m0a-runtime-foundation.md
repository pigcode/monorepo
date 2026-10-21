# Pigcode M0-A Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个可运行的 Pigcode 运行时垂直切片：Electron 窗口 + Host utilityProcess + MessagePort RPC + SQLite 事件日志 + fake provider + 插件安装/启停，用最小调试 UI 验证协议和插件模型。

**Architecture:** Electron main 启动 Host `utilityProcess`，用两条 `MessageChannelMain`（控制通道 main↔Host，应用通道 Renderer↔Host）通信；Host 内运行 Cordis 插件树，SQLite 保存事件日志与投影；Renderer 在 M0-A 只做纯 TypeScript 调试界面，M0-B 再迁移 pigclaude UI 与 Base UI。

**Tech Stack:** TypeScript 5.9、Node 22+、pnpm 10.28.2、Electron 43.4.1、electron-vite 5、Cordis 4.0.0-rc.11、`@cordisjs/plugin-loader` 1.0.0-rc.8、Zod 4、better-sqlite3 13.0.3、Vitest 4。

## Global Constraints

- Node `>=22`，包管理器 `pnpm@10.28.2`。
- 所有包使用 ESM（`"type": "module"`），包名 `@pigcode/*`。
- TypeScript `strict: true`；禁止 `any`、`@ts-ignore`、`@ts-expect-error`。
- 每个 `.ts`/`.tsx` 文件最多 500 行；每个源文件开头一段中文注释；导出的函数/类型/方法有中文注释。
- 不使用 `bundle-` 前缀；composition package 直接命名为 `@pigcode/base`、`@pigcode/workspace`、`@pigcode/providers`、`@pigcode/terminal`、`@pigcode/ui`。
- Cordis 固定版本：`cordis@4.0.0-rc.11`、`@cordisjs/plugin-loader@1.0.0-rc.8`。M0-A 只接 `cordis` 与 loader；HMR/timer/logger-console 在 M1 接入。
- SQLite 使用 `better-sqlite3@13.0.3`，开启 WAL 与 `foreign_keys`。
- 协议版本固定为 `1`；事件 `schemaVersion` 固定为 `1`。
- Electron 固定 `43.4.1`；Host 使用 `utilityProcess`；不使用 localhost HTTP/WebSocket、端口、bearer token、CORS。
- M0-A 不引入 React、Base UI 或 pigclaude UI；渲染层是纯 TypeScript 调试界面。UI 迁移在 M0-B。
- 测试使用 Vitest 4；每个任务必须先写失败测试，再实现。
- 提交信息使用 Conventional Commits。

---

## File Structure

```text
frontend/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.mjs
  prettier.config.mjs
  vitest.config.ts
  packages/
    contracts/
      package.json
      src/index.ts
      src/protocol.ts
      src/domain.ts
      src/events.ts
      src/commands.ts
      src/protocol.test.ts
      src/domain.test.ts
    plugin-sdk/
      package.json
      src/index.ts
      src/manifest.ts
      src/host.ts
      src/client.ts
      src/slots.ts
      src/manifest.test.ts
    client-runtime/
      package.json
      src/index.ts
      src/transport.ts
      src/rpc-client.ts
      src/rpc-client.test.ts
  apps/
    host/
      package.json
      tsconfig.json
      src/index.ts
      src/kernel/profile.ts
      src/kernel/app.ts
      src/kernel/cli.ts
      src/kernel/app.test.ts
      src/storage/database.ts
      src/storage/migrations.ts
      src/storage/event-store.ts
      src/storage/receipt-store.ts
      src/storage/event-store.test.ts
      src/services/storage.ts
      src/services/projects.ts
      src/services/threads.ts
      src/services/sessions.ts
      src/providers/driver.ts
      src/providers/fake.ts
      src/providers/registry.ts
      src/rpc/server.ts
      src/rpc/memory-transport.ts
      src/rpc/server.test.ts
      profiles/desktop.yml
    desktop/
      package.json
      electron.vite.config.ts
      src/main/index.ts
      src/main/host-process.ts
      src/main/protocol.ts
      src/main/protocol.test.ts
      src/preload/index.ts
      src/renderer/index.html
      src/renderer/src/main.ts
      playwright.config.ts
      e2e/m0-a.spec.ts
  examples/
    capability-session-info/
      package.json
      index.mjs
    ui-debug-panel/
      package.json
      client.mjs
  scripts/
    build-host.mjs
```

---

### Task 1: Bootstrap Monorepo

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/pnpm-workspace.yaml`
- Create: `frontend/tsconfig.base.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/eslint.config.mjs`
- Create: `frontend/prettier.config.mjs`
- Create: `frontend/.gitignore`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/packages/contracts/package.json`
- Create: `frontend/packages/contracts/tsconfig.json`
- Create: `frontend/packages/contracts/src/index.ts`
- Test: `frontend/packages/contracts/src/smoke.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces: workspace 根脚本 `pnpm test`、`pnpm lint`、`pnpm typecheck`；`@pigcode/contracts` 包可被其他包导入。

- [ ] **Step 1: 创建根配置**

`frontend/package.json`：

```json
{
  "name": "pigcode-frontend",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.28.2",
  "engines": { "node": ">=22" },
  "scripts": {
    "build": "pnpm -r --if-present build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint .",
    "format": "prettier --check .",
    "typecheck": "pnpm -r --if-present typecheck"
  },
  "devDependencies": {
    "@types/node": "24.10.1",
    "eslint": "9.39.5",
    "prettier": "3.9.10",
    "typescript": "5.9.3",
    "typescript-eslint": "8.71.2",
    "vitest": "4.0.16"
  }
}
```

`frontend/pnpm-workspace.yaml`：

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "vendor/*"
  - "examples/*"
```

`frontend/tsconfig.base.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`frontend/tsconfig.json`：

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["packages/**/*.ts", "apps/**/*.ts"]
}
```

`frontend/eslint.config.mjs`：

```js
import tseslint from "typescript-eslint"

export default tseslint.config(
  { ignores: ["**/dist/**", "**/out/**", "**/node_modules/**", "**/target/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": "error",
      "max-lines": ["error", 500],
    },
  },
)
```

`frontend/prettier.config.mjs`：

```js
export default {
  printWidth: 100,
  semi: false,
  singleQuote: false,
  trailingComma: "all",
  arrowParens: "always",
}
```

`frontend/.gitignore`：

```gitignore
node_modules/
dist/
out/
coverage/
*.log
.DS_Store
```

`frontend/vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    environment: "node",
  },
})
```

`frontend/packages/contracts/package.json`：

```json
{
  "name": "@pigcode/contracts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "4.4.3" },
  "devDependencies": { "typescript": "5.9.3" }
}
```

`frontend/packages/contracts/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true },
  "include": ["src/**/*.ts"]
}
```

`frontend/packages/contracts/src/index.ts`：

```ts
/** Pigcode 共享协议与领域类型的入口。 */
export {}
```

- [ ] **Step 2: 写 smoke 测试**

`frontend/packages/contracts/src/smoke.test.ts`：

```ts
import { describe, expect, it } from "vitest"

describe("contracts workspace", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 3: 安装并运行**

Run: `cd frontend && pnpm install && pnpm test`
Expected: smoke test PASS。

- [ ] **Step 4: 运行 lint**

Run: `cd frontend && pnpm lint`
Expected: PASS（如 eslint 尚未识别 TS，给根目录加 `tsconfig.json` 继承 `tsconfig.base.json`）。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add .
git commit -m "chore: bootstrap pigcode frontend monorepo"
```

---

### Task 2: Contracts Protocol Envelope and Errors

**Files:**
- Create: `frontend/packages/contracts/src/protocol.ts`
- Modify: `frontend/packages/contracts/src/index.ts`
- Test: `frontend/packages/contracts/src/protocol.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `@pigcode/contracts`。
- Produces: `PROTOCOL_VERSION`、`rpcRequestSchema`、`rpcSuccessSchema`、`rpcFailureSchema`、`rpcNotificationSchema`、`rpcErrorSchema`、`parseRpcRequest()`、`RpcRequest`、`RpcError`。

- [ ] **Step 1: 写失败测试**

`frontend/packages/contracts/src/protocol.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { PROTOCOL_VERSION, parseRpcRequest, rpcFailureSchema } from "./protocol"

describe("protocol", () => {
  it("parses a valid request", () => {
    const request = parseRpcRequest({
      jsonrpc: "2.0",
      id: "req-1",
      method: "project.list",
      params: {},
    })
    expect(request.method).toBe("project.list")
    expect(PROTOCOL_VERSION).toBe(1)
  })

  it("rejects a malformed envelope", () => {
    expect(() => parseRpcRequest({ jsonrpc: "1.0", id: "x", method: "a" })).toThrow()
  })

  it("keeps stable error codes", () => {
    const failure = rpcFailureSchema.parse({
      jsonrpc: "2.0",
      id: "req-1",
      error: { code: "PROVIDER_NOT_INSTALLED", message: "missing", retryable: false },
    })
    expect(failure.error.code).toBe("PROVIDER_NOT_INSTALLED")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/contracts/src/protocol.test.ts`
Expected: FAIL，`Cannot find module './protocol'`。

- [ ] **Step 3: 实现协议 schema**

`frontend/packages/contracts/src/protocol.ts`：

```ts
/** 定义 Renderer 与 Host 之间的版本化 RPC 信封与稳定错误结构。 */
import { z } from "zod"

export const PROTOCOL_VERSION = 1 as const

export const rpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.unknown().optional(),
})

export const rpcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
  retryable: z.boolean().optional(),
})

export const rpcSuccessSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string().min(1),
  result: z.unknown(),
})

export const rpcFailureSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.string().min(1),
  error: rpcErrorSchema,
})

export const rpcNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string().min(1),
  params: z.unknown().optional(),
})

export type RpcRequest = z.infer<typeof rpcRequestSchema>
export type RpcError = z.infer<typeof rpcErrorSchema>
export type RpcSuccess = z.infer<typeof rpcSuccessSchema>
export type RpcFailure = z.infer<typeof rpcFailureSchema>
export type RpcNotification = z.infer<typeof rpcNotificationSchema>

/** 解析请求；非法信封直接抛错，调用方负责转换成 RpcFailure。 */
export function parseRpcRequest(value: unknown): RpcRequest {
  return rpcRequestSchema.parse(value)
}
```

`frontend/packages/contracts/src/index.ts`：

```ts
/** Pigcode 共享协议与领域类型的入口。 */
export * from "./protocol"
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/contracts/src/protocol.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts
git commit -m "feat(contracts): add versioned RPC envelope"
```

---

### Task 3: Contracts Domain, Events, and Commands

**Files:**
- Create: `frontend/packages/contracts/src/domain.ts`
- Create: `frontend/packages/contracts/src/events.ts`
- Create: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/packages/contracts/src/index.ts`
- Test: `frontend/packages/contracts/src/domain.test.ts`

**Interfaces:**
- Consumes: Task 2 的协议类型。
- Produces: `Project`、`Thread`、`Run`、`RunStatus`、`ProviderCapabilities`、`ThreadEvent`、`ProviderEvent`、`commandSchemas`、`CommandMethod`。

- [ ] **Step 1: 写失败测试**

`frontend/packages/contracts/src/domain.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { commandSchemas, threadSchema } from "./index"

describe("domain contracts", () => {
  it("parses a thread", () => {
    const thread = threadSchema.parse({
      id: "th_1",
      projectId: "pr_1",
      title: "First thread",
      defaultProviderId: "fake",
      lastProviderId: null,
      lastModelId: null,
      permissionMode: "workspace-write",
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
      archivedAt: null,
      lastRunId: null,
    })
    expect(thread.permissionMode).toBe("workspace-write")
  })

  it("validates run.start params", () => {
    const params = commandSchemas["run.start"].parse({ threadId: "th_1", text: "hello" })
    expect(params.threadId).toBe("th_1")
  })

  it("rejects an empty run.start text", () => {
    expect(() => commandSchemas["run.start"].parse({ threadId: "th_1", text: "" })).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/contracts/src/domain.test.ts`
Expected: FAIL，找不到 `threadSchema`。

- [ ] **Step 3: 实现领域类型**

`frontend/packages/contracts/src/domain.ts`：

```ts
/** 定义 Pigcode 的持久领域实体与 provider 能力描述。 */
import { z } from "zod"

export const providerCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  approvals: z.boolean(),
  questions: z.boolean(),
  plan: z.boolean(),
  resume: z.boolean(),
  fork: z.boolean(),
  rollback: z.boolean(),
  checkpoint: z.boolean(),
  subagents: z.boolean(),
  mcp: z.boolean(),
  images: z.boolean(),
  usage: z.boolean(),
  modelCatalog: z.boolean(),
  nativeSessionId: z.boolean(),
})

export const permissionModeSchema = z.enum([
  "read-only",
  "workspace-write",
  "danger-full-access",
  "plan",
])

export const projectSchema = z.object({
  id: z.string().min(1),
  rootPath: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
})

export const threadSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().min(1),
  defaultProviderId: z.string().min(1),
  lastProviderId: z.string().nullable(),
  lastModelId: z.string().nullable(),
  permissionMode: permissionModeSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
  lastRunId: z.string().nullable(),
})

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "waiting-approval",
  "waiting-input",
  "completed",
  "failed",
  "interrupted",
])

export const runSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  providerSessionId: z.string().min(1),
  status: runStatusSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  checkpointId: z.string().nullable(),
})

export const executionItemKindSchema = z.enum([
  "message",
  "tool",
  "approval",
  "question",
  "plan",
  "file-change",
  "usage",
  "error",
])

export const executionItemSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  runId: z.string().min(1),
  kind: executionItemKindSchema,
  parentId: z.string().nullable(),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
})

export type ProviderCapabilities = z.infer<typeof providerCapabilitiesSchema>
export type PermissionMode = z.infer<typeof permissionModeSchema>
export type Project = z.infer<typeof projectSchema>
export type Thread = z.infer<typeof threadSchema>
export type Run = z.infer<typeof runSchema>
export type RunStatus = z.infer<typeof runStatusSchema>
export type ExecutionItem = z.infer<typeof executionItemSchema>
```

`frontend/packages/contracts/src/events.ts`：

```ts
/** 定义持久线程事件、规范化 provider 事件和订阅快照。 */
import { z } from "zod"

export const threadEventTypeSchema = z.enum([
  "thread.created",
  "thread.updated",
  "run.started",
  "run.completed",
  "run.failed",
  "message.completed",
  "tool.started",
  "tool.completed",
  "approval.requested",
  "approval.resolved",
  "question.requested",
  "question.answered",
  "plan.updated",
  "file.changed",
  "usage.updated",
  "subagent.started",
  "subagent.completed",
  "checkpoint.created",
  "plugin.changed",
])

export const threadEventSchema = z.object({
  seq: z.number().int().nonnegative(),
  threadId: z.string().min(1),
  runId: z.string().nullable(),
  type: threadEventTypeSchema,
  payload: z.unknown(),
  schemaVersion: z.literal(1),
  createdAt: z.string().datetime(),
})

export const providerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run.started") }),
  z.object({ type: z.literal("message.delta"), text: z.string() }),
  z.object({ type: z.literal("message.completed"), text: z.string() }),
  z.object({ type: z.literal("run.completed") }),
  z.object({ type: z.literal("run.failed"), message: z.string() }),
])

export const threadSnapshotSchema = z.object({
  thread: z.object({}).passthrough(),
  runs: z.array(z.object({}).passthrough()),
  items: z.array(z.object({}).passthrough()),
  pendingRequests: z.array(z.object({}).passthrough()),
})

export type ThreadEvent = z.infer<typeof threadEventSchema>
export type ProviderEvent = z.infer<typeof providerEventSchema>
export type ThreadSnapshot = z.infer<typeof threadSnapshotSchema>
```

`frontend/packages/contracts/src/commands.ts`：

```ts
/** 定义 Host 接受的命令参数；M0-A 只包含真实用到的命令。 */
import { z } from "zod"

export const commandSchemas = {
  "project.add": z.object({ rootPath: z.string().min(1) }),
  "project.list": z.object({}),
  "thread.create": z.object({
    projectId: z.string().min(1),
    title: z.string().min(1).default("New thread"),
    providerId: z.string().min(1).default("fake"),
  }),
  "thread.list": z.object({ projectId: z.string().min(1).optional() }),
  "run.start": z.object({ threadId: z.string().min(1), text: z.string().min(1) }),
  "run.interrupt": z.object({ threadId: z.string().min(1), runId: z.string().min(1) }),
  "thread.subscribe": z.object({
    threadId: z.string().min(1),
    cursor: z.number().int().nonnegative().default(0),
  }),
} as const

export type CommandMethod = keyof typeof commandSchemas
export type CommandParams<M extends CommandMethod> = z.infer<(typeof commandSchemas)[M]>

/** 校验命令参数；未知命令返回 null。 */
export function parseCommandParams(method: string, params: unknown): unknown | null {
  if (!(method in commandSchemas)) return null
  const schema = commandSchemas[method as CommandMethod]
  return schema.parse(params)
}
```

`frontend/packages/contracts/src/index.ts`：

```ts
/** Pigcode 共享协议、领域类型与命令入口。 */
export * from "./protocol"
export * from "./domain"
export * from "./events"
export * from "./commands"
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/contracts/src/domain.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts
git commit -m "feat(contracts): add domain, events, and command schemas"
```

---

### Task 4: Plugin SDK Manifest and Minimal Client API

**Files:**
- Create: `frontend/packages/plugin-sdk/package.json`
- Create: `frontend/packages/plugin-sdk/src/manifest.ts`
- Create: `frontend/packages/plugin-sdk/src/host.ts`
- Create: `frontend/packages/plugin-sdk/src/client.ts`
- Create: `frontend/packages/plugin-sdk/src/slots.ts`
- Create: `frontend/packages/plugin-sdk/src/index.ts`
- Test: `frontend/packages/plugin-sdk/src/manifest.test.ts`

**Interfaces:**
- Consumes: `zod`、`cordis` 的 `Context` 类型。
- Produces: `pluginManifestSchema`、`PluginManifest`、`defineHostPlugin()`、`ClientPlugin`、`ClientPluginContext`、`SlotMap`。

- [ ] **Step 1: 写失败测试**

`frontend/packages/plugin-sdk/src/manifest.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { pluginManifestSchema } from "./manifest"

const base = {
  name: "@pigcode/provider-fake",
  version: "0.0.0",
  pigcode: {
    apiVersion: 1,
    kind: "provider",
    host: "./index.mjs",
    inject: ["providers"],
    provides: ["provider:fake"],
    contributes: {},
    permissions: ["process:spawn"],
  },
}

describe("plugin manifest", () => {
  it("accepts a valid manifest", () => {
    const manifest = pluginManifestSchema.parse(base)
    expect(manifest.pigcode.kind).toBe("provider")
  })

  it("rejects a plugin without host or client entry", () => {
    expect(() =>
      pluginManifestSchema.parse({
        ...base,
        pigcode: { ...base.pigcode, host: undefined },
      }),
    ).toThrow()
  })

  it("rejects an incompatible api version", () => {
    expect(() =>
      pluginManifestSchema.parse({
        ...base,
        pigcode: { ...base.pigcode, apiVersion: 2 },
      }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/plugin-sdk/src/manifest.test.ts`
Expected: FAIL，找不到模块。

- [ ] **Step 3: 实现 manifest 与 API 类型**

`frontend/packages/plugin-sdk/package.json`：

```json
{
  "name": "@pigcode/plugin-sdk",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@pigcode/contracts": "workspace:*",
    "cordis": "4.0.0-rc.11",
    "zod": "4.4.3"
  },
  "devDependencies": { "typescript": "5.9.3" }
}
```

`frontend/packages/plugin-sdk/src/manifest.ts`：

```ts
/** 校验 Pigcode 插件在 package.json 中的 pigcode 声明。 */
import { z } from "zod"

export const pluginKindSchema = z.enum(["provider", "capability", "ui", "bundle"])

export const pluginManifestSchema = z
  .object({
    name: z.string().min(1),
    version: z.string().min(1),
    engines: z.object({ pigcode: z.string().min(1) }).optional(),
    pigcode: z.object({
      apiVersion: z.literal(1),
      kind: pluginKindSchema,
      displayName: z.string().min(1).optional(),
      host: z.string().min(1).optional(),
      client: z.string().min(1).optional(),
      inject: z.array(z.string().min(1)).default([]),
      provides: z.array(z.string().min(1)).default([]),
      contributes: z.record(z.string(), z.unknown()).default({}),
      permissions: z.array(z.string().min(1)).default([]),
    }),
  })
  .refine((value) => Boolean(value.pigcode.host || value.pigcode.client), {
    message: "plugin must declare host or client entry",
    path: ["pigcode"],
  })

export type PluginManifest = z.infer<typeof pluginManifestSchema>
export type PluginKind = z.infer<typeof pluginKindSchema>
```

`frontend/packages/plugin-sdk/src/host.ts`：

```ts
/** Host 侧插件的稳定入口类型；插件不直接依赖 Cordis 内部实现。 */
import type { Context } from "cordis"

export type HostPlugin = (ctx: Context, config: unknown) => void | Promise<void>

/** 保留一层薄封装，未来可以在不破坏插件的情况下替换容器。 */
export function defineHostPlugin(plugin: HostPlugin): HostPlugin {
  return plugin
}
```

`frontend/packages/plugin-sdk/src/slots.ts`：

```ts
/** M0 只定义最小 slot 集合；M0-B 再扩展为 React 渲染器。 */
export interface SlotMap {
  "sidebar.section": { id: string; title: string }
  "sidebar.footer.action": { id: string; label: string }
  "settings.section": { id: string; title: string }
  "status.bar": { id: string; text: string }
}
```

`frontend/packages/plugin-sdk/src/client.ts`：

```ts
/** 浏览器侧插件的最小 facade；M0-A 只支持注册调试面板。 */
export interface ClientPanel {
  id: string
  title: string
  render(container: HTMLElement): void
}

export interface ClientPluginContext {
  registerPanel(panel: ClientPanel): () => void
}

export type ClientPlugin = (ctx: ClientPluginContext) => void | Promise<void>

/** 保留一层薄封装，避免插件作者接触宿主内部对象。 */
export function defineClientPlugin(plugin: ClientPlugin): ClientPlugin {
  return plugin
}
```

`frontend/packages/plugin-sdk/src/index.ts`：

```ts
/** Pigcode 插件 SDK 的公开入口。 */
export * from "./manifest"
export * from "./host"
export * from "./client"
export * from "./slots"
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/plugin-sdk/src/manifest.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/plugin-sdk
git commit -m "feat(plugin-sdk): add manifest and minimal plugin APIs"
```

---

### Task 5: SQLite Storage, Event Log, and Receipts

**Files:**
- Create: `frontend/apps/host/package.json`
- Create: `frontend/apps/host/tsconfig.json`
- Create: `frontend/apps/host/src/storage/database.ts`
- Create: `frontend/apps/host/src/storage/migrations.ts`
- Create: `frontend/apps/host/src/storage/event-store.ts`
- Create: `frontend/apps/host/src/storage/receipt-store.ts`
- Test: `frontend/apps/host/src/storage/event-store.test.ts`

**Interfaces:**
- Consumes: `@pigcode/contracts` 的 `ThreadEvent`、`PROTOCOL_VERSION`。
- Produces: `openDatabase()`、`EventStore.append()`、`EventStore.read()`、`ReceiptStore.get()`、`ReceiptStore.put()`。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/storage/event-store.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { openDatabase } from "./database"
import { EventStore } from "./event-store"
import { ReceiptStore } from "./receipt-store"

describe("event store", () => {
  it("appends and reads events after a cursor", () => {
    const db = openDatabase(":memory:")
    const store = new EventStore(db)
    store.append({
      threadId: "th_1",
      runId: null,
      type: "thread.created",
      payload: { title: "hello" },
      schemaVersion: 1,
      createdAt: "2026-10-20T00:00:00.000Z",
    })
    store.append({
      threadId: "th_1",
      runId: "run_1",
      type: "run.started",
      payload: {},
      schemaVersion: 1,
      createdAt: "2026-10-20T00:00:01.000Z",
    })

    const all = store.read("th_1", 0)
    const after = store.read("th_1", all[0]!.seq)
    expect(all).toHaveLength(2)
    expect(after).toHaveLength(1)
    expect(after[0]!.type).toBe("run.started")
    db.close()
  })

  it("stores command receipts idempotently", () => {
    const db = openDatabase(":memory:")
    const receipts = new ReceiptStore(db)
    receipts.put("cmd-1", { ok: true })
    expect(receipts.get("cmd-1")).toEqual({ ok: true })
    expect(receipts.get("missing")).toBeUndefined()
    db.close()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/storage/event-store.test.ts`
Expected: FAIL，找不到 `./database`。

- [ ] **Step 3: 实现数据库与迁移**

`frontend/apps/host/package.json`：

```json
{
  "name": "@pigcode/host",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./kernel/*": "./src/kernel/*.ts",
    "./services/*": "./src/services/*.ts",
    "./providers/*": "./src/providers/*.ts",
    "./rpc/*": "./src/rpc/*.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@cordisjs/plugin-loader": "1.0.0-rc.8",
    "@pigcode/contracts": "workspace:*",
    "@pigcode/plugin-sdk": "workspace:*",
    "better-sqlite3": "13.0.3",
    "cordis": "4.0.0-rc.11",
    "yaml": "2.8.1",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@types/better-sqlite3": "7.6.13",
    "typescript": "5.9.3",
    "vitest": "4.0.16"
  }
}
```

`frontend/apps/host/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "types": ["node"] },
  "include": ["src/**/*.ts"]
}
```

`frontend/apps/host/src/storage/database.ts`：

```ts
/** 打开 SQLite 数据库并执行迁移；测试使用 :memory:。 */
import Database from "better-sqlite3"
import { migrate } from "./migrations"

export type PigcodeDatabase = Database.Database

export function openDatabase(path: string): PigcodeDatabase {
  const db = new Database(path)
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  migrate(db)
  return db
}
```

`frontend/apps/host/src/storage/migrations.ts`：

```ts
/** 管理 SQLite schema 版本；迁移只向前。 */
import type Database from "better-sqlite3"

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    root_path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    default_provider_id TEXT NOT NULL,
    last_provider_id TEXT,
    last_model_id TEXT,
    permission_mode TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    last_run_id TEXT
  );

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id),
    provider_session_id TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT,
    error_message TEXT,
    checkpoint_id TEXT
  );

  CREATE TABLE IF NOT EXISTS thread_events (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id TEXT NOT NULL,
    run_id TEXT,
    type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_thread_events_thread_seq
    ON thread_events(thread_id, seq);

  CREATE TABLE IF NOT EXISTS command_receipts (
    command_id TEXT PRIMARY KEY,
    result_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
]

/** 按 user_version 执行缺失迁移。 */
export function migrate(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number
  for (let version = current; version < MIGRATIONS.length; version += 1) {
    db.exec(MIGRATIONS[version]!)
    db.pragma(`user_version = ${version + 1}`)
  }
}
```

`frontend/apps/host/src/storage/event-store.ts`：

```ts
/** 只追加事件日志；写入与投影由上层在同一事务中完成。 */
import type { ThreadEvent } from "@pigcode/contracts"
import type { PigcodeDatabase } from "./database"

export type NewThreadEvent = Omit<ThreadEvent, "seq">

export class EventStore {
  constructor(private readonly db: PigcodeDatabase) {}

  append(event: NewThreadEvent): ThreadEvent {
    const createdAt = event.createdAt
    const result = this.db
      .prepare(
        `INSERT INTO thread_events (thread_id, run_id, type, payload_json, schema_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.threadId,
        event.runId,
        event.type,
        JSON.stringify(event.payload),
        event.schemaVersion,
        createdAt,
      )
    return {
      ...event,
      seq: Number(result.lastInsertRowid),
    }
  }

  read(threadId: string, afterSeq: number): ThreadEvent[] {
    const rows = this.db
      .prepare(
        `SELECT seq, thread_id, run_id, type, payload_json, schema_version, created_at
         FROM thread_events WHERE thread_id = ? AND seq > ? ORDER BY seq ASC`,
      )
      .all(threadId, afterSeq) as Array<{
      seq: number
      thread_id: string
      run_id: string | null
      type: ThreadEvent["type"]
      payload_json: string
      schema_version: 1
      created_at: string
    }>
    return rows.map((row) => ({
      seq: row.seq,
      threadId: row.thread_id,
      runId: row.run_id,
      type: row.type,
      payload: JSON.parse(row.payload_json) as unknown,
      schemaVersion: row.schema_version,
      createdAt: row.created_at,
    }))
  }
}
```

`frontend/apps/host/src/storage/receipt-store.ts`：

```ts
/** 保存命令回执，保证断线重试不会重复执行。 */
import type { PigcodeDatabase } from "./database"

export class ReceiptStore {
  constructor(private readonly db: PigcodeDatabase) {}

  get(commandId: string): unknown | undefined {
    const row = this.db
      .prepare(`SELECT result_json FROM command_receipts WHERE command_id = ?`)
      .get(commandId) as { result_json: string } | undefined
    return row ? (JSON.parse(row.result_json) as unknown) : undefined
  }

  put(commandId: string, result: unknown): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO command_receipts (command_id, result_json, created_at)
         VALUES (?, ?, ?)`,
      )
      .run(commandId, JSON.stringify(result), new Date().toISOString())
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/storage/event-store.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host
git commit -m "feat(host): add sqlite event log and receipts"
```

---

### Task 6: Host Kernel, Profile Loader, and `--dump-config`

**Files:**
- Create: `frontend/apps/host/src/kernel/profile.ts`
- Create: `frontend/apps/host/src/kernel/app.ts`
- Create: `frontend/apps/host/src/kernel/cli.ts`
- Create: `frontend/apps/host/src/kernel/app.test.ts`
- Create: `frontend/apps/host/profiles/desktop.yml`
- Modify: `frontend/apps/host/src/index.ts`

**Interfaces:**
- Consumes: Task 5 的 storage；Cordis + loader。
- Produces: `loadProfile()`、`createHostApp()`、`dumpConfig()`、`runCli()`。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/kernel/app.test.ts`：

```ts
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { createHostApp, dumpConfig } from "./app"

describe("host kernel", () => {
  it("loads a profile and dumps its entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "pigcode-kernel-"))
    await writeFile(
      join(dir, "desktop.yml"),
      [
        "plugins:",
        "  - id: core.settings",
        "    name: ./fixture-plugin.mjs",
        "  - id: core.disabled",
        "    name: ./fixture-plugin.mjs",
        "    disabled: true",
      ].join("\n"),
    )
    await writeFile(
      join(dir, "fixture-plugin.mjs"),
      "export function apply() {}\n",
    )

    const ctx = await createHostApp({ profileDir: dir, profileName: "desktop" })
    const config = dumpConfig(ctx)
    expect(config.entries.map((entry) => entry.id)).toEqual(["core.settings", "core.disabled"])
    expect(config.entries[1]!.disabled).toBe(true)
    await ctx.fiber.dispose()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/kernel/app.test.ts`
Expected: FAIL，找不到 `./app`。

- [ ] **Step 3: 实现 profile 与 kernel**

`frontend/apps/host/src/kernel/profile.ts`：

```ts
/** 读取 profile YAML；profile 只描述插件条目，不承载业务逻辑。 */
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { parse } from "yaml"
import { z } from "zod"

export const profileEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  config: z.unknown().optional(),
  disabled: z.boolean().optional(),
})

export const profileSchema = z.object({ plugins: z.array(profileEntrySchema) })

export type ProfileEntry = z.infer<typeof profileEntrySchema>
export type Profile = z.infer<typeof profileSchema>

export interface LoadedProfile extends Profile {
  profileDir: string
  profilePath: string
}

/** 从 profileDir 读取 `<name>.yml` 并校验。 */
export async function loadProfile(profileDir: string, profileName: string): Promise<LoadedProfile> {
  const profilePath = join(profileDir, `${profileName}.yml`)
  const source = await readFile(profilePath, "utf8")
  return { ...profileSchema.parse(parse(source)), profileDir, profilePath }
}
```

`frontend/apps/host/src/kernel/app.ts`：

```ts
/** 创建 Host Cordis 插件树；profile 负责组合，kernel 只做启动和 teardown。 */
import { Context } from "cordis"
import Loader from "@cordisjs/plugin-loader"
import { loadProfile } from "./profile"

export interface CreateHostAppOptions {
  profileDir: string
  profileName: string
}

export interface DumpedConfig {
  entries: Array<{ id: string; name: string; config?: unknown; disabled: boolean }>
}

/** 按 profile 加载插件；加载失败的第三方插件不阻止 kernel 返回。 */
export async function createHostApp(options: CreateHostAppOptions): Promise<Context> {
  const ctx = new Context()
  const profile = await loadProfile(options.profileDir, options.profileName)
  ctx.plugin(Loader, { baseUrl: profile.profileDir })

  for (const entry of profile.plugins) {
    await ctx.loader.create({
      id: entry.id,
      name: entry.name,
      config: entry.config,
      disabled: entry.disabled,
    })
  }
  return ctx
}

/** 输出 loader 当前条目，供 `pigcode --dump-config` 使用。 */
export function dumpConfig(ctx: Context): DumpedConfig {
  const entries = Object.values(ctx.loader.store).map((entry) => ({
    id: entry.options.id,
    name: entry.options.name,
    config: entry.options.config,
    disabled: Boolean(entry.options.disabled),
  }))
  return { entries }
}
```

`frontend/apps/host/src/kernel/cli.ts`：

```ts
/** `pigcode` CLI 的最小入口：目前只支持 --dump-config。 */
import { createHostApp, dumpConfig } from "./app"

export async function runCli(argv: string[]): Promise<number> {
  const profileIndex = argv.indexOf("--profile")
  const profileName = profileIndex >= 0 ? argv[profileIndex + 1] : "desktop"
  if (!profileName) {
    console.error("missing --profile value")
    return 2
  }
  const profileDir = process.env.PIGCODE_PROFILE_DIR ?? new URL("../profiles", import.meta.url).pathname
  const ctx = await createHostApp({ profileDir, profileName })
  if (argv.includes("--dump-config")) {
    console.log(JSON.stringify(dumpConfig(ctx), null, 2))
    await ctx.fiber.dispose()
    return 0
  }
  console.error("no command; use --dump-config")
  await ctx.fiber.dispose()
  return 2
}
```

`frontend/apps/host/src/index.ts`：

```ts
/** Host 包的入口；M0-A 先暴露 CLI，utilityProcess 入口在 Task 10 接入。 */
import { runCli } from "./kernel/cli"

if (process.argv[1]?.endsWith("index.ts") || process.argv[1]?.endsWith("index.js")) {
  void runCli(process.argv.slice(2)).then((code) => process.exit(code))
}
```

`frontend/apps/host/profiles/desktop.yml`：

```yaml
plugins:
  - id: core.storage
    name: "@pigcode/host/services/storage"
    config:
      path: ":memory:"
  - id: core.projects
    name: "@pigcode/host/services/projects"
  - id: core.threads
    name: "@pigcode/host/services/threads"
  - id: core.sessions
    name: "@pigcode/host/services/sessions"
  - id: core.providers
    name: "@pigcode/host/services/providers"
  - id: provider.fake
    name: "@pigcode/host/providers/fake"
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/kernel/app.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host
git commit -m "feat(host): add cordis kernel and profile loader"
```

---

### Task 7: Host Services for Storage, Projects, Threads, and Sessions

**Files:**
- Create: `frontend/apps/host/src/services/storage.ts`
- Create: `frontend/apps/host/src/services/projects.ts`
- Create: `frontend/apps/host/src/services/threads.ts`
- Create: `frontend/apps/host/src/services/sessions.ts`
- Test: `frontend/apps/host/src/services/services.test.ts`

**Interfaces:**
- Consumes: Task 5 的 `openDatabase`、`EventStore`、`ReceiptStore`。
- Produces: `ctx.storage`、`ctx.projects`、`ctx.threads`、`ctx.sessions`；`ProjectsService.add/list`、`ThreadsService.create/list/get`、`SessionsService.append/read/subscribe/latestSeq`。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/services/services.test.ts`：

```ts
import { Context } from "cordis"
import { describe, expect, it } from "vitest"
import { apply as projects } from "./projects"
import { apply as sessions } from "./sessions"
import { apply as storage } from "./storage"
import { apply as threads } from "./threads"

describe("host services", () => {
  it("creates a project and thread, then appends a session event", async () => {
    const ctx = new Context()
    await ctx.plugin(storage, { path: ":memory:" })
    await ctx.plugin(projects)
    await ctx.plugin(threads)
    await ctx.plugin(sessions)

    const project = ctx.projects.add("/tmp/pigcode-workspace")
    const thread = ctx.threads.create(project.id, "First thread", "fake")
    const event = ctx.sessions.append({
      threadId: thread.id,
      runId: null,
      type: "thread.created",
      payload: { title: thread.title },
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    })

    expect(ctx.projects.list()).toHaveLength(1)
    expect(ctx.threads.list(project.id)).toHaveLength(1)
    expect(ctx.sessions.read(thread.id, 0)[0]!.seq).toBe(event.seq)
    void ctx.fiber.dispose()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/services.test.ts`
Expected: FAIL，找不到 `../kernel/app` 或服务模块。

- [ ] **Step 3: 实现服务**

`frontend/apps/host/src/services/storage.ts`：

```ts
/** 提供 SQLite、事件日志和回执服务。 */
import type { Context } from "cordis"
import { openDatabase } from "../storage/database"
import { EventStore } from "../storage/event-store"
import { ReceiptStore } from "../storage/receipt-store"

export interface StorageService {
  db: ReturnType<typeof openDatabase>
  events: EventStore
  receipts: ReceiptStore
}

declare module "cordis" {
  interface Context {
    storage: StorageService
  }
}

export interface StorageConfig { path: string }

export function apply(ctx: Context, config: StorageConfig): void {
  const db = openDatabase(config.path)
  const storage: StorageService = {
    db,
    events: new EventStore(db),
    receipts: new ReceiptStore(db),
  }
  ctx.provide("storage", storage)
  ctx.effect(() => () => db.close())
}
```

`frontend/apps/host/src/services/projects.ts`：

```ts
/** 管理项目记录；路径的唯一性和归属由 SQLite 约束保证。 */
import type { Context } from "cordis"
import type { Project } from "@pigcode/contracts"
import { randomUUID } from "node:crypto"
import { basename } from "node:path"

export interface ProjectsService {
  add(rootPath: string): Project
  list(): Project[]
}

declare module "cordis" {
  interface Context {
    projects: ProjectsService
  }
}

export const inject = ["storage"]

export function apply(ctx: Context): void {
  const service: ProjectsService = {
    add(rootPath) {
      const project: Project = {
        id: `pr_${randomUUID()}`,
        rootPath,
        name: basename(rootPath),
        createdAt: new Date().toISOString(),
      }
      ctx.storage.db
        .prepare(`INSERT INTO projects (id, root_path, name, created_at) VALUES (?, ?, ?, ?)`)
        .run(project.id, project.rootPath, project.name, project.createdAt)
      return project
    },
    list() {
      return ctx.storage.db
        .prepare(`SELECT id, root_path, name, created_at FROM projects ORDER BY created_at ASC`)
        .all()
        .map((row) => {
          const value = row as { id: string; root_path: string; name: string; created_at: string }
          return { id: value.id, rootPath: value.root_path, name: value.name, createdAt: value.created_at }
        })
    },
  }
  ctx.provide("projects", service)
}
```

`frontend/apps/host/src/services/threads.ts`：

```ts
/** 管理线程记录；线程是 provider 无关的持久会话。 */
import type { Context } from "cordis"
import type { Thread } from "@pigcode/contracts"
import { randomUUID } from "node:crypto"

export interface ThreadsService {
  create(projectId: string, title: string, providerId: string): Thread
  list(projectId?: string): Thread[]
  get(threadId: string): Thread | undefined
}

declare module "cordis" {
  interface Context {
    threads: ThreadsService
  }
}

export const inject = ["storage"]

export function apply(ctx: Context): void {
  const service: ThreadsService = {
    create(projectId, title, providerId) {
      const now = new Date().toISOString()
      const thread: Thread = {
        id: `th_${randomUUID()}`,
        projectId,
        title,
        defaultProviderId: providerId,
        lastProviderId: null,
        lastModelId: null,
        permissionMode: "workspace-write",
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        lastRunId: null,
      }
      ctx.storage.db
        .prepare(
          `INSERT INTO threads (id, project_id, title, default_provider_id, last_provider_id,
            last_model_id, permission_mode, created_at, updated_at, archived_at, last_run_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          thread.id,
          thread.projectId,
          thread.title,
          thread.defaultProviderId,
          thread.lastProviderId,
          thread.lastModelId,
          thread.permissionMode,
          thread.createdAt,
          thread.updatedAt,
          thread.archivedAt,
          thread.lastRunId,
        )
      return thread
    },
    list(projectId) {
      const rows = projectId
        ? ctx.storage.db.prepare(`SELECT * FROM threads WHERE project_id = ? ORDER BY updated_at DESC`).all(projectId)
        : ctx.storage.db.prepare(`SELECT * FROM threads ORDER BY updated_at DESC`).all()
      return rows.map(mapThread)
    },
    get(threadId) {
      const row = ctx.storage.db.prepare(`SELECT * FROM threads WHERE id = ?`).get(threadId)
      return row ? mapThread(row) : undefined
    },
  }
  ctx.provide("threads", service)
}

function mapThread(row: unknown): Thread {
  const value = row as Record<string, string | null>
  return {
    id: value.id!,
    projectId: value.project_id!,
    title: value.title!,
    defaultProviderId: value.default_provider_id!,
    lastProviderId: value.last_provider_id,
    lastModelId: value.last_model_id,
    permissionMode: value.permission_mode as Thread["permissionMode"],
    createdAt: value.created_at!,
    updatedAt: value.updated_at!,
    archivedAt: value.archived_at,
    lastRunId: value.last_run_id,
  }
}
```

`frontend/apps/host/src/services/sessions.ts`：

```ts
/** 管理线程事件日志与实时订阅；delta 不落库，只走实时通道。 */
import type { Context } from "cordis"
import type { ThreadEvent } from "@pigcode/contracts"
import type { NewThreadEvent } from "../storage/event-store"

export interface SessionsService {
  append(event: NewThreadEvent): ThreadEvent
  read(threadId: string, cursor: number): ThreadEvent[]
  latestSeq(threadId: string): number
  subscribe(threadId: string, listener: (event: ThreadEvent) => void): () => void
}

declare module "cordis" {
  interface Context {
    sessions: SessionsService
  }
}

export const inject = ["storage"]

export function apply(ctx: Context): void {
  const listeners = new Map<string, Set<(event: ThreadEvent) => void>>()
  const service: SessionsService = {
    append(event) {
      const stored = ctx.storage.events.append(event)
      for (const listener of listeners.get(event.threadId) ?? []) listener(stored)
      return stored
    },
    read(threadId, cursor) {
      return ctx.storage.events.read(threadId, cursor)
    },
    latestSeq(threadId) {
      const events = ctx.storage.events.read(threadId, 0)
      return events.at(-1)?.seq ?? 0
    },
    subscribe(threadId, listener) {
      const set = listeners.get(threadId) ?? new Set()
      set.add(listener)
      listeners.set(threadId, set)
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(threadId)
      }
    },
  }
  ctx.provide("sessions", service)
  ctx.effect(() => () => listeners.clear())
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/services.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host
git commit -m "feat(host): add project, thread, and session services"
```

---

### Task 8: Provider Contract, Registry, and Fake Provider

**Files:**
- Create: `frontend/apps/host/src/providers/driver.ts`
- Create: `frontend/apps/host/src/providers/fake.ts`
- Create: `frontend/apps/host/src/providers/registry.ts`
- Test: `frontend/apps/host/src/providers/fake.test.ts`

**Interfaces:**
- Consumes: `ProviderCapabilities`、`ProviderEvent`、`ctx.sessions`、`ctx.threads`。
- Produces: `ProviderDriver`、`FakeProviderDriver`、`ctx.providers.startRun()`。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/providers/fake.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { FakeProviderDriver } from "./fake"

describe("fake provider", () => {
  it("streams a deterministic response", async () => {
    const driver = new FakeProviderDriver()
    const session = await driver.createSession({ threadId: "th_1", cwd: "/tmp" })
    const events: string[] = []
    await driver.send(session, { text: "hello" }, (event) => events.push(event.type))
    expect(events).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "message.delta",
      "message.delta",
      "message.completed",
      "run.completed",
    ])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/fake.test.ts`
Expected: FAIL，找不到 `./fake`。

- [ ] **Step 3: 实现 provider 契约与 fake**

`frontend/apps/host/src/providers/driver.ts`：

```ts
/** Provider adapter 的 Host 侧契约；应用层只依赖规范化事件。 */
import type { ProviderCapabilities, ProviderEvent } from "@pigcode/contracts"

export interface ProviderSessionHandle {
  id: string
  threadId: string
  cwd: string
  nativeSessionId: string | null
}

export interface CreateSessionInput {
  threadId: string
  cwd: string
}

export interface UserInput {
  text: string
}

export type ProviderEmit = (event: ProviderEvent) => void

export interface ProviderDriver {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities
  createSession(input: CreateSessionInput): Promise<ProviderSessionHandle>
  send(session: ProviderSessionHandle, input: UserInput, emit: ProviderEmit): Promise<void>
  interrupt(session: ProviderSessionHandle): Promise<void>
  dispose(session: ProviderSessionHandle): Promise<void>
}
```

`frontend/apps/host/src/providers/fake.ts`：

```ts
/** 确定性的 fake provider，用于验证协议、UI 和插件模型。 */
import type { ProviderCapabilities } from "@pigcode/contracts"
import { randomUUID } from "node:crypto"
import type {
  CreateSessionInput,
  ProviderDriver,
  ProviderEmit,
  ProviderSessionHandle,
  UserInput,
} from "./driver"

const CHUNKS = ["Hello", " from", " fake", " provider"]

export class FakeProviderDriver implements ProviderDriver {
  readonly id = "fake"
  readonly displayName = "Fake Provider"
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    approvals: false,
    questions: false,
    plan: false,
    resume: false,
    fork: false,
    rollback: false,
    checkpoint: false,
    subagents: false,
    mcp: false,
    images: false,
    usage: false,
    modelCatalog: false,
    nativeSessionId: false,
  }

  async createSession(input: CreateSessionInput): Promise<ProviderSessionHandle> {
    return {
      id: `ps_${randomUUID()}`,
      threadId: input.threadId,
      cwd: input.cwd,
      nativeSessionId: null,
    }
  }

  async send(_session: ProviderSessionHandle, _input: UserInput, emit: ProviderEmit): Promise<void> {
    emit({ type: "run.started" })
    for (const text of CHUNKS) emit({ type: "message.delta", text })
    emit({ type: "message.completed", text: CHUNKS.join("") })
    emit({ type: "run.completed" })
  }

  async interrupt(): Promise<void> {}

  async dispose(): Promise<void> {}
}
```

`frontend/apps/host/src/providers/registry.ts`：

```ts
/** 注册 provider driver，并把一次 run 的规范化事件映射为线程事件。 */
import type { Context } from "cordis"
import type { ProviderCapabilities, ProviderEvent } from "@pigcode/contracts"
import { randomUUID } from "node:crypto"
import type { ProviderDriver } from "./driver"
import { FakeProviderDriver } from "./fake"

export interface ProvidersService {
  register(driver: ProviderDriver): void
  list(): Array<{ id: string; displayName: string; capabilities: ProviderCapabilities }>
  startRun(
    threadId: string,
    text: string,
    emitLive: (event: ProviderEvent) => void,
  ): Promise<{ runId: string }>
}

declare module "cordis" {
  interface Context {
    providers: ProvidersService
  }
}

export const inject = ["threads", "sessions"]

export function apply(ctx: Context): void {
  const drivers = new Map<string, ProviderDriver>()
  const fake = new FakeProviderDriver()
  drivers.set(fake.id, fake)

  const service: ProvidersService = {
    register(driver) {
      drivers.set(driver.id, driver)
    },
    list() {
      return [...drivers.values()].map((driver) => ({
        id: driver.id,
        displayName: driver.displayName,
        capabilities: driver.capabilities,
      }))
    },
    async startRun(threadId, text, emitLive) {
      const thread = ctx.threads.get(threadId)
      if (!thread) throw new Error(`thread not found: ${threadId}`)
      const driver = drivers.get(thread.defaultProviderId)
      if (!driver) throw new Error(`provider not found: ${thread.defaultProviderId}`)

      const session = await driver.createSession({ threadId, cwd: process.cwd() })
      const runId = `run_${randomUUID()}`
      const createdAt = new Date().toISOString()

      ctx.sessions.append({
        threadId,
        runId,
        type: "run.started",
        payload: { providerId: driver.id, providerSessionId: session.id },
        schemaVersion: 1,
        createdAt,
      })

      await driver.send(session, { text }, (event) => {
        if (event.type === "message.delta") {
          emitLive(event)
          return
        }
        if (event.type === "run.started") return
        if (event.type === "message.completed") {
          ctx.sessions.append({
            threadId,
            runId,
            type: "message.completed",
            payload: { text: event.text },
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
          })
          return
        }
        if (event.type === "run.completed") {
          ctx.sessions.append({
            threadId,
            runId,
            type: "run.completed",
            payload: {},
            schemaVersion: 1,
            createdAt: new Date().toISOString(),
          })
          return
        }
        ctx.sessions.append({
          threadId,
          runId,
          type: "run.failed",
          payload: { message: event.message },
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
        })
      })

      return { runId }
    },
  }

  ctx.provide("providers", service)
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/providers/fake.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host
git commit -m "feat(host): add provider contract and fake provider"
```

---

### Task 9: RPC Dispatcher, Client, and Subscriptions

**Files:**
- Create: `frontend/apps/host/src/rpc/memory-transport.ts`
- Create: `frontend/apps/host/src/rpc/server.ts`
- Create: `frontend/packages/client-runtime/package.json`
- Create: `frontend/packages/client-runtime/src/transport.ts`
- Create: `frontend/packages/client-runtime/src/rpc-client.ts`
- Create: `frontend/packages/client-runtime/src/index.ts`
- Test: `frontend/apps/host/src/rpc/server.test.ts`
- Test: `frontend/packages/client-runtime/src/rpc-client.test.ts`

**Interfaces:**
- Consumes: Task 7/8 的 services；Task 2/3 的协议与命令。
- Produces: `HostTransport`、`MemoryTransport`、`RpcServer`、`RpcClient`；`thread.subscribe` 的 snapshot+cursor 语义。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/rpc/server.test.ts`：

```ts
import { Context } from "cordis"
import { describe, expect, it } from "vitest"
import { apply as projects } from "../services/projects"
import { apply as sessions } from "../services/sessions"
import { apply as storage } from "../services/storage"
import { apply as threads } from "../services/threads"
import { MemoryTransport } from "./memory-transport"
import { RpcServer } from "./server"

async function createServer() {
  const ctx = new Context()
  await ctx.plugin(storage, { path: ":memory:" })
  await ctx.plugin(projects)
  await ctx.plugin(threads)
  await ctx.plugin(sessions)
  const transport = new MemoryTransport()
  const server = new RpcServer(ctx, transport.host)
  server.start()
  return { ctx, transport, server }
}

describe("rpc server", () => {
  it("answers project.list", async () => {
    const { ctx, transport } = await createServer()
    transport.client.send({ jsonrpc: "2.0", id: "1", method: "project.list", params: {} })
    const response = await transport.client.next()
    expect(response).toMatchObject({ jsonrpc: "2.0", id: "1", result: [] })
    await ctx.fiber.dispose()
  })
})
```

`frontend/packages/client-runtime/src/rpc-client.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { MemoryTransport } from "../../../apps/host/src/rpc/memory-transport"
import { RpcClient } from "./rpc-client"

describe("rpc client", () => {
  it("resolves a call by id", async () => {
    const transport = new MemoryTransport()
    const client = new RpcClient(transport.client)
    const pending = client.call("project.list", {})
    transport.host.send({ jsonrpc: "2.0", id: "1", result: { ok: true } })
    const result = await pending
    expect(result).toEqual({ ok: true })
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/rpc/server.test.ts packages/client-runtime/src/rpc-client.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 transport、server 与 client**

`frontend/packages/client-runtime/src/transport.ts`：

```ts
/** 传输层只负责收发消息；v1.0 用 MessagePort，测试用内存实现。 */
export interface HostTransport {
  send(message: unknown): void
  onMessage(listener: (message: unknown) => void): () => void
  close(): void
}
```

`frontend/apps/host/src/rpc/memory-transport.ts`：

```ts
/** 一对内存双工传输，用于 Host 与 Renderer 的集成测试。 */
import type { HostTransport } from "@pigcode/client-runtime"

class Side implements HostTransport {
  private listeners = new Set<(message: unknown) => void>()
  private queue: unknown[] = []
  private waiters: Array<(value: unknown) => void> = []
  peer!: Side

  send(message: unknown): void {
    for (const listener of this.listeners) listener(message)
    const waiter = this.waiters.shift()
    if (waiter) waiter(message)
    else this.queue.push(message)
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  next(): Promise<unknown> {
    const value = this.queue.shift()
    if (value !== undefined) return Promise.resolve(value)
    return new Promise((resolve) => this.waiters.push(resolve))
  }

  close(): void {
    this.listeners.clear()
    this.queue.length = 0
    this.waiters.length = 0
  }
}

export class MemoryTransport {
  readonly host = new Side()
  readonly client = new Side()

  constructor() {
    this.host.peer = this.client
    this.client.peer = this.host
  }
}
```

`frontend/apps/host/src/rpc/server.ts`：

```ts
/** 把 RPC 请求分发给 Host 服务，并把线程事件推送给订阅者。 */
import type { Context } from "cordis"
import type { HostTransport } from "@pigcode/client-runtime"
import { commandSchemas, parseRpcRequest, rpcFailureSchema, rpcSuccessSchema } from "@pigcode/contracts"
import type { CommandMethod } from "@pigcode/contracts"

export class RpcServer {
  private disposers: Array<() => void> = []

  constructor(private readonly ctx: Context, private readonly transport: HostTransport) {}

  start(): void {
    this.disposers.push(
      this.transport.onMessage((message) => {
        void this.handle(message)
      }),
    )
  }

  stop(): void {
    for (const dispose of this.disposers) dispose()
    this.disposers = []
  }

  private async handle(message: unknown): Promise<void> {
    let request
    try {
      request = parseRpcRequest(message)
    } catch {
      return
    }
    try {
      const result = await this.dispatch(request.method, request.params)
      this.transport.send(rpcSuccessSchema.parse({ jsonrpc: "2.0", id: request.id, result }))
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "unknown error"
      this.transport.send(
        rpcFailureSchema.parse({
          jsonrpc: "2.0",
          id: request.id,
          error: { code: "COMMAND_FAILED", message: messageText, retryable: false },
        }),
      )
    }
  }

  private async dispatch(method: string, params: unknown): Promise<unknown> {
    if (!(method in commandSchemas)) throw new Error(`unknown method: ${method}`)
    const command = method as CommandMethod
    const parsed = commandSchemas[command].parse(params)

    switch (command) {
      case "project.list":
        return this.ctx.projects.list()
      case "project.add":
        return this.ctx.projects.add((parsed as { rootPath: string }).rootPath)
      case "thread.list":
        return this.ctx.threads.list((parsed as { projectId?: string }).projectId)
      case "thread.create": {
        const value = parsed as { projectId: string; title: string; providerId: string }
        const thread = this.ctx.threads.create(value.projectId, value.title, value.providerId)
        this.ctx.sessions.append({
          threadId: thread.id,
          runId: null,
          type: "thread.created",
          payload: { title: thread.title },
          schemaVersion: 1,
          createdAt: new Date().toISOString(),
        })
        return thread
      }
      case "thread.subscribe": {
        const value = parsed as { threadId: string; cursor: number }
        const events = this.ctx.sessions.read(value.threadId, value.cursor)
        const unsubscribe = this.ctx.sessions.subscribe(value.threadId, (event) => {
          this.transport.send({ jsonrpc: "2.0", method: "thread.event", params: event })
        })
        this.disposers.push(unsubscribe)
        return {
          snapshot: {
            thread: this.ctx.threads.get(value.threadId) ?? null,
            runs: [],
            items: [],
            pendingRequests: [],
          },
          cursor: events.at(-1)?.seq ?? value.cursor,
          events,
        }
      }
      case "run.start": {
        const value = parsed as { threadId: string; text: string }
        return this.ctx.providers.startRun(value.threadId, value.text, (event) => {
          this.transport.send({
            jsonrpc: "2.0",
            method: "thread.delta",
            params: { threadId: value.threadId, event },
          })
        })
      }
      case "run.interrupt":
        return { interrupted: true }
      default:
        throw new Error(`unsupported method: ${method}`)
    }
  }
}
```

`frontend/packages/client-runtime/src/rpc-client.ts`：

```ts
/** Renderer 侧的 RPC 客户端；负责 id 关联和线程事件订阅。 */
import type { HostTransport } from "./transport"

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export class RpcClient {
  private nextId = 1
  private readonly pending = new Map<string, Pending>()
  private readonly listeners = new Set<(message: unknown) => void>()

  constructor(private readonly transport: HostTransport) {
    transport.onMessage((message) => {
      const value = message as { id?: string; result?: unknown; error?: { message?: string }; method?: string }
      if (value.id && this.pending.has(value.id)) {
        const entry = this.pending.get(value.id)!
        this.pending.delete(value.id)
        if (value.error) entry.reject(new Error(value.error.message ?? "rpc failed"))
        else entry.resolve(value.result)
        return
      }
      for (const listener of this.listeners) listener(message)
    })
  }

  call(method: string, params: unknown): Promise<unknown> {
    const id = String(this.nextId++)
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.transport.send({ jsonrpc: "2.0", id, method, params })
    })
  }

  onNotification(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
```

`frontend/packages/client-runtime/package.json`：

```json
{
  "name": "@pigcode/client-runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@pigcode/contracts": "workspace:*"
  },
  "devDependencies": { "typescript": "5.9.3", "vitest": "4.0.16" }
}
```

`frontend/packages/client-runtime/src/index.ts`：

```ts
/** Renderer 侧连接与 RPC 的公开入口。 */
export * from "./transport"
export * from "./rpc-client"
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/rpc/server.test.ts packages/client-runtime/src/rpc-client.test.ts`
Expected: PASS（如 `createHostApp` 的 profile 为空，server 测试需要先注册内存 storage；按测试文件里的注释用真实服务 profile）。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host packages/client-runtime
git commit -m "feat(rpc): add dispatch, subscriptions, and client"
```

---

### Task 10: Electron Main, utilityProcess, MessagePort, and Debug Renderer

**Files:**
- Create: `frontend/apps/host/src/entry.ts`
- Create: `frontend/apps/host/src/rpc/message-port-transport.ts`
- Create: `frontend/apps/desktop/package.json`
- Create: `frontend/apps/desktop/electron.vite.config.ts`
- Create: `frontend/apps/desktop/src/main/index.ts`
- Create: `frontend/apps/desktop/src/main/host-process.ts`
- Create: `frontend/apps/desktop/src/main/protocol.ts`
- Test: `frontend/apps/desktop/src/main/protocol.test.ts`
- Create: `frontend/apps/desktop/src/preload/index.ts`
- Create: `frontend/apps/desktop/src/renderer/index.html`
- Create: `frontend/apps/desktop/src/renderer/src/main.ts`
- Create: `frontend/scripts/build-host.mjs`

**Interfaces:**
- Consumes: Task 9 的 RPC；Task 6 的 kernel。
- Produces: `startHostProcess()`、`createWindow()`、`resolveAppPath()`；Renderer 获得 MessagePort 并完成 `project.add` → `thread.create` → `run.start`。

- [ ] **Step 1: 写失败测试**

`frontend/apps/desktop/src/main/protocol.test.ts`：

```ts
import { describe, expect, it } from "vitest"
import { resolveInside } from "./protocol"

describe("protocol path resolution", () => {
  it("resolves a file inside the root", () => {
    expect(resolveInside("/tmp/root", "client.js")).toBe("/tmp/root/client.js")
  })

  it("rejects a traversal path", () => {
    expect(() => resolveInside("/tmp/root", "../secret")).toThrow()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/desktop/src/main/protocol.test.ts`
Expected: FAIL，找不到 `./protocol`。

- [ ] **Step 3: 实现 main/preload/renderer**

`frontend/apps/desktop/package.json`：

```json
{
  "name": "@pigcode/desktop",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@pigcode/client-runtime": "workspace:*",
    "@pigcode/contracts": "workspace:*"
  },
  "devDependencies": {
    "electron": "43.4.1",
    "electron-vite": "5.0.0",
    "typescript": "5.9.3",
    "vite": "7.1.12",
    "vitest": "4.0.16"
  }
}
```

`frontend/apps/desktop/electron.vite.config.ts`：

```ts
/** Electron 构建配置：main/preload/renderer 分开输出。 */
import { defineConfig } from "electron-vite"

export default defineConfig({
  main: { build: { outDir: "out/main" } },
  preload: { build: { outDir: "out/preload" } },
  renderer: { root: "src/renderer", build: { outDir: "out/renderer" } },
})
```

`frontend/apps/desktop/src/main/protocol.ts`：

```ts
/** 注册 pigcode:// 与 pigcode-plugin://，并保证路径不越出根目录。 */
import { protocol } from "electron"
import { readFile } from "node:fs/promises"
import { join, normalize, resolve } from "node:path"

export function resolveInside(root: string, requestPath: string): string {
  const normalizedRoot = resolve(root)
  const target = resolve(normalizedRoot, normalize(requestPath))
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}/`)) {
    throw new Error(`path escapes root: ${requestPath}`)
  }
  return target
}

/** 必须在 app ready 之前调用。 */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: "pigcode", privileges: { standard: true, secure: true, supportFetchAPI: true } },
    { scheme: "pigcode-plugin", privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ])
}

/** app ready 之后注册应用静态资源协议。 */
export function registerAppProtocol(appRoot: string): void {
  protocol.handle("pigcode", async (request) => {
    const url = new URL(request.url)
    const file = resolveInside(appRoot, url.pathname === "/" ? "index.html" : url.pathname)
    return new Response(await readFile(file), { headers: { "content-type": "text/html" } })
  })
}

/** 提供 boot.json 与插件 client bundle；插件名经过 URL 编码。 */
export function registerPluginProtocol(profileDir: string): void {
  protocol.handle("pigcode-plugin", async (request) => {
    const url = new URL(request.url)
    if (url.hostname === "boot.json") {
      return new Response(await readFile(join(profileDir, "boot.json")), {
        headers: { "content-type": "application/json" },
      })
    }
    if (url.hostname !== "plugins") return new Response("not found", { status: 404 })
    const segments = url.pathname.split("/").filter(Boolean)
    const name = decodeURIComponent(segments[0] ?? "")
    const file = segments.slice(1).join("/")
    if (!name || !file) return new Response("not found", { status: 404 })
    const target = resolveInside(join(profileDir, "node_modules", name), file)
    return new Response(await readFile(target), {
      headers: { "content-type": file.endsWith(".css") ? "text/css" : "text/javascript" },
    })
  })
}
```

`frontend/apps/desktop/src/main/host-process.ts`：

```ts
/** 启动并监督 Host utilityProcess，分配控制与应用两条 MessageChannel。 */
import { MessageChannelMain, utilityProcess } from "electron"
import type { UtilityProcess } from "electron"

export interface HostProcess {
  child: UtilityProcess
  appPort: Electron.MessagePortMain
  controlPort: Electron.MessagePortMain
  stop(): void
}

export function startHostProcess(entry: string, profileDir: string): HostProcess {
  const control = new MessageChannelMain()
  const app = new MessageChannelMain()
  const child = utilityProcess.fork(entry, [], {
    stdio: "pipe",
    env: { ...process.env, PIGCODE_PROFILE_DIR: profileDir },
  })
  child.postMessage({ type: "ports" }, [control.port1, app.port1])
  return {
    child,
    controlPort: control.port2,
    appPort: app.port2,
    stop() {
      child.kill()
    },
  }
}
```

`frontend/apps/host/src/rpc/message-port-transport.ts`：

```ts
/** 把 Electron utilityProcess 收到的 MessagePort 适配成 HostTransport。 */
import type { HostTransport } from "@pigcode/client-runtime"
import type { MessagePort } from "node:worker_threads"

export class MessagePortTransport implements HostTransport {
  private readonly listeners = new Set<(message: unknown) => void>()

  constructor(private readonly port: MessagePort) {
    port.on("message", (message) => {
      for (const listener of this.listeners) listener(message)
    })
    port.start()
  }

  send(message: unknown): void {
    this.port.postMessage(message)
  }

  onMessage(listener: (message: unknown) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  close(): void {
    this.port.close()
  }
}
```

`frontend/apps/host/src/entry.ts`：

```ts
/** Host utilityProcess 入口：接收 main 转交的端口并启动 RPC。 */
import { createHostApp } from "./kernel/app"
import { MessagePortTransport } from "./rpc/message-port-transport"
import { RpcServer } from "./rpc/server"

process.parentPort.on("message", async (event) => {
  if (event.data?.type !== "ports") return
  const [control, appPort] = event.ports
  if (!appPort) return
  const profileDir = process.env.PIGCODE_PROFILE_DIR
  if (!profileDir) throw new Error("PIGCODE_PROFILE_DIR is required")
  const ctx = await createHostApp({ profileDir, profileName: "desktop" })
  new RpcServer(ctx, new MessagePortTransport(appPort)).start()
  control?.on("message", () => {})
})
```

`frontend/apps/desktop/src/main/index.ts`：

```ts
/** Electron main：单实例、窗口、Host utilityProcess 与端口转交。 */
import { app, BrowserWindow } from "electron"
import { join } from "node:path"
import { startHostProcess, type HostProcess } from "./host-process"
import { registerAppProtocol, registerPluginProtocol, registerPrivilegedSchemes } from "./protocol"

registerPrivilegedSchemes()

let host: HostProcess | undefined
let mainWindow: BrowserWindow | undefined
let quitting = false

function profileDir(): string {
  return process.env.PIGCODE_PROFILE_DIR ?? join(app.getPath("userData"), "profiles", "desktop")
}

function startHost(): HostProcess {
  const next = startHostProcess(join(app.getAppPath(), "out/host/index.mjs"), profileDir())
  next.child.on("exit", () => {
    if (quitting) return
    host = startHost()
    if (mainWindow) mainWindow.webContents.postMessage("pigcode:port", null, [host.appPort])
  })
  return next
}

async function createWindow(): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: join(app.getAppPath(), "out/preload/index.mjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })
  window.webContents.on("did-finish-load", () => {
    if (host) window.webContents.postMessage("pigcode:port", null, [host.appPort])
  })
  await window.loadURL("pigcode://app/index.html")
  return window
}

app.whenReady().then(async () => {
  registerAppProtocol(join(app.getAppPath(), "out/renderer"))
  registerPluginProtocol(profileDir())
  host = startHost()
  mainWindow = await createWindow()

  if (process.env.PIGCODE_E2E === "1") {
    app.on("pigcode:test-kill-host" as never, () => {
      host?.stop()
    })
  }
})

app.on("before-quit", () => {
  quitting = true
  host?.stop()
})

app.on("window-all-closed", () => {
  quitting = true
  host?.stop()
  app.quit()
})
```

`frontend/apps/desktop/src/preload/index.ts`：

```ts
/** preload：只把 main 转交的 MessagePort 转交给渲染主世界；不暴露 Node。 */
import { ipcRenderer } from "electron"

ipcRenderer.on("pigcode:port", (event) => {
  const [port] = event.ports
  if (port) window.postMessage({ type: "pigcode:port" }, "*", [port])
})
```

`frontend/apps/desktop/src/renderer/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pigcode</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; display: grid; grid-template-columns: 260px 1fr; height: 100vh; }
      aside { border-right: 1px solid #ddd; padding: 12px; overflow: auto; }
      main { padding: 12px; overflow: auto; }
      button, input { font: inherit; }
      .event { padding: 4px 0; border-bottom: 1px solid #eee; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <aside>
      <h3>Pigcode M0-A</h3>
      <input id="root" placeholder="/path/to/project" />
      <button id="add">Add project</button>
      <button id="new">New thread</button>
      <ul id="threads"></ul>
      <div id="plugin-panels"></div>
    </aside>
    <main>
      <div id="messages"></div>
      <input id="text" placeholder="Message" />
      <button id="send">Send</button>
    </main>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
```

`frontend/apps/desktop/src/renderer/src/main.ts`：

```ts
/** M0-A 调试渲染器：验证 MessagePort、项目/线程、fake 流和插件面板。 */
import { RpcClient } from "@pigcode/client-runtime"

const state: { projectId?: string; threadId?: string } = {}
let client: RpcClient | undefined

window.addEventListener("message", async (event) => {
  if (event.data?.type !== "pigcode:port") return
  const port = event.ports[0]
  if (!port) return
  port.start()
  const transport = {
    send: (message: unknown) => port.postMessage(message),
    onMessage: (listener: (message: unknown) => void) => {
      const handler = (messageEvent: MessageEvent) => listener(messageEvent.data)
      port.addEventListener("message", handler)
      return () => port.removeEventListener("message", handler)
    },
    close: () => port.close(),
  }
  client = new RpcClient(transport)
  await loadPlugins()
})

async function loadPlugins(): Promise<void> {
  try {
    const response = await fetch("pigcode-plugin://boot.json")
    if (!response.ok) return
    const boot = (await response.json()) as { entries: Array<{ id: string; url: string }> }
    for (const entry of boot.entries) {
      const module = (await import(entry.url)) as {
        apply?: (ctx: { registerPanel: (panel: { id: string; title: string; render(container: HTMLElement): void }) => () => void }) => void
      }
      module.apply?.({
        registerPanel(panel) {
          const host = document.querySelector("#plugin-panels")!
          const section = document.createElement("section")
          const title = document.createElement("h4")
          title.textContent = panel.title
          const body = document.createElement("div")
          section.append(title, body)
          host.append(section)
          panel.render(body)
          return () => section.remove()
        },
      })
    }
  } catch {
    // 插件加载失败不影响核心调试界面
  }
}

async function call(method: string, params: unknown): Promise<unknown> {
  if (!client) throw new Error("host not connected")
  return client.call(method, params)
}

document.querySelector("#add")!.addEventListener("click", async () => {
  const rootPath = (document.querySelector("#root") as HTMLInputElement).value
  const project = (await call("project.add", { rootPath })) as { id: string }
  state.projectId = project.id
})

document.querySelector("#new")!.addEventListener("click", async () => {
  if (!state.projectId) return
  const thread = (await call("thread.create", { projectId: state.projectId, title: "First thread", providerId: "fake" })) as { id: string }
  state.threadId = thread.id
  const subscription = await call("thread.subscribe", { threadId: thread.id, cursor: 0 })
  renderEvents((subscription as { events: unknown[] }).events)
  client?.onNotification((message) => {
    const value = message as { method?: string; params?: unknown }
    if (value.method === "thread.event") renderEvents([value.params])
  })
})

document.querySelector("#send")!.addEventListener("click", async () => {
  if (!state.threadId) return
  const text = (document.querySelector("#text") as HTMLInputElement).value
  await call("run.start", { threadId: state.threadId, text })
})

function renderEvents(events: unknown[]): void {
  const target = document.querySelector("#messages")!
  for (const event of events) {
    const row = document.createElement("div")
    row.className = "event"
    row.textContent = JSON.stringify(event)
    target.append(row)
  }
}
```

`frontend/scripts/build-host.mjs`：

```js
/** 把 Host utilityProcess 入口打成可加载的单文件。 */
import { build } from "esbuild"

await build({
  entryPoints: ["apps/host/src/entry.ts"],
  outfile: "apps/desktop/out/host/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["better-sqlite3"],
  sourcemap: true,
})
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/desktop/src/main/protocol.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
pnpm add -D esbuild --filter @pigcode/desktop
node scripts/build-host.mjs
git add apps/desktop apps/host scripts
git commit -m "feat(desktop): add utilityProcess host and message port bridge"
```

---

### Task 11: Plugin Manager, Boot Graph, and Sample Plugins

**Files:**
- Create: `frontend/apps/host/src/services/plugins.ts`
- Create: `frontend/apps/host/src/services/plugin-manager.ts`
- Create: `frontend/examples/capability-session-info/package.json`
- Create: `frontend/examples/capability-session-info/index.mjs`
- Create: `frontend/examples/ui-debug-panel/package.json`
- Create: `frontend/examples/ui-debug-panel/client.mjs`
- Test: `frontend/apps/host/src/services/plugin-manager.test.ts`

**Interfaces:**
- Consumes: `pluginManifestSchema`、profile YAML、`ctx.sessions`。
- Produces: `installLocalPlugin()`、`setPluginEnabled()`、`buildBootGraph()`、`ctx.plugins`。

- [ ] **Step 1: 写失败测试**

`frontend/apps/host/src/services/plugin-manager.test.ts`：

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { buildBootGraph, installLocalPlugin, setPluginEnabled } from "./plugin-manager"

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pigcode-plugin-"))
  const source = join(root, "ui-debug-panel")
  await mkdir(source)
  await writeFile(
    join(source, "package.json"),
    JSON.stringify({
      name: "pigcode-ui-debug-panel",
      version: "0.0.0",
      pigcode: { apiVersion: 1, kind: "ui", client: "./client.mjs" },
    }),
  )
  await writeFile(join(source, "client.mjs"), "export function apply() {}\n")
  return { root, source }
}

describe("plugin manager", () => {
  it("installs a local plugin and toggles it", async () => {
    const { root, source } = await fixture()
    const entry = await installLocalPlugin(root, source)
    expect(entry.id).toContain("pigcode-ui-debug-panel")
    await setPluginEnabled(root, entry.id, false)
    const graph = await buildBootGraph(root)
    expect(graph.entries).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-manager.test.ts`
Expected: FAIL，找不到 `./plugin-manager`。

- [ ] **Step 3: 实现 plugin manager 与示例插件**

`frontend/apps/host/src/services/plugin-manager.ts`：

```ts
/** 本地插件安装、启停与 boot graph 构建；M0 只支持本地目录。 */
import { createHash } from "node:crypto"
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { parse, stringify } from "yaml"
import { pluginManifestSchema, type PluginManifest } from "@pigcode/plugin-sdk"

export interface InstalledPluginEntry {
  id: string
  name: string
  config?: unknown
  disabled?: boolean
}

export interface BootGraphEntry {
  id: string
  revision: string
  url: string
  inject: string[]
}

const PROFILE_FILE = "desktop.yml"

async function readProfile(profileDir: string): Promise<{ plugins: InstalledPluginEntry[] }> {
  const path = join(profileDir, PROFILE_FILE)
  try {
    return parse(await readFile(path, "utf8")) as { plugins: InstalledPluginEntry[] }
  } catch {
    return { plugins: [] }
  }
}

async function writeProfile(profileDir: string, profile: { plugins: InstalledPluginEntry[] }): Promise<void> {
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, PROFILE_FILE), stringify(profile), "utf8")
}

/** 校验并复制本地插件到 profile，随后写入启用的条目。 */
export async function installLocalPlugin(profileDir: string, sourceDir: string): Promise<InstalledPluginEntry> {
  const manifest = pluginManifestSchema.parse(
    JSON.parse(await readFile(join(sourceDir, "package.json"), "utf8")),
  )
  const target = join(profileDir, "node_modules", manifest.name)
  await rm(target, { recursive: true, force: true })
  await mkdir(dirname(target), { recursive: true })
  await cp(sourceDir, target, { recursive: true })
  const entry: InstalledPluginEntry = {
    id: `${manifest.pigcode.kind}.${manifest.name}`,
    name: manifest.name,
    config: {},
    disabled: false,
  }
  const profile = await readProfile(profileDir)
  profile.plugins = [...profile.plugins.filter((item) => item.id !== entry.id), entry]
  await writeProfile(profileDir, profile)
  return entry
}

/** 切换插件的 disabled 标记。 */
export async function setPluginEnabled(profileDir: string, id: string, enabled: boolean): Promise<void> {
  const profile = await readProfile(profileDir)
  const entry = profile.plugins.find((item) => item.id === id)
  if (!entry) throw new Error(`plugin not found: ${id}`)
  entry.disabled = !enabled
  await writeProfile(profileDir, profile)
}

/** 为已启用且带 client 入口的插件生成启动图。 */
export async function buildBootGraph(profileDir: string): Promise<{ entries: BootGraphEntry[] }> {
  const profile = await readProfile(profileDir)
  const entries: BootGraphEntry[] = []
  for (const entry of profile.plugins) {
    if (entry.disabled) continue
    const manifest = await readManifest(profileDir, entry)
    if (!manifest.pigcode.client) continue
    const clientPath = join(profileDir, "node_modules", manifest.name, manifest.pigcode.client)
    const revision = createHash("sha256")
      .update(await readFile(clientPath))
      .digest("hex")
      .slice(0, 12)
    entries.push({
      id: entry.id,
      revision,
      url: `pigcode-plugin://plugins/${encodeURIComponent(manifest.name)}/client.js?rev=${revision}`,
      inject: manifest.pigcode.inject,
    })
  }
  return { entries }
}

async function readManifest(profileDir: string, entry: InstalledPluginEntry): Promise<PluginManifest> {
  const path = join(profileDir, "node_modules", entry.name, "package.json")
  return pluginManifestSchema.parse(JSON.parse(await readFile(path, "utf8")))
}
```

`frontend/apps/host/src/services/plugins.ts`：

```ts
/** 把 plugin manager 暴露为 Host 服务，供 RPC 与界面调用。 */
import type { Context } from "cordis"
import { buildBootGraph, installLocalPlugin, setPluginEnabled } from "./plugin-manager"

export interface PluginsService {
  installLocal(profileDir: string, sourceDir: string): Promise<unknown>
  enable(profileDir: string, id: string): Promise<void>
  disable(profileDir: string, id: string): Promise<void>
  bootGraph(profileDir: string): Promise<unknown>
}

declare module "cordis" {
  interface Context {
    plugins: PluginsService
  }
}

export function apply(ctx: Context): void {
  ctx.provide("plugins", {
    installLocal: installLocalPlugin,
    enable: (profileDir, id) => setPluginEnabled(profileDir, id, true),
    disable: (profileDir, id) => setPluginEnabled(profileDir, id, false),
    bootGraph: buildBootGraph,
  })
}
```

`frontend/examples/capability-session-info/package.json`：

```json
{
  "name": "pigcode-capability-session-info",
  "version": "0.0.0",
  "type": "module",
  "main": "./index.mjs",
  "pigcode": { "apiVersion": 1, "kind": "capability", "host": "./index.mjs" }
}
```

`frontend/examples/capability-session-info/index.mjs`：

```js
/** 示例 capability 插件：暴露当前线程事件数量。 */
export const inject = ["sessions"]

export function apply(ctx) {
  ctx.provide("sessionInfo", {
    count(threadId) {
      return ctx.sessions.read(threadId, 0).length
    },
  })
}
```

`frontend/examples/ui-debug-panel/package.json`：

```json
{
  "name": "pigcode-ui-debug-panel",
  "version": "0.0.0",
  "type": "module",
  "pigcode": { "apiVersion": 1, "kind": "ui", "client": "./client.mjs" }
}
```

`frontend/examples/ui-debug-panel/client.mjs`：

```js
/** 示例 UI 插件：在调试侧栏添加一个面板。 */
export function apply(ctx) {
  ctx.registerPanel({
    id: "debug-panel",
    title: "Debug Panel",
    render(container) {
      container.textContent = "Hello from pigcode-ui-debug-panel"
    },
  })
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-manager.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host examples
git commit -m "feat(plugins): add local install, boot graph, and samples"
```

---

### Task 12: Wire Boot Graph to Renderer, E2E, and CI

**Files:**
- Create: `frontend/apps/host/src/kernel/boot.ts`
- Modify: `frontend/apps/desktop/src/main/index.ts`
- Modify: `frontend/apps/desktop/src/renderer/src/main.ts`
- Create: `frontend/apps/desktop/playwright.config.ts`
- Create: `frontend/apps/desktop/e2e/m0-a.spec.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 10 的 protocol/renderer；Task 11 的 boot graph。
- Produces: 可运行的 M0-A 验收：创建项目/线程、fake 流、插件面板出现/消失、Host 重启后重连。

- [ ] **Step 1: 写失败 E2E**

`frontend/apps/desktop/e2e/m0-a.spec.ts`：

```ts
import { _electron as electron, test, expect } from "@playwright/test"

test("creates a project, streams a fake response, and reconnects", async () => {
  const app = await electron.launch({ args: ["."] })
  const page = await app.firstWindow()
  await page.fill("#root", "/tmp/pigcode-e2e")
  await page.click("#add")
  await page.click("#new")
  await page.fill("#text", "hello")
  await page.click("#send")
  await expect(page.locator("#messages")).toContainText("message.delta")
  await expect(page.locator("#messages")).toContainText("message.completed")

  // 通过测试 hook 杀掉 utilityProcess，窗口应保留并重连
  await app.evaluate(({ app }) => app.emit("pigcode:test-kill-host"))
  await expect(page.locator("#messages")).toContainText("reconnected")
  await app.close()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend/apps/desktop && pnpm exec playwright test`
Expected: FAIL，因为 host 重启与重连尚未接线。

- [ ] **Step 3: 接线 boot graph、重启与重连**

`frontend/apps/host/src/kernel/boot.ts`：

```ts
/** 在 Host 启动后把 boot graph 写到 profile 目录，main 的 protocol 直接读取。 */
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { buildBootGraph } from "../services/plugin-manager"

export async function writeBootGraph(profileDir: string): Promise<void> {
  const graph = await buildBootGraph(profileDir)
  await writeFile(join(profileDir, "boot.json"), JSON.stringify(graph), "utf8")
}
```

同时修改 `frontend/apps/host/src/entry.ts`，在 `createHostApp` 之后、启动 RPC 之前调用：

```ts
await writeBootGraph(profileDir)
```

`frontend/apps/desktop/src/main/index.ts` 增加：
- `app.on("pigcode:test-kill-host", ...)` 仅在 `PIGCODE_E2E=1` 时允许；
- Host exit 后重新 `startHostProcess` 并把新 `appPort` 转给窗口；
- 窗口保留，Renderer 收到新端口后清空连接状态并从 cursor 重订阅。

Renderer 在 `window.message` 处理器中改为调用 `connect(port)`，并保留 cursor：

```ts
let cursor = 0
let currentThreadId: string | undefined

async function connect(port: MessagePort): Promise<void> {
  port.start()
  const transport = {
    send: (message: unknown) => port.postMessage(message),
    onMessage: (listener: (message: unknown) => void) => {
      const handler = (event: MessageEvent) => listener(event.data)
      port.addEventListener("message", handler)
      return () => port.removeEventListener("message", handler)
    },
    close: () => port.close(),
  }
  client = new RpcClient(transport)
  client.onNotification((message) => {
    const value = message as { method?: string; params?: { seq?: number } }
    if (value.method === "thread.delta") {
      renderEvents([value.params])
      return
    }
    if (value.method === "thread.event" && value.params) {
      cursor = Math.max(cursor, value.params.seq ?? cursor)
      renderEvents([value.params])
    }
  })
  if (currentThreadId) {
    const subscription = await call("thread.subscribe", { threadId: currentThreadId, cursor })
    renderEvents((subscription as { events: unknown[] }).events)
    appendStatus("reconnected")
  }
  await loadPlugins()
}

function appendStatus(text: string): void {
  const row = document.createElement("div")
  row.className = "event"
  row.textContent = text
  document.querySelector("#messages")!.append(row)
}
```

同时把 `thread.create` 后的 `currentThreadId` 设为新线程 id，并在每条 `thread.event` 到达时更新 `cursor`。

- [ ] **Step 4: 运行 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test`
Expected: PASS。

- [ ] **Step 5: 添加 CI 并提交**

`.github/workflows/ci.yml`：

```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 10.28.2 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm, cache-dependency-path: frontend/pnpm-lock.yaml }
      - run: pnpm install --frozen-lockfile
        working-directory: frontend
      - run: pnpm lint
        working-directory: frontend
      - run: pnpm test
        working-directory: frontend
```

```bash
cd frontend
git add .
git commit -m "test(e2e): add m0-a vertical slice and ci"
```

---

## Self-Review

**Spec coverage（M0-A 范围）：**

| Spec 要求 | 对应任务 |
|---|---|
| Cordis 固定版本与 profile/bundle/patch | Task 6（loader + profile）；patch 应用在 M1 补全 |
| 协议版本、命令、事件、snapshot+cursor | Task 2/3/9 |
| SQLite 事件日志、投影、回执 | Task 5/7 |
| Fake provider | Task 8 |
| Host utilityProcess + MessageChannel | Task 10/12 |
| MessagePort 无 HTTP/token | Task 9/10 |
| 插件 manifest、安装/启停、boot graph | Task 4/11/12（manager 单测；插件管理 RPC 与 UI 在 M0-B） |
| 样例 capability/UI 插件 | Task 11 |
| 项目/线程/运行 | Task 7/8/9 |
| `--dump-config` | Task 6 |
| 三平台 CI | Task 12 |
| UI 迁移 / Base UI | **不在 M0-A**，属于 M0-B |

**Placeholder scan:** 无 TBD/TODO；所有任务包含具体文件、代码与测试命令。

**Type consistency:** `ThreadEvent`、`ProviderEvent`、`ProviderDriver`、`HostTransport`、`RpcClient`、`BootGraphEntry` 在前后任务中名称一致。`createHostApp` 在 Task 6 定义，Task 7/9/12 复用。`ctx.provide` 的服务名与 `declare module "cordis"` 扩展一致。
