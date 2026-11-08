# 一个 Agent 可以有多份配置（Agent 实例）

以前一个 Agent 只有一套设置：改 Claude Code 的 API 地址就等于改了所有 Claude Code 会话。参照 t3code 的 `providerInstance`，把「驱动」和「配置」拆开：`AgentDriver` 仍由 Agent 插件注册，id 是 `agentId`（`claude`、`codex`）；每次具体配置是一个 **Agent 实例**，有自己的 `instanceId`、名字、启用开关和设置值。一个 Agent 因此可以同时接两个 API 端点、两个 CLI 路径或两套模型清单。

默认实例的 `instanceId` 就是 `agentId`，设置仍存在 `agents.<agentId>` 下，旧数据与旧调用方式不用迁移。用户新建的实例是 `inst_<uuid>`，存在 `agentInstances` 里，新建时从当前实例复制一份值。会话记住两个实例 id：`default_instance_id`（新 run 用它）和 `last_instance_id`（上次用的），`agent_sessions` 按 `(thread_id, agent_id, instance_id)` 存会话，所以同一个 Agent 的两个实例各有自己的上下文。

界面上设置页改成主从两栏：左栏列出全部实例（按 Agent 分组、默认实例在前），右栏是选中实例的详情卡片；新建实例走「选 Agent → 起名字 → 初始设置」三步向导。非默认实例可以改名、停用、设为新会话默认、删除，默认实例不可改不可删。新建会话的模型选择器把所有启用实例的模型平铺在一起，选择结果带着 `instanceId`。

## Considered Options

- 把实例当成「另一个 Agent」注册：插件的 manifest 会膨胀成每个实例一份，插件作者要关心用户开了几个实例。
- 一个 Agent 只留一套设置、靠环境变量切换：无法同时跑两条不同配置的会话，且改设置会影响正在跑的会话。
- 让实例从零开始配置：新建后要重填 API key，太麻烦；改为从当前实例复制，之后互不影响。

## Consequences

- 删除实例后线程里记着的 id 会失效：`resolveInstance` 找不到就退回该 Agent 的默认实例，会话照常继续。
- 默认实例的「删除」是撤回自定义设置（`agents.<agentId>` 清空），不是真的删掉这个 Agent。
- 默认实例的 id 与 `agentId` 相同，所以 `instanceId` 在协议里全部可选：老的客户端只传 `agentId` 时行为与以前一致。
- 设置在实例之间独立，检测结果和模型目录按 `instanceId` 缓存，改一个实例不会让另一个重新探测 CLI。
