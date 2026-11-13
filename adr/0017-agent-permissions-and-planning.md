# 统一四档权限，Agent 负责原生映射，计划独立控制

权限采用 T3 Code 的平台统一模型：监督审批（`approval-required`）、接受编辑（`auto-accept-edits`）、自动审批（`auto`）、完全访问（`full-access`）。菜单名称、说明、图标、顺序、快捷轮换与 `/` 命令共用 contracts 中的定义。Agent 插件实现原生映射，不再自定义权限菜单。

新会话默认完全访问。这一默认值由用户明确选择；已有会话不会因此扩大权限。权限和计划属于会话，切换 Agent 时保留当前档位，不恢复另一套按实例保存的偏好。子会话继承主会话选择，运行中的 run 使用启动时的快照。

Codex 四档分别映射为：只读沙箱加 `untrusted`、工作区可写加 `on-request`、工作区可写加 `on-request` 和 `auto_review`、完全访问加 `never`。用户审批档显式设置 `approvalsReviewer: user`，每轮也发送沙箱与审批参数。Codex 0.169.0 的 app-server 已验证接受 `untrusted`，不依据 CLI 命令行帮助是否列出它来猜测支持情况。

Claude 四档映射为 `default`、`acceptEdits`、`auto`、`bypassPermissions`。计划期间使用原生 `plan`，退出时恢复当前统一档位。完全访问期间常规命令与文件操作直接放行；提问和计划确认沿用专门交互。没有接入新协议的旧插件仍接收旧权限字符串，自动审批保守回退到监督审批。

`executionModes = { plan: boolean }` 表示插件接入统一权限协议并声明独立计划能力。`planMode` 与权限分开保存，输入框提供“执行 / 计划”切换；Codex 通过 `collaborationMode` 发送 `default/plan`，Claude 使用原生计划模式，计划中的问题通过现有提问卡片作答。`features.plan` 只表示计划进度事件。

数据库升级将旧 id 按实际行为转换：Codex 的工作区权限对应接受编辑，Claude 的默认权限对应监督审批，旧完全访问对应完全访问。旧只读和计划会话继续保留限制。迁移追加规范化事件，防止历史回放覆盖新值；移除旧的按实例模式缓存。未知旧权限保持原值并拒绝运行，等待用户选择，不能静默变成完全访问。

未采用每个 Agent 自定义一套权限菜单：它会让切换 Agent 同时改变可选项和默认值，用户需要重新理解每个菜单。统一档位保留一致交互，原生能力差异由适配器负责。
