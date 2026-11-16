# 一个 Agent 可以有多份配置（Agent 实例）

以前一个 Agent 只有一套设置：改 Claude Code 的 API 地址就等于改了所有 Claude Code 会话。参照 t3code 的 `providerInstance`，把「驱动」和「配置」拆开：`AgentDriver` 仍由 Agent 插件注册，id 是 `agentId`（`claude`、`codex`）；每次具体配置是一个 **Agent 实例**，有自己的 `instanceId`、名字、启用开关和设置值。一个 Agent 因此可以同时接两个 API 端点、两个 CLI 路径或两套模型清单。

默认实例的 `instanceId` 就是 `agentId`，设置仍存在 `agents.<agentId>` 下。自定义实例存在 `agentInstances` 里。新建向导建议一个可用的实例 ID，可以编辑，在提交时把实例和初始配置一起保存。旧调用仍可用 `inst_<uuid>` 和复制来源创建实例，旧数据继续沿用原 ID。会话记住两个实例 id：`default_instance_id`（新 run 用它）和 `last_instance_id`（上次用的），`agent_sessions` 按 `(thread_id, agent_id, instance_id)` 存会话，同一个 Agent 的两个实例在一个会话里各有自己的原生会话。（2026-11-11 修订：以前每次切换都把会话里所有原生会话停掉，「各有自己的上下文」只在不切换时成立；现在切走时原生会话停放着，切回来接着用，配置目录相同的两个实例还能接着用彼此的原生会话，见 ADR 0016。）

界面上设置页改成主从两栏：左栏列出全部实例（按 Agent 分组、默认实例在前），右栏是选中实例的详情卡片；新建实例走「选 Agent → 名称与 ID → 初始设置」三步向导。初始设置使用同一套 Agent 表单，留空的字段使用 Agent 默认值。非默认实例可以改名、停用、设为新会话默认、删除，默认实例不可改不可删。新建会话的模型选择器把所有启用实例的模型平铺在一起，选择结果带着 `instanceId`。

## Considered Options

- 把实例当成「另一个 Agent」注册：插件的 manifest 会膨胀成每个实例一份，插件作者要关心用户开了几个实例。
- 一个 Agent 只留一套设置、靠环境变量切换：无法同时跑两条不同配置的会话，且改设置会影响正在跑的会话。
- 创建时复制已有实例可以省掉重复录入。向导改为填写初始配置，便于为不同账号或 API 填写对应设置。

## Consequences

- 删除实例后线程里记着的 id 会失效：`resolveInstance` 找不到就退回该 Agent 的默认实例，会话照常继续。
- 默认实例的「删除」是撤回自定义设置（`agents.<agentId>` 清空），不是真的删掉这个 Agent。
- 默认实例的 id 与 `agentId` 相同，所以 `instanceId` 在协议里全部可选：老的客户端只传 `agentId` 时行为与以前一致。
- 设置在实例之间独立，检测结果和模型目录按 `instanceId` 缓存，改一个实例不会让另一个重新探测 CLI。
