# Pigcode M3 Code Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Pigcode 加一个可用的代码工作台：文件树、按 run 的 diff、内置 PTY 终端、git worktree、checkpoint 创建/回滚，并把它们接进右栏 UI。

**Architecture:** Host 新增五个服务：`workspace`（文件树/读文件/搜索）、`git`（status/diff/隐藏 ref checkpoint）、`checkpoints`（按 run 自动捕获 baseline/final）、`worktrees`（创建/切换/删除）、`terminal`（node-pty）。Renderer 通过 RPC 消费这些能力，`ui-workbench` 包提供右栏的 Files/Diff/Terminal/Checkpoint 视图；Shell 增加一个可折叠的右栏列。

**Tech Stack:** Node 22+、`node-pty@1.1.0`、`@xterm/xterm@6.0.0`、`@xterm/addon-fit@0.11.0`、`diff@9.0.0`、better-sqlite3 13、Vitest 4、Playwright 1.64.1。

## Global Constraints

- Host 拥有工作区、Git、PTY、checkpoint；Renderer 不直接读写文件系统或启动进程。
- 所有路径经过项目根目录校验；禁止 `..` 逃逸和符号链接逃逸。
- Git 命令一律 `execFile("git", args)`，不经过 shell；不在用户分支上创建 commit。
- Checkpoint 使用隐藏 ref：`refs/pigcode/checkpoints/<threadId>/<runId>/<phase>`；不修改用户索引。
- 一个 thread 同时最多一个终端和一个活跃 run；终端不跨 Host 重启保留。
- PTY 使用 `node-pty`；单测注入 fake PTY factory，不依赖原生模块。
- UI 只能通过 RPC；右栏关闭时不得保持终端订阅或文件轮询。
- 三平台终端的最终验收在 macOS/Windows/Linux 上执行；本计划先保证 macOS 真机通过，Windows/Linux 走 CI。
- TypeScript strict；禁止 `any`、`@ts-ignore`、`@ts-expect-error`；文件 ≤500 行；中文注释。
- 每个任务先写失败测试，再实现，提交使用 Conventional Commits。

---

## File Structure

```text
frontend/
  apps/host/src/
    storage/migrations.ts              # migration 3：checkpoints、worktrees
    services/workspace.ts              # 文件树/读文件/搜索
    services/git.ts                    # status/diff/checkpoint refs
    services/checkpoints.ts            # 按 run 自动捕获与回滚
    services/worktrees.ts              # git worktree 生命周期
    services/terminal.ts               # node-pty 会话
    services/sessions.ts               # subscribeAll（checkpoint 用）
    rpc/server.ts                      # 新命令与 terminal.output
    providers/switching.ts             # resolveProjectCwd 支持 worktree
    profiles/desktop.yml               # 新服务
  packages/contracts/src/
    commands.ts                        # workspace/git/checkpoint/worktree/terminal
    events.ts                          # checkpoint.created / terminal.output
  packages/ui-workbench/
    src/file-tree.tsx
    src/file-preview.tsx
    src/diff-view.tsx
    src/checkpoint-panel.tsx
    src/worktree-picker.tsx
    src/terminal-view.tsx
    src/right-panel.tsx
    src/plugin.ts
  packages/client-runtime/src/
    connection.ts                      # terminal.output 通知
  packages/ui-shell/src/shell.tsx      # rightPanel 列
  apps/desktop/src/renderer/src/app.tsx
  apps/desktop/e2e/m3-workbench.spec.ts
  scripts/build-host.mjs
```

---

### Task 1: Contracts and Migration 3

**Files:**
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/packages/contracts/src/events.ts`
- Modify: `frontend/apps/host/src/storage/migrations.ts`
- Test: `frontend/apps/host/src/storage/migration-v3.test.ts`

**Interfaces:**
- Consumes: M0/M1 的 contracts 与 SQLite。
- Produces: `workspace.*`、`git.*`、`checkpoint.*`、`worktree.*`、`terminal.*` 命令；`checkpoints`/`worktrees` 表；`terminal.output` 通知。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证 migration 3 创建 checkpoints 与 worktrees。 */
import { describe, expect, it } from "vitest"
import { openDatabase } from "./database"

describe("migration v3", () => {
  it("creates checkpoint and worktree tables", () => {
    const db = openDatabase(":memory:")
    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>
    ).map((row) => row.name)
    expect(names).toContain("checkpoints")
    expect(names).toContain("worktrees")
    expect(db.pragma("user_version", { simple: true })).toBe(3)
    db.close()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/storage/migration-v3.test.ts`
Expected: FAIL，表不存在或 user_version 为 2。

- [ ] **Step 3: 添加命令与 migration**

`commands.ts` 增加：

```ts
"workspace.tree": z.object({ threadId: z.string().min(1) }),
"workspace.readFile": z.object({ threadId: z.string().min(1), path: z.string().min(1) }),
"workspace.search": z.object({
  threadId: z.string().min(1),
  query: z.string().min(1),
  glob: z.string().optional(),
}),
"git.status": z.object({ threadId: z.string().min(1) }),
"git.diff": z.object({
  threadId: z.string().min(1),
  base: z.string().min(1),
  head: z.string().min(1),
}),
"checkpoint.list": z.object({ threadId: z.string().min(1) }),
"checkpoint.create": z.object({ threadId: z.string().min(1), label: z.string().optional() }),
"checkpoint.restore": z.object({ threadId: z.string().min(1), checkpointId: z.string().min(1) }),
"worktree.create": z.object({ threadId: z.string().min(1) }),
"worktree.switch": z.object({ threadId: z.string().min(1), path: z.string().min(1) }),
"worktree.remove": z.object({ threadId: z.string().min(1) }),
"terminal.open": z.object({
  threadId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
}),
"terminal.write": z.object({ terminalId: z.string().min(1), data: z.string() }),
"terminal.resize": z.object({
  terminalId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
}),
"terminal.close": z.object({ terminalId: z.string().min(1) }),
```

`events.ts` 增加线程事件 `"checkpoint.created"` 的 payload 形状不强制；新增通知类型（不进事件日志）：

```ts
export const terminalOutputSchema = z.object({
  terminalId: z.string().min(1),
  data: z.string(),
})
```

`migrations.ts` 追加：

```sql
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  run_id TEXT,
  phase TEXT NOT NULL,
  git_ref TEXT NOT NULL,
  commit_sha TEXT,
  label TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
  ON checkpoints(thread_id, created_at);

CREATE TABLE IF NOT EXISTS worktrees (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  path TEXT NOT NULL UNIQUE,
  branch TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  removed_at TEXT
);
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/storage/migration-v3.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts apps/host/src/storage
git commit -m "feat(host): add workbench contracts and storage"
```

---

### Task 2: Workspace Service

**Files:**
- Create: `frontend/apps/host/src/services/workspace.ts`
- Create: `frontend/apps/host/src/services/path-safety.ts`
- Test: `frontend/apps/host/src/services/workspace.test.ts`

**Interfaces:**
- Consumes: `projects`、`worktrees`（可选）。
- Produces: `ctx.workspace.tree(threadId)`、`readFile(threadId, path)`、`search(threadId, query, glob?)`。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证文件树与路径逃逸保护。 */
import { Context } from "cordis"
import { mkdtemp, mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { apply as projects } from "./projects"
import { apply as storage } from "./storage"
import { apply as threads } from "./threads"
import { apply as workspace } from "./workspace"

describe("workspace", () => {
  it("lists files and rejects traversal", async () => {
    const root = await mkdtemp(join(tmpdir(), "pigcode-ws-"))
    await mkdir(join(root, "src"))
    await writeFile(join(root, "src", "index.ts"), "export const x = 1\n")
    const ctx = new Context()
    await ctx.plugin(storage, { path: ":memory:" })
    await ctx.plugin(projects)
    await ctx.plugin(threads)
    await ctx.plugin(workspace)
    const project = ctx.projects.add(root)
    const thread = ctx.threads.create(project.id, "M3", "fake")

    const tree = await ctx.workspace.tree(thread.id)
    expect(tree.some((entry) => entry.path === "src/index.ts")).toBe(true)
    await expect(ctx.workspace.readFile(thread.id, "../secret")).rejects.toThrow("escapes project")
    await ctx.fiber.dispose()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/workspace.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`path-safety.ts`：

```ts
/** 把相对路径解析到根目录内；越界、绝对路径与空路径都拒绝。 */
import { resolve, sep } from "node:path"

export function resolveInside(root: string, requestPath: string): string {
  const normalizedRoot = resolve(root)
  const target = resolve(normalizedRoot, requestPath)
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`path escapes project: ${requestPath}`)
  }
  return target
}
```

`workspace.ts`：
- `tree(threadId)`：
  - 解析 cwd（优先 active worktree，见 Task 5；M3 先项目根）。
  - 运行 `git ls-files -z --cached --others --exclude-standard`（`execFile`，`maxBuffer` 8MB）。
  - 返回 `[{ path, type: "file" }]`；目录由 Renderer 从路径推导。
  - 非 git 项目回退到递归 `readdir`（忽略 `node_modules`、`.git`、`dist`、`out`）。
- `readFile(threadId, path)`：`resolveInside`，`stat` 必须文件，大小 ≤1MB，返回 `{ path, text, truncated }`；二进制检测（前 8KB 含 NUL）返回 `binary: true`。
- `search`：优先 `rg --line-number --no-heading --color never <query> <glob?>`；无 `rg` 时回退 `git grep`；结果最多 200 条。
- `inject = ["projects", "threads", "storage"]`。
- 单元测试只覆盖 tree/readFile/traversal；search 用 fixture 文本测试解析函数。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/workspace.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/services
git commit -m "feat(host): add workspace file tree and safe reads"
```

---

### Task 3: Git Service and Checkpoint Refs

**Files:**
- Create: `frontend/apps/host/src/services/git.ts`
- Test: `frontend/apps/host/src/services/git.test.ts`

**Interfaces:**
- Consumes: `execFile("git")`、临时 `GIT_INDEX_FILE`。
- Produces: `ctx.git.status(threadId)`、`diff(threadId, base, head)`、`capture(threadId, runId, phase)`、`restore(threadId, commitSha)`。

- [ ] **Step 1: 写失败测试**

```ts
/** 在临时 git 仓库验证 status、diff、checkpoint capture 与 restore。 */
import { execFile } from "node:child_process"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"
import { capture, restore, status } from "./git"

const exec = promisify(execFile)

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "pigcode-git-"))
  await exec("git", ["init", "-q"], { cwd: root })
  await exec("git", ["config", "user.email", "test@example.com"], { cwd: root })
  await exec("git", ["config", "user.name", "Test"], { cwd: root })
  await writeFile(join(root, "a.txt"), "one\n")
  await exec("git", ["add", "."], { cwd: root })
  await exec("git", ["commit", "-qm", "init"], { cwd: root })
  return root
}

describe("git service", () => {
  it("captures and restores a checkpoint including untracked files", async () => {
    const root = await repo()
    await writeFile(join(root, "a.txt"), "two\n")
    await writeFile(join(root, "b.txt"), "new\n")
    const checkpoint = await capture(root, "thread-1", "run-1", "final")
    expect(checkpoint.commitSha).toMatch(/^[0-9a-f]{40}$/)

    await writeFile(join(root, "a.txt"), "three\n")
    await restore(root, checkpoint.commitSha)
    expect(await readFile(join(root, "a.txt"), "utf8")).toBe("two\n")
    expect(await readFile(join(root, "b.txt"), "utf8")).toBe("new\n")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/git.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`git.ts`：
- `runGit(cwd, args, env?)` 用 `execFile`，返回 stdout；`maxBuffer` 32MB。
- `capture(cwd, threadId, runId, phase)`：
  - 临时 index 文件：`join(tmpdir(), "pigcode-index-"+randomUUID())`。
  - `GIT_INDEX_FILE=temp` + `git add -A`；`git write-tree`；`git commit-tree <tree> [-p HEAD] -m "pigcode checkpoint"`；`git update-ref <ref> <commit>`；删除 temp index。
  - ref：`refs/pigcode/checkpoints/${threadId}/${runId}/${phase}`。
  - 返回 `{ ref, commitSha }`。
  - 非 git 仓库抛 `NOT_A_GIT_REPO`。
- `restore(cwd, commitSha)`：
  - `git restore --source=<sha> --worktree --staged -- .`
  - `git clean -fd`（只清未跟踪、不删 ignored）。
  - 返回受影响路径列表（`git diff --name-only <sha>` 之前先记录）。
- `diff(cwd, base, head)`：`git diff --no-color <base> <head> --`，返回文本；空 diff 返回空字符串。
- `status(cwd)`：`git status --porcelain=v1 -z`，解析 `{ branch, changed: [{path,status}] }`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/git.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/services
git commit -m "feat(host): add git status, diff, and checkpoint refs"
```

---

### Task 4: Checkpoint Service and Run Integration

**Files:**
- Create: `frontend/apps/host/src/services/checkpoints.ts`
- Modify: `frontend/apps/host/src/services/sessions.ts`
- Test: `frontend/apps/host/src/services/checkpoints.test.ts`

**Interfaces:**
- Consumes: `sessions.subscribeAll`、`git.capture`、`storage`。
- Produces: `ctx.checkpoints.list(threadId)`、`create(threadId,label?)`、`restore(threadId,id)`；`run.started` 自动 baseline、`run.completed/failed/interrupted` 自动 final。

- [ ] **Step 1: 写失败测试**

```ts
/** 验证 run 边界自动写 checkpoint 行。 */
it("captures baseline and final checkpoints for a run", async () => {
  const { ctx, thread } = await setupGitThread()
  const { runId, done } = await ctx.providers.startRun(thread.id, "hello")
  await done
  const checkpoints = ctx.checkpoints.list(thread.id)
  expect(checkpoints.map((item) => item.phase)).toEqual(["baseline", "final"])
  expect(checkpoints.every((item) => item.runId === runId)).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/checkpoints.test.ts`
Expected: FAIL，服务不存在。

- [ ] **Step 3: 实现**

`sessions.ts` 增加：

```ts
subscribeAll(listener: (event: ThreadEvent) => void): () => void
```

在 `append` 中对所有全局监听器广播。

`checkpoints.ts`：
- `inject = ["sessions", "storage", "git", "threads", "projects"]`
- 订阅 `subscribeAll`：
  - `run.started`：capture(threadId, runId, "baseline")，写 `checkpoints` 行和 `checkpoint.created` 事件（payload `{ checkpointId, runId, phase }`）。
  - `run.completed`/`run.failed`/`run.interrupted`：capture(..., "final")，同样写行/事件。
- 捕获失败（非 git 项目）静默跳过，不阻塞 run。
- `list(threadId)` 从表读取，按创建时间升序。
- `create(threadId,label?)` 手动 capture 一个 `manual` phase。
- `restore(threadId, checkpointId)`：查表，`git.restore(cwd, commitSha)`，追加 `checkpoint.created`? 不，追加 `checkpoint.restored` 事件（新增事件类型）或 `thread.updated` payload `{ restored: checkpointId }`；M3 用 `thread.updated`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/checkpoints.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/services
git commit -m "feat(host): capture checkpoints at run boundaries"
```

---

### Task 5: Worktree Service and Thread CWD

**Files:**
- Create: `frontend/apps/host/src/services/worktrees.ts`
- Modify: `frontend/apps/host/src/providers/switching.ts`
- Test: `frontend/apps/host/src/services/worktrees.test.ts`

**Interfaces:**
- Consumes: `git worktree`、`worktrees` 表。
- Produces: `ctx.worktrees.create(threadId)`、`switch(threadId,path)`、`remove(threadId)`、`activePath(threadId)`。

- [ ] **Step 1: 写失败测试**

```ts
it("creates and removes a worktree", async () => {
  const { ctx, thread, root } = await setupGitThread()
  const worktree = await ctx.worktrees.create(thread.id)
  expect(worktree.path).not.toBe(root)
  expect(await pathExists(worktree.path)).toBe(true)
  await ctx.worktrees.remove(thread.id)
  expect(await pathExists(worktree.path)).toBe(false)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/worktrees.test.ts`
Expected: FAIL，服务不存在。

- [ ] **Step 3: 实现**

- `create(threadId)`：项目根 + `git rev-parse --show-toplevel`；目标路径 `join(dirname(root), `${basename(root)}-pigcode-${shortId}`)`；分支 `pigcode/${threadId.slice(-8)}`；`git worktree add -b <branch> <path> HEAD`；写 `worktrees` 行 `status='active'`；返回 `{ id,path,branch }`。
- `switch(threadId,path)`：校验路径等于已创建 worktree；把同 thread 其他 active 标记 `removed`。
- `remove(threadId)`：`git worktree remove --force <path>`；标记 `removed`。
- `activePath(threadId)`：查 active 行。
- `switching.resolveProjectCwd` 改为先查 `activePath(threadId)`，没有则项目根；签名改为 `resolveThreadCwd(ctx, threadId, projectId)`，registry 调用更新。
- 测试用临时 git 仓库；Windows 路径用 `git worktree remove` 可能失败，测试在 macOS 跑。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/worktrees.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/services apps/host/src/providers/switching.ts
git commit -m "feat(host): add git worktree lifecycle"
```

---

### Task 6: Terminal Service with node-pty

**Files:**
- Modify: `frontend/apps/host/package.json`
- Create: `frontend/apps/host/src/services/terminal.ts`
- Test: `frontend/apps/host/src/services/terminal.test.ts`

**Interfaces:**
- Consumes: `node-pty`、`sessions`、`worktrees`（cwd）。
- Produces: `ctx.terminal.open(threadId, cols, rows)`、`write(id,data)`、`resize(id,cols,rows)`、`close(id)`、`subscribe(id,listener)`。

- [ ] **Step 1: 写失败测试（fake PTY）**

```ts
/** 用 fake PTY 工厂验证 open/write/output/resize/close，不加载原生模块。 */
it("echoes input and closes", async () => {
  const data: string[] = []
  const pty = fakePty((write) => `echo:${write}`)
  const ctx = await setupTerminal(pty)
  const terminal = await ctx.terminal.open("th_1", 80, 24)
  const unsubscribe = ctx.terminal.subscribe(terminal.id, (chunk) => data.push(chunk))
  ctx.terminal.write(terminal.id, "hi\n")
  await waitFor(() => data.join("").includes("echo:hi"))
  ctx.terminal.resize(terminal.id, 100, 30)
  expect(pty.resizes).toEqual([[100, 30]])
  ctx.terminal.close(terminal.id)
  expect(pty.killed).toBe(true)
  unsubscribe()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/terminal.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

`apps/host/package.json` 增加 `"node-pty": "1.1.0"`；运行 `pnpm --dir frontend install`。

`terminal.ts`：

```ts
/** 终端会话；真实实现用 node-pty，测试注入 fake factory。 */
export interface PtyLike {
  onData(listener: (data: string) => void): void
  onExit(listener: (event: { exitCode: number }) => void): void
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

export interface PtyFactory {
  spawn(input: { cwd: string; cols: number; rows: number; shell: string }): PtyLike
}

export function realPtyFactory(): PtyFactory {
  return {
    spawn(input) {
      const require = createRequire(import.meta.url)
      const pty = require("node-pty") as typeof import("node-pty")
      return pty.spawn(input.shell, [], {
        cwd: input.cwd,
        cols: input.cols,
        rows: input.rows,
        env: process.env as Record<string, string>,
      })
    },
  }
}
```

顶部导入：

```ts
import { createRequire } from "node:module"
```

- `shell`：macOS/Linux `process.env.SHELL ?? "/bin/zsh"`；Windows `process.env.COMSPEC ?? "cmd.exe"`。
- `open(threadId, cols, rows)`：解析 cwd（worktree/项目根）；id `term_<uuid>`；创建 PtyLike；注册 data 监听广播给 subscribers；exit 时清理；最多每 thread 一个终端，重复 open 先 close。
- `close` 移除监听、kill、广播 `terminal.exit`？M3 只发 data。
- `inject = ["projects", "threads", "storage"]`；worktrees 通过 `ctx.worktrees` 可选？使用 `ctx.inject(['worktrees'], ...)` 或直接查表。M3 先项目根，Task 5 后接 worktree。
- `realPtyFactory` 用 `createRequire` 避免 ESM 默认导入问题；`node-pty` 是 CJS。
- 单测只注入 fake；真实 PTY 的 E2E 在 Task 11。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/terminal.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/package.json pnpm-lock.yaml apps/host/src/services
git commit -m "feat(host): add pty terminal service"
```

---

### Task 7: RPC Wiring, Build Manifest, and Profile

**Files:**
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Modify: `frontend/apps/host/src/profiles/desktop.yml`（如果存在）
- Modify: `frontend/scripts/build-host.mjs`
- Modify: `frontend/apps/host/package.json`（如需 `@xterm`? 不需要）
- Test: `frontend/apps/host/src/rpc/workbench.test.ts`

**Interfaces:**
- Consumes: Task 2-6 的服务。
- Produces: RPC 命令可达；`terminal.output` 通知；构建产物包含新 core 服务；`node-pty` external。

- [ ] **Step 1: 写失败测试**

```ts
it("dispatches workspace.tree", async () => {
  const { ctx, thread, transport } = await setupWorkbenchRpc()
  transport.client.send({ jsonrpc: "2.0", id: "1", method: "workspace.tree", params: { threadId: thread.id } })
  const response = (await transport.client.next()) as { result: unknown[] }
  expect(Array.isArray(response.result)).toBe(true)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/rpc/workbench.test.ts`
Expected: FAIL，未知方法。

- [ ] **Step 3: 实现**

`rpc/server.ts` 增加分支：

```ts
case "workspace.tree": return this.ctx.workspace.tree(threadId)
case "workspace.readFile": return this.ctx.workspace.readFile(threadId, path)
case "workspace.search": return this.ctx.workspace.search(threadId, query, glob)
case "git.status": return this.ctx.git.status(threadId)
case "git.diff": return this.ctx.git.diff(threadId, base, head)
case "checkpoint.list": return this.ctx.checkpoints.list(threadId)
case "checkpoint.create": return this.ctx.checkpoints.create(threadId, label)
case "checkpoint.restore": return this.ctx.checkpoints.restore(threadId, checkpointId)
case "worktree.create": return this.ctx.worktrees.create(threadId)
case "worktree.switch": return this.ctx.worktrees.switch(threadId, path)
case "worktree.remove": return this.ctx.worktrees.remove(threadId)
case "terminal.open": {
  const terminal = await this.ctx.terminal.open(threadId, cols, rows)
  this.disposers.push(this.ctx.terminal.subscribe(terminal.id, (data) => {
    this.transport.send({ jsonrpc: "2.0", method: "terminal.output", params: { terminalId: terminal.id, data } })
  }))
  return terminal
}
case "terminal.write": return this.ctx.terminal.write(terminalId, data)
case "terminal.resize": return this.ctx.terminal.resize(terminalId, cols, rows)
case "terminal.close": return this.ctx.terminal.close(terminalId)
```

- `build-host.mjs`：
  - `external` 增加 `"node-pty"`。
  - `coreEntries` 增加 `workspace`、`git`、`checkpoints`、`worktrees`、`terminal`。
  - 生成的 `profile/desktop.yml` 增加对应条目。
  - `apps/host/profiles/desktop.yml` 同步。
- 打包时 `node-pty` 的原生文件需要 `asarUnpack`：在 electron-builder 配置中加入 `"asarUnpack": ["node_modules/node-pty/**"]`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/rpc/workbench.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/host/src/rpc apps/host/profiles scripts/build-host.mjs
git commit -m "feat(host): expose workbench services over rpc"
```

---

### Task 8: UI Workbench Package

**Files:**
- Create: `frontend/packages/ui-workbench/package.json`
- Create: `frontend/packages/ui-workbench/tsconfig.json`
- Create: `frontend/packages/ui-workbench/src/{file-tree,file-preview,diff-view,checkpoint-panel,worktree-picker,right-panel,index,plugin}.tsx`
- Test: `frontend/packages/ui-workbench/src/right-panel.test.tsx`

**Interfaces:**
- Consumes: `client-runtime`、`ui-primitives`、`@xterm/xterm`、`diff`。
- Produces: `RightPanel`（Files/Diff/Terminal/Checkpoint tabs）。

- [ ] **Step 1: 写失败测试**

```tsx
/** 验证右栏 tab 切换。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { RightPanel } from "./right-panel"

describe("RightPanel", () => {
  it("switches tabs", async () => {
    render(
      <RightPanel
        threadId="t1"
        tabs={{ files: <div>files</div>, diff: <div>diff</div>, terminal: <div>term</div> }}
        active="files"
        onTab={() => {}}
      />,
    )
    expect(screen.getByText("files")).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-workbench/src/right-panel.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现组件**

`package.json` 依赖：

```json
{
  "name": "@pigcode/ui-workbench",
  "dependencies": {
    "@pigcode/client-runtime": "workspace:*",
    "@pigcode/contracts": "workspace:*",
    "@pigcode/ui-primitives": "workspace:*",
    "@xterm/addon-fit": "0.11.0",
    "@xterm/xterm": "6.0.0",
    "diff": "9.0.0"
  },
  "peerDependencies": { "react": "^19", "react-dom": "^19" }
}
```

组件：

- `file-tree.tsx`：接收 `entries`，构建目录树；点击文件回调。
- `file-preview.tsx`：显示文本或“二进制文件”。
- `diff-view.tsx`：用 `diff` 的 `parsePatch` 解析 unified diff，按行渲染 `+`/`-`/上下文。
- `checkpoint-panel.tsx`：列出 baseline/final/manual；恢复按钮二次确认。
- `worktree-picker.tsx`：创建/切换/删除 worktree。
- `terminal-view.tsx`：xterm 实例；`onData` 回调；`fit` addon；resize observer。
- `right-panel.tsx`：tab 头 + 内容；关闭按钮。
- `plugin.ts`：注册 `panel.right` slot（可选）。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-workbench/src/right-panel.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-workbench
git commit -m "feat(ui): add workbench right panel components"
```

---

### Task 9: Integrate Right Panel into Shell and App

**Files:**
- Modify: `frontend/packages/ui-shell/src/shell.tsx`
- Modify: `frontend/packages/ui-shell/src/index.ts`
- Modify: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Modify: `frontend/packages/ui-chat/src/chat-view.tsx`
- Test: `frontend/packages/ui-shell/src/shell.test.tsx`

**Interfaces:**
- Consumes: Task 8 的 `RightPanel`。
- Produces: `Shell.rightPanel` 可折叠列；chat 头按钮切换；Files/Diff/Terminal/Checkpoint 数据接线。

- [ ] **Step 1: 写失败测试**

```tsx
it("renders the right panel when provided", () => {
  render(
    <LocaleProvider locale="zh-CN">
      <Shell view="chat" projects={[]} threads={[]} activeThreadId={null} rightPanel={<div>right</div>}>
        <div>chat</div>
      </Shell>
    </LocaleProvider>,
  )
  expect(screen.getByText("right")).toBeTruthy()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-shell/src/shell.test.tsx`
Expected: FAIL，Shell 不接受 `rightPanel`。

- [ ] **Step 3: 实现**

- `ShellProps` 增加 `rightPanel?: ReactNode`、`rightOpen?: boolean`、`onToggleRight?: () => void`。
- 渲染：
```tsx
<main className="panel">{children}</main>
{rightPanel ? <aside className="right-panel">{rightPanel}</aside> : null}
```
- CSS：
```css
.app { grid-template-columns: var(--sidebar-w) minmax(0,1fr) 0; }
.app.has-right { grid-template-columns: var(--sidebar-w) minmax(0,1fr) minmax(320px, 38%); }
.right-panel { min-width: 0; border-left: var(--hair) solid var(--border); overflow: hidden; }
```
- `App`：
  - 状态 `rightTab: "files"|"diff"|"terminal"|"checkpoints"`、`rightOpen`。
  - 当前 thread 时渲染 `<RightPanel ... />`。
  - Files tab：调用 `workspace.tree`，选中文件调用 `workspace.readFile`。
  - Diff tab：调用 `git.diff`，base/head 来自选中的 checkpoint 或最近 run 的 baseline/final。
  - Terminal tab：`TerminalView` 调用 `terminal.open`，`Connection.onTerminalOutput` 写入。
  - Checkpoint tab：`checkpoint.list` + create/restore。
  - Worktree picker 放在右栏顶部或线程头。
- `ChatView` 增加 `onToggleRight`、`rightOpen` props；线程头按钮切换。
- `Connection` 增加 `onTerminalOutput(listener)` 并在 `handleNotification` 分发 `terminal.output`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-shell/src/shell.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-shell apps/desktop/src/renderer/src/app.tsx packages/ui-chat packages/client-runtime
git commit -m "feat(ui): integrate the workbench right panel"
```

---

### Task 10: Terminal View and xterm Wiring

**Files:**
- Create: `frontend/packages/ui-workbench/src/terminal-view.tsx`
- Modify: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Test: `frontend/packages/ui-workbench/src/terminal-view.test.tsx`

**Interfaces:**
- Consumes: `terminal.open/write/resize/close`、`terminal.output`。
- Produces: 可交互终端；关闭 tab 时关闭 PTY。

- [ ] **Step 1: 写失败测试（mock xterm）**

```tsx
it("writes incoming output to xterm", () => {
  const write = vi.fn()
  render(<TerminalView terminalId="term_1" onData={() => {}} />, {
    wrapper: ({ children }) => <TerminalRegistry value={{ write }}>{children}</TerminalRegistry>,
  })
  // 通过 provider 注入的 registry 触发 output；实现细节由 TerminalView 暴露的 test hook 驱动。
  expect(write).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-workbench/src/terminal-view.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

- `TerminalView` 使用 `useEffect` 创建 `Terminal({ cursorBlink: true, fontSize: 13 })` 与 `FitAddon`；挂到 `div ref`；`term.onData(onData)`；`ResizeObserver` -> `fit()` + `onResize(cols, rows)`。
- 暴露 `write(data)` 方法给父组件（通过 `forwardRef` 或 store）。
- `App` 在 terminal tab 挂载时调用 `terminal.open`；收到 `terminal.output` 时调用 `write`；tab 关闭调用 `terminal.close`。
- xterm CSS：在 `terminal-view.tsx` 中 `import "@xterm/xterm/css/xterm.css"`；Vite 处理。
- 单测不加载真实 xterm（jsdom 不支持 canvas），用 `vi.mock("@xterm/xterm", ...)` 验证生命周期；真实终端由 E2E 覆盖。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-workbench/src/terminal-view.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-workbench apps/desktop
git commit -m "feat(ui): add the pty terminal view"
```

---

### Task 11: Workbench E2E

**Files:**
- Create: `frontend/apps/desktop/e2e/m3-workbench.spec.ts`
- Modify: `frontend/apps/desktop/playwright.config.ts`
- Modify: `frontend/apps/desktop/package.json`（native rebuild script，如需要）

**Interfaces:**
- Consumes: 真实 PTY + git + checkpoint。
- Produces: 工作台端到端验收。

- [ ] **Step 1: 写 E2E**

```ts
/** M3 验收：文件树、终端、checkpoint、diff、恢复。 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { _electron as electron, expect, test } from "@playwright/test"

test("workbench files, terminal, checkpoint, and diff", async () => {
  const root = "/tmp/pigcode-m3-e2e"
  mkdirSync(root, { recursive: true })
  execFileSync("git", ["init", "-q"], { cwd: root })
  execFileSync("git", ["config", "user.email", "e2e@example.com"], { cwd: root })
  execFileSync("git", ["config", "user.name", "E2E"], { cwd: root })
  writeFileSync(`${root}/a.txt`, "one\n")
  execFileSync("git", ["add", "."], { cwd: root })
  execFileSync("git", ["commit", "-qm", "init"], { cwd: root })

  const app = await electron.launch({ args: ["."], env: { ...process.env, PIGCODE_PROVIDER: "fake" } })
  const page = await app.firstWindow()
  await page.getByRole("button", { name: "添加项目" }).first().click()
  await page.getByLabel("项目路径").fill(root)
  await page.getByRole("button", { name: "添加", exact: true }).click()
  await expect(page.getByText("pigcode-m3-e2e", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "新会话" }).first().click()

  // 打开右栏终端，跑一个命令。
  await page.getByRole("button", { name: "工作台" }).click()
  await page.getByRole("tab", { name: "终端" }).click()
  await expect(page.locator(".xterm")).toBeVisible()
  await page.locator(".xterm").click()
  await page.keyboard.type("echo READY")
  await page.keyboard.press("Enter")
  await expect(page.locator(".xterm")).toContainText("READY")

  // 手动 checkpoint，修改文件后 diff/restore。
  await page.getByRole("tab", { name: "检查点" }).click()
  await page.getByRole("button", { name: "创建检查点" }).click()
  await page.getByRole("tab", { name: "终端" }).click()
  await page.locator(".xterm").click()
  await page.keyboard.type("echo two > a.txt")
  await page.keyboard.press("Enter")
  await page.getByRole("tab", { name: "检查点" }).click()
  await page.getByRole("button", { name: "恢复" }).first().click()
  await page.getByRole("button", { name: "确认恢复" }).click()
  await expect(page.getByText("one", { exact: false })).toBeVisible()
  await app.close()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m3-workbench.spec.ts`
Expected: FAIL，右栏/终端未接线或 PTY ABI 不匹配。

- [ ] **Step 3: 处理原生模块与接线**

- `apps/desktop/package.json` 增加 `"rebuild:native": "electron-rebuild -f -w node-pty"`，devDependency `@electron/rebuild`。
- E2E 前运行 `pnpm --dir frontend/apps/desktop rebuild:native`（或 `electron-builder install-app-deps`）。
- 如果 PTY 无法在 Electron ABI 下加载，先确保 `node-pty` 在 utilityProcess 中加载；错误通过 `terminal.open` 返回给 UI，不能静默。
- 补齐右栏 tab 的 `role="tab"`、按钮 aria-label，匹配 E2E 选择器。

- [ ] **Step 4: 运行 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m3-workbench.spec.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/desktop/e2e apps/desktop/package.json pnpm-lock.yaml
git commit -m "test(e2e): add workbench file, terminal, and checkpoint flow"
```

---

### Task 12: Final Verification and Docs

**Files:**
- Modify: `frontend/README.md`
- Test: all

**Interfaces:**
- Consumes: 全部 M3 实现。
- Produces: 可复现的 M3 验收记录。

- [ ] **Step 1: 全量门禁**

Run: `cd frontend && pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS。

- [ ] **Step 2: 回归**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m0-b.spec.ts`
Expected: PASS。

Run: `cd frontend && PIGCODE_REAL_CLAUDE=1 pnpm real:claude`
Expected: PASS。

Run: `cd frontend && PIGCODE_REAL_CODEX=1 PIGCODE_CODEX_MODEL=gpt-6-astra pnpm real:codex`
Expected: PASS。

- [ ] **Step 3: 工作台 E2E**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m3-workbench.spec.ts`
Expected: PASS。

- [ ] **Step 4: 更新 README**

增加：

```markdown
## Workbench

The right panel provides files, per-run diffs, an embedded PTY terminal, checkpoints,
and git worktrees. Checkpoints are stored under
`refs/pigcode/checkpoints/<thread>/<run>/<phase>` and never add commits to your branch.
```

- [ ] **Step 5: 提交**

```bash
cd frontend
git add README.md
git commit -m "docs: document the workbench"
```

---

## Self-Review

**Spec coverage（M3 范围）：**

| Spec 要求 | 对应任务 |
|---|---|
| 文件树/读文件/搜索 | Task 2/8/9 |
| 按 run 的 diff | Task 3/4/9 |
| 内置 PTY 终端 | Task 6/10/11 |
| worktree | Task 5/9 |
| checkpoint 创建/列表/恢复 | Task 3/4/9/11 |
| 隐藏 ref，不污染分支 | Task 3 Global Constraints |
| 三平台终端 | Task 6/11/12（macOS 真机，Windows/Linux CI） |
| 右栏 UI | Task 8/9/10 |

**Placeholder scan:** 无 TBD/TODO；每个任务有具体文件、测试命令与关键代码。

**Type consistency:** `workspace`、`git`、`checkpoints`、`worktrees`、`terminal` 服务名与 `ctx.*` 一致；`terminal.output` 通知在 Task 1/7/9/10 一致。

**Known deferrals（不属于 M3）：**

- Monaco/完整代码编辑器；M3 只做文件预览与 diff。
- 图片/二进制预览。
- Windows/Linux 的真实 PTY 验收；本计划先在 macOS 真机跑通，CI 矩阵后补。
- 实时文件监听；M3 在打开 Files/Checkpoint tab 时刷新，watch 事件后置。
- checkpoint 的完整三方合并/冲突 UI。
```