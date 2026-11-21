# 同类产品的手机端怎么做（pigcode/monorepo#87）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。源码结论基于文中注明的提交。方括号里的数字对应「参考来源」的编号。标注「未经一手来源证实」的内容没有找到官方页面或源码支持。

> 状态：调研进行中。已写完 Happy、Claude Code、Codex、Omnara、T3 Code；OpenCode、ZCode、Cursor、VS Code Remote Tunnels 待补。

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
- 手机端技术栈换过一次：
  - 早期是 React Native 应用，最后一版是 1.8.0（build 154）。之后的 2.0.0 起换成原生 iOS 应用，沿用同一个 App Store 条目，要求 iOS 26 和 Swift 6.2，本地存储用 GRDB（SQLite）[24]；
  - Android 改成 Kotlin 加 Jetpack Compose，仓库写明「The React Native app has been removed」[25]；
  - 换栈时保留了原来的签名团队和钥匙串访问组，让 React Native 版存下的凭据在原地升级后还能读到 [24]。
- 自托管：`npm install -g happy happy-server-self-host` 后运行 `happy server`，内嵌 PGlite 和本地文件存储，不需要 Postgres、Redis 或 S3，并把 CLI 和守护进程的 `serverUrl` 指向本机服务器 [26]。

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
- 断线补齐：文档只写「重连后客户端可以重新拉取离线期间错过的状态」[5]。原生 iOS 端的做法是 [4][27]：
  - 会话列表用 `GET /v2/sessions?cursor=…&limit=…&changedSince=…` 增量拉取；
  - 每个会话的消息有自己的 `seq`，历史用 `GET /v3/sessions/:id/messages?after_seq=…`（往后）或 `?before_seq=…`（往前翻页）分页拉取。
- 多副本部署时用 Redis streams 适配器在副本间转发 [5]。官方托管服务器的地址是 `api.cluster-fluster.com`（CLI 推送客户端的默认地址）[8]。

### 1.3 加密：中继看不到内容

- 设计目标写明「Keep the server blind to user content」[2]。两种方案 [2]：
  - legacy：`tweetnacl.secretbox`（XSalsa20-Poly1305），32 字节共享密钥，布局 `[nonce 24 | 密文+MAC]`；
  - dataKey：每个会话、每台机器一把 AES-256-GCM 数据密钥，布局 `[版本 1 | nonce 12 | 密文 | tag 16]`。数据密钥用 `tweetnacl.box` 和一对临时密钥加密给账号公钥，结果放在 `dataEncryptionKey` 字段里。
- 客户端加密的字段：会话元数据（路径、主机名、摘要、Claude 会话 ID 等）、Agent 状态（待审批请求和结果）、会话消息、机器元数据、守护进程状态、artifact、KV 和 access key [2]。
- RPC 的参数和返回值也用会话或机器的密钥加密，方法名（带会话或机器 ID 前缀）是明文 [28]。
- 中继能看到的明文：各种 ID、时间戳、版本号、`seq`、RPC 方法名，以及 `ephemeral` 里的在线状态、是否在思考和用量 [2][3][28]。GitHub OAuth token 和用户登记的 AI 厂商 token 由服务器用自己的主密钥加密保存，不是端到端加密 [2]。

### 1.4 配对和设备身份

- 账号就是一对密钥：客户端用私钥签名 challenge，`POST /v1/auth { publicKey, challenge, signature }`，服务器验签后按公钥 upsert 账号并签发 JWT [4][6]。
- 电脑登录（terminal auth）的流程 [4][7]：
  1. CLI 生成一对临时 `box` 密钥，`POST /v1/auth/request { publicKey, supportsV2 }`；
  2. 终端显示二维码 `happy://terminal?<base64url 公钥>`，也可以改用网页登录链接；
  3. 已登录的手机扫码，把响应用这把临时公钥加密后 `POST /v1/auth/response`；
  4. CLI 每秒轮询 `/v1/auth/request`，状态变为 `authorized` 后拿到 token 和密文响应，用临时私钥解开。解出 32 字节就是 legacy 共享密钥；第一个字节是 0 时，后面 32 字节是账号公钥，CLI 再自己生成一把随机的 `machineKey`；
  5. CLI 写入凭据，并生成随机 UUID 作为 `machineId`。
- 所以中继只转交密文，看不到账号密钥。二维码里只有公钥，被别人看到也拿不到密钥；但谁先用已登录的 Happy 手机扫到这个码，谁就把这台电脑登进了自己的账号。
- 身份模型是「一个账号的所有设备共享同一把账号密钥」，没有逐台设备的密钥。服务器有 `DELETE /v1/machines/:id` [30]，但删掉机器记录不会让那台设备手里的账号密钥失效（这是根据共享密钥模型的推论）。手机丢失后怎么撤销，文档里没有写，未经一手来源证实。

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
- 电脑上的 CLI 和守护进程给手机注册的 RPC 方法决定了手机能做什么 [29]：
  - 会话控制：`abort`、`permission`（回复审批）、`switch`、`stop-session`、`killSession`；
  - 在电脑上新建和恢复会话：`spawn-happy-session`、`resume-happy-session`，以及 Claude、Codex 会话的 fork、复制和回退点；
  - 文件和命令：`bash`、`readFile`、`writeFile`、`listDirectory`、`getDirectoryTree`、`ripgrep`、`difftastic`；
  - 守护进程：`stop-daemon`。
- 所以持有账号密钥的手机可以在电脑上直接执行 shell 命令、读写文件，不只是和 Agent 对话。登录 Claude、Codex 等 CLI 本身仍在电脑上完成。

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

## 4. Omnara

Omnara 前后是两个产品。旧版（2025）和 Pigcode 一样遥控用户电脑上的 CLI，已经弃用；新版（2026-08 起）是托管 Agent 平台，没有手机 App。

### 4.1 旧版：包装 Claude Code CLI 的「Mission Control」（已弃用）

源码：omnara-ai/omnara 提交 `70b298d`（2025-11-09，加弃用通知的那次提交）[31]。

- Agent 跑在用户电脑上：Python CLI `omnara` 启动 Claude Code 或 Codex CLI，终端、网页和手机三处同步；`omnara serve` 在电脑上开一个端点，让手机远程启动新的 Claude Code 实例 [31]。
- 连接方式是 Omnara 自己运营的中继 [31][32][33]：
  - 架构图里 Agent 把更新发给 Omnara 的 API 服务器，存进 PostgreSQL，再实时同步到手机和网页；用户的回复经 API 服务器交回 Agent；
  - 另有一个终端中继 `relay_server`，转发终端原始字节，帧格式是 1 字节类型加 4 字节长度，类型有输出、输入、窗口大小和元数据；
  - 中继用 Omnara API key 认证（请求头，或 WebSocket 子协议 `omnara-key.<key>`）。本次读到的中继代码里没有内容加密，只有传输层 TLS。
- 手机端：Expo 54、React Native 0.81.4、`expo-notifications`，实时更新用 SSE；网页和手机端在弃用时以 Apache 2.0 开源 [31][34]。
- 推送：后端注册 Expo 推送 token，用 Expo Push API 发送，提问时标题是「<Agent 名> needs your input」；另有基于 Twilio 的短信 [31][35][36]。
- 弃用原因：通知原文是「This version was built as a wrapper around the Claude Code CLI, which became unfeasible to maintain with Claude Code's constant updates」。旧网页端只维护到 2025 年底，手机 App 自动更新到 1.5.0 后就是新平台 [31]。

### 4.2 新版：开源托管 Agent 平台

源码：omnara-ai/omnara 提交 `313ac70`（2026-11-19）[37]。2026-08-05 的提交 #293 把仓库重做为「open-source agent control plane」[38]。

- 定位是 Claude Managed Agents 和 OpenAI Agents API 的开源、可自托管替代品，Apache 2.0 [37]。当前前端只有网页（`frontend/apps/web`），文档没有提到手机 App [37]。应用商店里的 Omnara App 现在是什么状态，本次没有核实，未经一手来源证实。
- Agent 的循环跑在 Omnara 的控制面（Omnara Cloud 或自托管）里，模型走配置的模型供应商；「机器」只负责执行工具调用，可以是托管沙箱，也可以是用户自己的电脑 [37][39]。
- 自带电脑的接入方式 [39][40]：
  - 先在控制面建机器记录，拿到只显示一次的机器 token；
  - 在电脑上装守护进程 `omnarad`，它注册成 launchd 或 systemd 用户服务，主动连出到控制面，不开入站端口、不需要 SSH 密钥；
  - 机器有 `online`、`asleep`、`offline` 三种连接状态。合盖后机器离线，新命令返回可重试的错误；宽限期过后，等着这台机器的工具调用返回 `machine_unreachable` [39]。

## 5. T3 Code

源码：pingdotgg/t3code，提交 `0fd4822`（2026-11-21），MIT 许可证 [41]。它和 Pigcode 的结构最接近：同样有私有的 `contracts` 和 `client-runtime` 包，手机端直接复用它们 [48]。

### 5.1 Agent 跑在哪

- 每个连接把一个客户端接到一个「环境」（environment）。环境就是运行在某台机器上的 T3 Code 服务器，负责 Agent、执行、文件和持久状态；直连、Tailscale、SSH 和 T3 Connect 只是改变客户端怎么到达它 [43]。
- 环境可以是桌面 App 里的本地环境（关掉最后一个窗口就停），也可以是 `t3 up` 装的后台服务 [44][49]。

### 5.2 连接方式：多条路线，中继不在热路径上

- 支持四种路线 [43][44]：
  - 局域网或私有网络直连：`t3 up --lan` 或 `t3 serve --lan`，用一次性配对链接或二维码配对；
  - Tailscale：服务器报告自己的 tailnet 地址，也支持 Tailscale HTTPS；
  - 桌面 App 管理的 SSH；
  - T3 Connect：T3 托管的中继加 Cloudflare Tunnel，不需要路由器端口转发。
- 客户端为每个环境保存一个有序的路线列表，按顺序连第一个能用的；连在靠后的路线上时，后台会预检靠前的路线，能连上就切过去，失败的路线冷却一段时间，避免网络抖动来回切。服务器会报告自己绑定的局域网和 tailnet 地址，客户端记为「学到的路线」，地址变了就替换 [43]。
- 没有指定监听地址的后台服务监听所有 IPv4 接口，但只接受对端地址是 loopback、私有网段或 tailnet 的连接，云服务器的公网地址因此不会暴露 [43]。
- T3 Connect 的中继是 Cloudflare Worker，身份用 Clerk [41][42]：
  - 中继负责把环境关联到云账号、分配和回收托管的 Cloudflare 隧道、签发连接用的短期凭据、登记手机推送 token、接收 Agent 活动并推送；
  - 客户端拿到凭据后，HTTP 和 WebSocket 直接走环境的隧道域名，中继 Worker 不代理这些流量（自动化 webhook 除外）[41][42]；
  - 电脑上运行一个版本固定的 `cloudflared` 连接器，升级时先起新连接器、注册成功后再停旧的 [41]。
- 加密：T3 Code 文档没有提到应用层的端到端加密，流量的保护是 HTTPS 加 Cloudflare 隧道。Cloudflare 边缘能否看到明文，T3 Code 文档没有写，属于 #89 要查的 Cloudflare Tunnel 机制，这里未经一手来源证实。

### 5.3 配对和设备身份

- 局域网配对 [44]：
  - 电脑上 `t3 pair` 生成一次性的配对链接和二维码，手机在「Add environment」里扫码或粘贴；
  - 配对后设备拿到一个 bearer 会话，之后重连不再需要原来的链接；30 天不用就要重新配对；
  - 在电脑的「Sharing & access」里逐个撤销设备会话；撤销没用过的链接只能阻止新的配对。
- 权限范围：配对时可以用 `--scope` 指定权限，例如 `orchestration:read`、`relay:read`；默认权限包括管理访问。`terminal:operate` 和 `orchestration:operate` 分开授予，因为能开终端或驱动全权限 Agent 的客户端也就能绕过其他限制 [44]。
- T3 Connect 的凭据 [41]：
  - 中继请环境签发一个一次性的引导凭据，绑定到客户端的 DPoP 密钥；客户端直接拿它去环境换「环境会话」，中继拿不到这个会话 token；没有客户端私钥，单有引导凭据也换不到会话；
  - 中继和环境互相验证：环境只接受有边界、防重放的中继证明，签名的响应绑定请求的 nonce；
  - 文档明确写了信任假设：中继持有签发请求的签名权，中继签名密钥泄露不是无害的。
- 新设备审批（默认关闭）：打开 `requireConnectDeviceApproval` 后，环境只信任设备密钥（DPoP 指纹），不再信任中继。新设备显示一个由指纹派生的短码（如 `K7QM-2XFD`），要在已连接的设备上或用 `t3 auth connect-device approve` 批准；请求 10 分钟过期；审批不过期，直到撤销该密钥 [41][44]。

### 5.4 睡眠和退出

- macOS 的后台服务在登录时启动、登出时停止，文档要求「Keep the Mac logged in and awake for unattended remote access」[49]。没有看到自己阻止睡眠的功能。
- Cloudflare 按隧道计费，笔记本睡眠会留下空闲隧道。中继每 5 分钟检查一次，回收断开超过 5 分钟的隧道；电脑醒来后请求替换，主机名和 DNS 不变，客户端的绑定继续有效 [41]。

### 5.5 推送通知

- 推送必须开 T3 Connect：「Background delivery requires T3 Connect; a direct or Tailscale connection alone does not enable push notifications」。手机不需要和电脑保持连接 [45]。
- 事件：Agent 完成、失败、需要审批、需要回答；点通知打开对应会话。iOS 还有实时活动和锁屏小组件，Android 16 以上有 Live Updates，完成的结果最多保留 15 分钟 [45]。
- 抑制规则：手机 App 在前台时普通提醒静音；在另一台设备上看着这个会话不会让手机静音 [45]。
- 路径：电脑把 Agent 活动发布给中继，中继拼通知文字后直连 APNs 和 FCM HTTP v1，不经 Expo 推送服务 [42][46]。通知标题是会话标题，正文是「状态: 项目名」，每个字段截断到 120 字符 [47]。所以会话标题和项目名以明文经过 T3 的中继。
- Android 推送要求 Android 7.0 以上和 Google Play 服务 [45][46]。

### 5.6 手机端技术栈和能做的事

- Expo 58.0.23、React Native 0.88.1、`expo-notifications`；复用工作区里的 `@t3tools/contracts`、`@t3tools/client-runtime`、`@t3tools/shared`；代码高亮、审阅 diff、源码文本和终端各自做成原生模块，没有用 Expo 的 DOM 组件（`'use dom'`）[48]。
- 手机能做什么由配对时的权限范围决定；带 `terminal:operate` 的设备可以操作电脑上的终端 [44][48]。

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
24. slopus/happy `packages/happy-ios/README.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-ios/README.md
25. slopus/happy `packages/happy-android/AGENTS.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-android/AGENTS.md
26. slopus/happy `packages/happy-server-self-host/README.md`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-server-self-host/README.md
27. slopus/happy `packages/happy-ios/Sources/HappyWire/API.swift`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-ios/Sources/HappyWire/API.swift
28. slopus/happy `packages/happy-cli/src/api/rpc/RpcHandlerManager.ts`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-cli/src/api/rpc/RpcHandlerManager.ts
29. slopus/happy `packages/happy-cli/src`（对 `registerHandler(` 的全部调用）: https://github.com/slopus/happy/tree/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-cli/src
30. slopus/happy `packages/happy-server/sources/app/api/routes/machinesRoutes.ts`: https://github.com/slopus/happy/blob/42d90b4c786b3bcff6111b363ff8fe3fbc42b4f2/packages/happy-server/sources/app/api/routes/machinesRoutes.ts
31. omnara-ai/omnara README（提交 70b298d，弃用通知）: https://github.com/omnara-ai/omnara/blob/70b298d91/README.md
32. omnara-ai/omnara `src/relay_server/protocol.py`（提交 70b298d）: https://github.com/omnara-ai/omnara/blob/70b298d91/src/relay_server/protocol.py
33. omnara-ai/omnara `src/relay_server/websocket.py`（提交 70b298d）: https://github.com/omnara-ai/omnara/blob/70b298d91/src/relay_server/websocket.py
34. omnara-ai/omnara `apps/mobile/package.json`（提交 70b298d）: https://github.com/omnara-ai/omnara/blob/70b298d91/apps/mobile/package.json
35. omnara-ai/omnara `src/servers/shared/notifications.py`（提交 70b298d）: https://github.com/omnara-ai/omnara/blob/70b298d91/src/servers/shared/notifications.py
36. omnara-ai/omnara `src/backend/api/push_notifications.py`（提交 70b298d）: https://github.com/omnara-ai/omnara/blob/70b298d91/src/backend/api/push_notifications.py
37. omnara-ai/omnara README（提交 313ac70）: https://github.com/omnara-ai/omnara/blob/313ac70cc1991e013c6fc54813cb13eae6be6992/README.md
38. omnara-ai/omnara 提交 0f96db6「feat: relaunch Omnara as an open-source agent control plane (#293)」（2026-08-05）: https://github.com/omnara-ai/omnara/commit/0f96db663
39. Omnara Docs, Machines overview（源文件 `docs/machines/overview.mdx`）: https://docs.omnara.com/machines/overview
40. Omnara Docs, Connect a machine（源文件 `docs/machines/connect.mdx`）: https://docs.omnara.com/machines/connect
41. pingdotgg/t3code `docs/internals/t3-connect.md`（提交 0fd4822）: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/docs/internals/t3-connect.md ；许可证: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/LICENSE
42. pingdotgg/t3code `infra/relay/README.md`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/infra/relay/README.md
43. pingdotgg/t3code `docs/internals/remote.md`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/docs/internals/remote.md
44. pingdotgg/t3code `docs/user/remote-access.md`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/docs/user/remote-access.md
45. pingdotgg/t3code `docs/user/mobile-notifications.md`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/docs/user/mobile-notifications.md
46. pingdotgg/t3code `docs/operations/android-notifications.md`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/docs/operations/android-notifications.md
47. pingdotgg/t3code `infra/relay/src/agentActivity/agentActivityAlerts.ts`、`agentActivityPayloads.ts`: https://github.com/pingdotgg/t3code/tree/0fd48228874d5dc884e67e378526ee6279138ed0/infra/relay/src/agentActivity
48. pingdotgg/t3code `apps/mobile/package.json`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/apps/mobile/package.json
49. pingdotgg/t3code `docs/user/background-service.md`: https://github.com/pingdotgg/t3code/blob/0fd48228874d5dc884e67e378526ee6279138ed0/docs/user/background-service.md
