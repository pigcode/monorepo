# Pigcode

Pigcode 是一个本地桌面工作台：控制用户机器上已安装的 coding agent CLI，把会话、审批、文件改动、终端和插件放进同一个窗口。

## Agent

**Agent**:
Pigcode 驱动来完成工作的 coding CLI，例如 Claude Code、Codex。每个 Agent 由一个 Agent 插件接入。
_Avoid_: Provider、driver、backend

**Agent 功能（Agent feature）**:
某个 Agent 支持或不支持的一项功能，例如原生 fork、计划模式、回滚会话。界面按它隐藏 Agent 不支持的控件。
_Avoid_: capability、能力

**Agent 实例（Agent instance）**:
一个 Agent 的一份具体配置：名字、启用开关和自己的一套设置值（API 地址、密钥、CLI 路径、启动参数、自定义模型）。同一个 Agent 可以有多个实例，会话绑定到某一个实例上。默认实例的 `instanceId` 就是 `agentId`，不可删除；用户新建的实例用 `inst_` 前缀。
_Avoid_: provider、providerInstance、配置档案、profile

## 插件

**插件（Plugin）**:
可以安装、启用、停用的包，为 Pigcode 增加 Agent、Capability 或界面。Claude Code 和 Codex 也是插件，随应用内置。
_Avoid_: extension、add-on

**Agent 插件**:
接入一个 Agent 的插件。
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
插件市场从哪里读：GitHub 仓库、git 仓库、网址、本地文件夹或文件。插件页的「市场源」里添加、启停、刷新和删除；停用的市场源不在插件市场里列出，从它装的插件照常可用。
_Avoid_: 插件源

**扩展点（Extension point）**:
窗口里允许内置功能和插件登记内容的固定位置，共五个：Panel、Surface、设置页、Command、工具渲染器。内置功能和插件用同一套扩展点。
_Avoid_: slot、hook

**Contribution**:
登记在某个扩展点上的一项内容，归属于一个插件或内置功能。插件停用时，它的 Contribution 一起移除。

## 会话

**新会话草稿（Draft）**:
点「新会话」后还没发出第一条消息的会话。它只在窗口里，不在侧栏里，Host 上也没有记录；第一次发送，或者打开挂在会话上的右侧面板、终端时，才按草稿里选好的项目、Agent 实例、模型和权限建会话。
_Avoid_: 空会话、临时会话

**会话导航（Conversation navigator）**:
会话区左边的一列短横线，每条对应用户在这个会话里发的一条消息，用来在长会话里预览并跳到某条消息。
_Avoid_: 问题导航、minimap、目录

**快速模式（Fast mode）**:
按模型打开的一个开关：同一个模型输出更快、计费更高。Claude 是会话设置 `fastMode`，需要账号开启额外用量；Codex 是 `fast` 服务档。
_Avoid_: 极速、turbo

**Ultracode**:
Claude Code 的一个会话设置：让主 agent 用工作流把任务拆给多个 agent 并行完成，和思考深度互不影响。打开时同时打开 Workflows。哪些模型能开记在开发者用 `pnpm gen:ultracode` 生成的表里，运行时不再逐个问 CLI。
_Avoid_: 超级编码、ultra 思考

**Agent 命令（Agent command）**:
输入框 `/` 菜单里由 Agent 提供的一项：CLI 内置命令（标「内置」），或用户、项目、插件装的 skill 与自定义命令（标「Skill」）。选中后把它的文字插进输入框，随消息发给 CLI 展开：Claude 是 `/名字`，Codex 的 skill 是 `$名字`。和 Pigcode 自己的命令重名时，Pigcode 的优先。
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
