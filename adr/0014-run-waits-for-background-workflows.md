# 后台工作流跑完，run 才结束

Claude Code 的 Workflow 工具（打开 Ultracode 后会用）是在后台跑的：工具调用一返回就是「已在后台启动」，主回合紧接着就给出 `result`；工作流跑完后，CLI 在同一个 SDK 会话里自动续一个回合（又一条 `init`、回复与 `result`），把结果交给用户。以前 Claude driver 把第一个 `result` 当成 run 结束，Host 收到 `run.completed` 后释放 run，之后的进度和续上的回答都被当作迟到事件丢掉。

现在 driver 记下所有 `task_started` 之后还没收到 `task_notification` 的后台任务。`result` 到来时只要还有任务没结束，就只发回答和用量，不发 `run.completed`，等续上的回合的 `result` 再结束。这一整段在 Pigcode 里是一个 run：线程显示运行中，停止按钮会连同工作流一起停掉，用户这时发的消息照常排队。

工作流本身用新的 `workflow.updated` 事件表示：每次有看得见的变化（agent 的状态、在做的事、结论、阶段）时发一份完整快照，token 计数的跳动不算。界面按发起它的 Workflow 工具调用 id 合并快照，画成一张按阶段列出 agent 的卡片。Workflow 工具调用本身不再画成普通工具行。

## Considered Options

- 第一个 `result` 就结束 run，后台事件另走一条「线程级」通道：线程不在运行中，用户能接着聊，但后台事件需要一套不属于任何 run 的存储与重放，续上的回答也没有 run 可挂。
- 照 T3 Code 的做法，把 `task_*` 消息平铺成工作日志里的行：实现简单，但看不出哪些 agent 属于哪个工作流，也没有阶段。
- 每条 `task_progress` 都落盘：录制里一个两 agent 的小工作流就有 30 多条，大多只是 token 在涨，事件日志会被撑大。

## Consequences

- 工作流运行期间不能和主 agent 对话，新消息要排队到工作流跑完。以后要支持边跑边聊，需要换成上面第一种方案。
- 用 string prompt 启动的 query 会一直等到后台任务结束才关流，driver 的 `send` 也就一直挂着；中断时 abort 整个 query，CLI 进程退出，后台任务跟着停。
- `workflow_progress` 不在 SDK 的类型里，形状来自 Claude Code 2.1.304 的真实录制（`agent-claude/src/fixtures/workflow.jsonl`）。字段变了时回放测试会先失败。
- Ultracode 依赖 Workflows；有的账号默认没开，所以打开 Ultracode 时同时传 `enableWorkflows: true`。
