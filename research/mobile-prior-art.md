# 同类产品的手机端怎么做（pigcode/monorepo#87）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。源码结论基于文中注明的提交。方括号里的数字对应「参考来源」的编号。标注「未经一手来源证实」的内容没有找到官方页面或源码支持。

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

- **Agent 留在用户电脑上、手机只做远程界面，是这一类产品的主流做法。** Claude Code（Remote Control）、Codex、Happy、T3 Code、OpenCode、ZCode 都是这样，和 ADR 0018 的选择一致 [11][13][1][43][50][55]。例外是 Cursor（以云端 Agent 为主，可选自己的电脑）和 Omnara 新版（Agent 循环在控制面，电脑只执行工具）[58][39]。Omnara 旧版靠包装 Claude Code 的终端界面实现，2025-11 因为「跟不上 Claude Code 的频繁更新」弃用 [31]。
- **连接方式只有三种形态，电脑都主动连出、不开公网端口。**
  - 厂商中继转发全部内容：Claude Code、Codex、Omnara 旧版、Cursor [11][16][31][58]；
  - 中继看不到内容：Happy 在应用层加密每条消息，中继存密文 [2]；OpenCode 的 OpenTunnel 只按 SNI 转发 TLS 字节，TLS 在 OpenCode 进程里终止，中继什么都不存 [51][52]；
  - 中继只做发现、凭据和推送，流量走隧道或直连：T3 Code（T3 Connect 加 Cloudflare Tunnel，另有局域网、Tailscale、SSH 路线，客户端按顺序自动选路）[41][43]。
- **端到端加密只在开源独立产品里有。** Anthropic、OpenAI、Cursor 都只有 TLS，Claude 明说 Remote Control 期间转录存在 Anthropic 服务器上 [11]。Happy 和 OpenCode 把「中继看不到内容」当卖点 [1][50]。但即便是 Happy 和 T3 Code，推送文字（会话标题、项目名）也以明文经过它们的服务器和 APNs/FCM [8][47]。
- **配对普遍是「电脑出示一次性二维码或链接，手机扫码」，之后换成长期的逐设备凭据。** OpenCode 的链接一次有效、5 分钟过期，会话 30 天 [50]；T3 Code 的链接一次有效，30 天不用要重新配对，可按设备撤销，还能按权限范围签发 [44]；Codex 每台手机和每台电脑分别配对，电脑上能列出并撤销客户端 [13][18]。设备密钥做得最完整的是 T3 Code（凭据绑定设备的 DPoP 私钥，可选「新设备要已有设备批准」）[41] 和 Claude Trusted Devices（设备公钥加 18 小时一次的生物识别确认）[11]。反例：Happy 所有设备共用一把账号密钥，没有逐设备撤销 [6][7]；ZCode 的连接地址本身就是授权 [55]。
- **手机端技术栈：开源产品里两条路都有人走。** T3 Code 用 Expo 58 / React Native 0.88，直接复用和 Pigcode 同名的 `contracts`、`client-runtime` 包，代码高亮、diff、终端做成原生模块，没有用 Expo DOM 组件 [48]。Happy 从 React Native 换成了原生 Swift/UIKit 和 Kotlin/Compose [24][25]。Omnara 旧版用 Expo [34]。OpenCode 和 ZCode 官方只做网页 [53][55]，Cursor 是原生 iOS 加安卓 PWA [58]，Claude 和 ChatGPT App 闭源。
- **推送都由云端组件持有 APNs/FCM 凭据发出，电脑只报告事件。** Happy 的电脑把事件交给服务器，服务器经自建的 Cloudflare Worker 直连 APNs/FCM [9][10]；T3 Code 的中继直连 APNs 和 FCM HTTP v1，没有 T3 Connect 就没有后台推送 [45][46]；Omnara 旧版经 Expo Push API [35]；大厂经各自的官方 App [11][13][58]。Happy 和 T3 Code 都绕开了 Expo 的推送服务 [10][46]。
- **推送事件收敛到「需要处理」和「跑完或失败」。** Happy 删掉了「每条消息都推」[9]，Cursor 删掉了「每轮结束都推」[61]。都有「正在看就不推」的规则：Happy 服务器查用户界面是否在前台 [9]，Claude Code 在终端聚焦时不推 [11]，T3 Code 在手机 App 前台时静音 [45]。T3 Code 的安卓推送要求 Google Play 服务 [45]，ZCode 改用微信和飞书机器人把消息送到手机 [56]。
- **没有一家解决合盖睡眠。** 做法只有三种：标成离线、醒来自动重连（Claude Code、Omnara 新版）[11][39]；插电并开着远程访问时阻止睡眠，合盖还要接外接显示器（Codex）[13]；文档要求保持唤醒（T3 Code）[49]。
- **手机上普遍能做：** 看会话列表和实时输出、发消息、审批和回答提问、停止、在已有项目里新建会话、看 diff、换模型 [11][13][29][55][58]。**普遍只能在电脑上做：** 新建项目或远程连接、插件和密钥配置、CLI 登录 [11][13][55][58]。Happy 和 T3 Code 还把 shell、终端或文件读写开放给手机 [29][44]。

### 对决策票的直接含义（详见第 10 节）

- #95 手机端技术栈：T3 Code 证明 `contracts` 和 `client-runtime` 这种不依赖 DOM 的包能直接用在 Expo 里；它的时间线没有复用网页组件。
- #96 连接：电脑只出站连接；如果加局域网直连，照 T3 Code 只接受私有网段的对端，客户端保存多条路线自动切换；断线补齐参照 Codex 的 seq/ack 重发和 Happy 的按 seq 分页；电脑睡眠时显示离线，醒来自动重连，可选「插电时阻止睡眠」。
- #97 配对与加密：一次性、短时的配对二维码；配对后每台手机一把自己的密钥和凭据，能在电脑上逐台撤销；可以按设备限权（T3 Code 有先例）；要「中继看不到内容」，有 Happy（应用层加密，中继能存密文）和 OpenTunnel（TLS 透传，中继不存任何东西）两种做法。
- #98 通知：推送凭据放在中继一侧，电脑只报事件；事件只发「需要处理」和「跑完或失败」，用户正在看时不推；推送文字会经过 APNs/FCM，要保密就只发不含内容的提示。

### 未经一手来源证实的事项

- Claude App、ChatGPT App 和 Cursor for iOS 的技术栈和推送通道（文档只写了经官方 App 推送）。
- ZCode 的「Web 远程控制通道」经过谁的服务器、是否加密。
- 经 Cloudflare Tunnel 的流量 Cloudflare 能否看到明文（T3 Code 的文档没有写，由 #89 查 Cloudflare 的文档）。
- Cursor 用 My Machines 时 Agent 循环在云端还是本机。
- Omnara 的手机 App 目前是否还在应用商店上架。
- Happy 手机丢失后怎么撤销；Codex 实验中的「用户验证」是否用于手机审批。
- 有没有哪家支持在通知上直接批准或拒绝：本次读到的文档都没有提到。
- VS Code Remote Tunnels 等其他产品本次没有展开。

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

## 6. OpenCode

依据：OpenCode 官方文档的 Web 页（源文件在 anomalyco/opencode dev 分支提交 `32ae019`）[50]，以及 2026-10-11 合并的 PR #54561 [51]。

- Agent 跑在用户电脑上：OpenCode 服务器以共享后台服务（`opencode service start`）或前台的 `opencode serve` 运行，网页界面由同一个服务器提供 [50]。
- 配对 [50][51]：
  - `opencode pair` 打印一次性链接和二维码（形如 `http://127.0.0.1:49374/auth/connect/…`），链接只能用一次，5 分钟过期；
  - 浏览器打开链接后用会话 cookie 登录；OpenCode 的 App 扫码或粘贴链接也一样；会话 30 天有效，改服务器密码会让所有会话失效；
  - 除了兑换一次性配对码，每个请求都要带服务器密码（默认随机生成）或用它签名的会话 token。其他 HTTP 客户端用 Basic auth，用户名固定为 `opencode`。
- 外网：`opencode pair --remote` 经 OpenTunnel 暴露服务器，第一次会提示「Traffic is end-to-end encrypted, and access requires your server password」并要求确认 [50][51]。
- OpenTunnel 是 OpenCode 同一组织（anomalyco）做的隧道服务，工作方式 [51][52]：
  - 第一次使用时生成随机主机名，私钥在本机生成、不离开本机；为这个主机名申请通配符证书，中继只见到公钥那一半；
  - 本机后台服务保持一条到中继的加密通道；访问者连公网地址时，中继只读 TLS 握手里的主机名（SNI），把加密字节原样转发；
  - TLS 在 OpenCode 进程里终止，所以中继看不到明文，这是 OpenCode 称「端到端加密」的依据；
  - 代价：证书进入证书透明度日志，主机名是公开的；服务本身必须自己做认证。
- 手机端：官方仓库的包列表里没有原生手机 App，官方网页界面做了手机布局（`packages/app` 里有手机布局的回归测试）[53]。原生手机 App 来自第三方，例如 OpenCode Mobile（getopencode.app），它支持局域网、Tailscale、Cloudflare Tunnel、反向代理、SSH 转发等连接方式，把密码存在 Keychain/Keystore 里 [54]。
- 推送：官方文档没有提到推送通知。

## 7. ZCode（智谱）

依据：ZCode 官方中文文档 [55][56][57]。

- Agent 跑在桌面端工作区连着的机器上：本地工作区是这台电脑，SSH 工作区是远程主机，也可以是 WSL 或 Docker 容器 [55][57]。
- 手机端是网页，不是 App：在桌面端左下角点手机图标，弹窗给出二维码和连接地址，手机扫码或在手机浏览器里打开链接 [55]。
- 授权就是这个地址：「连接地址本身就带远控授权，拿到它就能操作你的窗口」。刷新二维码让旧地址立即失效；关掉弹窗不会停止，要点「停止」；同一时间只允许一个手机页面连接；桌面端断网或关窗口后手机就不能用 [55]。
- 这条「Web 远程控制通道」不走设置里的 HTTP 代理 [57]。它经过谁的服务器、是否加密，文档没有写，未经一手来源证实。
- 手机上能做：按工作区或时间线看任务、刷新、在已有工作区里新建任务、给 Agent 追加指令、分叉会话、重连已登记但断开的远程工作区。不能做：新建 SSH、WSL、Docker 连接，打开桌面端没开过的项目，浏览任意目录 [55]。
- 通知走聊天工具：Bot Channel 把 Agent 接进微信（扫码登录自动绑定）和飞书（扫码建应用，再在飞书里发限时有效的 `/bind` 命令绑定）。飞书里 Agent 的输出在一张卡片里流式更新；需要用户选方案、授权操作或确认计划时，单独发一张卡片等用户回答。每个机器人可以限制能打开的工作区 [56]。文档没有提到 APNs/FCM 推送。

## 8. Cursor

依据：Cursor 官方文档、博客和 Cloud Agents 发布说明 [58][59][60][61]。

- 手机端：Cursor for iOS 是原生 App，2026-06-29 公开测试，要求 iOS 26；Android 还在计划中，Android 用户在 Chrome 里把 cursor.com/agents 装成 PWA [58][59][60]。技术栈和是否开源文档没有写，App 未开源。
- Agent 跑在哪：主要是 Cursor 云端隔离虚拟机里的 Cloud Agents；每次运行可以选云端机器、团队机器池，或「My Machines」里自己的电脑 [58][59]。博客写的是「control agents running on your computer from your phone」[60]。发布说明把它叫作 Cloud Agents on Self-Hosted Machines：自己的机器离线时，Agent 等同一台机器回来再继续；给离线的 My Machine 发消息约 15 秒后提示机器离线 [61]。用自己电脑时 Agent 循环在云端还是本机，官方页面没有说清，未经一手来源证实。
- 连接和身份：手机 App 和 cursor.com/agents、桌面 Agents 窗口用同一个后端，用 Cursor 账号（可走 SSO）登录，没有设备配对。App 先读本地缓存，网络恢复后再同步 [58]。内容由 Cursor 后端处理，不是端到端加密。
- 推送：iOS 文档写「Agent 跑完一轮时推送」，并在锁屏和灵动岛用实时活动同时跟踪最多 8 个 Agent [58]；但 2026-08-31 那周的发布说明写明不再推送「一轮结束」，只在 Agent 提问或需要审批时推送 [61]。两处不一致，以发布说明为准。
- 手机上能做：启动 Agent、实时看输出、追加指令、看子代理记录、完整审阅 diff 并合并 PR、用斜杠命令和 skill、语音输入和语音对话、按次选择 MCP 服务器。只能在网页上做：编辑器、终端和文件浏览器，密钥和环境配置，MCP 服务器管理，源码托管接入，自动化和规则配置，管理和计费 [58]。

## 9. 对比表

「中继看得到内容吗」指会话内容（消息、工具输出）；推送文字另列在「推送」一列。Omnara 只列和 Pigcode 相近的旧版。

| 产品 | Agent 跑在哪 | 手机怎么连 | 中继看得到内容吗 | 配对和设备身份 | 手机端 | 推送 |
|---|---|---|---|---|---|---|
| Happy | 用户电脑 | Happy 运营的中继，可自托管 [1][26] | 看不到，客户端加密；ID、在线状态、RPC 方法名是明文 [2][28] | 电脑二维码里是临时公钥，手机把账号密钥加密交给电脑；所有设备共用账号密钥 [7] | 原生 Swift/UIKit、Kotlin/Compose，MIT [24][25] | 电脑报事件，服务器经自建 Worker 发 APNs/FCM，标题明文 [8][9][10] |
| Claude Code（Remote Control） | 用户电脑 | Anthropic API，电脑出站轮询加流式连接 [11] | 看得到，转录存在 Anthropic [11] | claude.ai 账号；可选 Trusted Devices [11] | Claude App，闭源 | 经 Claude App；跑完或需要决定时 [11] |
| Codex | 用户电脑（ChatGPT 桌面 App）或它的 SSH 主机 | chatgpt.com 上的 WebSocket 中继 [13][15] | 看得到，JSON-RPC 只有 TLS [15][16] | ChatGPT 账号，每台手机和每台电脑扫码配对，可撤销 [13][18] | ChatGPT App，闭源 | 经 ChatGPT App [13] |
| Omnara 旧版（已弃用） | 用户电脑，包装 Claude Code CLI | Omnara 的 API 服务器和终端中继 [31][32] | 看得到 [32][33] | Omnara 账号和 API key [33] | Expo 54 / RN 0.81，弃用时开源 [34] | 后端经 Expo Push API [35] |
| T3 Code | 用户电脑 | 局域网、Tailscale、SSH，或 T3 Connect（Cloudflare Tunnel）；中继不转发流量 [41][43] | T3 中继不经手；Cloudflare 一段未核实 [41] | 一次性配对链接换逐设备会话，可限权、可撤销；T3 Connect 用 DPoP 绑定设备密钥，可选新设备审批 [41][44] | Expo 58 / RN 0.88，复用 `contracts`、`client-runtime`，MIT [48] | 必须开 T3 Connect；中继直连 APNs、FCM；标题明文 [45][47] |
| OpenCode | 用户电脑 | 直连，或 OpenTunnel（按 SNI 转发）[50] | 看不到，TLS 在 OpenCode 进程里终止 [51][52] | 一次性链接 5 分钟过期，换 30 天会话；服务器密码 [50] | 官方只有网页；原生 App 是第三方 [53][54] | 官方没有 |
| ZCode | 桌面端工作区连着的机器 | 「Web 远程控制通道」，手机浏览器打开 [55][57] | 文档未写 | 连接地址就是授权，可刷新作废；一次只连一个手机 [55] | 网页；另有微信、飞书机器人 [55][56] | 微信、飞书机器人消息 [56] |
| Cursor | 主要在 Cursor 云端，可选 My Machines [58] | Cursor 后端 [58] | 看得到 | Cursor 账号 [58] | 原生 iOS，安卓用 PWA，闭源 [58][59] | 提问或需审批时推送，有实时活动 [58][61] |

## 10. 对 Pigcode 的启示

### 10.1 手机端技术栈（#95）

- T3 Code 是最直接的先例：它的 `contracts`、`client-runtime` 和 Pigcode 的同名包一样是私有的、直接导出 TS 源码，Expo 应用用 `workspace:*` 依赖它们 [48]。Pigcode 的连接层和协议定义可以照此直接复用。
- T3 Code 没有把网页的聊天时间线搬进手机，代码高亮、diff、源码文本和终端都写成了原生模块 [48]。Pigcode 想用 Expo DOM 组件承载 `ui-chat`，没有同类先例，地图里列的技术验证应该照做。
- Happy 从 React Native 换到两套原生代码 [24][25]，说明长会话列表的体验最后可能推着项目走向原生。第一版自用不必走这一步，但要知道这条路的代价是两套界面代码。
- Happy 和 T3 Code 最后都绕开了 Expo 的推送服务，自己直连 APNs 和 FCM [10][46]。选 Expo 不等于要用 Expo 的推送服务；Expo 推送在大陆能不能用由 #88 回答。

### 10.2 连接、睡眠和退出（#96）

- 所有方案的电脑都只出站连接，不在公网上监听 [11][13][39][41]。如果第一版做局域网直连，照 T3 Code 的做法：监听所有接口，但只接受 loopback、私有网段和 tailnet 地址的对端 [43]。
- 客户端应该为一台电脑保存多条路线（局域网地址、组网地址、中继），按顺序连，连在较差的路线上时后台探测更好的路线再切换 [43]。这样「先做局域网，后接外网」不用改协议。
- 中继有三种选法，第一版和以后公开发布都要考虑：
  - TLS 透传的盲中继（OpenTunnel 式）：中继最简单、不存任何东西；但电脑离线时手机什么都拿不到，推送要另走一条路 [52]；
  - 存密文的中继（Happy 式）：能在电脑离线时给手机看历史、能做推送，代价是要自己设计应用层加密和同步 [2][3]；
  - 只做发现和凭据的中继加隧道（T3 Code 式）：依赖 Cloudflare Tunnel，大陆能否用由 #89 回答 [41]。
- 断线补齐的现成做法 [3][16][27]：
  - Codex：每条电脑到手机的消息带 `seq_id`，没确认的消息在重连后重发，中继给一个游标，重连时带回；
  - Happy：账号级单调 `seq` 加每个会话的消息 `seq`，历史按 `after_seq` / `before_seq` 分页，会话列表按 `changedSince` 增量拉取。
  
  Pigcode 现状里「会话列表没有序号」「打开会话从 0 全量回放」正是这两处要补的（也和 #92 有关）。
- 睡眠：没有人解决合盖睡眠。可以照做的有：手机端标明「电脑离线」和最后在线时间，电脑醒来自动重连 [11][39]；开着远程访问并插电时阻止睡眠，并在界面上说明合盖仍会断开 [13]。Pigcode 已有的「保持唤醒」开关可以接到这里。
- Pigcode 退出时，会话、审批和提问都在 Host 的数据库里，下次启动能接着服务；Claude Code 服务器模式停止后 4 小时内可以恢复会话 [11]，Pigcode 不需要这种时限。

### 10.3 配对、设备身份与加密（#97）

- 配对码：电脑出示一次性、短时有效（参考 OpenCode 的 5 分钟、一次有效）的二维码 [50]，扫码后换成这台手机自己的长期凭据。不要像 ZCode 那样让一条长期有效的链接本身就是授权 [55]。
- 设备身份：每台手机生成自己的密钥对，私钥放在 Secure Enclave 或 Keystore，配对时把公钥登记到电脑上；之后用它签名请求。T3 Code 的 DPoP 绑定 [41] 和 Claude 的 Trusted Devices [11] 都是这个思路。不要学 Happy 让所有设备共用一把账号密钥，否则无法撤销单台手机 [6][7]。
- 撤销：电脑上列出已配对的手机（名称、平台、最后在线时间），逐台撤销 [18][44]。Claude 的「18 小时后要生物识别再确认一次」可以作为高危操作的补充 [11]。
- 按设备限权有先例：T3 Code 配对时按权限范围签发，并提醒能开终端或驱动全权限 Agent 的设备就能绕过其他限制 [44]。Pigcode 如果做「只能看和审批」，也要禁止这台设备以完全访问发起 run。
- 远程执行面：Happy 把 `bash`、`writeFile` 直接开放给手机 [29]。Pigcode 的手机端协议应该只暴露地图里列的七件事需要的方法，不顺带开放任意命令。
- 加密：要「中继看不到内容」，可选 Happy 的应用层加密（每个会话一把数据密钥，用 AES-256-GCM，密钥再用公钥加密分发）[2]，或 OpenTunnel 式的 TLS 透传 [52]。Happy 的配对流程说明了怎么在中继看不到的情况下交换密钥：二维码里放电脑的临时公钥，经中继回传的只有密文 [7]。

### 10.4 通知（#98）

- 推送凭据放在中继一侧，电脑只报告「哪个会话发生了什么」[9][42]。第一版只给自己用时，也可以让电脑直接拿开发者的 APNs 密钥发，但公开发布时要换成中继发，所以接口最好一开始就是「电脑报事件，另一端发推送」。
- 事件只发「等你处理」（审批、提问）和「跑完、失败」[8][45]。不要每条消息都推（Happy 删掉过）[9]，「每轮结束」也要谨慎（Cursor 删掉过）[61]。Host 已经算好的「需要处理」和未读可以直接作为推送和桌面系统通知的同一个信号。
- 用户正在看时不推：电脑上窗口在前台看着这个会话，或手机 App 在前台时跳过 [9][11][45]。Happy 的经验是推送结果要记下来（已发、已抑制、没有 token、失败），否则推送全挂了也没人发现 [9]。
- 推送内容会经过中继和 APNs/FCM，Happy 和 T3 Code 都把会话标题明文放进去 [8][47]。要保密就只推「有会话需要处理」，打开 App 后再从电脑拉详情；iOS 上也可以用 Notification Service Extension 在本机解密（Happy 的推送服务支持 `mutableContent`）[10]，这一条是推论。
- 大陆网络：T3 Code 的安卓推送依赖 Google Play 服务 [45]；ZCode 用微信、飞书机器人把需要决定的事送到手机 [56]，可以作为大陆用户的备选通道，可行性由 #88 判断。
- 迭代路线可以预留实时活动和锁屏小组件：T3 Code 和 Cursor 都用它们跟踪进行中的 Agent [45][58]。

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
50. OpenCode Docs, Web: https://opencode.ai/docs/cli/web/ ；源文件（dev 分支提交 32ae019）: https://github.com/anomalyco/opencode/blob/32ae0197715f822fb1247504f81e3eefc7d3c8fb/services/site/src/docs/content/cli/web.mdx
51. anomalyco/opencode PR #54561「feat(cli): ask before pair --remote first exposes the server」（2026-10-11 合并）: https://github.com/anomalyco/opencode/pull/54561
52. OpenTunnel 官网「how it works」「privacy」: https://opentunnel.xyz/ ；仓库: https://github.com/anomalyco/opentunnel
53. anomalyco/opencode `packages/`（提交 32ae019）: https://github.com/anomalyco/opencode/tree/32ae0197715f822fb1247504f81e3eefc7d3c8fb/packages
54. OpenCode Mobile（第三方）, Remote access（2026-11-06 更新）: https://getopencode.app/docs/remote-access/
55. ZCode Docs, Remote Control: https://zcode.z.ai/cn/docs/remote-control
56. ZCode Docs, Bot Channel: https://zcode.z.ai/cn/docs/bot-channel
57. ZCode Docs, 远程开发: https://zcode.z.ai/cn/docs/remote-development
58. Cursor Docs, Cursor for iOS: https://cursor.com/docs/cloud-agent/mobile
59. Cursor Docs, Cloud Agents: https://cursor.com/docs/cloud-agent
60. Cursor Blog, Build from anywhere with Cursor for iOS（2026-06-29）: https://cursor.com/blog/ios-mobile-app
61. Cursor Docs, Cloud Agents release notes（Week of Aug 31, 2026 等）: https://cursor.com/docs/release-notes/cloud-agents
