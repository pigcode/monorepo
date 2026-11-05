# Pigcode

Pigcode 是一个本地桌面工作台：控制用户机器上已安装的 coding agent CLI，把会话、审批、文件改动、终端和插件放进同一个窗口。

## Agent

**Agent**:
Pigcode 驱动来完成工作的 coding CLI，例如 Claude Code、Codex。每个 Agent 由一个 Agent 插件接入。
_Avoid_: Provider、driver、backend

**Agent 功能（Agent feature）**:
某个 Agent 支持或不支持的一项功能，例如原生 fork、计划模式、回滚会话。界面按它隐藏 Agent 不支持的控件。
_Avoid_: capability、能力

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

**扩展点（Extension point）**:
窗口里允许内置功能和插件登记内容的固定位置，共五个：Panel、Surface、设置页、Command、工具渲染器。内置功能和插件用同一套扩展点。
_Avoid_: slot、hook

**Contribution**:
登记在某个扩展点上的一项内容，归属于一个插件或内置功能。插件停用时，它的 Contribution 一起移除。

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
