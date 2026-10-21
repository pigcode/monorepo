# Pigcode M4 Plugin Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M0-B 的插件“列表 + 本地安装”补成完整插件平台：API 版本与 engines 校验、权限展示、`provides`/slot 冲突检测、npm/tarball 安装、Host 插件动态加载/卸载、第三方 provider/capability/UI 样例，以及端到端验收。

**Architecture:** 插件仍是普通 npm 包；`plugins` 服务在 profile 目录维护安装记录，并通过 Cordis loader 对 Host 插件做 `create/remove`，对 client 插件刷新 boot graph。第三方 provider 插件通过 `@pigcode/plugin-sdk` 暴露的稳定 `ProviderPluginDriver` 注册；capability 插件通过 `PluginHostContext` 注册服务；UI 插件继续通过受限 client facade 注册 slot/panel。

**Tech Stack:** TypeScript 5.9、Cordis 4.0.0-rc.11、Zod 4、`semver@7.7.2`、pnpm 10.28.2、Vitest 4、Playwright 1.64.1。

## Global Constraints

- 插件是普通 npm 包；不加 `bundle-` 前缀，不引入第二套 manifest 格式。
- `apiVersion` 当前只支持 `1`；`engines.pigcode` 用 semver 校验，不兼容的插件拒绝加载并给出可读错误。
- Host 插件在 Host 进程内受信运行；UI 插件只拿到受限 facade；安装时必须展示权限和风险。
- 启停必须热生效：启用后 Host 插件与 provider 立即可用，停用后服务、命令、provider、UI slot 全部移除，不需要重启。
- `provides` 重复、slot item id 重复都必须显式失败，不允许静默覆盖。
- npm 安装通过 pnpm；测试注入 fake runner，不联网。本地目录安装仍支持。
- 第三方 provider 样例不得依赖 `@pigcode/host` 内部路径；只依赖 `@pigcode/plugin-sdk` 的类型或零依赖。
- 仍使用 MessagePort RPC；不引入 HTTP/WebSocket/token。
- TypeScript strict；禁止 `any`、`@ts-ignore`、`@ts-expect-error`；文件 ≤500 行；中文注释。

---

## File Structure

```text
frontend/
  packages/plugin-sdk/src/
    manifest.ts                  # apiVersion/engines/permissions 校验
    host.ts                      # PluginHostContext / ProviderPluginDriver
    provider.ts                  # 稳定 provider 类型
  apps/host/src/
    services/plugin-manager.ts   # 安装、冲突、摘要
    services/plugins.ts          # 动态 create/remove + boot graph
    providers/registry.ts        # unregister；defaultProvider 支持动态 provider
    providers/switching.ts       # env 强制 provider 允许任意已注册 driver
    rpc/server.ts                # plugin.install / plugin.list / plugin.enable
  packages/ui-plugin-manager/src/
    plugin-list.tsx              # 权限/版本/冲突展示
    install-form.tsx             # 本地路径或 npm spec
    plugin-manager-view.tsx
  apps/desktop/src/renderer/src/
    app.tsx                      # 插件操作后刷新 provider 列表
  examples/
    provider-echo/               # 第三方 provider 样例
    capability-session-info/     # 已有 capability 样例
    ui-debug-panel/              # 已有 UI 样例
  apps/desktop/e2e/
    m4-plugins.spec.ts
  frontend/docs/plugin-authoring.md
```

---

### Task 1: Plugin Manifest Compatibility and Summary

**Files:**
- Modify: `frontend/packages/plugin-sdk/package.json`
- Modify: `frontend/packages/plugin-sdk/src/manifest.ts`
- Modify: `frontend/apps/host/src/services/plugin-manager.ts`
- Test: `frontend/packages/plugin-sdk/src/manifest.test.ts`
- Test: `frontend/apps/host/src/services/plugin-manager.test.ts`

**Interfaces:**
- Consumes: Zod、semver。
- Produces: `CURRENT_PLUGIN_API_VERSION`、`HOST_VERSION`、`checkPluginCompatibility()`；`PluginSummary` 增加 `apiVersion`、`permissions`、`provides`、`contributes`、`conflict`。

- [ ] **Step 1: 写失败测试**

`manifest.test.ts` 增加：

```ts
/** 验证 apiVersion 与 engines 兼容性。 */
import { describe, expect, it } from "vitest"
import { checkPluginCompatibility, pluginManifestSchema } from "./manifest"

const base = {
  name: "demo",
  version: "1.0.0",
  engines: { pigcode: ">=0.1.0" },
  pigcode: { apiVersion: 1 as const, kind: "ui" as const, client: "./client.js" },
}

describe("plugin compatibility", () => {
  it("accepts the current API and engine range", () => {
    expect(checkPluginCompatibility(pluginManifestSchema.parse(base))).toBeNull()
  })

  it("rejects an unsupported engine range", () => {
    const manifest = pluginManifestSchema.parse({
      ...base,
      engines: { pigcode: ">=99.0.0" },
    })
    expect(checkPluginCompatibility(manifest)).toContain("engines")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/plugin-sdk/src/manifest.test.ts`
Expected: FAIL，`checkPluginCompatibility` 不存在。

- [ ] **Step 3: 实现兼容性校验**

`plugin-sdk/package.json` 增加 `"semver": "7.7.2"` 和 `"@types/semver": "7.7.1"`（devDependencies）。

`manifest.ts` 增加：

```ts
import semver from "semver"

/** 当前 Host 支持的插件 API 主版本。 */
export const CURRENT_PLUGIN_API_VERSION = 1
/** Host 版本；随 Host 发布递增，插件 engines 用它判断兼容。 */
export const HOST_VERSION = "0.1.0"

/** 返回 null 表示兼容；否则返回可直接展示给用户的原因。 */
export function checkPluginCompatibility(manifest: PluginManifest): string | null {
  if (manifest.pigcode.apiVersion !== CURRENT_PLUGIN_API_VERSION) {
    return `unsupported plugin apiVersion: ${manifest.pigcode.apiVersion} (expected ${CURRENT_PLUGIN_API_VERSION})`
  }
  const range = manifest.engines?.pigcode
  if (range && !semver.satisfies(HOST_VERSION, range)) {
    return `plugin requires pigcode ${range}, current ${HOST_VERSION}`
  }
  return null
}
```

`plugin-manager.ts`：
- `PluginSummary` 增加：
```ts
apiVersion: number
permissions: string[]
provides: string[]
contributes: Record<string, unknown>
conflict: string | null
```
- `listPlugins` 读取 manifest 后填充这些字段；`error` 优先显示 manifest/compat 错误，其次 conflict。
- `readManifestState` 调用 `checkPluginCompatibility`；不兼容时 `manifest` 仍返回（供展示），但 `error` 非空。

`plugin-manager.test.ts` 增加断言 summary 字段。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/plugin-sdk/src/manifest.test.ts apps/host/src/services/plugin-manager.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/plugin-sdk apps/host/src/services
git commit -m "feat(plugins): validate api version and engines"
```

---

### Task 2: Provides and Slot Conflict Detection

**Files:**
- Modify: `frontend/apps/host/src/services/plugin-manager.ts`
- Modify: `frontend/apps/host/src/services/plugins.ts`
- Modify: `frontend/apps/desktop/src/renderer/src/client-plugins.tsx`
- Test: `frontend/apps/host/src/services/plugin-conflict.test.ts`

**Interfaces:**
- Consumes: Task 1 的 summary。
- Produces: `PluginConflictError`；`plugin.enable` 在冲突时拒绝；client slot id 冲突时跳过并记录。

- [ ] **Step 1: 写失败测试**

```ts
it("rejects enabling a plugin with a duplicate provides", async () => {
  const { profileDir } = await fixtureWithTwoProviders()
  await expect(setPluginEnabled(profileDir, "provider.b", true)).rejects.toThrow("PROVIDES_CONFLICT")
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-conflict.test.ts`
Expected: FAIL，enable 不检查冲突。

- [ ] **Step 3: 实现**

`plugin-manager.ts`：
- 新增 `PluginConflictError`（`code = "PROVIDES_CONFLICT"`）。
- `collectProvides(profileDir, profile)` 读取所有启用 manifest 的 `provides`，构建 `Map<string, string[]>`。
- `setPluginEnabled(profileDir, id, true)` 在写 profile 前计算 enabled 集合 + 目标插件，发现任一 `provides` 出现两次则抛出 `PluginConflictError`。
- `listPlugins` 给冲突的摘要设置 `conflict` 文本。

`client-plugins.tsx`：
- 维护 `slotOwners: Map<slotName + ":" + id, pluginId>`；`register` 前检查重复，重复则记录到 controller 的 `errors` 快照并跳过。
- `ClientPluginController` 增加 `errors: PanelRegistry`（或 `getErrors()`），插件管理 UI 可选展示；M4 不强制 UI 展示，但 console.error 带插件 id。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-conflict.test.ts apps/host/src/services/plugin-manager.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/services apps/desktop/src/renderer/src/client-plugins.tsx
git commit -m "feat(plugins): reject provides and slot conflicts"
```

---

### Task 3: Dynamic Host Plugin Load and Unload

**Files:**
- Modify: `frontend/apps/host/src/services/plugins.ts`
- Modify: `frontend/apps/host/src/providers/registry.ts`
- Test: `frontend/apps/host/src/services/plugins-dynamic.test.ts`

**Interfaces:**
- Consumes: `ctx.loader.create/remove`、`ProvidersService.unregister`。
- Produces: 启用后 Host 插件立即可用；停用后服务/provider 立即移除。

- [ ] **Step 1: 写失败测试**

```ts
it("loads and unloads a host plugin without restart", async () => {
  const { ctx, profileDir } = await setupHost()
  await installLocalPlugin(profileDir, fixtureProviderPlugin())
  await ctx.plugins.enable(pluginId)
  await ctx.loader.await()
  expect(ctx.providers.list().some((provider) => provider.id === "echo")).toBe(true)

  await ctx.plugins.disable(pluginId)
  await ctx.loader.await()
  expect(ctx.providers.list().some((provider) => provider.id === "echo")).toBe(false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugins-dynamic.test.ts`
Expected: FAIL，enable 只写 profile，不加载。

- [ ] **Step 3: 实现**

`ProvidersService` 增加：

```ts
unregister(driverId: string): void
```

实现：`drivers.delete(driverId)`。

`plugins.ts`：
- `PluginsService` 增加 `install(spec)`（Task 5 实现）和内部 `loadEntry`/`unloadEntry`。
- `apply(ctx, config)` 持有 `ctx`：
```ts
async function loadEntry(entry: InstalledPluginEntry): Promise<void> {
  if (ctx.loader.store[entry.id]) return
  await ctx.loader.create({
    id: entry.id,
    name: entry.name,
    config: entry.config ?? {},
  })
  await ctx.loader.await()
}
async function unloadEntry(id: string): Promise<void> {
  if (!ctx.loader.store[id]) return
  ctx.loader.remove(id)
  await ctx.loader.await()
}
```
- `installLocal`: copy + write profile（保持现有函数），然后 `loadEntry`。
- `enable`: `setPluginEnabled(true)`，`loadEntry`。
- `disable`: `setPluginEnabled(false)`，`unloadEntry`。
- `writeBootGraph` 每次操作后调用。
- 加载失败：把错误写回 profile? 至少让 `list` 的 `error` 通过 loader 状态可见；当前 `PluginSummary.error` 只来自 manifest。M4 可加 `loadError` 内存 Map，`list` 合并。简单实现：`loadEntry` 捕获错误，写入 `ctx.plugins` 的 `errors` Map，`list` 合并显示。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugins-dynamic.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/services apps/host/src/providers/registry.ts
git commit -m "feat(plugins): hot load and unload host plugins"
```

---

### Task 4: Provider Plugin SDK and Echo Sample

**Files:**
- Modify: `frontend/packages/plugin-sdk/src/provider.ts`
- Modify: `frontend/packages/plugin-sdk/src/host.ts`
- Modify: `frontend/packages/plugin-sdk/src/index.ts`
- Create: `frontend/examples/provider-echo/package.json`
- Create: `frontend/examples/provider-echo/index.mjs`
- Test: `frontend/apps/host/src/services/sample-provider.test.ts`

**Interfaces:**
- Consumes: 稳定 provider 类型、`ctx.providers`。
- Produces: 第三方 provider 样例 `echo`，可在运行时安装/启用。

- [ ] **Step 1: 写失败测试**

```ts
it("loads the echo provider plugin and completes a run", async () => {
  const { ctx, thread } = await installEchoProvider()
  const { done } = await ctx.providers.startRun(thread.id, "hello")
  await done
  const events = ctx.sessions.read(thread.id, 0)
  expect(events.some((event) => event.type === "message.completed")).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/sample-provider.test.ts`
Expected: FAIL，样例不存在。

- [ ] **Step 3: 实现**

`plugin-sdk/src/provider.ts`：

```ts
/** 第三方 provider 插件使用的稳定契约；不依赖 Host 内部路径。 */
import type { ProviderCapabilities, ProviderEvent } from "@pigcode/contracts"

export interface PluginProviderSession {
  id: string
  threadId: string
  cwd: string
  nativeSessionId: string | null
  permissionMode: string
  model: string | null
}

export interface PluginProviderRuntime {
  signal: AbortSignal
  emit(event: ProviderEvent): void
  requestApproval(request: {
    toolName: string
    input: unknown
  }): Promise<"allow-once" | "allow-for-session" | "deny">
}

export interface ProviderPluginDriver {
  id: string
  displayName: string
  capabilities: ProviderCapabilities
  createSession(input: { threadId: string; cwd: string; nativeSessionId?: string | null }): Promise<PluginProviderSession>
  send(session: PluginProviderSession, input: { text: string; handoff?: string }, runtime: PluginProviderRuntime): Promise<void>
  interrupt(session: PluginProviderSession): Promise<void>
  dispose(session: PluginProviderSession): Promise<void>
}
```

`plugin-sdk/src/host.ts` 增加：

```ts
import type { ProviderPluginDriver } from "./provider"

export interface PluginHostContext {
  provide(name: string, value: unknown): void
  effect(setup: () => (() => void) | void): void
  providers: {
    register(driver: ProviderPluginDriver): void
    unregister(id: string): void
  }
}

export type HostPlugin = (ctx: PluginHostContext, config: unknown) => void | Promise<void>
```

`examples/provider-echo/package.json`：

```json
{
  "name": "pigcode-provider-echo",
  "version": "0.1.0",
  "type": "module",
  "main": "./index.mjs",
  "pigcode": {
    "apiVersion": 1,
    "kind": "provider",
    "displayName": "Echo",
    "host": "./index.mjs",
    "provides": ["provider:echo"],
    "permissions": [],
    "contributes": { "provider": { "id": "echo" } }
  }
}
```

`index.mjs`：

```js
/** 示例第三方 provider：把用户输入原样回显。 */
export const name = "provider-echo"
export const inject = ["providers"]

export function apply(ctx) {
  const driver = {
    id: "echo",
    displayName: "Echo",
    capabilities: {
      streaming: true, approvals: false, questions: false, plan: false,
      resume: false, fork: false, rollback: false, checkpoint: false,
      subagents: false, mcp: false, images: false, usage: false,
      modelCatalog: false, nativeSessionId: false,
    },
    async createSession(input) {
      return {
        id: `echo_${input.threadId}`,
        threadId: input.threadId,
        cwd: input.cwd,
        nativeSessionId: null,
        permissionMode: "workspace-write",
        model: null,
      }
    },
    async send(_session, input, runtime) {
      runtime.emit({ type: "run.started" })
      runtime.emit({ type: "message.delta", text: input.text })
      runtime.emit({ type: "message.completed", text: input.text })
      runtime.emit({ type: "run.completed" })
    },
    async interrupt() {},
    async dispose() {},
  }
  ctx.providers.register(driver)
  ctx.effect(() => () => ctx.providers.unregister("echo"))
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/sample-provider.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/plugin-sdk examples/provider-echo apps/host/src/services/sample-provider.test.ts
git commit -m "feat(plugins): add provider plugin sdk and echo sample"
```

---

### Task 5: npm / Tarball Install Pipeline

**Files:**
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/services/plugin-manager.ts`
- Modify: `frontend/apps/host/src/services/plugins.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Test: `frontend/apps/host/src/services/plugin-install.test.ts`

**Interfaces:**
- Consumes: pnpm runner injection。
- Produces: `plugin.install({ spec })`；支持本地目录、`file:`、npm 包名/版本。

- [ ] **Step 1: 写失败测试**

```ts
it("installs from an npm spec using the injected runner", async () => {
  const calls: string[][] = []
  const runner = async (args: string[]) => { calls.push(args) }
  await installPlugin(profileDir, "pigcode-provider-echo@0.1.0", runner)
  expect(calls[0]).toEqual(["add", "pigcode-provider-echo@0.1.0", "--dir", profileDir])
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-install.test.ts`
Expected: FAIL，`installPlugin` 不存在。

- [ ] **Step 3: 实现**

`commands.ts` 增加：

```ts
"plugin.install": z.object({ spec: z.string().min(1) }),
```

`plugin-manager.ts`：

```ts
export type PnpmRunner = (args: string[]) => Promise<void>

/** 本地路径走 copy；其余走 pnpm add。 */
export async function installPlugin(
  profileDir: string,
  spec: string,
  runPnpm: PnpmRunner = defaultPnpmRunner,
): Promise<InstalledPluginEntry> {
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("file:")) {
    return installLocalPlugin(profileDir, spec.replace(/^file:/, ""))
  }
  await runPnpm(["add", spec, "--dir", profileDir])
  const packageJson = JSON.parse(await readFile(join(profileDir, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>
  }
  const name = Object.keys(packageJson.dependencies ?? {}).at(-1)
  if (!name) throw new Error("installed package not found in profile dependencies")
  const manifest = pluginManifestSchema.parse(
    JSON.parse(await readFile(join(profileDir, "node_modules", name, "package.json"), "utf8")),
  )
  return addProfileEntry(profileDir, manifest)
}
```

`defaultPnpmRunner` 用 `execFile("pnpm", args)`；`PIGCODE_PNPM` 可覆盖。`addProfileEntry` 抽取现有 entry 写入逻辑。

`plugins.ts` 增加 `install(spec)`，调用 `installPlugin` + `loadEntry` + boot graph。

`rpc/server.ts` 增加 `plugin.install` 分支。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-install.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts apps/host/src/services apps/host/src/rpc/server.ts
git commit -m "feat(plugins): install from npm and tarball specs"
```

---

### Task 6: Plugin Manager UI Details and Install Spec

**Files:**
- Modify: `frontend/packages/ui-plugin-manager/src/plugin-list.tsx`
- Modify: `frontend/packages/ui-plugin-manager/src/install-form.tsx`
- Modify: `frontend/packages/ui-plugin-manager/src/plugin-manager-view.tsx`
- Modify: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Test: `frontend/packages/ui-plugin-manager/src/plugin-manager-view.test.tsx`

**Interfaces:**
- Consumes: Task 1/5 的 summary 与 `plugin.install`。
- Produces: 显示版本/API/权限/冲突；安装表单接受路径或 npm spec；启停后刷新 provider 列表。

- [ ] **Step 1: 写失败测试**

```tsx
it("renders permissions and conflicts", () => {
  render(
    <LocaleProvider locale="zh-CN">
      <PluginManagerView
        plugins={[{
          id: "provider.demo", name: "demo", version: "1.0.0", kind: "provider",
          enabled: true, error: null, apiVersion: 1, permissions: ["process:spawn"],
          provides: ["provider:demo"], contributes: {}, conflict: "provides conflict: provider:demo",
        }]}
        onInstall={async () => {}}
        onEnable={async () => {}}
        onDisable={async () => {}}
        onRefresh={async () => {}}
      />
    </LocaleProvider>,
  )
  expect(screen.getByText("process:spawn")).toBeTruthy()
  expect(screen.getByText(/conflict/)).toBeTruthy()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-plugin-manager/src/plugin-manager-view.test.tsx`
Expected: FAIL，summary 类型/渲染缺失。

- [ ] **Step 3: 实现**

- `PluginSummary` 增加字段（与 Host 对齐）。
- `PluginList` 显示 kind、version、apiVersion、permissions badges、conflict 错误。
- `InstallForm` 的输入改为“本地目录或 npm 包”；`onInstall(spec)`；提示“插件以 Host 权限运行”。
- `PluginManagerContainer` 的 `onInstall` 调用 `plugin.install`；启停后额外调用 `provider.list`、`provider.detect` 刷新 store，使新 provider 立即出现在线程头菜单。
- 文案加入 zh-CN/en-US：`plugins.permissions`、`plugins.conflict`、`plugins.installSpec`、`plugins.trustWarning`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-plugin-manager/src/plugin-manager-view.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-plugin-manager apps/desktop/src/renderer/src/app.tsx packages/ui-primitives/src/locale
git commit -m "feat(plugins): show permissions, conflicts, and npm installs"
```

---

### Task 7: Capability Plugin Facade and Sample

**Files:**
- Modify: `frontend/packages/plugin-sdk/src/host.ts`
- Modify: `frontend/examples/capability-session-info/index.mjs`
- Test: `frontend/apps/host/src/services/sample-capability.test.ts`

**Interfaces:**
- Consumes: `PluginHostContext.provide`。
- Produces: capability 样例可安装/启用/停用；服务随插件卸载消失。

- [ ] **Step 1: 写失败测试**

```ts
it("loads and unloads the capability sample", async () => {
  const { ctx } = await installCapabilitySample()
  expect(ctx.reflect.get("sessionInfo")).toBeTruthy()
  ctx.plugins.disable("capability.pigcode-capability-session-info")
  await ctx.loader.await()
  expect(ctx.reflect.get("sessionInfo")).toBeUndefined()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/sample-capability.test.ts`
Expected: FAIL，facade/样例不满足。

- [ ] **Step 3: 实现**

- `PluginHostContext` 增加 `sessions.read(threadId,cursor)` 的只读类型，供 capability 样例使用；Host adapter 不需要改，Cordis Context 结构上已满足。
- `examples/capability-session-info/index.mjs` 改为：
```js
export const name = "capability-session-info"
export const inject = ["sessions"]
export function apply(ctx) {
  ctx.provide("sessionInfo", {
    count(threadId) { return ctx.sessions.read(threadId, 0).length },
  })
  ctx.effect(() => () => {})
}
```
- 确保 `ctx.provide` 在 Cordis 中可调用；如果只能 `ctx.reflect.provide`，在 SDK 中提供 `provide` 辅助并在样例中使用。实现时以实际 Cordis API 为准。
- 测试通过 `installLocalPlugin` + `ctx.plugins.enable` 加载样例；禁用后服务消失。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/sample-capability.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/plugin-sdk examples/capability-session-info apps/host/src/services/sample-capability.test.ts
git commit -m "feat(plugins): add capability plugin facade and sample"
```

---

### Task 8: Plugin E2E

**Files:**
- Create: `frontend/apps/desktop/e2e/m4-plugins.spec.ts`
- Modify: `frontend/apps/desktop/playwright.config.ts`

**Interfaces:**
- Consumes: 真实 app、本地样例插件。
- Produces: 安装/启用/停用 provider、UI、capability 插件的端到端验收。

- [ ] **Step 1: 写 E2E**

```ts
/** M4 验收：安装/启用/停用第三方 provider、UI、capability 插件。 */
import { _electron as electron, expect, test } from "@playwright/test"
import { mkdirSync, rmSync } from "node:fs"

test("installs, enables, and disables plugins without restart", async () => {
  mkdirSync("/tmp/pigcode-m4-e2e", { recursive: true })
  const env = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
  const app = await electron.launch({ args: ["."], env: { ...env, PIGCODE_PROVIDER: "echo" } })
  const page = await app.firstWindow()
  // 安装 provider 插件
  await page.getByRole("button", { name: "添加项目" }).first().click()
  await page.getByLabel("项目路径").fill("/tmp/pigcode-m4-e2e")
  await page.getByRole("button", { name: "添加", exact: true }).click()
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "插件", exact: true }).first().click()
  const provider = new URL("../../../examples/provider-echo", import.meta.url).pathname
  await page.getByLabel("插件目录或 npm 包").fill(provider)
  await page.getByRole("button", { name: "安装插件" }).click()
  await expect(page.getByText("pigcode-provider-echo")).toBeVisible()
  await expect(
    page.locator(".item").filter({ hasText: "pigcode-provider-echo" }).getByRole("button", { name: "停用" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "返回应用" }).click()

  // 新建会话，默认 provider 由 PIGCODE_PROVIDER=echo 强制
  await page.getByRole("button", { name: "新会话" }).first().click()
  await page.getByRole("textbox").fill("hello echo")
  await page.keyboard.press("Enter")
  await expect(page.getByText("hello echo")).toBeVisible()

  // 安装 UI 插件，面板出现；停用后消失
  await page.getByRole("button", { name: "设置", exact: true }).click()
  await page.getByRole("button", { name: "插件", exact: true }).first().click()
  const ui = new URL("../../../examples/ui-debug-panel", import.meta.url).pathname
  await page.getByLabel("插件目录或 npm 包").fill(ui)
  await page.getByRole("button", { name: "安装插件" }).click()
  await expect(
    page.locator(".item").filter({ hasText: "pigcode-ui-debug-panel" }).getByRole("button", { name: "停用" }),
  ).toBeVisible()
  await expect(page.getByText("Debug Panel")).toBeVisible()
  await page
    .locator(".item")
    .filter({ hasText: "pigcode-ui-debug-panel" })
    .getByRole("button", { name: "停用" })
    .click()
  await expect(page.getByText("Debug Panel")).toBeHidden()

  await app.close()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m4-plugins.spec.ts`
Expected: FAIL，安装/动态加载或选择器未就绪。

- [ ] **Step 3: 修正接线与选择器**

- `defaultProvider` 在 `PIGCODE_PROVIDER` 是任意已注册 provider 时返回该 id；`switching.ts` 的强制白名单改为 `drivers` 判断。
- `App` 在创建线程时调用 `provider.default`；插件启用后 provider 列表刷新。
- 插件页按钮/输入框的 aria-label、插件行按名称定位。
- 本地安装复制样例到 profile；loader 从 profileDir 解析 `pigcode-provider-echo`。
- `provider-echo` 的 `message.completed` 带 `role: "assistant"`? Host 已统一；E2E 断言文本即可。

- [ ] **Step 4: 运行 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m4-plugins.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/desktop/e2e apps/desktop/playwright.config.ts apps/desktop/src/renderer/src apps/host/src/providers
git commit -m "test(e2e): add plugin install and hot toggle flow"
```

---

### Task 9: Plugin Authoring Docs and Scaffold

**Files:**
- Create: `frontend/docs/plugin-authoring.md`
- Create: `frontend/scripts/create-plugin.mjs`
- Modify: `frontend/package.json`

**Interfaces:**
- Consumes: manifest/provider/client APIs。
- Produces: 插件作者可照着写第一个插件。

- [ ] **Step 1: 写文档**

`frontend/docs/plugin-authoring.md` 至少包含：

- 目录结构。
- `package.json` 的 `pigcode` 声明（apiVersion、kind、host/client、inject、provides、permissions）。
- provider 插件示例（引用 `examples/provider-echo`）。
- UI 插件示例（`ctx.slots.register` / `registerPanel`）。
- capability 插件示例（`ctx.provide`）。
- 启停与冲突规则。
- 本地安装命令。

- [ ] **Step 2: 写 scaffold 脚本**

`scripts/create-plugin.mjs`：
- `node scripts/create-plugin.mjs <dir> <kind> <name>` 生成最小目录：
  - `package.json`
  - `index.mjs`（provider/capability）
  - `client.mjs`（ui）
- 生成后打印安装路径。

- [ ] **Step 3: 运行脚本**

Run: `cd frontend && node scripts/create-plugin.mjs /tmp/pigcode-plugin-demo ui demo`
Expected: 生成 `/tmp/pigcode-plugin-demo/package.json` 与 `client.mjs`。

- [ ] **Step 4: 提交**

```bash
cd frontend
git add docs/plugin-authoring.md scripts/create-plugin.mjs package.json
git commit -m "docs: add plugin authoring guide and scaffold"
```

---

### Task 10: Final Verification

**Files:**
- Modify: `frontend/README.md`
- Test: all

**Interfaces:**
- Consumes: 全部 M4 实现。
- Produces: 可复现的 M4 验收记录。

- [ ] **Step 1: 全量门禁**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS。

- [ ] **Step 2: 回归**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m0-b.spec.ts e2e/m3-workbench.spec.ts`
Expected: PASS。

- [ ] **Step 3: 插件 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m4-plugins.spec.ts`
Expected: PASS。

- [ ] **Step 4: 真实 provider 冒烟**

Run: `cd frontend && PIGCODE_REAL_CLAUDE=1 pnpm real:claude`
Expected: PASS。

Run: `cd frontend && PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6-astra pnpm real:codex`
Expected: PASS。

- [ ] **Step 5: 更新 README 并提交**

```markdown
## Plugins

Plugins are ordinary npm packages with a `pigcode` manifest field. Install a local
directory or npm spec from Settings → Plugins. Provider, capability, and UI plugins
load and unload without restarting the app.

See [docs/plugin-authoring.md](docs/plugin-authoring.md).
```

```bash
cd frontend
git add README.md
git commit -m "docs: document the plugin platform"
```

---

## Self-Review

**Spec coverage（M4 范围）：**

| Spec 要求 | 对应任务 |
|---|---|
| apiVersion/engines 兼容 | Task 1 |
| 权限展示 | Task 1/6 |
| provides/slot 冲突 | Task 2 |
| Host 插件热加载/卸载 | Task 3 |
| 第三方 provider | Task 4/8 |
| 第三方 capability | Task 7 |
| npm/tarball 安装 | Task 5/6 |
| 插件管理 UI | Task 6 |
| 插件端到端 | Task 8 |
| 插件作者文档/脚手架 | Task 9 |
| 回归与冒烟 | Task 10 |

**Placeholder scan:** 无 TBD/TODO；每个任务有文件、测试命令与关键代码。

**Type consistency:** `PluginSummary` 的字段在 Host 与 UI 两侧一致；`ProviderPluginDriver` 与 Host `ProviderDriver` 结构一致；`plugin.install` 与 `installPlugin` 命名一致。

**Known deferrals（不属于 M4）：**

- 插件市场/远程索引与签名。
- 插件沙箱/out-of-process plugin host；M4 仍是 Host 内受信插件。
- npm 安装的真实网络 E2E；单测用 fake pnpm runner，真实安装由本地样例覆盖。
- UI 插件 slot 冲突的完整 UI 错误面板；M4 记录并跳过冲突项。
```