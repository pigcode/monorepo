# Pigcode 架构设计

- 状态：Draft（待评审）
- 日期：2026-10-20
- 决策来源：与产品负责人的需求澄清会话
- 适用范围：Pigcode v1.0 的总体架构、插件平台、Provider 层、协议、桌面端与交付边界

---

## 1. 摘要

Pigcode 是一个**本地优先的 agent CLI 控制台**。它不实现自己的 agent runtime，而是控制用户机器上已经安装并完成认证的 agent CLI，把会话、工具调用、审批、文件改动、终端和 Git 操作统一到一个可插件扩展的桌面工作台。

v1.0 的产品边界：

- 只控制第三方 CLI；不实现自研 agent runtime，但架构为后续自有 runtime 预留 provider 接口。
- 首批 provider：Claude Code、Codex。
- 纯本地单机：无账号、无云端、无远程访问、无 relay。
- 三平台发布：macOS、Windows、Linux。
- 完整插件平台：provider、capability、UI 三类插件可安装、启用、停用；插件市场不包含在 v1.0。
- 能力范围：核心会话、代码工作台、多会话与并行、生态集成全部纳入 v1.0。
- v1.0 的里程碑 M0–M5 全部是发布门槛，不设 v1.1 的“后置范围”。

技术路线：

- 使用开源 [Cordis](https://github.com/cordiverse/cordis) 作为插件容器，不重新实现插件框架。
- UI 外壳与组件以 pigclaude 为迁移基线；账号、会员、代理等 pigclaude 专属页面不迁移。
- TypeScript 全家桶：Electron 壳 + Host Runtime（Electron utilityProcess）+ 共享 React 客户端。
- Host 与 Renderer 各自运行一棵 Cordis 插件树，通过版本化 RPC 通信。
- SQLite 保存只追加事件日志与投影；Git 隐藏 ref 保存 checkpoint。
- 插件信任模型与 deepseek-harness 一致：Host 侧插件在进程内受信运行，UI 插件在 Renderer 内通过受限 facade 运行。

---

## 2. 背景与目标

### 2.1 问题

开发者在多个 agent CLI 之间切换：Claude Code、Codex 等各自有独立的终端界面、会话存储、审批交互和文件改动展示方式。终端里的 agent 工作流有三个结构性痛点：

1. **会话不可管理**：历史、分支、恢复、切换模型/provider 都依赖终端滚动缓冲。
2. **工作区不可观察**：agent 改了什么、能不能回滚、与哪一轮对话对应，缺少统一视图。
3. **能力不可扩展**：想给 agent 增加团队自己的工具、审批策略、代码托管集成，通常要改 CLI 或写脆弱的 wrapper。

现有产品（t3code、Codex desktop、Conductor、Cursor Glass）证明了“控制面”这一产品形态，但要么绑定单一 provider，要么插件扩展能力有限。

### 2.2 目标

- 用一个桌面应用统一控制 Claude Code 与 Codex。
- 每个会话、每个轮次、每次工具调用、每次审批都可持久化、可恢复、可审计。
- 代码工作台：文件树、diff、终端、worktree、checkpoint/rollback。
- 多会话与并行：多个会话同时运行，后台任务和子 agent 可视化。
- 插件平台：第三方可以发布 provider、Host 能力、UI 扩展，并能在应用内安装、启用、停用。
- 本地优先：离线可用，不依赖账号或云服务。
- 三平台发布。

### 2.3 非目标

- 自研 agent loop、模型推理或模型路由。
- 云端执行 agent、云端保存工作区文件。
- v1.0 的账号体系、团队协作、计费、远程访问、移动端。
- 插件市场（v1.0 只做本地安装与插件列表）。
- 多窗口、多人实时协作、浏览器版产品。
- 重新实现 Cordis 的插件/依赖注入/生命周期机制。

### 2.4 关键决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 产品形态 | 第三方 CLI 控制面 | 复用用户已有订阅与认证，聚焦体验与扩展性 |
| v1 provider | Claude Code、Codex | 覆盖最大用户群，协议能力最丰富 |
| 插件容器 | Cordis（固定版本 + vendor） | 上游开源、经过 dsh 验证，不重复造轮子 |
| Host 形态 | Electron utilityProcess + MessagePort | 无独立 daemon/端口/token；保留崩溃隔离、可重启与远程路径 |
| Client 形态 | Electron + 共享 React 客户端 | 三平台桌面能力与成熟生态 |
| 数据模型 | SQLite 事件日志 + 投影 | 回放、重连、审计、多端一致 |
| 插件信任 | Host 内受信 + UI 受限 facade | 与 dsh 一致，v1 成本可控 |
| 仓库 | `frontend` 作为产品 monorepo | 单一 lockfile、单一发布单元、协议与客户端同步演进 |
| UI 基线 | pigclaude 外壳与组件 | 已有高质量桌面 UI，节省视觉与交互成本 |
| UI 原语 | shadcn 的 Base UI 版本 | 统一组件层，避免 Radix/Base UI 混用 |
| v1.0 范围 | M0–M5 全部 | 产品负责人明确要求 |

---

## 3. 产品定义

### 3.1 用户与场景

**主要用户**：已经在终端中使用 Claude Code 或 Codex 的个人开发者、技术负责人、独立开发者。

**核心场景**：

1. 在多个仓库之间切换，快速查看每个仓库中 agent 正在做什么。
2. 让 agent 改代码，同时在 UI 中审查 diff、运行测试、回滚到某个 checkpoint。
3. 在一个会话中处理审批和 agent 提问，不必在终端里等待。
4. 同时开多个会话处理不同任务，并在侧栏看到进度。
5. 安装团队或社区提供的插件，为 agent 增加工具、审批策略或 UI 面板。

**非目标用户（v1.0）**：需要团队协作、云端沙箱、非开发者、纯聊天用户。

### 3.2 v1.0 范围

v1.0 包含以下全部能力，对应里程碑 M0–M5：

- 核心会话体验：流式消息、工具调用、审批、问题、计划模式、中断/继续、历史会话。
- 代码工作台：文件树、diff、内置终端、git worktree、checkpoint/rollback。
- 多会话与并行：多 tab、后台任务、子 agent 可视化、同一会话切换 provider。
- 生态集成：MCP bridge、PR/代码托管、浏览器预览、定时任务。
- 插件平台：provider/UI/capability 插件安装、启用、停用、版本兼容、权限声明、插件列表。
- 三平台：macOS、Windows、Linux。

pigclaude 的 UI 外壳与组件作为迁移基线；其账号、会员、代理和 Claude 账号池页面不属于 Pigcode v1.0 的核心功能。

### 3.3 核心用户旅程

**首次启动**：

1. 应用打开，Host 启动。
2. 检测 `claude`、`codex` 是否安装及认证状态；检测只读，不触发登录。
3. 用户添加一个本地项目目录。
4. 选择 provider 和模型，创建第一个会话。
5. 发送第一条消息，看到流式输出和工具卡片。

**日常会话**：

1. 从侧栏选择项目和会话，或新建会话。
2. 输入任务；agent 流式回复，调用工具；需要审批时在时间线内联处理。
3. 会话结束后查看本轮 diff；必要时回滚到 checkpoint。
4. 关闭窗口后 Host 继续运行；再次打开窗口恢复原会话与滚动位置。
5. 退出应用时，如果仍有运行中的会话，提示会中断的任务。

**插件使用**：

1. 打开插件页，安装本地目录或 npm 包。
2. 插件列表显示类型、版本、权限和贡献项。
3. 启用后，侧栏出现新面板、设置页出现新分区，或 provider 选择器出现新 provider。
4. 停用后，相关 UI、Host 服务和子进程干净移除，无需重启应用。

---

## 4. 总体架构

### 4.1 三层

```text
┌────────────────────────────────────────────────────┐
│ Client                                             │
│  Electron renderer / shared client runtime         │
│  Cordis client plugin tree                          │
│  第三方 UI 插件                                     │
└───────────────┬────────────────────────────────────┘
                │ MessagePort RPC：commands / events / snapshot+cursor
┌───────────────▼────────────────────────────────────┐
│ Host Runtime（Electron utilityProcess）             │
│  Cordis host plugin tree                            │
│  workspace / projects / threads / sessions          │
│  providers / terminal / git / checkpoints           │
│  plugins / rpc / storage / settings                 │
│  第三方 provider / capability 插件                  │
└───────────────┬────────────────────────────────────┘
                │ 子进程 / PTY / 文件 / Git
┌───────────────▼────────────────────────────────────┐
│ Provider CLIs                                       │
│  claude / codex / 未来的自研 runtime                 │
└────────────────────────────────────────────────────┘
```

v1.0 没有 Cloud 层。未来的 Cloud 只做身份、设备、配对、relay、可选同步和计费，不执行 agent、不持有工作区文件。

### 4.2 进程模型

```text
Electron main
  ├─ 单实例锁
  ├─ 窗口 / 托盘 / 菜单 / 快捷键
  ├─ 自动更新 / 代码签名验证
  ├─ 原生目录选择 / 打开外部链接
  ├─ 插件 bundle 的自定义 protocol
  └─ 监督 Host utilityProcess
       ├─ 启动、崩溃重启、退出时优雅停止
       └─ MessageChannelMain 端口分配

Host Runtime（Electron utilityProcess）
  ├─ Cordis root context
  ├─ SQLite（事件日志 + 投影 + 回执）
  ├─ Provider 子进程（claude / codex）
  ├─ PTY 子进程
  ├─ Git 操作
  └─ MessagePort RPC（无 HTTP、无端口、无 token）

Electron renderer
  ├─ 沙箱化，无 Node 集成
  ├─ preload 暴露最小原生 bridge + MessagePort 转交
  └─ 通过 MessagePort 访问 Host
```

### 4.3 为什么 Host 放在 utilityProcess，而不是 Electron main

- **崩溃隔离**：provider 协议解析或第三方 Host 插件崩溃时，只重启 utilityProcess，窗口和已渲染的 UI 不受影响。
- **可重启**：main 监听 utilityProcess 的 exit，重新创建进程和 MessageChannel；Renderer 从 cursor 重连。
- **进程所有权**：Host 是 CLI/PTY 子进程的父进程，退出时能清理进程组，避免孤儿进程。
- **主进程不被阻塞**：SQLite、PTY、Git、插件代码不占用 Electron main 的事件循环；窗口/菜单/更新保持响应。
- **启动与打包**：utilityProcess 复用 Electron 自带的 Node，不需要第二个 Node 运行时；没有 HTTP server、端口分配、token 握手和 CORS，Host 与窗口可以并行启动。
- **未来远程**：Host 的核心只依赖一个 transport 接口；v1.0 用 MessagePort，未来远程再加 WebSocket transport，不重写领域层。

不把 Host 放进 Electron main 的代价是：插件崩溃会带走整个应用、同步 SQLite 可能卡住窗口事件、未来远程需要把业务层整体抽走。把 Host 放进 utilityProcess 已经去掉独立 daemon 的启动和打包开销，同时保留隔离。

### 4.4 Cordis 的使用方式

Pigcode 直接使用 Cordis 及其官方插件：

- `cordis`：Context、Service、事件分发、Fiber 生命周期。
- `@cordisjs/plugin-loader`：从 profile 配置加载插件。
- `@cordisjs/plugin-group`：插件分组。
- `@cordisjs/plugin-include`：配置 include。
- `@cordisjs/plugin-hmr`：开发期热重载。
- `@cordisjs/plugin-timer`：定时服务。
- `@cordisjs/plugin-logger-console`：日志。

约束：

1. **固定版本并 vendor**：Cordis 当前是 `4.0.0-rc.11`，上游明确声明 API 不稳定。Pigcode 在 `vendor/` 下固定版本，升级走独立 PR 与兼容测试，不跟随上游自动升级。
2. **第三方插件不直接依赖 Cordis 类型**：通过 `@pigcode/plugin-sdk` 暴露稳定的 `ctx`、`inject`、`effect` 和事件 API。SDK 是薄封装，不是另一个插件框架。
3. **核心也尽量插件化**：只有 kernel（创建 Cordis 应用、加载 profile、日志、信号处理）是固定的；settings、storage、rpc、workspace、threads、providers、UI shell 都以 composition package / plugin 形式挂载。

### 4.5 组合模型：profile → bundle → patch

沿用 dsh 的组装方式：

- **profile**：一套具名组装，位于 `$PIGCODE_HOME/profiles/<name>/`。v1.0 默认 `desktop` profile。
- **bundle（composition package）**：bundle 本身就是一个普通 npm 包，直接用包名发布，不加 `bundle-` 前缀；`package.json` 的 `pigcode.bundle` 指向 patch 文件，声明它挂载的插件条目。
- **patch**：按 `id` 定位条目，替换整个 config、插入新条目，或设置 `disabled`。
- **叠加顺序**：profile 中的 bundle 按顺序 → profile patch → home patch → 启动参数 overlay。
- **HMR**：开发期可启用；生产默认关闭，改动在下次启动生效。
- **可观测性**：`pigcode --profile desktop --dump-config` 打印最终配置树，任何条目都可被用户 patch 替换。

内置 bundle（初始）：

| Bundle | 内容 |
|---|---|
| `@pigcode/base` | settings、storage、rpc、plugin-manager、logging |
| `@pigcode/workspace` | workspace、projects、threads、sessions、git、checkpoints |
| `@pigcode/providers` | provider-claude、provider-codex |
| `@pigcode/terminal` | PTY 终端 |
| `@pigcode/ui` | client modules、slots、renderer、shell、chat、diff、terminal、settings、plugin-manager |

`apps/desktop` 的 `package.json` 声明 `pigcode.profile`，直接引用这些 composition package；不再单独发布 `bundle-desktop`。

---

## 5. 领域模型

### 5.1 核心实体

```text
Project
  id, rootPath, name, gitRemote, defaultBranch, createdAt

Thread
  id, projectId, title, defaultProviderId, lastProviderId, lastModelId,
  permissionMode, createdAt, updatedAt, archivedAt, lastRunId

Run
  id, threadId, providerSessionId, status,
  startedAt, completedAt, error, checkpointId
  status: queued | running | waiting-approval | waiting-input |
          completed | failed | interrupted

ProviderSession
  id, threadId, providerId, nativeSessionId,
  processState, cwd, startedAt, stoppedAt

ExecutionItem
  id, threadId, runId, kind, parentId, payload, createdAt
  kind: message | tool | approval | question | plan | file-change | usage | error
```

关系：

- 一个 Project 有多个 Thread。
- 一个 Thread 有多个 Run。
- Thread 记录默认 provider（`defaultProviderId`）与最近使用的 provider（`lastProviderId`）；每个 Run 通过 `providerSessionId` 绑定实际会话。
- 一个 Run 最多关联一个根 ProviderSession；切换 provider 时创建新的 ProviderSession。
- 一个 Run 有多个 ExecutionItem，`parentId` 表达子 agent/工具嵌套。
- Provider 原生 id 只作为 ref 保存，不作为主键。

### 5.2 事件日志与投影

- `thread_events` 是只追加日志，`seq` 全局单调递增；每个 thread 的 cursor 是该 thread 内最后应用的 `seq`。
- 每个事件包含 `threadId`、`runId?`、`type`、`payload`、`createdAt`、`schemaVersion`。
- 投影表（`thread_summaries`、`run_summaries`、`pending_requests` 等）与事件在同一 SQLite 事务中更新。
- 客户端订阅返回 `snapshot + cursor`；之后只接收 `seq > cursor` 的事件。
- 事件日志是唯一事实来源；投影可以重建。
- 原始 provider 帧写入独立的轮转诊断日志，最多保留固定大小/天数；不属于产品状态。

### 5.3 命令、回执与副作用

- 客户端发来的变更请求是**命令**，例如 `thread.create`、`run.start`、`run.interrupt`、`approval.respond`。
- Host 按 thread 串行化命令；跨 thread 的全局命令（插件、设置）单独串行化，避免全局锁阻塞所有会话。
- 每个命令检查幂等键 `commandId`，并在同一事务中写入：
  - 事件
  - 投影
  - 命令回执
  - 待执行的 effect（outbox）
- effect worker 在事务提交后执行外部 I/O（启动 provider、写 checkpoint、调用 Git），再把结果作为新事件写回。
- 命令回执表示“意图已提交”，不表示 provider 工作已完成。
- 断线重连时，客户端用回执和 cursor 恢复，不重复执行命令。

### 5.4 Checkpoint

- Checkpoint 保存工作区快照，使用隐藏 Git ref：
  `refs/pigcode/checkpoints/<threadId>/<runId>`
- 快照包含已跟踪文件的修改与未跟踪文件（遵守 `.gitignore`，排除 ignored 文件）；不包含 `.git` 目录本身。
- 通过 `git commit-tree` 创建快照对象并更新 ref，不修改用户工作区、索引或当前分支。
- 每个 Run 结束（provider turn 完成）后可以创建 checkpoint；checkpoint 与 diff 的完成是独立里程碑，不阻塞 `run.completed`。
- 回滚必须同时协调工作区和 provider 会话：
  - provider 支持原生回滚：先回滚会话，再恢复文件。
  - provider 不支持：在修改任何文件前拒绝，并给出明确错误。
- 回滚是破坏性操作，UI 必须二次确认，并显示将受影响的文件。

### 5.5 ID 与版本

- 应用内主键使用 ULID，按时间有序。
- Provider 原生 id（session、turn、tool call）只作为 `ref` 字段保存。
- 事件 schema 从第一天带 `schemaVersion`；迁移在打开数据库时执行，迁移链只允许向前。
- 协议版本与事件 schema 版本独立：协议版本用于客户端/服务端兼容，事件版本用于历史回放。

---

## 6. Provider 层

### 6.1 Adapter 契约

每个 provider 实现一个 `ProviderDriver`：

```ts
interface ProviderDriver {
  readonly id: string
  readonly displayName: string
  readonly capabilities: ProviderCapabilities
  detect(): Promise<ProviderDetection>
  listModels(): Promise<ModelInfo[]>
  createSession(input: CreateSessionInput): Promise<ProviderSessionHandle>
  send(session: ProviderSessionHandle, input: UserInput): Promise<void>
  interrupt(session: ProviderSessionHandle): Promise<void>
  respondApproval(session: ProviderSessionHandle, requestId: string, decision: ApprovalDecision): Promise<void>
  answerQuestion(session: ProviderSessionHandle, requestId: string, answers: Answer[]): Promise<void>
  resume(session: ProviderSessionHandle): Promise<void>
  dispose(session: ProviderSessionHandle): Promise<void>
}
```

- `detect()` 只读，不触发登录、不创建会话。
- `createSession()` 启动一个 CLI 子进程或连接一个本地协议端点。
- `send()` 发送用户输入；流式事件通过 adapter 的回调/事件流返回。
- `dispose()` 优雅终止进程组；超时后强制 kill。
- Adapter 不直接写数据库；它把规范化事件交给 `sessions` 服务。

### 6.2 Capability descriptor

```ts
interface ProviderCapabilities {
  streaming: boolean
  approvals: boolean
  questions: boolean
  plan: boolean
  resume: boolean
  fork: boolean
  rollback: boolean
  checkpoint: boolean
  subagents: boolean
  mcp: boolean
  images: boolean
  usage: boolean
  modelCatalog: boolean
  nativeSessionId: boolean
}
```

- UI 根据 capability 决定显示哪些控件；不做 provider 名称判断。
- 编排层根据 capability 决定是否允许某个操作。
- 缺失能力必须显式表达，不能假装支持。

### 6.3 规范化事件

Adapter 把原生协议翻译为统一的 `ProviderEvent`：

```text
session.started
session.resumed
run.started
message.delta
message.completed
tool.started
tool.completed
approval.requested
approval.resolved
question.requested
question.answered
plan.updated
file.changed
usage.updated
subagent.started
subagent.completed
run.completed
run.failed
session.stopped
```

- 每个事件带 `providerId`、`providerSessionId`、原生 ref（可选）。
- 原生协议特有字段放入 `raw` 或诊断日志，不进入 UI 的通用字段。
- 事件必须可从日志回放；回放不依赖 provider 进程仍然存活。

### 6.4 Claude Code adapter

- 优先使用 Anthropic 官方 headless / Agent SDK 的流式协议（`stream-json` 输入输出）。
- 会话恢复使用 Claude 的 session resume 能力；原生 session id 保存在 ProviderSession。
- 审批通过 adapter 的权限回调或协议消息处理；不在 Host 内实现模型工具执行。
- 模型目录与用量从 CLI 返回的结构化信息中读取；不可用时明确标记为不可用。
- 如果某个能力（如原生 fork）未暴露，capability 置为 false，不尝试用 PTY 伪造。
- PTY 仅作为最后回退，用于无法通过结构化协议完成的能力；回退路径必须在 capability 中体现。

### 6.5 Codex adapter

- 优先使用 `codex app-server` 的 JSON-RPC 协议；它提供线程、轮次、审批、问题、计划等结构化事件。
- 异步问题（provider 主动发起、没有立即的 RPC 响应）必须持久化为待答问题，并通过后续用户消息回答。
- 线程恢复、rollback、fork 使用 Codex 原生能力；不支持时 capability 置为 false。
- 原生 `/goal` 状态、子 agent 事件等映射为规范化事件；原生 id 只作为 ref。
- 如果 app-server 不可用，回退到 `codex exec --json`，但 capability 相应降级。

### 6.6 进程生命周期与安全

- 每个 ProviderSession 拥有独立的 CLI 子进程；同一 thread 同一时刻最多一个活跃会话。
- 子进程使用进程组/Job Object 管理；停止时先发送中断信号，超时后终止整个进程组。
- 不通过 shell 拼接命令；argv 数组传递。
- cwd 固定为项目或 worktree 根目录；路径经过规范化与根目录校验。
- 环境变量继承用户环境，但不把 provider token 写入日志；Renderer 不接收任何 provider 凭据。
- Host 启动时清理上次异常退出遗留的孤儿进程（通过记录的 pid + 启动时间校验）。
- provider CLI 的版本在会话创建时记录；适配器对不支持的版本给出明确错误。
- PTY 会话不跨 Host 重启保留；Host 重启后终端标记为已结束，用户可重新打开。

### 6.7 权限模式、审批与问题

统一权限模式（由 adapter 映射到 provider 原生模式）：

| 模式 | 文件写入 | 命令执行 | 说明 |
|---|---|---|---|
| `read-only` | 禁止 | 禁止（只读命令可选） | 适合审查、提问、规划 |
| `workspace-write` | 仅项目/worktree | 需要审批 | 默认模式 |
| `danger-full-access` | 允许 | 允许 | 危险，必须显式开启并二次确认 |
| `plan` | 禁止 | 禁止 | 只生成计划，等待用户批准后继续 |

- 如果 provider 不支持某个模式，降级到最接近的安全模式，并在 UI 明确提示；绝不静默放宽权限。
- 审批决策统一为：`allow-once`、`allow-for-session`、`deny`、`cancel`。
- 审批与问题请求持久化到 `pending_requests`；provider 会话丢失时标记为 `orphaned`，UI 显示并允许用户重新发起。
- 问题支持自由文本与选项；回答通过命令提交，带幂等回执。
- 所有审批/问题操作都是命令，不能绕过事件日志直接调用 provider。

### 6.8 Provider 切换与上下文交接

- 切换 provider 不创建新 Thread，只创建新的 ProviderSession 和新的 Run。
- 切换时生成显式的 **handoff artifact**：摘要、未完成事项、相关文件、最近工具结果、用户约束。
- handoff artifact 作为新 provider 的第一条系统/用户上下文的一部分，不以隐藏 prompt hack 的方式注入。
- 原生 fork 优先；不可用时使用可移植的上下文交接。
- UI 必须向用户展示“已切换 provider，上下文通过摘要交接”，不能伪装成同一个原生会话。

---

## 7. 插件平台

### 7.1 插件类型

| 类型 | 运行位置 | 职责 | 示例 |
|---|---|---|---|
| `provider` | Host | 实现 `ProviderDriver`，声明能力，可附带设置 UI | Claude Code、Codex |
| `capability` | Host | 注册 Cordis 服务、命令、策略、MCP 工具 | checkpoint、PTY、MCP bridge、GitHub 集成 |
| `ui` | Renderer（可选 Host 半） | 注册 slot、面板、设置页、命令、消息渲染器 | 时间线增强、右栏面板、主题 |
| `bundle`（composition package） | Host | 普通 npm 包，声明 profile 组合，不是用户插件 | `@pigcode/base`、`@pigcode/ui` |

### 7.2 Manifest

插件是普通 npm 包，在 `package.json` 中声明：

```json
{
  "name": "@pigcode/provider-claude",
  "version": "0.1.0",
  "engines": { "pigcode": ">=1.0.0" },
  "pigcode": {
    "apiVersion": 1,
    "kind": "provider",
    "displayName": "Claude Code",
    "host": "./dist/host.js",
    "client": "./dist/client.js",
    "inject": ["providers", "sessions", "settings"],
    "provides": ["provider:claude"],
    "contributes": {
      "provider": {
        "id": "claude",
        "capabilities": {
          "streaming": true,
          "approvals": true,
          "questions": true,
          "plan": true,
          "resume": true,
          "fork": false,
          "rollback": false,
          "checkpoint": true,
          "subagents": true,
          "mcp": true,
          "images": true,
          "usage": true,
          "modelCatalog": true,
          "nativeSessionId": true
        }
      },
      "settings": ["provider.claude"],
      "slots": ["settings.provider"],
      "commands": ["claude.detect"]
    },
    "permissions": ["process:spawn", "fs:workspace", "secret:provider"]
  }
}
```

字段说明：

- `apiVersion`：插件 API 主版本，Host 只加载兼容版本。
- `kind`：`provider` | `capability` | `ui` | `bundle`。
- `host` / `client`：入口文件；至少存在一个。
- `inject`：依赖的 Host 服务或客户端服务。
- `provides`：注册的服务/能力标识，用于冲突检测。
- `contributes`：声明式贡献，Host 不执行代码即可构建插件列表、启动图和 slot 索引。
- `permissions`：声明式权限，安装时展示；v1.0 不强制沙箱。

### 7.3 安装、启用、停用

- 安装命令：`pigcode plugin add <npm-spec | 本地目录 | tarball>`。
- 数据位置：`$PIGCODE_HOME/profiles/desktop/`，包含 `package.json`、`pigcode.patch.yml`、`node_modules`。
- 包管理：内置 pnpm（随应用分发），不依赖系统 PATH。
- 启用/停用：修改 profile patch 中对应条目的 `disabled`；启用 HMR 时立即生效，否则下次启动生效。
- 停用必须：
  - 卸载该插件注册的 slot、命令、设置页。
  - 停止该插件拥有的 Host 服务。
  - 终止该插件启动的子进程。
  - 清理其样式与模块缓存。
- 卸载：移除依赖与 patch 条目；不自动删除用户数据，除非用户确认。
- 冲突：两个插件声明同一个 `provides` 或同一个 slot item id 时，Host 拒绝后加载的插件并在插件列表显示错误；不允许静默覆盖。

### 7.4 Host 加载

- `@cordisjs/plugin-loader` 读取 profile 配置。
- 每个条目按 `inject` 等待依赖服务就绪后挂载。
- 插件注册一律通过 `ctx.effect()` 或 `ctx.on()`，确保 reload/teardown 可逆。
- 第三方插件加载失败不能阻止 Host 启动；失败条目进入插件列表的 error 状态，并提供重试。核心 composition package 加载失败是致命错误，Host 不会进入可用状态。
- `pigcode --dump-config` 输出最终配置树，便于定位和覆盖。

### 7.5 Client 加载

- Host 扫描已启用且带 `client` 入口的插件，构建 **boot graph**：
  - 节点：插件 id、revision、client 依赖。
  - 边：`inject` 声明的客户端服务依赖。
- Host 通过控制通道把 boot graph 与插件文件映射交给 Electron main；main 注册 `pigcode-plugin://` protocol，提供：
  - `pigcode-plugin://boot.json`
  - `pigcode-plugin://<id>/<revision>/client.js`
  - `pigcode-plugin://<id>/<revision>/style.css`（可选）
- 插件启停或 revision 变化时，Host 推送新的映射；main 更新 protocol 处理器，Renderer 按 revision 重新加载。
- `pigcode-plugin://` 在 app ready 前注册为 privileged scheme（standard、secure、supportFetchAPI），以便 ESM import 与 CSP 正常工作。
- Renderer 的 `client-modules` 服务：
  - 先加载客户端 kernel（connection、store、slots、renderer）。
  - 按 boot graph 顺序惰性 `import()` 每个 client entry。
  - 每个 entry 是一个 Cordis 插件；激活时注册 slot/命令，停用时通过 effect 清理。
- React 19 作为共享 external，所有插件共用同一份 React；插件不得自带 React。
- CSS 以 revision 隔离；卸载时移除对应 style 标签。
- 生产环境关闭 HMR；开发环境通过 revision URL 重载单个插件。

### 7.6 UI 扩展点

初始 slot 集合：

```text
sidebar.section           sidebar.footer.action
thread.header             thread.list.item
chat.message              chat.tool
chat.approval             chat.question
composer.action           composer.banner
panel.right               settings.section
settings.provider         command.palette
status.bar                onboarding.step
```

Slot 声明包含：

- `id`：全局唯一。
- `order`：排序。
- `when`：可选的能力/状态谓词，例如 `provider.capabilities.rollback`。
- `render`：React 组件；由 `ui-renderer` 绑定。

UI 插件只能通过宿主提供的 facade 访问能力：

```ts
interface PigcodeClientApi {
  connection: ConnectionApi
  slots: SlotApi
  commands: CommandApi
  theme: ThemeApi
  locale: LocaleApi
  ui: UiPrimitivesApi
  host: HostCallApi
}
```

- 不暴露 Node、preload、文件系统、provider 凭据。
- `host.call(namespace.method, args)` 通过 RPC 调用插件自己的 Host 半，方法必须在 manifest 的 `contributes.rpc` 中声明。
- v1.0 不做硬沙箱；安装 UI 插件视为安装受信代码，但 API 面按最小能力设计。

### 7.7 权限与信任

- Host 插件在 Host 进程内运行，拥有与 Host 相同的权限；安装时必须显示风险提示。
- UI 插件在 Renderer 内运行，只能访问浏览器 API 与 facade；CSP 限制外部脚本。
- `permissions` 在 v1.0 是声明式的，用于：
  - 安装时展示。
  - 插件列表展示。
  - 未来的 out-of-process plugin host 策略输入。
- 不承诺 v1.0 能阻止恶意插件；文档必须明确“安装插件 = 运行第三方代码”。
- 未来隔离路径：独立 plugin host 进程 + RPC + 权限强制；manifest 格式不变。

### 7.8 API 版本与兼容

- `apiVersion` 从 1 开始；破坏性变更递增主版本。
- Host 支持当前主版本及明确声明的一个旧主版本（如果成本允许）；不兼容时拒绝加载并显示迁移提示。
- `@pigcode/plugin-sdk` 的版本与 `apiVersion` 对齐。
- Cordis 升级不改变插件作者可见的 API；SDK 负责吸收差异。
- 插件必须声明其兼容的 Host 版本范围（`engines.pigcode`）。

### 7.9 MCP bridge

- Pigcode 不是 agent，不能直接向模型注册工具。
- capability 插件通过 manifest 贡献 MCP 工具定义与处理函数。
- `mcp-bridge` 服务为每个 thread 启动一个受控的 MCP 端点，并把配置注入到 provider 会话：
  - Claude Code：通过 MCP server 配置。
  - Codex：通过 app-server 的 MCP 注册。
- 工具调用回流到 Host，由插件处理；结果以工具结果事件写回线程日志。
- 作用域：thread 级；不同 thread 不共享可变的 MCP 注册。
- v1.0 实现放在 M5；manifest 与 seam 在 M0 定义。

---

## 8. 协议

### 8.1 传输与信任边界

- v1.0 的本地传输是 Electron `MessagePort`，使用两条 `MessageChannelMain`：
  - 控制通道：main ↔ Host，用于生命周期、boot graph、插件文件映射和状态。
  - 应用通道：Renderer ↔ Host，用于命令、事件和订阅。
- 没有 HTTP server、端口分配、bearer token 或 CORS。
- RPC 消息使用结构化克隆；普通消息为 JSON 信封，大文件/附件通过 MessagePort 分块传输。
- 协议本身与传输解耦：`HostTransport` 接口在 v1.0 只有 MessagePort 实现；未来的远程 transport 增加 WebSocket 实现，领域层、命令和事件不变。
- 插件 client bundle 由 Electron main 通过自定义 protocol `pigcode-plugin://` 从 profile 目录提供；Renderer 直接 `import()`，不经过 HTTP。
- 信任边界：MessagePort 只交给受信 Renderer；Renderer 不接收 provider 凭据。UI 插件在 v1.0 受信（见 7.7）。

### 8.2 命令

命令使用 JSON-RPC 2.0 风格信封：

```json
{
  "jsonrpc": "2.0",
  "id": "cmd-01J...",
  "method": "run.start",
  "params": {
    "threadId": "th_...",
    "input": { "text": "..." },
    "commandId": "01J..."
  }
}
```

初始命令集合：

```text
project.add / project.list / project.remove
thread.create / thread.list / thread.get / thread.archive
run.start / run.interrupt / run.respondApproval / run.answerQuestion
checkpoint.list / checkpoint.restore
terminal.open / terminal.write / terminal.resize / terminal.close
plugin.list / plugin.install / plugin.enable / plugin.disable / plugin.remove
settings.get / settings.update
provider.detect / provider.listModels
```

每个变更命令必须带 `commandId`；Host 返回持久化回执。

### 8.3 订阅：snapshot + cursor

订阅请求：

```json
{
  "method": "thread.subscribe",
  "params": { "threadId": "th_...", "cursor": 42 }
}
```

返回：

```json
{
  "snapshot": { "...": "..." },
  "cursor": 120
}
```

之后通过 `thread.event` 推送 `seq > cursor` 的事件。客户端断线重连时带上最后应用的 `cursor`；Host 不重复发送已确认的事件。

### 8.4 事件

初始事件类型：

```text
thread.created / thread.updated / thread.archived
run.started / run.completed / run.failed
message.delta / message.completed
tool.started / tool.completed
approval.requested / approval.resolved
question.requested / question.answered
plan.updated
file.changed
usage.updated
subagent.started / subagent.completed
checkpoint.created
plugin.changed
host.status
```

`message.delta` 是高频瞬态事件，只通过实时订阅发送，不写入事件日志；`message.completed` 持久化完整消息，重连后从日志恢复。

### 8.5 错误模型

统一错误对象：

```json
{
  "code": "PROVIDER_NOT_INSTALLED",
  "message": "Claude Code CLI not found on PATH",
  "details": { "provider": "claude" },
  "retryable": false
}
```

- 错误码稳定，UI 可本地化。
- 可重试错误带 `retryable: true` 和退避建议。
- Provider 原生错误保留在诊断日志，不直接暴露给用户；UI 显示规范化错误与“查看日志”入口。

### 8.6 版本协商

- 连接时客户端发送 `protocolVersion`、`clientVersion`、`platform`。
- Host 返回 `protocolVersion`、`hostVersion`、`capabilities`、`pluginApiVersions`。
- 不兼容时 Host 拒绝连接并返回可读错误；客户端可以提示升级。
- 新字段必须可选；旧客户端忽略未知字段。

---

## 9. 存储

### 9.1 SQLite 表（初始）

```text
projects(id, root_path, name, git_remote, default_branch, created_at)
threads(id, project_id, title, default_provider_id, last_provider_id,
        last_model_id, permission_mode, created_at, updated_at,
        archived_at, last_run_id)
runs(id, thread_id, provider_session_id, status, started_at, completed_at,
     error_code, error_message, checkpoint_id)
provider_sessions(id, thread_id, provider_id, native_session_id,
                  process_state, cwd, started_at, stopped_at)
thread_events(seq INTEGER PRIMARY KEY AUTOINCREMENT, thread_id, run_id,
              type, payload_json, schema_version, created_at)
execution_items(id, thread_id, run_id, kind, parent_id, payload_json, created_at)
pending_requests(id, thread_id, run_id, kind, provider_request_id,
                 payload_json, status, created_at, resolved_at)
checkpoints(id, thread_id, run_id, git_ref, commit_sha, created_at)
plugins(id, version, kind, enabled, manifest_json, installed_at, last_error)
settings(key, value_json, updated_at)
command_receipts(command_id PRIMARY KEY, result_json, created_at)
```

- `execution_items`、`thread_summaries`、`run_summaries`、`pending_requests` 是投影/读模型，由 `thread_events` 派生；投影可在启动时重建。
- `settings` 与 `plugins` 表是缓存/索引；用户设置与插件组合的权威来源分别是 `settings.json` 和 profile 配置。
- SQLite 使用 WAL 模式；事件写入在事务中完成，Host 崩溃后可从 WAL 恢复。

索引：

- `thread_events(thread_id, seq)`
- `execution_items(thread_id, run_id, created_at)`
- `pending_requests(thread_id, status)`
- `threads(project_id, updated_at)`

### 9.2 原始 provider 日志

- 每个 ProviderSession 一个轮转日志文件，位于 `$PIGCODE_HOME/logs/providers/`。
- 单文件上限与保留天数可配置；默认 64 MiB / 7 天。
- 记录原生请求、响应、错误；token、密钥、图片二进制必须脱敏或排除。
- 诊断日志不参与 replay；产品状态只来自事件日志。

### 9.3 迁移

- 启动时读取 `PRAGMA user_version`，按顺序执行迁移。
- 迁移只向前，不自动降级；降级需要用户显式确认并备份。
- 事件 `schemaVersion` 与数据库 `user_version` 分开；旧事件在读取时通过投影迁移函数兼容。
- 每个版本发布前运行“旧库 + 新代码”的兼容测试。

---

## 10. 桌面端

### 10.1 Electron 进程

- **main**：窗口、托盘、菜单、快捷键、更新、原生对话框、Host 监督、单实例锁。
- **preload**：只暴露最小 bridge：
  - `onHostPort(listener)`：接收 main 转交的 MessagePort
  - `pickDirectory()`
  - `openExternal(url)`
  - `showItemInFolder(path)`
  - `getAppInfo()`
  - `onHostStatus(listener)`
  - `onHostRestarted(listener)`
- **renderer**：加载 `pigcode://app/` 的打包资源，沙箱化，无 Node 集成。
- 原生模块（如 PTY）只在 Host 进程中加载，不进入 Electron main 的启动路径。

### 10.2 启动与关闭

启动：

1. main 获取单实例锁。
2. main 创建两条 `MessageChannelMain`（控制通道 main↔Host、应用通道 Renderer↔Host），启动 Host utilityProcess 并把 Host 侧端口交给它；同时创建窗口并加载 renderer，两者并行。
3. main 通过 `webContents.postMessage(channel, null, [port])` 把应用通道的 Renderer 侧端口交给 preload；preload 用 `window.postMessage(..., [port])` 转交给主世界的 client-runtime。
4. Host 发送 `ready`（协议版本、capabilities）；Renderer 订阅 snapshot，渲染 UI。
5. 首屏只激活 kernel、settings、storage、rpc、plugin-manager 与 UI shell；provider 检测、终端、git 等在首屏后按需激活。

启动优化：

- Host 入口预先 bundle 成少量文件，避免启动时解析大量模块。
- SQLite 打开与迁移在首屏之后或与首屏并行执行；首屏不等待 provider 检测。
- 非关键 Host 插件惰性激活；插件列表与设置页可以后加载。

关闭：

- 关闭窗口默认隐藏（macOS/Windows 托盘），Host 与任务继续运行。
- 退出应用前查询 Host 是否有运行中的 run、待审批、后台任务、定时任务。
- 有任务时弹出确认；确认后先请求 Host 优雅停止，再退出。
- utilityProcess 退出时 main 负责重启（应用退出流程除外）；Host 退出时终止所有 provider/PTY 进程组，超时强制 kill。

### 10.3 安全

- `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
- 自定义 scheme `pigcode://` 只提供打包资源；`pigcode-plugin://` 只提供 profile 目录内的插件 bundle，路径经过规范化与根目录校验。
- CSP：`default-src 'self'`；`script-src 'self' pigcode-plugin:`；禁止内联脚本（开发模式例外）。MessagePort 不受 CSP 约束。
- Renderer 不读取 provider 凭据、不读取任意文件；所有文件访问走 Host 的路径校验与 MessagePort RPC。
- MessagePort 只转交给应用主窗口的受信 frame；不使用 localhost 端口、bearer token 或 CORS。
- UI 插件在 v1.0 受信，能够通过连接模块调用 Host；未来的 out-of-process plugin host 会把这一能力收窄为 capability-scoped bridge。
- Host 的路径校验：规范化、解析 symlink、检查是否位于项目根目录或允许的工作区。
- Provider 子进程不通过 shell 启动；环境变量中的敏感值不写入日志。

### 10.4 原生能力

- 目录选择：Electron 原生对话框；Host 只接受用户选中的路径。
- 打开外部链接：只允许 `https:`；带凭据的 URL 拒绝。
- 托盘：Windows/Linux 常驻；macOS 不强制。
- 快捷键：应用级命令通过 preload 转发；Host 不注册全局快捷键，除用户显式配置。
- 自动更新：electron-updater；签名验证；稳定/预览通道。

### 10.5 三平台打包

| 平台 | 格式 | 签名 |
|---|---|---|
| macOS | DMG / ZIP | Developer ID + notarization |
| Windows | NSIS / MSI | Authenticode（EV 或云签名） |
| Linux | AppImage / deb | 发布校验和 + GPG（可选） |

- 三平台共享同一 Host bundle 与 protocol。
- PTY 使用 `node-pty`；Windows 使用 ConPTY。
- 路径、编码、换行、进程组在 Host 层抽象；UI 不感知平台差异。
- CI 建立三平台冒烟矩阵：启动、创建会话、流式、审批、终端、退出清理。

---

## 11. UI / UX

### 11.1 布局

```text
┌──────────────────────────────────────────────────────────────┐
│ 顶部：项目 / 分支 / worktree | provider / model | 运行状态     │
├──────────────┬───────────────────────────────┬───────────────┤
│ 左栏          │ 会话时间线                     │ 右栏           │
│ 项目          │  用户消息                      │ 文件树         │
│ 会话列表      │  助手消息 / 流式               │ diff           │
│ 插件面板      │  工具卡片 / 审批 / 问题 / 计划  │ 终端           │
│              │  Composer                      │ 预览 / 插件面板 │
└──────────────┴───────────────────────────────┴───────────────┘
```

### 11.2 核心流程

1. **添加项目**：选择目录 → 检测 Git → 选择主 checkout 或 worktree。
2. **新建会话**：选择 provider/model/权限模式 → 输入任务。
3. **运行中**：流式消息、工具卡片、审批内联、问题面板、计划状态。
4. **中断/继续**：中断当前 run；保留会话；可以继续发送消息。
5. **审查改动**：按 run 查看 diff；文件树标记变更；打开终端运行测试。
6. **回滚**：选择 checkpoint；确认后恢复工作区与 provider 会话（若支持）。
7. **插件**：安装/启停；新面板、设置页、provider 即时出现/消失。

### 11.3 设计原则

- **本地优先**：不登录也能用；检测失败不阻塞进入应用。
- **能力驱动**：不支持的 provider 能力直接隐藏，不展示无效控件。
- **服务器状态为准**：流式可乐观渲染，最终以事件日志为准；重连从 cursor 续上。
- **键盘优先**：命令面板、快捷键、审批、中断均可无鼠标完成。
- **可恢复**：窗口关闭、应用重启、Host 崩溃后，会话和滚动位置可恢复。
- **透明**：provider 切换、上下文交接、回滚、插件权限都必须明确告知用户。

### 11.4 i18n 与主题

- 从第一天提供 locale 服务与消息目录；v1.0 支持 `zh-CN` 与 `en-US`。
- 用户消息、agent 输出、文件名不翻译。
- 主题：浅色/深色/跟随系统；插件通过 theme token 取色，不硬编码颜色。
- 视觉方向：React 19 + Tailwind 4 + shadcn 组件（Base UI 原语）的高密度开发工具；具体视觉稿另开设计任务。

### 11.5 复用 pigclaude UI 基线

Pigcode 的 UI 外壳与组件以 `pigclaude/frontend` 为起点，而不是从零设计。基线：

- pigclaude 聚合仓库：`944f6f9edb5efa5c525d9b884e9aeca72b37ae10`
- pigclaude frontend：`e9582dd766d550f266dc792efa0961543584d94a`
- 技术栈：Electron 43 / electron-vite 5 / React 19.2 / Tailwind 4 / shadcn 组件（Base UI 原语）/ TipTap
- 组件原语目标：shadcn 的 Base UI 版本（Base UI primitives），不使用 Radix。当前 pigclaude checkout 的组件实际引用 `radix-ui` / `@radix-ui/react-*`；迁移到 Pigcode 时做一次性 Radix → Base UI 替换，保持 tokens、CSS 与视觉基线不变。
- 已有能力：macOS 隐藏标题栏 + 交通灯 + 磨砂、Windows mica + titleBarOverlay、浅/深色与自定义主题、侧栏/设置侧栏、聊天时间线、工具卡片、审批卡片、composer、命令面板、视觉回归基线

复用边界：

| 部分 | 处理 | 说明 |
|---|---|---|
| `@pigclaude/web-ui` 组件、tokens、主题 | 迁移并替换原语 | 重命名为 `@pigcode/ui-primitives`；Radix → Base UI，保留 token 与对外组件 API |
| Electron 窗口外壳、交通灯、Windows 标题栏、托盘 | 迁移并适配 | 去掉 `sandbox: false`；原生能力改由 preload + Host RPC 承担 |
| 侧栏、设置侧栏、聊天页布局、composer、审批/工具卡片 | 迁移并重构 | 去掉 fixture 和硬编码标题；改为 props/store 驱动；底层 Radix → Base UI |
| 主题/外观设置、视觉回归 harness | 直接迁移 | 插件主题 API 映射到同一套 tokens |
| 登录、会员、OAuth、设备授权 | 不迁移 | Pigcode v1.0 无账号体系 |
| Claude 账号池、代理、用量、环境页 | 不迁移到核心 | 未来作为 provider/capability 插件实现 |
| Electron main 的授权/daemon/local-store/switcher/session-env | 不迁移 | 由 Pigcode Host 取代 |
| Rust backend | 不迁移 | 与 v1.0 本地架构无关 |

迁移方式：

- 一次性复制到 `pigcode/frontend`，保留来源 commit 与 NOTICE；不在运行时跨仓库依赖 pigclaude。
- 包名 `@pigclaude/*` → `@pigcode/*`；组件 API 尽量保持，减少视觉回归。
- 组件原语统一到 shadcn 的 Base UI 版本；不接受同一应用里 Radix 与 Base UI 混用。
- Base UI 的 Portal/Popup/Trigger 组合与 Radix 不完全一致；逐个组件改写并补交互/可访问性测试，再跑视觉回归。
- 先迁移纯展示层，再替换数据源；禁止把 fixture 带入生产路径。
- `Screen` 联合类型与硬编码路由替换为 view registry + slot；核心视图（chat、settings、plugin manager、onboarding）由内置 UI 插件注册。
- 把所有可见文案迁移到 locale 目录；v1.0 同时提供 zh-CN 与 en-US。
- React 19 作为共享 external；UI 插件不得自带 React；`@pigcode/plugin-sdk` 导出统一的 UI primitives 与 hooks。
- 视觉回归：沿用 pigclaude 的 Playwright 截图基线，迁移后先做“无视觉变化”验收，再做数据接线。

这个基线的价值是节省大量视觉与交互打磨；风险是它目前是 fixture 驱动、且带有 Claude 单产品假设。迁移时必须把“展示层”和“产品状态”彻底切开。

---

## 12. 仓库与工程结构

### 12.1 仓库职责

| 仓库 | 职责 | v1.0 |
|---|---|---|
| `pigcode/pigcode` | 聚合仓库：submodule 指针、ADR 索引、发布清单、脚本 | 使用 |
| `pigcode/docs` | 架构、协议、插件作者指南、ADR、用户文档、设计 spec | 使用 |
| `pigcode/frontend` | 产品 monorepo：desktop、host、contracts、plugin-sdk、client-runtime、ui、providers、compositions | 使用 |
| `pigcode/backend` | 云端：身份、设备、relay、同步、计费 | 不使用，预留 |

### 12.2 产品 monorepo 结构

```text
frontend/
  apps/
    desktop/                 # Electron main / preload / renderer；声明 pigcode.profile
    host/                    # Host Runtime（Electron utilityProcess entry）
  packages/
    contracts/               # Zod 协议、领域类型、版本
    plugin-sdk/              # Host/Client 插件 API、manifest 类型
    client-runtime/          # connection、store、slots、renderer
    ui-primitives/           # 设计系统原语（由 @pigclaude/web-ui 迁移）
    ui-shell/                # 应用外壳（由 pigclaude desktop renderer 迁移）
    ui-chat/                 # 时间线、消息、工具卡片、审批
    ui-composer/             # 输入框、上下文 chip、附件
    ui-diff/                 # diff 视图
    ui-terminal/             # 终端视图
    ui-settings/             # 设置
    ui-plugin-manager/       # 插件列表与安装
    provider-claude/         # Claude Code adapter
    provider-codex/          # Codex adapter
    compositions/
      base/                  # @pigcode/base
      workspace/             # @pigcode/workspace
      providers/             # @pigcode/providers
      terminal/              # @pigcode/terminal
      ui/                    # @pigcode/ui
  vendor/
    cordis/                  # 固定版本 + 必要 patch
  scripts/                   # 构建、打包、签名、发布
```

### 12.3 构建与发布

- pnpm workspace + Turborepo。
- TypeScript strict；共享 tsconfig。
- 构建：`tsdown`/`esbuild` 产出 ESM；Electron main/preload 单独 bundle。
- Host 以 utilityProcess entry 打包，随 Desktop 发布；复用 Electron 自带的 Node，不额外分发 Node 运行时；版本与 Desktop 一致。
- `better-sqlite3`、`node-pty` 等原生模块使用 `asarUnpack`，Host 入口路径在打包配置中固定。
- 插件独立版本；通过 `apiVersion` 与 Host 兼容。
- 发布单元：Desktop（含 Host）+ 内置 composition packages；第三方插件独立发布。

### 12.4 为什么 Host 放在 `frontend`

Host、Desktop、contracts、plugin SDK 必须共享同一 lockfile 和发布单元，否则协议与版本会漂移。t3code 与 dsh 都采用产品 monorepo。`frontend` 这个名字在引入远程/云端后可能重命名为 `app`，或把 Host 抽成 `pigcode/core`；这是可逆的重构，不影响 v1.0。

---

## 13. 里程碑与验收

v1.0 的发布门槛是 M0–M5 全部完成。M0–M2 是技术风险最高的关键路径；M3–M5 可以并行，但都必须通过验收才能 GA。

### M0：地基

内容：

- monorepo、Cordis vendor/pin、contracts、plugin-sdk 骨架。
- Host：kernel、settings、storage、rpc、projects、threads、sessions。
- Electron 壳：启动 Host utilityProcess、MessageChannel、窗口；Host 与窗口并行启动。
- 迁移 pigclaude UI 外壳与组件：`ui-primitives`、`ui-shell`、`ui-chat`、`ui-composer`、`ui-settings`；清除 fixture 与 Claude 专属路由。
- 组件原语从 Radix 替换为 shadcn 的 Base UI 版本，保持 tokens、CSS 与视觉基线。
- fake provider：用于验证协议与 UI，不依赖真实 CLI。
- 用 Pigcode store 驱动聊天页与插件列表；核心视图通过 view registry 注册。
- 一个样例 UI 插件、一个样例 capability 插件。

验收：

- 应用在三平台开发环境启动。
- Host 崩溃后自动重启；窗口不重载，Renderer 通过新的 MessagePort 从 cursor 重连。
- 冷启动首屏不等待 provider 检测；Host 与窗口并行启动。
- 创建项目/会话，fake provider 流式输出。
- 迁移后的 UI 在浅色/深色/玻璃/窄窗口下通过视觉回归基线；没有可见的 Claude 账号/会员/代理入口。
- 组件层不残留 `@radix-ui/*` 依赖；Dialog/Select/Dropdown/Tooltip/ScrollArea 等交互组件通过 Base UI 行为与可访问性测试。
- 聊天页、侧栏、设置页由 store/registry 驱动，不再读取 fixture。
- 安装/启用/停用样例插件；UI slot 和 Host capability 都生效并能干净移除。
- `pigcode --dump-config` 输出完整配置树。

### M1：Claude Code 垂直切片

内容：

- Claude Code adapter。
- 事件日志与投影、待审批/待答问题持久化。
- 将真实 Claude 会话接入迁移后的聊天页、composer、工具卡片和审批组件。
- 项目选择、权限模式。
- Host 崩溃恢复与 provider 进程清理。

验收：

- 真实 Claude Code 会话在选定仓库中运行。
- 审批在 UI 内完成；拒绝/取消不产生副作用。
- 重启应用后恢复会话与历史；未完成的审批标记为 orphaned 并可重新发起。
- Host 崩溃不丢已提交事件；孤儿 provider 进程被清理。
- 同一 thread 不能同时启动两个 provider 会话。
- 真实数据下，迁移后的聊天页、工具卡片、审批卡片通过视觉回归基线。

### M2：Codex 与能力模型

内容：

- Codex app-server adapter。
- 完整 capability descriptor 与 UI 条件渲染。
- provider/model 选择、模型目录。
- 两个 provider 并存、并行会话。
- provider 切换与 handoff artifact（基础版）。

验收：

- 同一套 UI 驱动 Claude Code 与 Codex。
- 不支持的能力自动隐藏；直接调用不支持的命令返回明确错误。
- 两个 provider 的会话可同时运行。
- 切换 provider 后，新会话收到显式 handoff artifact；UI 明确提示。

### M3：代码工作台

内容：

- 文件树、文件监听、搜索。
- 按 run 的 diff、文件变更卡片。
- 内置终端（PTY）。
- worktree 创建/切换/清理。
- checkpoint 创建、列表、恢复。

验收：

- agent 改文件后，UI 可按 run 查看 diff。
- 终端在 macOS/Windows/Linux 可用；关闭会话终止进程组。
- checkpoint 恢复后工作区与预期一致；不支持回滚的 provider 在改文件前拒绝。
- worktree 与主 checkout 的项目状态正确隔离。

### M4：插件平台完整化

内容：

- manifest 校验、apiVersion、依赖与冲突检测。
- npm/本地目录/tarball 安装；内置 pnpm。
- 启用/停用/卸载；HMR。
- client boot graph、bundle 服务、slot API、CSS 隔离。
- 权限展示、插件列表、错误与重试。
- 侧栏、设置页、消息/工具渲染器全部通过 slot 挂载；插件面板不需要修改 `ui-shell`。
- 样例第三方 provider、UI、capability 插件。
- Plugin SDK 文档与脚手架。

验收：

- 从本地目录安装样例插件；它新增侧栏面板、设置页和 provider。
- 停用后 UI、Host 服务、子进程全部移除，无需重启。
- 不兼容 apiVersion 的插件被拒绝并显示可读错误。
- 两个插件声明同一贡献时，后加载者失败并显示冲突，不静默覆盖。
- 插件加载失败不影响 Host 启动。
- 新增/移除插件面板不改变 shell 的布局与视觉回归基线。

### M5：多会话、并行与生态

内容：

- 多 tab、多会话并行调度与资源上限。
- 后台任务与子 agent 可视化。
- MCP bridge：capability 插件向 CLI 注入工具。
- PR/代码托管集成（至少一个 provider）。
- 浏览器预览。
- 定时任务。
- provider 切换的完整 handoff 与原生 fork 优先策略。

验收：

- 多个会话并行运行，资源上限生效，UI 正确显示各自状态。
- 子 agent 在时间线中可展开/折叠，父 run 完成语义正确。
- MCP 工具在 Claude Code/Codex 中可用；thread 作用域隔离。
- 能创建/关联 PR，并在 UI 中看到状态。
- 定时任务在 Host 运行期间触发；Host 退出时不丢失调度状态。
- provider 切换后上下文可继续工作；原生 fork 可用时优先使用。

### 三平台发布硬化

- macOS：签名、公证、DMG、自动更新。
- Windows：ConPTY、进程树、NSIS、Authenticode。
- Linux：AppImage/deb、Wayland、进程组。
- 三平台冒烟矩阵全部通过后 GA。

---

## 14. 测试策略

- **单元测试**：adapter 的规范化逻辑、capability 决策、路径校验、事件投影。
- **回放测试**：录制 Claude Code/Codex 的原生协议帧，作为 adapter 的 replay fixture；不 mock 协议细节。
- **集成测试**：Host 核心以内存 transport 启动，使用 fake provider 跑完整命令/事件/投影链路；不依赖 Electron 窗口。
- **协议契约测试**：contracts 的 schema 与客户端/服务端双向兼容。
- **插件生命周期测试**：安装、启用、停用、卸载、冲突、崩溃、HMR。
- **E2E**：Playwright 驱动 Electron，覆盖首次启动、会话、审批、diff、插件安装。
- **UI 视觉回归**：沿用 pigclaude 的 Playwright 截图基线，覆盖浅/深色、玻璃、窄窗口。
- **跨平台 CI**：macOS/Windows/Linux 冒烟矩阵。
- **迁移测试**：旧数据库 + 新代码；旧事件回放。
- **安全测试**：路径遍历、命令注入、MessagePort 越权、自定义 protocol 路径越界、CSP、插件恶意行为（在受控范围内）。

---

## 15. 安全与隐私

- v1.0 无本地网络监听；Renderer 通过 MessagePort 访问 Host。MessagePort 只交给应用主窗口；Renderer 不接收 provider 凭据。UI 插件在 v1.0 受信，能够通过连接模块调用 Host；安装 Host 插件等同于运行受信第三方代码。
- 插件 client bundle 通过 `pigcode-plugin://` 从 profile 目录读取，路径经过规范化与根目录校验。
- Provider 凭据由 CLI 自己管理；Pigcode 不读取、不存储、不转发 provider token。
- Renderer 不直接访问文件系统；所有路径经 Host 校验。
- 插件安装显示权限和风险；Host 插件视为受信代码。
- 诊断日志脱敏；不记录完整的用户消息内容到遥测。
- v1.0 默认不发送遥测；未来的匿名指标必须显式 opt-in。
- 自动更新验证签名；插件包验证来源（npm 完整性/本地路径）。
- 第三方代码许可证保留；Cordis 与 dsh 的 MIT 声明随分发保留。

---

## 16. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| Cordis 仍是 rc，API 不稳定 | 升级破坏插件 | vendor + 固定版本 + plugin-sdk 隔离 + 兼容测试 |
| 插件信任模型 | 恶意插件可执行任意代码 | 安装警告 + 权限展示 + 未来 out-of-process plugin host |
| Provider 协议漂移 | adapter 失效 | replay fixture + 版本检测 + capability 降级 |
| 三平台 PTY/进程差异 | 终端/清理问题 | `node-pty` + ConPTY + 进程组 + 三平台 CI |
| M0–M5 全进 v1.0 | 发布周期长、范围蔓延 | 明确里程碑验收；M0–M2 关键路径优先；不做市场/远程/账号 |
| Electron 安全配置错误 | 凭据泄漏/远程代码执行 | contextIsolation、sandbox、CSP、MessagePort、自定义 protocol、代码审查 |
| 事件日志膨胀 | 磁盘/性能 | 分页、归档、压缩、保留策略、投影索引 |
| Provider CLI 版本差异 | 不兼容 | 版本检测 + 最小支持版本 + 明确错误 |
| 插件冲突 | UI/服务异常 | `provides` + slot id 冲突检测；不允许静默覆盖 |
| Host utilityProcess 崩溃/孤儿进程 | 资源泄漏、会话中断 | main 重启 utilityProcess；Renderer 从 cursor 重连；pid+启动时间校验；进程组终止 |
| utilityProcess 启动/打包失败 | Host 不可用 | 启动超时与错误界面；打包路径校验；原生模块 asarUnpack；三平台冒烟 |
| pigclaude UI 迁移 | 视觉回归、产品耦合 | 先纯展示层迁移；fixture 清零；固定来源 commit；视觉回归 |
| React 19 插件兼容 | 插件自带 React 导致多实例 | React 作为 shared external；SDK 统一导出；构建校验 |
| pigclaude 私有产品假设 | 误带账号/代理/会员页面 | 明确不复用清单；删除相关路由；代码审查 |
| Radix → Base UI 迁移 | 交互行为/可访问性回归 | 逐组件替换；保留视觉基线；补交互测试；锁定 Base UI 版本 |

---

## 17. 开放问题（不阻塞本 spec）

以下问题不影响总体架构，留给后续设计或实现阶段：

- 具体的视觉稿、品牌、组件库选型细节。
- 团队规模、排期与人力分配。
- 首个 PR 集成选择 GitHub 还是 GitLab（M5 前确定）。
- 插件市场的索引格式与签名方案（v1.0 之后）。
- 远程访问的认证与 relay 方案（v1.0 之后）。
- 是否在 v1.0 提供 headless/SDK 发行形态（当前只做 desktop profile）。

---

## 18. 决策记录

| 编号 | 决策 | 状态 |
|---|---|---|
| D1 | v1 只控制第三方 CLI，架构预留自研 runtime | 已确认 |
| D2 | 首批 provider：Claude Code、Codex | 已确认 |
| D3 | TypeScript 全家桶 + Electron | 已确认 |
| D4 | v1 纯本地单机，无账号/云端/远程 | 已确认 |
| D5 | 完整插件平台（安装/启用/停用；市场后置） | 已确认 |
| D6 | 插件信任模型与 deepseek-harness 一致 | 已确认 |
| D7 | v1 能力范围包含核心会话、工作台、多会话、生态集成 | 已确认 |
| D8 | v1 支持 macOS、Windows、Linux | 已确认 |
| D9 | 使用 Cordis，不重新实现插件框架 | 已确认 |
| D10 | v1.0 发布门槛为 M0–M5 全部完成 | 已确认 |
| D11 | Host 运行在 Electron utilityProcess，Renderer 通过 MessagePort RPC 访问；不使用独立 daemon/localhost 服务 | 已确认（按评审调整） |
| D12 | SQLite 事件日志 + 投影作为事实来源 | 本 spec 提出 |
| D13 | 产品代码放在 `frontend` monorepo；`backend` 仅云端 | 本 spec 提出 |
| D14 | 插件通过 `@pigcode/plugin-sdk` 隔离 Cordis | 本 spec 提出 |
| D15 | UI 外壳与组件以 pigclaude 为迁移基线；账号/会员/代理不迁移 | 已确认 |
| D16 | UI 组件原语使用 shadcn 的 Base UI 版本，不使用 Radix | 已确认 |
| D17 | bundle/composition package 使用普通包名，不加 `bundle-` 前缀 | 已确认 |
