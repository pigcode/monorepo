# 手机端是电脑上 Pigcode 的远程客户端，Agent 不离开电脑

手机端连到用户自己电脑上运行的 Pigcode，查看和操作那里的会话。Agent、项目文件和 CLI 的登录凭据都留在电脑上，手机端不运行 Agent，中间也没有云端执行。这推翻了架构稿（`docs/superpowers/specs/2026-10-20-pigcode-architecture-design.md`）决策 D4「v1 纯本地单机，无账号/云端/远程」里「无远程」的部分；不在云端执行 Agent、不持有工作区文件仍然成立。

## Considered Options

- **Agent 跑在云端沙箱，手机独立工作**：和 Pigcode 的定位冲突。Pigcode 控制的是用户机器上已经装好、登录好的 CLI，不在云端执行 Agent，也不持有工作区文件（架构稿 §2.3）。
- **Host 不开窗口，跑在常开的服务器或 NAS 上**：第一版不做，设计上不堵死，放进手机端的迭代路线。

## Consequences

- 电脑睡眠、合盖或 Pigcode 退出时，手机端连不上电脑，只能显示离线。
- 架构稿 §15「v1.0 无本地网络监听」要不要改、怎么改，由连接方式的决定另行记录。
