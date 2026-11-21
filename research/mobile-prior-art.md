# 同类产品的手机端怎么做（pigcode/monorepo#87）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。源码结论基于文中注明的提交。方括号里的数字对应「参考来源」的编号。标注「未经一手来源证实」的内容没有找到官方页面或源码支持。

> 状态：调研进行中。已写完 Happy、Claude Code、Codex；Omnara、T3 Code、OpenCode、ZCode、Cursor、VS Code Remote Tunnels 待补。

## 问题

同类产品的手机端是怎么做的？逐个查 Happy（Happy Coder）、Omnara、T3 Code、ZCode、Claude Code、Codex、Cursor，以及调研中发现的其他相近产品，每个回答：

- Agent 跑在哪：用户自己的电脑、云端，还是服务器；
- 手机怎么连回去：直连、中继还是组网；中继由谁运营，内容是否端到端加密；
- 手机和电脑怎么配对，设备身份怎么建立（扫码、账号、密钥）；
- 手机端用什么技术栈，是否开源；
- 推送通知怎么送达；
- 手机上能做哪些事，哪些只能在电脑上做。

结论要能直接用在「手机端技术栈」（#95）、「手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办」（#96）、「配对、设备身份与加密」（#97）、「通知怎么送到手机」（#98）上。

## 结论

（初稿，随调研补全）

- **Agent 留在电脑上、手机远程操作，已经是 Claude Code、Codex 两家官方和 Happy 的共同做法。** 三者都是电脑主动连出到一个云端中继，电脑不开入站端口 [1][11][13][15]。
- **中继能不能看到内容，三家分成两派。** Claude Code 和 Codex 的中继是厂商自己的 API 后端，传输只有 TLS，会话内容在厂商服务器上可见并会存储 [11][14][15]。Happy 的中继只存客户端加密后的密文，ID、时间戳、序号和在线状态是明文 [2][3]。
- **配对都是「电脑出示二维码，手机扫码」。** Happy 的二维码里是电脑临时生成的公钥，手机用它把账号密钥加密后经中继交给电脑 [7]。Claude Code 和 Codex 的二维码只是把手机带到同一账号下的会话或配对流程，身份靠厂商账号 [11][13][15]。
- **推送都由中继一侧发出，电脑只上报「什么事件」。** Happy 的电脑把事件类型和会话标题明文交给服务器，服务器发现用户正在看界面就不推，再经自己的 Cloudflare Worker 直连 APNs/FCM [8][9][10]。Claude Code 和 Codex 都通过各自官方 App 推送 [11][13]。
- **电脑睡眠后都只能等它醒来。** Claude Code 在机器恢复联网后自动重连 [11]；Codex 提供「插电时阻止睡眠」，合盖时要接外接显示器才能保持可用 [13]。

## 1. Happy（Happy Coder）

源码：slopus/happy，提交 `42d90b4`（2026-11-19）[1]。MIT 许可证 [1]。

### 1.1 组成和 Agent 跑在哪

- 仓库包含 iOS（原生 Swift/UIKit）、Android（原生 Kotlin/Jetpack Compose）、原始 CLI（npm 包 `happy`）、中继服务器 `happy-server`、推送服务 `happy-push-server`，另有 Rust 版服务器和自托管包 [1]。桌面端在 slopus/happy-desktop，Agent 运行时在 slopus/happy-agent [1]。
- CLI 在用户电脑的终端里包装 Claude Code 和 Codex（`happy claude`、`happy codex`），让用户从手机接着操作 [1]。Agent 和项目文件在用户电脑上。

### 1.2 连接方式：中继

- 传输是 HTTP（`/v1`、`/v2`）加 Socket.IO（路径 `/v1/updates`）[3]。电脑和手机都主动连到服务器，服务器负责转发和存储。
- Socket.IO 握手带 Bearer token 和连接范围 [3][5]：
  - `user-scoped`：App 和网页，接收整个账号的更新；
  - `session-scoped`：一个会话进程；
  - `machine-scoped`：一台机器上的守护进程。
- 服务器发两类事件 [3]：
  - `update`：要在断线后能补回的持久事件，带每个用户单调递增的 `seq`。类型有 `new-session`、`update-session`、`new-message`、`new-machine`、`update-machine` 等；
  - `ephemeral`：在线状态和用量，不落库，例如 `activity`（会话是否活跃、是否在思考）、`machine-status`（机器是否在线）、`usage`。
- 写入有版本号：会话元数据、Agent 状态、守护进程状态等字段要带 `expectedVersion`，冲突时返回当前版本和数据，由客户端解决 [3]。
- 点对点控制走 RPC：电脑上的进程 `rpc-register` 一个方法名，服务器按房间 `rpc:<userId>:<method>` 找到目标 socket，用 `rpc-request` 转发并等确认。目标不在时短暂等待重连再失败，调用中途目标掉线就立即失败 [5]。
- 断线补齐：文档只写「重连后客户端可以重新拉取离线期间错过的状态」[5]。会话列表支持 `changedSince` 增量查询（`GET /v2/sessions?cursor=…&changedSince=…`）[4]。
- 多副本部署时用 Redis streams 适配器在副本间转发 [5]。官方托管服务器的地址是 `api.cluster-fluster.com`（CLI 推送客户端的默认地址）[8]。

### 1.3 加密：中继看不到内容

- 设计目标写明「Keep the server blind to user content」[2]。两种方案 [2]：
  - legacy：`tweetnacl.secretbox`（XSalsa20-Poly1305），32 字节共享密钥，布局 `[nonce 24 | 密文+MAC]`；
  - dataKey：每个会话、每台机器一把 AES-256-GCM 数据密钥，布局 `[版本 1 | nonce 12 | 密文 | tag 16]`。数据密钥用 `tweetnacl.box` 和一对临时密钥加密给账号公钥，结果放在 `dataEncryptionKey` 字段里。
- 客户端加密的字段：会话元数据（路径、主机名、摘要、Claude 会话 ID 等）、Agent 状态（待审批请求和结果）、会话消息、机器元数据、守护进程状态、artifact、KV 和 access key [2]。
- 中继能看到的明文：各种 ID、时间戳、版本号、`seq`，以及 `ephemeral` 里的在线状态、是否在思考和用量 [2][3]。GitHub OAuth token 和用户登记的 AI 厂商 token 由服务器用自己的主密钥加密保存，不是端到端加密 [2]。

### 1.4 配对和设备身份

- 账号就是一对密钥：客户端用私钥签名 challenge，`POST /v1/auth { publicKey, challenge, signature }`，服务器验签后按公钥 upsert 账号并签发 JWT [4][6]。
- 电脑登录（terminal auth）的流程 [4][7]：
  1. CLI 生成一对临时 `box` 密钥，`POST /v1/auth/request { publicKey, supportsV2 }`；
  2. 终端显示二维码 `happy://terminal?<base64url 公钥>`，也可以改用网页登录链接；
  3. 已登录的手机扫码，把响应用这把临时公钥加密后 `POST /v1/auth/response`；
  4. CLI 每秒轮询 `/v1/auth/request`，状态变为 `authorized` 后拿到 token 和密文响应，用临时私钥解开。解出 32 字节就是 legacy 共享密钥；第一个字节是 0 时，后面 32 字节是账号公钥，CLI 再自己生成一把随机的 `machineKey`；
  5. CLI 写入凭据，并生成随机 UUID 作为 `machineId`。
- 所以中继只转交密文，看不到账号密钥。二维码里只有公钥，被别人看到也拿不到密钥；但谁先用已登录的 Happy 手机扫到这个码，谁就把这台电脑登进了自己的账号。
- 身份模型是「一个账号的所有设备共享同一把账号密钥」，没有逐台设备的密钥和撤销。手机丢失后怎么撤销单台设备，文档和本次读到的代码里没有找到，未经一手来源证实。

### 1.5 推送通知

- 触发：电脑上的 CLI 或守护进程在三种事件时发：`done`（标题「It's ready!」）、`permission`（「Permission request」）、`question`（「Clarification needed」）。正文是会话标题，取会话摘要，没有摘要时取项目目录名 [8]。
- 路径 [8][9][10]：
  1. CLI `POST /v1/sessions/:sessionId/push-event`，把事件类型、标题、正文明文交给服务器；
  2. 服务器 `dispatchSessionEventPush` 先查用户是否有 `user-scoped` 连接报告 `app-state: active`，有就不推（用户正在看界面）；查询失败则照样推；
  3. 服务器取出账号下所有推送 token，交给 `happy-push-server`；
  4. `happy-push-server` 是 Cloudflare Worker，用 ES256 JWT 直连 APNs、用服务账号直连 FCM HTTP v1，也能转发给 Expo 推送服务。
- 推送内容不是端到端加密的：会话标题以明文经过 Happy 服务器、推送服务和 APNs/FCM [8][9]。
- 推送服务的设计 [10]：
  - App 用随机 `deviceId` 注册原生 token，拿回一个稳定的 `HappyPushToken[…]`（约 131 位随机数）。发送接口不需要认证，这个 token 本身就是凭据，所以自托管的 Happy 服务器也能共用官方推送服务；
  - 每个接收者每 60 秒最多 60 条；载荷上限 4096 字节；
  - Android 用 data-only 消息，由 App 自己显示通知；iOS 没有标题和正文的消息按后台推送（优先级 5）发。
- 早期每条消息都推，一轮对话里每 10 秒震一次，后来删掉了，只保留上面三种事件 [9]。服务器每次都返回 `sent`、`suppressed`、`no_tokens`、`failed` 等结果，起因是曾有两个月推送全部失败却没人发现 [9]。

### 1.6 手机上能做什么

- README 写的是手机上能接着操作同一批会话，并能邀请别人进同一个会话一起看和操作 [1]。审批结果、权限模式写在加密的 Agent 状态里 [2]。
- 只能在电脑上做的事：未查完，待补。

## 2. Claude Code（Anthropic）

Claude Code 有三种手机端用法：Remote Control 遥控本机会话、云端会话（Claude Code on the web）、Dispatch（不再对新用户开放）[11]。这里重点写 Remote Control。

### 2.1 Agent 跑在哪、怎么连

- Remote Control 让 claude.ai/code 或 Claude 的 iOS、Android App 连到用户电脑上运行的 Claude Code 会话。执行和文件访问都在电脑上，网页和手机只是「一扇窗」，电脑必须开着、`claude` 进程必须在跑 [11]。
- 启动方式：`claude remote-control`（服务器模式，默认最多 32 个并发会话）、`claude --remote-control`、在会话里输入 `/remote-control`；桌面 App 和 VS Code 扩展也支持 [11]。
- 连接：电脑只发出站 HTTPS，从不开入站端口。启动后向 Anthropic API 注册并轮询任务；手机连上后，服务器在两边之间用流式连接转发消息 [11]。
- 加密：全部流量经 Anthropic API，只有 TLS。连接用多把短期凭据，每把只管一件事、各自过期 [11]。
- 中继能看到内容：连接期间会话转录（用户消息、Claude 回复、工具活动）存在 Anthropic 服务器上，用来在多设备间同步和断线后重连。开启零数据保留（ZDR）或 HIPAA 配置的组织不能用 Remote Control [11]。
- 只支持 claude.ai 订阅登录，不支持 API key、Bedrock、Vertex 类平台或自定义 `ANTHROPIC_BASE_URL` [11]。

### 2.2 配对和设备身份

- 身份就是 claude.ai 账号：手机用同一账号登录，在 Code 标签页的会话列表里就能看到在线的 Remote Control 会话（电脑图标加绿点）[11][12]。终端显示的 URL 和二维码只是带手机打开这个会话 [11]。
- 可选的 Trusted Devices：每台浏览器、手机或桌面 App 各自登记一把凭据，只在完整登录后不久允许登记；登录超过 18 小时要用 Face ID、Touch ID、Windows Hello 或 passkey 再确认一次。服务器只存设备公钥和名称、平台、登记时间。可以在账号设置里逐台撤销，丢失设备时由用户或管理员撤销 [11]。

### 2.3 断线、睡眠和退出

- 电脑睡眠或断网后，机器恢复联网时 Claude Code 自动重连 [11]。
- 服务器模式在电脑醒着但断网约 10 分钟后放弃并退出；交互式会话一直重试 [11]。
- 关掉终端或退出进程，会话就离线，直到重新启动。服务器模式停止后约 4 小时内可以用 `claude remote-control --continue` 等命令恢复原会话 [11]。
- 权限请求和 `AskUserQuestion` 一直等到有人回答；其他转发到手机的对话框默认 5 分钟后按「不操作」关闭 [11]。

### 2.4 推送通知

- Remote Control 开着时，任务跑完或需要用户决定时，Claude 可以推送到手机上的 Claude App；用户也可以在提示里要求「测试跑完通知我」。在 `/config` 里分别开关「Claude 自己决定何时推送」和「需要操作时推送（权限请求和提问）」[11]。
- 用户正在电脑终端里打字或聚焦时不推；可以设置 `CLAUDE_CLIENT_PRESENCE_FILE` 指向一个标记文件，文件存在时一律不推，配合锁屏监听使用 [11]。
- 推送由 Anthropic 一侧经 Claude App 送达；具体走 APNs/FCM 的细节文档没写，未经一手来源证实。

### 2.5 手机上能做什么

- 能做：发消息、发图片和文件（非图片文件下载到电脑上作为 `@` 引用）、处理审批和提问、看子代理和工作流进度并停止它们、看 git diff、切换模型和思考强度、fork 会话、执行一部分斜杠命令 [11]。
- 只能在电脑上：`/plugin`、`/resume` 等只在终端界面运行的命令；连接器重新授权要在电脑的 shell 里取链接 [11]。
- 手机端是闭源的 Claude App，技术栈未公开，未经一手来源证实。

## 3. Codex（OpenAI）

OpenAI 2026-05-14 宣布把 Codex 放进 ChatGPT 手机 App（预览），iOS 和 Android 都有，所有套餐可用 [14]。

### 3.1 Agent 跑在哪、怎么连

- Agent 跑在装了 ChatGPT 桌面 App（Codex）的 Mac 或 Windows 电脑上，也可以是这台电脑通过 SSH 连着的远程主机 [13]。手机用 ChatGPT App 远程操作，项目、文件、凭据、插件和本地工具都来自电脑 [13][14]。
- 官方说法是「secure relay layer」：让受信任的机器在用户已授权的设备间可达，又不直接暴露在公网上；这个中继同时在所有登录 ChatGPT 的地方同步会话状态 [13][14]。
- 源码（openai/codex，提交 `1145028`）[15][16][17]：
  - 电脑上的 app-server 用用户的 ChatGPT 登录（Bearer token 加 `ChatGPT-Account-ID`）和本机 `installation_id` 向 `https://chatgpt.com/backend-api/wham/remote/control/server/enroll` 登记，拿回 `server_id`、`environment_id`、短期 `remote_control_token` 和过期时间，之后定期 refresh；
  - 然后主动连 WebSocket `wss://chatgpt.com/backend-api/wham/remote/control/server`，请求头带协议版本 `3`、`installation_id` 和上次的订阅游标 `x-codex-subscribe-cursor`；
  - 地址白名单只允许 `chatgpt.com`（及其子域、staging）和 localhost，不能指向自建中继 [15]。
- 线上格式 [15][16]：
  - 手机到电脑：`client_message`（一条完整的 JSON-RPC 消息）、`client_message_chunk`（大消息分片，base64）、`ack`、`ping`、`client_closed`，每条带 `client_id`、`stream_id`、`seq_id`；
  - 电脑到手机：`server_message`、`server_message_chunk`、`pong`，带 `client_id`、`stream_id`、`seq_id`；
  - 分片目标 100 KiB，单片上限 150 KiB，重组后上限 100 MiB [19]。
- 加密：信封里直接装 JSON-RPC 消息，`remote_control` 传输代码里没有端到端加密层，只有 WebSocket 的 TLS [15][16]。也就是说 OpenAI 的中继能看到会话内容，这和官方说「中继同步会话状态」一致 [14]。
- 断线补齐 [16][19]：
  - 电脑为每个（客户端，流）保留还没被确认的消息，`ack` 由中继后端生成，确认到某个 `seq_id` 为止；重连后重发未确认的消息；
  - 中继在客户端消息里带 `cursor`，电脑保存后在重连时作为订阅游标发回，中继从那里接着投递；
  - 每 10 秒 ping，60 秒没有 pong 判定断线；重连退避从 5 秒开始，上限 30 秒；客户端 10 分钟没有活动就清理。

### 3.2 配对和设备身份

- 流程：在电脑的 ChatGPT 桌面 App 里打开 Settings > Connections > Control this Mac or PC，批准远程访问并完成验证，App 显示二维码；手机扫码后打开 ChatGPT，确认同一账号和工作区，完成多因素认证、SSO 或 passkey。每台手机要和每台电脑分别配对 [13]。
- 源码里的配对 [15][17][21]：电脑向 `…/server/pair` 申请配对码（二维码用的 `pairing_code`，以及可手输的短码 `manual_pairing_code`，都有过期时间），再轮询 `…/pair/status` 直到 `claimed`。CLI 的 `codex remote-control pair` 打印手输短码，例如 `ABCD-EFGH` [21]。
- 设备管理：电脑可以列出已配对的客户端（名称、设备类型、平台、系统版本、型号、App 版本、最后在线时间）并逐个撤销 [18]。本机 SQLite 记一张 `remote_control_enrollments` 表（账号、`server_id`、`environment_id`、服务器名、是否启用）[20]。
- 退出 ChatGPT 登录会关掉远程控制，但不删除已有配对 [13]。
- 实验中的「用户验证」：app-server 能在本机生成一把 P-256 密钥，用系统的生物识别对 challenge 签名；文档写明 WebSocket 和远程控制的对端必须用自己设备上的认证器 [23]。它和远程审批的关系文档没有展开，未经一手来源证实。

### 3.3 睡眠和退出

- 电脑睡眠、断网或关掉 App，远程访问就停止 [13]。
- 电脑设置里有「Keep this Mac awake」：插电并开启远程访问时阻止睡眠。Mac 笔记本合盖时要接外接显示器才能保持可用；选择「睡眠」仍会断开 [13]。
- 没有桌面 App 的 Linux 主机可以用 `codex remote-control start` 启动带远程控制的 app-server 守护进程 [21][22]，但官方页面写明手机端的设置只能从桌面 App 开始 [13]。

### 3.4 推送通知和手机上能做什么

- 能做：在电脑的项目里新建或继续对话、发后续指令、回答问题、批准命令、看输出、diff、测试结果、终端输出和截图、切换模型、在多台电脑和多个对话间切换；任务完成或需要处理时收到通知 [13][14]。
- 推送经 ChatGPT App 送达，通道细节未公开，未经一手来源证实。
- 手机端是闭源的 ChatGPT App，技术栈未公开，未经一手来源证实。

## 参考来源

所有来源的访问日期都是 2026-11-21。

1. slopus/happy README（提交 42d90b4）: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/README.md
2. slopus/happy `docs/encryption.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/docs/encryption.md
3. slopus/happy `docs/protocol.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/docs/protocol.md
4. slopus/happy `docs/api.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/docs/api.md
5. slopus/happy `docs/realtime-sync-and-rpc.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/docs/realtime-sync-and-rpc.md
6. slopus/happy `docs/user-identity.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/docs/user-identity.md
7. slopus/happy `packages/happy-cli/src/ui/auth.ts`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-cli/src/ui/auth.ts
8. slopus/happy `packages/happy-cli/src/api/pushNotifications.ts`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-cli/src/api/pushNotifications.ts
9. slopus/happy `packages/happy-server/sources/app/push/pushDispatch.ts`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-server/sources/app/push/pushDispatch.ts
10. slopus/happy `packages/happy-push-server/README.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-push-server/README.md
11. Claude Code Docs, Continue local sessions from any device with Remote Control: https://code.claude.com/docs/en/remote-control
12. Claude Code Docs, Claude Code on mobile: https://code.claude.com/docs/en/mobile
13. ChatGPT Learn, Remote connections: https://learn.chatgpt.com/docs/remote-connections
14. OpenAI, Work with Codex from anywhere（2026-05-14）: https://openai.com/index/work-with-codex-from-anywhere/
15. openai/codex `codex-rs/app-server-transport/src/transport/remote_control/protocol.rs`（提交 1145028）: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-transport/src/transport/remote_control/protocol.rs
16. openai/codex `remote_control/websocket.rs`: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-transport/src/transport/remote_control/websocket.rs
17. openai/codex `remote_control/enroll.rs`: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-transport/src/transport/remote_control/enroll.rs
18. openai/codex `remote_control/clients.rs`: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-transport/src/transport/remote_control/clients.rs
19. openai/codex `remote_control/client_tracker.rs`、`segment.rs`: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-transport/src/transport/remote_control/client_tracker.rs ，https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-transport/src/transport/remote_control/segment.rs
20. openai/codex `codex-rs/state/migrations/0024_remote_control_enrollments.sql`、`0037_remote_control_enrollments_enabled.sql`: https://github.com/openai/codex/tree/1145028ae47e8119955323d38ce34122d418f951/codex-rs/state/migrations
21. openai/codex `codex-rs/cli/src/remote_control_cmd.rs`: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/cli/src/remote_control_cmd.rs
22. openai/codex `codex-rs/app-server-daemon/README.md`: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server-daemon/README.md
23. openai/codex `codex-rs/app-server/README.md`（User verification 一节）: https://github.com/openai/codex/blob/1145028ae47e8119955323d38ce34122d418f951/codex-rs/app-server/README.md
