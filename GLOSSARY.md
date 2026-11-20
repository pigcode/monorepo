# Pigcode

Pigcode 是一个本地桌面工作台：控制用户机器上已安装的 coding agent CLI，把会话、审批、文件改动、终端和插件放进同一个窗口。

## Agent

**Agent**:
Pigcode 驱动来完成工作的 coding CLI，例如 Claude Code、Codex。Agent 由 Agent 插件接入，通用 ACP 插件可以通过本地命令或 ACP Registry 接入多个 Agent。
_Avoid_: Provider、driver、backend

**Agent 功能（Agent feature）**:
某个 Agent 支持或不支持的一项功能，例如原生 fork、计划进度、回滚会话。界面按它隐藏 Agent 不支持的控件。
_Avoid_: capability、能力

**Agent 实例（Agent instance）**:
一个 Agent 的一份具体配置：名字、启用开关和自己的一套设置值（API 地址、密钥、CLI 路径、启动参数、自定义模型）。同一个 Agent 可以有多个实例，会话绑定到某一个实例上。支持应用内登录的 Agent 把登录绑定到实例，多个实例可以共用一份托管 CLI 安装。默认实例的 `instanceId` 就是 `agentId`，不可删除。自定义实例的 ID 在创建时可编辑。
_Avoid_: provider、providerInstance、配置档案、profile

## 插件

**插件（Plugin）**:
可以安装、启用、停用的包，为 Pigcode 增加 Agent、Capability 或界面。Claude Code、Codex 和 Antigravity 的 Agent 插件随应用内置。
_Avoid_: extension、add-on

**Agent 插件**:
接入一种或多种 Agent 的插件。
_Avoid_: provider 插件

**Capability 插件**:
在 Host 里增加服务或 MCP 工具、自身不接入 Agent 的插件。「Capability」只指这一种插件。
_Avoid_: 用 capability 指 Agent 功能

**UI 插件**:
只在窗口里增加界面的插件。

**插件市场（Marketplace）**:
一个列出插件的目录文件（`.pigcode-plugin/marketplace.json` 或 `marketplace.json`），放在 GitHub 仓库、git 仓库、网址或本地文件夹里。添加市场后可以在插件页浏览、安装和更新其中的插件。
_Avoid_: 插件商店、插件源（指市场本身时）

**市场源（Marketplace source）**:
插件市场读取目录的位置，包括网址、GitHub 仓库、git 仓库、本地文件夹和文件。用户添加的市场源在「个人」分组，可在「市场源」里启停、刷新或删除。停用市场源会隐藏其目录，从它安装的插件照常可用。
_Avoid_: 插件源

**官方市场（Official marketplace）**:
Pigcode 随应用提供的分发渠道。包含「公开」的 Pigcode 插件，以及「社区」中收录的社区插件和注明上游作者的适配。

**扩展点（Extension point）**:
窗口里允许内置功能和插件登记内容的固定位置，共五个：Panel、Surface、设置页、Command、工具渲染器。内置功能和插件用同一套扩展点。
_Avoid_: slot、hook

**Contribution**:
登记在某个扩展点上的一项内容，归属于一个插件或内置功能。插件停用时，它的 Contribution 一起移除。

## 会话

**新会话草稿（Draft）**:
点「新会话」后还没发出第一条消息的会话。它只在窗口里，不在侧栏里，Host 上也没有记录；第一次发送时才按草稿里选好的项目、Agent 实例、模型和权限建会话。草稿里打开右侧面板、底部终端不建会话：它们挂在草稿的项目上，建好会话后原样交给它。
_Avoid_: 空会话、临时会话

**原生会话（Native session）**:
Agent CLI 自己保存的那段对话：Claude 的会话、Codex 的 thread。一个会话里每个 Agent 实例各有一个原生会话，换到别的实例时它留着，换回来、应用重启后都接着用。
_Avoid_: 底层会话、agent session（指 CLI 那一侧时）

**交接（Handoff）**:
原生会话里没有、但这个会话里发生过的内容，按规则挑出原文，随下一条消息交给 Agent。它是挑出来的原文，不是模型写的总结；没放进去的部分 Agent 可以自己去读。
_Avoid_: 摘要、上下文迁移、summary

**会话引用（Thread reference）**:
用户在输入框里 @ 的另一个会话。Agent 拿到它的标题、项目和一小段历史，需要更多时自己去读；被引用的会话不会被改动。
_Avoid_: 会话链接、关联会话

**上下文占用（Context usage）**:
当前原生会话已经用掉多少上下文，以及它的窗口和自动压缩线有多大。显示在输入框里模型选择器旁边。
_Avoid_: 用量（那是计费）、token 数

**会话导航（Conversation navigator）**:
会话区左边的一列短横线，每条对应用户在这个会话里发的一条消息，用来在长会话里预览并跳到某条消息。
_Avoid_: 问题导航、minimap、目录

**权限模式（Permission mode）**:
平台统一提供的监督审批、接受编辑、自动审批、完全访问四档权限。各 Agent 负责映射到自己的原生执行范围与审批参数；权限属于会话，切换 Agent 时保持同一档。新会话默认完全访问，已有会话保留原实际权限。

**计划模式（Plan mode）**:
会话里的独立开关，让 Agent 使用自己的原生计划流程。它与权限选择分别保存；退出计划时恢复之前的权限。是否可用由插件的 `executionModes.plan` 声明，和输出计划进度事件的 `features.plan` 不同。

**快速模式（Fast mode）**:
按模型打开的一个开关：同一个模型输出更快、计费更高。Claude 是会话设置 `fastMode`，需要账号开启额外用量；Codex 是 `fast` 服务档。
_Avoid_: 极速、turbo

**Ultracode**:
Claude Code 的一个会话设置：让主 agent 用工作流把任务拆给多个 agent 并行完成，和思考深度互不影响。打开时同时打开 Workflows。哪些模型能开记在开发者用 `pnpm gen:ultracode` 生成的表里，运行时不再逐个问 CLI。
_Avoid_: 超级编码、ultra 思考

**Agent 命令（Agent command）**:
Agent 提供的输入框命令与 Skill 目录。`/` 菜单列 CLI 命令和自定义命令，同名时 Pigcode 的命令优先。`$` 菜单列当前 Agent 可用的 Skill，支持按名称、展示名、描述和作用域搜索，重新打开时刷新。Codex 通过 `skills/list` 列目录，按 `$名称` 调用。Claude 从本地配置、项目和启用的插件发现 Skill，输入框和历史显示 `$名称`，发送时由适配器以 `/名称` 或 `/插件:名称` 原生调用。单条 Claude 消息中，最后一个匹配的 Skill 原生展开，前面的请求文本一并发送。Claude 的本地 Skill 可在未登录时列出。
_Avoid_: slash command（指 Agent 提供的这一种时）、技能

**工作流（Workflow）**:
主 agent 用 Workflow 工具写的一段脚本，在后台按阶段派出一组 agent。它在时间线里是一张卡片，跑完以前所属的 run 不结束。
_Avoid_: 流水线、pipeline、task group

## 窗口

**Panel**:
插件放在左侧栏里的一个区块。
_Avoid_: section、widget、侧栏面板

**Workbench**:
窗口右侧放 Surface 的区域，界面上叫「右侧面板」。
_Avoid_: right panel（在代码和文档里）

**Surface**:
Workbench 里的一种标签页，例如浏览器、终端、文件、Diff、PR、检查点，或插件提供的标签页。
_Avoid_: panel、tab kind

**Command**:
用户可以从命令面板执行、也可以在输入框里输入 `/` 执行的一个具名操作。两处用同一份 Command。
_Avoid_: action、slash command

**工具渲染器（Tool renderer）**:
决定一类工具调用在对话时间线里怎么显示的 Contribution。
