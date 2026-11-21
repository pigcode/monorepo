# DSH Go 的手机端怎么做（pigcode/monorepo#105）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。方括号里的数字对应「参考来源」的编号。源码结论基于这些提交：DSH Go `da79802`（main，1.3.0 合并后）、ds-harness-remote `7c9fc70`、DeepSeek Harness `2e39e70`；PiPilot 只读了 README（`d94aeaa`）。标注「推论」的是根据所引代码或文档推出、来源本身没有直接写明的结论；查不到的写「没有找到一手来源」。描述 DSH Go 自己的东西时沿用它的叫法并注明，例如「主机」「本机引擎」「对话」「工作区」「插话」；指 Pigcode 时用 `GLOSSARY.md` 的用词。

## 问题

[DSH Go](https://github.com/ccch1mneyyy/dsh-Go) 是 DeepSeek Harness（DSH）的手机 App，用 Flutter 写，AGPL-3.0。它能在手机本机跑 DSH，也能遥控电脑或服务器上的 DSH。和 Pigcode 相关的是遥控电脑这条线和它的界面，逐项回答：

- **连接**：手机怎么连到电脑上的 DSH（SSH、[DSHarness Remote](https://github.com/liguobao/ds-harness-remote) 或别的）；在外网时怎么走，有没有中继、谁运营、内容是否端到端加密；电脑睡眠、断网或 DSH 退出时手机上看到什么。
- **配对和设备身份**：怎么建立，能不能撤销单台手机。
- **协议**：会话列表、历史分页、流式输出、断线补齐、审批和提问怎么在手机和电脑之间传。
- **界面**：主机切换和连接状态、会话列表、时间线（过程折叠、中途插话、排队消息）、审批和提问、新建会话、改动和 diff 各自怎么排，附截图链接。
- **推送和后台**：App 在后台或锁屏时怎么提醒用户。
- **技术**：Flutter 和 Dart 版本、状态管理，Markdown、代码高亮、diff、终端、长列表用的包；Kotlin、Swift、Rust 各写了哪些部分；iOS 版为什么还没发布、卡在哪。
- **许可**：AGPL-3.0 对 MIT 的 Pigcode 意味着什么，哪些只能借鉴思路；标为 MIT 的 `sdk/` 和 `examples/` 里有没有能直接用的。

结论要能直接用在[原型：手机端的主要界面](https://github.com/pigcode/monorepo/issues/94)、[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)、[手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办](https://github.com/pigcode/monorepo/issues/96)、[配对、设备身份与加密](https://github.com/pigcode/monorepo/issues/97)和[通知怎么送到手机](https://github.com/pigcode/monorepo/issues/98)上。只认一手来源：仓库源码、文档和发布说明。

## 结论

- **DSH Go 遥控电脑有两条路，两条路都把电脑上 DSH 自带的 Web API 原样搬到手机上，没有另起一套手机协议。** SSH 路线：手机用 SSH 登录电脑，在远端用 `nohup` 起一个只听 `127.0.0.1` 的 `dsh web`，从它的日志里读启动令牌，再经 SSH 端口转发连过去 [3][22]。DSHarness Remote 路线（下称 DSH Remote）：电脑上的 DSH 装 ds-harness-remote 插件，电脑和手机都连出到 Remote 服务器，按 LAN → P2P → TURN → Relay 自动选路，每条路径上跑同一层 `Noise_IK_25519_ChaChaPoly_SHA256` [6][53]。两条路最后都在手机上得到一个和本机引擎同样接口的客户端对象 [2][6]。
- **外网靠第三方托管的中继，业务内容端到端加密，但首次信任和账号授权都押在服务器上。** 默认服务器 `dsh.r2049.cn` 由 ds-harness-remote 项目提供；完整的多账号服务器不开源，仓库里只有单账号的最小服务器 [51][56]。服务器看得到设备、在线状态、连接时间、选路和 ICE 协调数据、流量大小，看不到 Prompt、输出、工作区路径和文件内容 [52]。主机公钥由服务器分发、首次连接时固定，服务器作恶时可以在首次连接冒名；同账号的任何客户端都被主机自动信任，账号被盗就等于主机被控；还没有 rekey，也没有独立的密码学审查 [6][52][57]。
- **配对有两种：第三方账号登录，或者不用账号的扫码配对；协议能撤销单台手机，但公开代码里没有做这个界面。** 扫码配对：电脑插件出示 180 秒有效的二维码，手机先核对服务器地址和电脑的完整 SHA-256 指纹，再领取一个 8 位验证码，用户在电脑上输入并确认，只有一次机会；完成后这一对「电脑—手机」关系可以用一个接口单独撤销 [54]。托管服务器已经声明支持这套配对 [61]。但电脑插件和 DSH Go 的公开代码都只实现了「退出并撤销本设备」，没有列出、撤销某台手机的界面 [24][60]。
- **会话协议做得很完整：每次订阅先给快照，之后的持久事件序号严格连续，有缺口就按序号补齐；待处理的审批和提问对每个新连接重投。** 快照里带正在输出的那一段；流式增量带 revision，跳号就重新同步；首屏回溯到一轮开头、至少 50 条消息和 2 轮，上限 500 条，上翻用同样的窗口按 `beforeSeq` 分页；发送带 `requestId`，结果未知时重发由主机去重 [40][38][2]。中继层自己不缓存、不重放任何东西 [55][53]。
- **界面上值得借鉴的是：点加文字的连接状态、每行最多一个标记的会话列表、跑完自动收成一行的过程、挂在工具调用下的审批卡、贴在对话底部的排队消息、每轮末尾的改动卡。** 会话列表按「全部 / 运行中 / 待确认 / 未读」筛选，按今天、昨天、本周、更早分组，当前主机放在列表底部 [26][27][19]；会话页顶栏标题下一行按优先级显示「正在连接 / 连接已断开 / 重新连接中 / 正在同步对话 / 等你确认 / 生成中」，否则显示主机名 [31]；一轮跑完，思考和工具调用收成「已完成 · 5 次工具调用 · 1 条消息」，下面是回答和「改动了 2 个文件」卡片，点进去是左右滑切文件的全屏 diff [32][34][19]。
- **要避开的是：一次只能连一台主机、未读记在手机上、「本对话都允许」只存在手机内存里、断线后的列表只缓存在内存里、长对话首屏太重。** DSH Remote 一次只连一台主机，切换就断开上一台 [3][6]；未读是每台手机按主机自己记的「上次看到的活动时间」[28]；「本对话都允许」由手机替用户自动点「允许本次」，App 重启就失效，远程协议本身也只允许单次允许或拒绝 [38][4][55]；用户报告长对话首屏快照 1.2–4.3 MB，蜂窝网下从打开到能输入要 5–8 秒，超长对话直接闪退 [50]。
- **通知完全由手机本地发，没有 APNs 或 FCM；iOS 版因此离开 App 就收不到提醒。** 安卓上 App 进程活着并且连着主机时，跑完、出错或被停下、等你确认、向你提问会发系统通知；能完整显示要批准什么时，通知上直接带「拒绝」「允许本次」[41][42]。代码注释写明远程主机的提醒是尽力而为，只在 App 进程活着、链路连着时才有 [41]。iOS README 写明「锁屏和离开应用后的提醒要 APNs，还没做」[12]。App 进后台 30 秒后，远程对话停止逐字推送，回前台再从快照接上 [38][48]。
- **技术栈是 Flutter 3.47.7 加 Riverpod 3，远程这条线全部是纯 Dart；iOS 只发未签名包，正式发布前还有几件事没定。** Markdown 用 gpt_markdown 加自写的流式修补，代码高亮用 re_highlight，终端用 xterm，diff 自己画，聊天列表是自写的「居中锚定」滚动视图 [44][11][36]。Noise、SSH、WebRTC 信令都写在纯 Dart 包里，手机端单是 DSH 客户端和远程协议两个包就有约 3.1 万行 Dart [2][6]。Kotlin 写本机运行环境、手机操控、通知和自更新，Swift 写 iOS 本机引擎、手机操控和小组件，Rust 只用在 iOS 手机操控的一个组件里 [2][12][46]。iOS 从 1.2.0 起附未签名 IPA，要用户自己签；APNs、凭据能不能落盘、分享扩展的非公开用法等发行前事项还没定 [48][12]。
- **许可：AGPL-3.0 的代码 Pigcode 只能看、不能抄，但它最有用的几块都有 MIT 的上游。** 远程协议、Noise 和选路的 Dart 代码移植自 ds-harness-remote（MIT，TypeScript）；聊天页、输入框、审批卡、提问卡和抽屉的结构与部分实现来自 PiPilot（MIT）；若干组件参照 DeepSeek Harness 官方 Web 客户端（MIT）[14]。ds-harness-remote 自己的手机客户端就是 Expo SDK 57 加 React Native 0.86，用 `workspace:*` 共享 TS 写的协议和 Noise 包 [59]。DSH Go 标为 MIT 的 `sdk/`、`examples/` 是给它的原生插件写声明式界面的工具包和示例，与连接、配对、会话无关 [17][18]。

### 对决策票的直接含义（详见第 9 节）

- 原型：手机端的主要界面：照搬连接状态的两处位置、会话行的单一标记、跑完收起的过程、内联审批卡、排队消息条和改动卡；未读、自动允许、断线缓存这三处改成以电脑为准。
- 手机端技术栈：DSH Go 说明 Flutter 能做到这个程度，代价是用 Dart 重写客户端和协议；ds-harness-remote 的 Expo 客户端才是 Pigcode 选型的直接先例。
- 手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办：DSH Remote 的拓扑与本仓库的连接调研一致；要补的是最后在线时间、首连别等打洞、电脑醒来后的恢复。
- 配对、设备身份与加密：同一个 Noise 套件可以直接拿上游的跨实现测试向量；配对流程可借鉴，但信任根要放在二维码里的电脑公钥上，撤销要在电脑上做。
- 通知怎么送到手机：DSH Go 是反例，没有推送就等于 iOS 上没有提醒；它的事件分类、抑制规则和通知上审批的条件可以照搬。

## 1. DSH Go 是什么

- 社区开发的 DeepSeek Harness 手机 App，与 DeepSeek 无关。安卓已发布（Android 8 以上，APK 侧载，不是 Google Play 发布配置）；iOS 仍在开发和真机测试 [1]。1.0.0 发布于 2026-10-30，到 1.3.0（2026-11-20）三周内发了 20 个版本 [48]。
- 第一次打开时选「本机」「远程主机」或「和角色聊天」（DSH Go 的叫法）；只连远程主机时手机上不必装运行环境 [3][1]。对话、工作区和插件都属于各自的主机，换了主机，列表里就是那台主机的对话 [3][4]。
- 本机运行（只作概括，Pigcode 不在手机上跑 Agent）：安卓在 PRoot 里的 Ubuntu 24.04 上跑打过补丁的 `dsh web`，1.3.0 起在 Android 10 以上默认改用 tawcroot 启动；由 Kotlin 前台服务托管 [2][48]。iOS 在 App 进程里用 NodeMobile 跑 `dsh web`，可选装一个 iSH 的 Alpine Linux；鸿蒙用进程内的 Node [2][12]。
- 规模（本次在 `da79802` 上用 `wc -l` 统计）：`app/lib` 约 35.5 万行 Dart（不含生成的文案），Kotlin 约 6.3 万行（不含测试），Swift 约 2.7 万行；`packages/dsh_client` 约 2.3 万行、`packages/dsh_remote` 约 7,900 行。

## 2. 连接

### 2.1 三种主机，一次只连一台

- DSH Go 的主机分三种：本机、SSH 主机、DSH Remote 主机；`_connectionForHost()` 是唯一的装配点，全 App 只认一个「当前主机」[20][2]。
- 打开 App 时默认连回上次用的主机，可以在远程主机页关掉 [3]。
- 远程路线在架构上是「另开一条加密隧道（SSH 或 WebRTC/中继），复用同一个 DshClient」[2]。

### 2.2 SSH 路线

- **前提**：那台电脑开着 SSH，装好 DSH（`npm i -g @deepseek-ai/dsh`）。手机上填主机、用户名、端口，选密码或私钥（可带口令）；密码、私钥和 DSH 登录令牌只存在手机的安全存储里 [3]。
- **主机指纹**：首次连接弹「信任这台主机？」，用户在电脑上核对指纹后才连；指纹变了就断开并报「主机指纹和上次不一致，已断开」[3][22][47]。
- **托管启动**（默认）：手机经 SSH 在远端执行 `<启动命令> --host 127.0.0.1 --port 0 --no-open`，放在 `nohup` 下，所以它比这次 SSH 会话活得久，下次连接直接复用；`~/.dsh-app-remote/` 下记 pid、日志和启动命令，日志每次启动截断，令牌从最后一行 `dsh web: http://…?token=` 读 [22]。启动命令不同或日志丢失的存活实例不会被自动杀掉，要用户明确选「重启托管 DSH」；确认已死的托管进程会自动补启 [3]。依赖远端的 POSIX shell，报错文案写「主机上没有 sh，只支持 Linux 和 macOS」[47]。
- **只连接**：用户自己管理实例，填远端端口和令牌；App 只建隧道，不启动、不停止、不重启 [3]。
- **隧道和登录**：本地端口转发到远端 `127.0.0.1:<端口>`，请求带 `Host: 127.0.0.1:<端口>` 以通过 DSH 的 Host 检查 [22]。DSH 的 `dsh web` 默认只绑 loopback，绑到非 loopback 且用明文 HTTP 时启动会警告；Connection 插件检查 Host 和 Origin [63]。DSH Go 用启动令牌请求 `GET /?token=…`，换到一个绑定 `host:port` 的会话 Cookie（默认 30 天），之后的 HTTP 和 WebSocket 都带它、不带 Origin [40][2][64]。
- **保活和重连**：每 15 秒发一次 keepalive，10 秒没回应算断；断开后指数退避重试（1 秒起、30 秒封顶，默认最多 8 次），网络变化或 App 回到前台时立即重试 [22][21]。1.0.16 起支持认证后的 SSH 压缩 [3][48]。
- **外网**：SSH 路线自己不做任何穿透，手机必须能直接连到电脑的 SSH 端口（推论：外网要靠公网地址、端口转发或组网工具）。

### 2.3 DSH Remote 路线

- **组成**：电脑上的 DSH（桌面版或 `dsh web`）装 `ds-harness-remote` 插件并登录；手机登录同一个账号，或者扫码配对 [3][51]。电脑一侧是 DSH 的插件，不要求单独的命令行程序 [54]；Linux 服务器可以一键装成 systemd 服务（要 root）[51]。
- **拓扑**：主机和客户端都主动连出到 `wss://<server>/ws/v1/connect`，主机不监听公网端口，也不要路由器端口转发 [53]。网络分三个平面 [53]：
  - REST：登录、设备注册、token 轮换、主机列表和在线状态、受 membership 保护的公钥查询、按连接签发的短期 TURN 凭据；
  - Control：`hello` 和能力协商、`connect.request/incoming/accepted`、WebRTC 信令、Noise 握手字节的中转、`transport.selected`、心跳；
  - 数据：WebRTC DataChannel，或服务器分配的独立 Relay 数据 WebSocket（凭一次性 ticket `relay.attach`）。Relay 节点不需要数据库或主服务密钥。
- **选路**（DSH Go 1.0.4 起默认自动，1.0.3 时是默认关闭的可选项）[48][8][6]：
  - 先 LAN/P2P：两者共用第一轮 ICE 探测，这一轮去掉 TURN 并过滤双方的 relay 候选；确认在蜂窝网络时跳过 LAN；
  - 再 TURN：新建一条授权连接，重新取 TURN 凭据，只用 relay 候选；
  - 最后新建一条纯 Relay 连接。Noise 只在最终选中的连接上握手一次；
  - 每个 WebRTC 阶段默认 8 秒、服务器允许时最多 15 秒，首次连接总预算 45 秒；失败的路径按主机冷却 45 秒，网络变化时清除冷却。
- **上游已有、DSH Go 没做的两项**：上游协议允许服务器支持时并行准备直连和 TURN 两条候选连接（直连优先 3 秒），以及 Relay 回落后在同一 Noise 会话里升级到 WebRTC，不重开订阅；但同一节也规定手机端的自动连接要先协商直连、再做 Noise 认证和首屏读取 [55]。DSH Go 代码里没有这两项的实现（代码检索的推论）。
- **加密**：固定 `Noise_IK_25519_ChaChaPoly_SHA256`。Noise 的 prologue 绑定 `DSH-REMOTE`、协议版本、本次 `connectionId`、主机和客户端的 `deviceId`，握手不能被搬到别的连接上；超过 48 KiB 的消息先在加密通道内分片，重组上限 4 MiB；重复、乱序、伪造的密文直接关闭通道 [52][6]。WSS、WebRTC 的 DTLS 只是外层，业务数据的安全边界是 Noise [52]。
- **服务器能看到什么** [52]：

| 能看到 | 看不到 |
|---|---|
| 账号与设备归属、设备 ID、角色、显示名、公开的身份公钥 | Prompt、对话消息、模型输出 |
| 主机和客户端的在线状态、连接时间、`connectionId` | 工具的输入和输出 |
| 协议版本、能力、所选网络路径 | 工作区路径、源码、文件预览 |
| WebRTC 信令、ICE/TURN 协调数据 | Noise 传输密钥、设备私钥 |
| Relay 帧的大小、方向、时序和流量规模 | Remote RPC 的方法名、参数和结果 |

- **谁运营**：默认用 ds-harness-remote 项目提供的托管服务器 `https://dsh.r2049.cn`，README 写「优先使用 P2P 网络，全球多 TURN 节点中转，极端情况下使用多 Server Relay 兜底」[51]。完整的多账号服务器、Remote Web 和管理后台在独立仓库、不开源；本仓库的自部署服务器只有单账号，TURN 要自己部署 coturn [56]。托管服务器在哪、域名是否备案，没有找到一手来源（首页和前端脚本里都没有备案号）。
- **多客户端**：同一台主机可以同时被多个客户端连接，RPC 和数据流按连接隔离 [51]；但服务器只允许一台客户端设备同时连一台主机，DSH Go 连另一台主机会关掉上一条连接 [6][3]。
- **手机上看得到的连接信息**：抽屉底部主机名旁直接显示实际路径（「LAN 局域网」「P2P 点对点」「TURN」「Relay 中继」）；点主机图标打开「网络详情」：路径、连接耗时、可测时的往返延迟、回落原因、所选 ICE 候选对的 IPv4/IPv6 和 UDP/TCP，不显示原始 IP、SDP 和凭据 [26][25][8][47]。
- **验证边界**：DSH Go 的验证记录写明，只在 Android 35 x86_64 模拟器上跑通过真实的 P2P（连接 1,932 ms）和纯 Relay（1,173 ms），阻断直连后回落 Relay 用了 13,542 ms；没有真机、公网 NAT 和真实 TURN 的验证 [7][8]。用户在 issue 里报告，蜂窝网下从打开 App 或切网到能输入要 5–8 秒：冷启动后 1.4–1.9 秒还没开始连，等 WebRTC 打洞 1.8–2.3 秒，首屏一起下来 2 MB 以上未压缩的 JSON 又要 1.5–4.0 秒；其中 Noise 解密只占约 75 ms [50]。

### 2.4 电脑睡眠、断网或 DSH 退出时手机上看到什么

| 情况 | SSH 路线 | DSH Remote 路线 |
|---|---|---|
| 电脑睡眠或断网 | keepalive 失败后进入「重新连接中 · 第 N 次」，退避重试用完后停在「连接失败」，带「重试」[22][21][47] | 服务器 25 秒一次心跳、75 秒没有 pong 就断开主机 [55]；手机每次重连先查主机在线状态，不在线就报「主机现在不在线」并按退避重试，用完后停在「连接失败」[23][21][47] |
| 电脑醒来 | 回到前台或网络变化时立即重连，复用仍在运行的 `dsh web` [22][21] | 主机插件重连服务器后，手机在下一次重试、回到前台或点「重试」时连上（推论）[53][21] |
| DSH 退出 | 托管模式确认进程已死时自动补启；只连接模式报「远端 DSH 端口连不上」[3][47] | 插件跑在 DSH 里，DSH 退出就和主机离线一样（推论）[54] |

- 「切换主机」面板里，Remote 主机按服务器报告的在线状态显示「在线」或「离线」[25]。服务器接口返回每台设备的 `lastSeenAt`，但 DSH Go 界面里没有显示最后在线时间的地方（代码检索的推论）[24]。
- 抽屉的空状态分别是「正在连接「X」…」（下面写当前步骤）、「正在重新连接「X」…」加「立即重试」、「连不上「X」」加原因和「重试」[26][47]。已经拉到过的列表在断线时只读显示，标题后面加「离线 · 上次结果」，待确认和未读标记隐藏；这份缓存只在内存里，上限 2 MiB，App 重启后就没有了 [29][47]。
- 会话页顶栏显示「连接已断开」或「重新连接中」[31][47]。
- 断线后上游不维护通用的事件重放缓冲：关闭这条连接，重新做 membership 和公钥校验、选路和 Noise 握手，重开订阅、重读历史基线，不重放结果未知的修改 [53][55]。
- 电脑一侧没有阻止睡眠的功能：在 ds-harness-remote 仓库里检索 `caffeinate`、keep awake、阻止休眠，只找到手机客户端自己的保持唤醒（推论）。上游待办里，「真实网络切换、休眠/唤醒、代理、高延迟和长连接矩阵」和「Android 后台、息屏 1、5、15 分钟下的链路状态」都还没验证 [57]。

## 3. 配对和设备身份

### 3.1 账号登录（DSH Remote 的默认方式）

- 手机在浏览器（Custom Tab）里完成第三方登录，不需要 App 自己的 URL scheme，期间每 2 秒轮询结果；自建服务器用邮箱和密码 [6]。2026-11-21 托管服务器列出的登录方式是知乎、GitHub、Google [61]。
- 每台设备按服务器 origin 各生成一把 X25519 身份密钥，私钥和 token 只放在系统安全存储里；refresh token 每次刷新都轮换，复用旧的会让整串 token 失效 [6]。
- 主机信任：连接前从服务器取主机描述，首次连接固定主机公钥（可以先弹窗让用户核对 48 位的短指纹，形如 `ABCD EF01 2345`），之后公钥变了一律拒绝（`PEER_IDENTITY_MISMATCH`）[6][24]。
- 授权边界：同账号的 membership 和本地固定的公钥两者都要满足 [52]。但上游主机自动信任同账号的任何客户端，所以账号被盗等于主机被控；服务器被攻破或作恶时，可以给同账号伪造新设备描述，让首次连接固定攻击者的公钥 [6][52]。
- 在托管 Web 的主机列表里可以给某台设备打开「仅被控」，它就看不到账号下的其他设备 [51][52]。

### 3.2 扫码配对（dsh-pairing-v1，不用 Remote 账号）

- **流程** [54][47]：
  1. 电脑插件向服务器创建配对会话，有效期 180 秒，显示二维码 `https://dsh.r2049.cn/pair#v1.<ticket>`；ticket 是 32 字节随机数，服务器只存它的摘要。
  2. 手机直接解析扫码文本，不打开网页、不跟随重定向，先让用户确认服务器地址；也可以从相册识码或粘贴配对链接。
  3. 手机用 ticket 向服务器取电脑的设备描述（只读，不消耗机会），界面问「要连接这台电脑吗？」，显示电脑名、服务器和完整指纹 `lowercaseHex(SHA256(公钥))`，提示和电脑插件上显示的核对一致再继续。
  4. 用户确认后手机领取，拿到 8 位验证码，界面写「在电脑上输入这 8 位验证码」「只有一次机会：输错后这次配对作废」。
  5. 用户在电脑插件里输入验证码并点「确认绑定」，服务器只校验一次。
  6. 双方各自取回独立的设备凭据，手机固定电脑公钥后自动连接。
- **私钥持有证明**：领取、查询、确认和取消请求都带一个 HMAC（创建会话和解析 ticket 不带）：用设备私钥和服务器这次会话的临时公钥做 X25519，经 HKDF-SHA256（salt 为会话 ID、info 区分电脑和手机）导出密钥，对「方法、路径、请求体的 SHA-256」签名 [54]。
- **为什么验证码由手机显示、在电脑上输入**：文档写明服务器能验证私钥持有和验证码，但不能仅凭 HTTP 请求证明是真人点击，所以最终提交必须放在电脑本机的专用界面，模型工具、远程客户端都不能调用 [54]。
- **身份**：两端都是新设备时，服务器新建一个无密码的内部账号 `dsh-device:<UUID>` 放它们；一端已登记时沿用那一端的所有者。新配对的设备标为「配对受限」，只授权这一对，不享受同账号设备之间的自动授权 [54]。DSH Go 要求先登录 DeepSeek，只把 DeepSeek 账号 ID 作为未验证的元数据带上，不传密码、Cookie 或 token [47][54]。
- **信任根**：短二维码里只有 ticket，电脑公钥来自用户确认过的 HTTPS 服务器，文档承认服务器被攻破时短格式没有独立于服务器的电脑身份保证；旧的完整 JSON 二维码里直接带电脑公钥 [54]。
- **状态**：DSH Go 1.0.14 加入扫码入口，写明「线上服务器目前还没开」；1.0.15 修了相机打不开的问题；两个版本都写明没有在真机上验证 [48]。2026-11-21 托管服务器的登录方式接口已经声明 `devicePairing: dsh-pairing-v1` 和 `devicePairingQr: fragment-ticket-v1` [61]。

### 3.3 撤销

- 协议：`DELETE /api/v1/device-memberships/{peerDeviceId}` 撤销本设备与某台设备的这一条关系，不删除设备或账号，不影响其他手机；服务器发布授权变更，并只断开这一对设备的连接。文档也写明，断网时的端到端 P2P 不能由服务器保证瞬时断流 [54]。设备撤销后，在线端看到撤销会关闭活动连接 [52]。
- 实现：电脑插件和 DSH Go 的公开代码都没有调用这个接口，只有「退出并撤销本设备」（`DELETE /api/v1/devices/self`）；DSH Go 退出登录时尽力撤销本设备并删除 token，撤销成功时连身份密钥一起删，已固定的主机公钥保留 [60][24][6]。托管 Web 的设备管理不开源，能否逐台撤销没有核实。
- SSH 主机没有设备身份：凭据就是 SSH 密码或私钥加 DSH 令牌；在手机上删除主机只移除手机上的配置和凭据，远端不受影响 [3]。要拒绝某台手机，只能在电脑上换 SSH 凭据（推论）。

## 4. 协议

### 4.1 分层

- 电脑上的 DSH 自带 Web API：一元调用是 `POST /api/<命名空间>/<方法>`，信封为 `{type:"client-request", rpcId, method, payload}`；流走 WebSocket `/api/remote.mux`，每一代先开 `$events` 流且首帧必须是 `ready`，帧词汇是 `open/item/end/cancel`；跨 socket 不重放任何东西 [2]。业务错误用 HTTP 200 加 `ok:false`，只有传输拒绝用 4xx [2]。
- SSH 路线直接走这套 HTTP/WS [2][22]。DSH Remote 路线把同样的调用装进加密通道里的 `harness.remote.call` 和 `harness.remote.stream.*`，主机插件解密后只按编译期固定的白名单调用 DSH 的官方接口 [6][55]。
- 远程与本机的差异：不在白名单里的方法在手机本地就报 `METHOD_NOT_ALLOWED`；2 MiB 以内的调用直传，更大的按 512 KiB 分块，超过 4 MiB 的响应改走分块传输；每条连接最多 16 条流；不支持上行流 [6]。

### 4.2 会话列表

- `session/list` 一次拉全量，没有分页 [40]。之后靠 `$events` 里的会话增删和状态事件就地更新，或在 400 ms 防抖后重新拉；每次重连就绪后重拉一次 [30]。1.0.2 起不再在每次状态变化时整份重新下载 [48]。
- 「待确认 / 计划待审 / 待回答」来自主机对每个新连接重投的待处理请求；请求要等 800 ms 才标记，在另一台设备上立刻被回答的不会闪一下；子代理的请求算在顶层对话上 [28]。
- 「未读」由手机自己算：按主机记下每个对话上次看到的活动时间（主机时钟），第一次看到时已有的都算看过 [28]。

### 4.3 历史分页、流式输出和断线补齐

- 订阅一个对话用 `session/follow`，客户端保证 [40]：
  1. 每一代订阅都以快照开头；重新同步时快照覆盖上次交付之后的全部持久事件，缺的部分用 `session/page` 补齐，按 `seq` 合并不会留洞；
  2. 快照之后的持久事件 `seq` 严格连续，重复的丢掉，缺口先补齐再交付；
  3. 助手的流式增量按 revision 检查连续性，跳号就强制重新同步，新快照里带正在进行的那次输出（`activeAttempt`）；
  4. 这个对话的审批和提问请求也在流里，包括订阅时已经在等的；重连后可能以同一个 `eventId` 再来一次，按它去重。
- 首屏窗口和官方 Web 客户端一样：回溯到一轮的开头，至少 50 条消息、2 轮，硬上限 500 条；上翻时用最旧的 `seq` 作 `beforeSeq`，按同样的窗口拉 [40][38]。
- 重连：底层每断一次就退避（0.5–10 秒）重建连接，开新的一代、重开流，订阅以 `isResync` 快照接上；连续 6 次瞬时失败才结束 [6][40]。DSH Remote 每 25 秒还做一次健康探测，5 秒没回应算断 [6]。
- 「精简历史」（默认关）：支持的主机把历史里的工具参数和输出换成摘要，正文、实时流和审批不变；一个客户端对象的模式固定，换模式要重新选主机 [3][6]。
- 上游协议同样把通用的事件重放缓冲撤掉了：重连后由各自的领域重新读历史基线，`seq` 在同一主机身份上严格递增 [55]。

### 4.4 发送、插话、排队和停止

- `session/prompt` 带 `requestId` 和 `mode`：`queue` 等下一轮，`steer` 插进正在跑的这一轮的下一步；同一个 `requestId` 重试是幂等的 [40]。连接中断、结果未知时用同一个 `requestId` 重发，由主机去重 [2]。
- 消息离开 Agent 收件箱后主机才写 `user/message`；在那之前手机显示乐观气泡，等同一个 `requestId` 的回声到了再替换 [38]。
- 排队中的消息由主机的收件箱持有，主机报告收件箱 ID 后，手机可以用 `session/updateQueue` 编辑、撤回，或把它改为插话 [40][38]。
- 停止是 `session/cancel`，空闲时也回答成功 [40]。「中断并发送」是先停再发；停不下来就改成插话发出，并提示「没能停下本轮，已作为插话发送」[38][47]。

### 4.5 审批和提问

- 主机发 `approval/request` 和 `user-questions/request`，客户端经 `$events/result` 回答；重连后按同一个 `eventId` 重投，已经结算的不再出现 [2][40]。
- 远程协议只允许单次允许（`allow_once`）和拒绝，不得伪造会话级授权；同一会话最多 16 个待处理的审批 [55]。
- 「本对话都允许」是手机这一侧的开关：打开后，手机替用户对这个对话之后的审批自动回答「允许本次」，正在等的也一并放行；App 重启后恢复逐次询问 [38][4]。

## 5. 界面

### 5.1 截图

下面是 README 的展示图（同一段示例对话反复出现，是按 App 界面做的展示图；本次转成 PNG 逐张看过，`f-lang` 未看图）。链接都是浅色中文版，深色版把文件名里的 `light` 换成 `dark` [19]。

- [`f-remote-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-remote-zh-light.webp)：三台手机。左边是本机上的对话，标题胶囊下一行是绿点「本机」。中间是「切换主机」面板：「本机 · 这台手机上的 DSH · 运行中」「电脑 · SSH · me@192.168.1.20 · 已连接 ✓」「工作室 Mac · 远程 · macOS · 在线」，底部「管理远程主机」。右边是电脑上的对话，标题下绿点「电脑」；回答上方一行「已完成 · 5 次工具调用 · 1 条消息 ⌄」，回答下方脚注「35 秒 · 4 步 · 3.4 万 tokens ›」，再下面是改动卡「改动了 2 个文件 +17 −3」，两行文件各带目录和 +/−，底栏「查看改动 ›」。
- [`f-steer-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-steer-zh-light.webp)：左边生成中：标题下「生成中」；过程逐行展开（「思考 · …」可展开、「读取 · 账单-10月.csv」「运行 · python3 make_sheet.py …」，最后一行带转圈）；对话底部是一条排队的用户消息，下面一行「排队中 · 本轮结束后发送　立即发送　改为插话　撤回」；输入框上方的活动条「跑 python3 make_chart.py 0:20」；输入框占位「生成中 · 可直接插话」，发送键变成停止键。右边同一对话跑完：过程收成一行「已完成 · 3 次工具调用 · 1 条消息」，下面是回答、脚注和「交付了 2 个文件」卡片。
- [`f-adaptive-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-adaptive-zh-light.webp)：平板上侧栏常驻：顶部「DSH」、一个圆形切换键和「新对话」按钮，下面「搜索对话」和「⋯」，一排筛选「全部 / 运行中 / 待确认 / 未读」，列表按「今天 / 昨天 / 本周 / 更早」分组，底部是「本机 · 运行中 ⌃」主机栏和两个圆键；右下角是横屏手机。
- [`f-web-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-web-zh-light.webp)：同一段对话的原生界面和官方 DSH Web 的手机布局（右边有「对话 / 轨迹」两个标签），中间是切换按钮。
- [`f-phone-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-phone-zh-light.webp)：手机操控设置页和「确认方式」面板（每次都询问 / 本任务免确认 / 始终免确认），与 Pigcode 无关。
- [`f-share-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-share-zh-light.webp)、[`f-theme-zh-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-theme-zh-light.webp)、[`f-lang-light.webp`](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-lang-light.webp)：分享卡和对话回放、主题配色、中英文界面，与本票无关（`f-lang` 未看图，按 README 的说明是「同一段对话的中文与英文界面」[1]）。
- `docs/guide/` 里没有配图。

### 5.2 外壳

- 手机上的主界面是聊天页；左上角菜单键或从左缘右滑打开对话列表抽屉；从右往左滑出「快捷入口」，打开着对话时是这段对话的「信息 / 插件」面板 [2][4]。宽度 840dp 以上侧栏常驻 [2][19]。
- 手机顶栏：菜单键、标题胶囊（标题和一行状态）、新对话键；模型不在顶栏，点进输入框后显示在输入框下方，平板上才在顶栏放模型胶囊 [4]。README 展示图里手机顶栏还有模型胶囊「V4 Pro · 高」，比当前指南描述的旧 [19][4]。

### 5.3 主机切换和连接状态

- 抽屉最底部是「身份栏」：主机图标（远程主机打开「网络详情」，本机打开引擎页）、「主机名 · 状态 ⌄」（点它切换主机；远程连上时状态换成实际路径），后面是「全部功能」「设置」两个圆键 [26][4]。
- 「切换主机」面板依次列本机、每台 SSH 主机（副标题 `SSH · 用户@地址`）、账号下每台 Remote 主机（副标题「远程 · macOS」）。只有本机和当前主机显示实时状态；Remote 主机显示在线或离线；没连着的 SSH 主机不显示状态，代码注释说为了显示一个点去登录不值得；有两台以上 Remote 主机时提示「DSH Remote 一次只连一台主机，切换会断开上一台」[25][47]。
- 状态总是「点 + 文字」，代码注释写明颜色从不单独表达状态 [25][31]。连接中逐步显示「连接服务器 → 验证主机指纹 → 启动 DSH → 建立隧道 → 登录」，重连时显示「重新连接中 · 第 N 次」[21][47]。
- 会话页顶栏标题下那一行按这个顺序取第一个成立的：未连接时「正在启动 / 正在连接 / 未连接」；订阅断了「连接已断开」；底层在重连「重新连接中」；「正在同步对话」；「正在停止」；有审批「等你确认」、有提问「等你回答」（读屏会念出具体内容）；运行中「生成中」；否则显示主机标签，如「本机」「电脑 · SSH」「家里的 Mac · 远程」[31][47][20]。
- 远程连不上时，新对话空状态的主按钮变成「重新连接」[39]。

### 5.4 会话列表

- 抽屉从上到下：品牌和「新对话」、搜索、工作区切换器和列表选项「⋯」、状态筛选、当前主机的对话（置顶、文件夹、再按天分组）、底部身份栏 [26][19]。
- 每行 44 高，只放标题，行尾最多一个标记，优先级是：等待的事用警示色文字（「待确认」「计划待审」「待回答」）> 运行中的呼吸点 > 未读的灰点 [27][47]。
- 筛选胶囊「全部 / 运行中 / 待确认 / 未读」，待确认和未读带数量；「⋯」里按最近活动或创建时间排序、管理文件夹 [27][4]。
- 长按：置顶、重命名、移到文件夹、分享、多选、归档、永久删除；归档后 4 秒内可以撤销 [4]。
- 列表只属于当前主机，没有跨主机合并的列表；选了工作区就只看这个工作区的对话 [3][4][26]。

### 5.5 时间线：过程折叠和活动条

- 运行中，思考、读取、运行等步骤逐行出现；一轮结束后，整轮过程收成一行安静的摘要「已完成 · N 次工具调用 · M 条消息」（只有思考时写「N 段思考」），点开后在下面按原样列出，左边一道细线表示属于这一轮；展开和收起时摘要行在屏幕上不动 [32][19]。
- 回答下方的脚注（用时、步数、token）打开本轮的轨迹 [19][37]。
- 生成中，输入框正上方有一颗「活动条」胶囊：此刻在做什么、一句自述或趣味文案、本轮用时，有待办时右端显示进度；点它看本轮轨迹 [37]。
- 输入框上方的待办条、目标条、活动条和插件状态行叠成一摞卡片，默认叠起，点开展开，上下滑换到前面 [37]。
- 聊天列表是「居中锚定」的滚动视图：中心以上是打开对话时已有的行（向上长，加载更早的历史接在最上面），中心以下是之后新来的行（流式增长只发生在这一段）；所以加载历史和流式输出都不移动用户正在看的内容；贴底时跟随，用户上翻后不打扰 [36]。
- 流式 Markdown 只修补未完成的尾部（参照 Vercel Streamdown 的做法）：没闭合的粗体、行内代码先替它闭合，半截链接先按链接显示，半截图片和只有标记的行先不显示，没闭合的公式先显示源码 [11]。

### 5.6 插话和排队

- 生成中输入框占位是「生成中 · 可直接插话」，直接发送就是插话：不打断，AI 下一步会看到 [4][47]。
- 长按发送键选「插话 / 中断并发送 / 排队」[4]。
- 插话和排队的消息显示在对话底部，带「立即发送」「改为插话」「撤回」；撤回的内容回到输入框 [4][19]。
- 输入框为空时，生成中的发送键变成停止键；停止后，排队的消息接着开始下一轮 [4]。外接键盘在半秒内连按两次 Esc 停止 [4]。

### 5.7 审批和提问

- 审批卡内联在时间线里，挂在等待审批的那个工具调用下面 [35][36]。代码注释的定位是「屏幕上最显眼的东西，但不靠大红色」：警示色盾牌和细线，标题直接问「允许运行这条命令？」，下面是说明、等宽的命令框、理由；「拒绝」和「允许本次」等宽并排，主色只给「允许本次」；更宽的「本对话都允许」降为文字按钮，点了还要先确认风险 [35][47]。
- 提问卡用同一套结构：选项是可选中的行，可以「其他回答」自己写，底部通栏「提交」；能拒绝时和「不回答」左右并排；选到一半滚出屏幕或切到别的对话，选择和自填都保留 [35]。
- 只有一个问题在等、没有审批和附件时，可以直接在输入框里回答，输入框一直显示「发送文字将回答待答问题」[4][47]。回答后对话保留「已回答」和答案 [4]。
- 等待时顶栏状态变成「等你确认」或「等你回答」[31]。「本对话都允许」打开后，输入框上方一直显示「自动允许中」，点它关闭 [4]。

### 5.8 新建会话

- 点「新对话」先进空白页，发出第一条消息才建立对话，只打开新对话页不会留下空对话 [4]。
- 空状态：一个工作区胶囊，下面一行轻量选项：Agent 预设、权限、放进抽屉的哪个文件夹；模型在输入框下方；这些选择先存着，第一条消息建对话时一并应用 [39][4]。主按钮最多一个，只在需要时出现（例如「重新连接」）；下面是两列建议卡片 [39]。
- 没选工作区时，新对话落到最近用过的工作区，并在新对话页上显示出来；主机上一个工作区都没有时写明「主机默认目录」[48]。
- 工作区是主机上的目录，远程主机上不存在的目录选不到；「添加工作区」选择主机上的目录 [5]。

### 5.9 改动和 diff

- 改动卡：一轮结束时接在回答后面，标题「改动了 N 个文件」和总 +/−；最多列 3 个文件（文件名、目录、+/−，新建的标「新建」），底栏「查看改动」，文件多时写「还有 N 个文件」；点某个文件直接打开那个文件 [34][47][19]。
- 改动从本轮成功的 `write`、`edit`、`str_replace_editor` 调用里算：优先用 DSH 结果里算好的 hunk，其次用参数里的新旧文本，新建文件全算新增；bash 里 `sed -i`、重定向写的文件看不出来；行号靠同一轮更早读过的内容对位，对不上就不编号 [33]。
- 全屏 diff 页：顶上一排文件胶囊，左右滑切换文件；每个文件是带行号栏的统一 diff；右上角是换行开关和「复制补丁」。默认换行，因为不换行时横向滚动会吃掉左右滑切文件的手势 [34]。
- 另有「交付了 N 个文件」的产物卡，列本轮交付的文件 [19][14]。

## 6. 推送和后台

- **没有远程推送**：`app/pubspec.yaml`、安卓的 Gradle 和 Manifest、iOS 的 Info.plist、权限文件和 Swift 源码里都检索不到 Firebase、FCM、APNs 或其他推送通道；iOS 权限文件只有 App Group 和 Keychain 共享 [44][43]。
- **通知怎么来**：App 自己监视本机引擎和当前远程主机的事件，在后台发系统通知、在前台弹横幅；代码注释写明远程主机是尽力而为，只在 App 进程活着、链路连着时才有提醒 [41]。
- **事件和开关**：通知设置有总开关，以及一轮完成、出错或被停下、等你确认、向你提问、实时活动五个分项，默认全开 [41]。
- **抑制规则**：App 在后台时发系统通知；在前台时，正在看的那个对话不提醒，别的对话弹横幅；桌宠在屏幕上时由它的气泡提醒，只提醒一次 [41]。请求等 800 ms 再提醒，重连后给主机 3 秒重投还在等的请求 [41]。
- **通知上直接审批**：安卓上「等你确认」的通知只在能完整说清要批准什么时，才带「拒绝」「允许本次」两个按钮；点按时要求 App 仍连着这台主机、请求还在等 [42][41]。1.0.15 起，点过按钮但结果还没回来时重发的通知显示「正在处理」，不再给按钮 [48]。锁屏时审批和分组摘要通知只显示公共标题 [48][9]。
- **实时活动**：安卓 16 的 Live Update（状态栏胶囊、通知栏顶部、锁屏），只在系统真的会提升时才发；运行中显示计时，等确认时显示「待确认」；审批按钮只放在通知上，不在实时活动里重复；国行 vivo OriginOS 6 真机上拿不到 [9]。iOS 的 Info.plist 没有 `NSSupportsLiveActivities`，即没有实时活动 [43]。
- **后台**：本机引擎在安卓上靠 `specialUse` 前台服务和唤醒锁，在 iOS 26 上为正在跑的一轮申请系统的持续处理任务；设计文档的结论第一句是「没有“永远不被杀”的移动端保活」[10]。安卓 Manifest 里的两个前台服务分别给本机引擎和桌宠，远程连接没有自己的前台服务 [43]。用户报告连着远程主机时切出去一会儿，回来要重新连接（#810）[50]。App 离开屏幕 30 秒后，远程主机上正在跑的对话停止接收逐字增量，只收持久事件、审批和回合结束，回到屏幕时从新快照接上 [38][48]。
- **iOS**：「通知只在应用运行时发得出去。锁屏和离开应用后的提醒要 APNs，还没做，所以离开应用后等你确认的请求不会提醒你，回到应用才看得到。」[12] 免费 Apple 账号签名时也不能用推送 [12]。
- **对照上游**：ds-harness-remote 自己的 Expo 安卓客户端带一个前台服务的配置插件，文案写「避免熄屏时系统休眠网络，保持与 Host 的稳定长连接」[59]；上游待办里提到部分小米系统会冻结进程、禁用唤醒锁并销毁 TCP，「通知存在或唤醒重连成功不能视为息屏持续联网」[57]。

## 7. 技术

### 7.1 版本和状态管理

- Flutter 3.47.7（工具链脚本和 CI 固定），App 要求 Dart `^3.13.4`（`pubspec.yaml`；README 写的是 `^3.13.5`）[45][44][1]。鸿蒙用 oh-flutter 3.47.9 [2]。
- 状态管理：Riverpod 3（`flutter_riverpod ^3.4.3`），手写 Notifier，不用代码生成；约定一个状态只有一个 owner，界面只通过 notifier 的方法改状态 [2][44]。
- 聊天页有一份「流式性能契约」：`ChatScreen.build` 只 watch 一个 select 元组，完整的聊天状态只在列表里 watch；行缓存依赖条目身份 [2]。

### 7.2 依赖包

| 用途 | 包或做法 |
|---|---|
| Markdown | `gpt_markdown ^1.4.0`，换了 builder，自己做流式修补；公式用它自带的 `val_latex_flutter` [44][11] |
| 代码高亮 | `re_highlight ^0.0.3` [44] |
| diff | 没有 diff 包：用 DSH 给的 hunk 或参数里的新旧文本，自己画统一 diff [33][34] |
| 终端 | `xterm ^4.0.0` [44] |
| 长列表 | 自写的居中锚定 `CustomScrollView`（两段 `SliverList`）；依赖里另有 `scrollable_positioned_list` [36][44] |
| 安全存储 | `flutter_secure_storage ^11.2.0` [44] |
| SSH | 内置改过的 dartssh2 4.1.0（加了认证后的 zlib 压缩）[44][14] |
| WebRTC | `flutter_webrtc ^1.6.3`，只用 DataChannel；让 APK 每个 ABI 多约 16.5 MiB，直连关着也一样 [44][7] |
| 密码学 | `cryptography ^2.9.0`（X25519、ChaCha20-Poly1305）和 `crypto`（SHA-256、HMAC），纯 Dart，在调用方的 isolate 上同步运行，桌面 JIT 约 55 MB/s [6] |
| 扫码 | `mobile_scanner ^7.5.0`，按需初始化 ML Kit [44][3] |
| 网页模式 | `webview_flutter` [44] |
| 网络变化 | `connectivity_plus` [44] |

### 7.3 Kotlin、Swift、Rust 各写了什么

- **远程连接全在 Dart**：`packages/dsh_client`（DSH Web API：连接、RPC、mux、事件、各领域接口，不依赖 Flutter，可单测）和 `packages/dsh_remote`（账号、设备身份、主机列表和公钥固定、Noise IK、Relay、WebRTC 信令、隧道）；WebRTC 本身由 App 用 flutter_webrtc 实现一个接口交进去 [2][6]。
- **Kotlin**：本机运行环境（PRoot 生命周期、前台服务、分层升级）、手机操控（无障碍、Shizuku、ADB）、通知和实时活动、自更新、桌宠悬浮窗，以及文件、媒体、语音、分享、快捷方式、磁贴等平台通道 [2]。
- **Swift**：iOS 本机引擎（同进程 NodeMobile）、可选的 iSH Linux、手机操控（CoreDevice 和 XCTest）、WidgetKit 伙伴小组件、语音、可选的宠物画中画、分享扩展、Siri [2][12]。
- **Rust**：只有 iOS 手机操控用的 `dsh-phone-self-runner`（CoreDevice、RemoteXPC、XCTest 的本机组件），固定 Rust 1.99.1；和远程连接无关 [46]。
- **ArkTS**：鸿蒙宿主 [2]。

### 7.4 iOS 为什么还没正式发布

- README：iOS 版仍在开发和真机测试，需要在 Mac 上自己签名编译 [1]。1.2.0 起每个版本附一个未签名 IPA，要用爱思助手、AltStore 等工具自己签名；用免费 Apple ID 签名时 Bundle ID 会被改掉，Siri、分享扩展、后台等可能用不了；只在少数真机上试过 [48]。
- iOS 工程说明里列出的未定事项 [12]：
  - 离开应用就没有提醒，APNs 还没做；
  - 「完整凭据能不能落盘」还没改，发行前要定；
  - 包里还带着 `assets/engine/`，发行前要决定去留，并生成 iOS 的第三方许可清单；
  - 分享扩展靠响应链唤起主应用，是非公开用法，上架时要重新评估；
  - 后台持续运行、系统动作、系统工具等多项「只编过、没在设备上跑过」；
  - 免费 Apple 账号能不能注册 App Group 还没实测。
- 维护者在 issue 里的说法：2026-11-05 说 iOS 在路线图 P4、只做远程客户端、没有可以承诺的时间（#582）；2026-11-21 对「能上架 App Store 吗」回复「谢谢 会考虑的～」（#1554）[49]。路线图里仍写「iOS：只做远程客户端」，与已经合入的 iOS 本机引擎不一致（推论：路线图没更新）[13][2]。
- 没有找到维护者对「卡在哪」的正式说明。

### 7.5 对照：上游 ds-harness-remote 的手机客户端

- ds-harness-remote 自己的 Android 和 iOS 客户端是 Expo SDK 57（`expo ~57.0.13`）、React Native 0.86.2、React 19.2.3，用 `workspace:*` 依赖仓库里的 `@dsh-remote/protocol`、`crypto`、`webrtc`、`client-core`、`app-core`；Markdown 用 markdown-it，WebRTC 用 react-native-webrtc，私钥放在 `expo-secure-store` [59]。
- 它的 Noise 是纯 TS：`@dsh-remote/crypto` 包一层 `@lukeburns/clatterjs`（MIT，基于 noble 的 Noise 框架），只暴露固定的 IK 套件 [58][62]。在 Hermes 上靠 `expo-crypto` 补 `getRandomValues`；安卓另有一个可选的原生 ChaCha20-Poly1305 加速模块（要求 Android 9 以上），输出要与纯 JS 逐字节一致，nonce 仍由 Noise 管 [59][58]。
- iOS 客户端是 TestFlight 内测，未公开上架 [51]。

## 8. 许可

以下按许可证原文和仓库声明说事实，不是法律意见。

- **DSH Go 的许可构成**：代码以 AGPL-3.0 发布，`sdk/` 和 `examples/` 是 MIT [1]。DSH Go 的名称、标识和吉祥物（Deepy、鲸娘、小粉鱼）不在 AGPL 授权内；README 用的 `docs/assets/` 展示素材「可以随本仓库一起查看和转载介绍，不要用在你自己发布的产品上」[16]。README 还请求改造前先联系作者，并说明这是协作请求，不是对许可证追加的限制 [1]。
- **AGPL-3.0 原文**：第 5 条 (c) 要求修改版在传递时「把整个作品作为整体按本许可证授权给任何拿到副本的人」；第 13 条要求修改版如果支持通过网络远程交互，要向所有远程交互的用户提供对应源码 [15]。
- **对 MIT 的 Pigcode 意味着什么**：把 DSH Go 的 AGPL 代码复制或改写进 Pigcode 仓库，按第 5 条 (c) 这部分作品要按 AGPL 授权，和 Pigcode 以 MIT 发布不兼容（推论）。所以 AGPL 部分只读：界面思路、交互模式和信息架构可以借鉴，代码、界面文案、图形和素材不复制。
- **DSH Go 里的 MIT 文件**：`app/lib` 和 `packages` 下有 60 个源文件的文件头写着 `SPDX-License-Identifier: MIT`，按版权行分是 PiPilot 的作者 CikeSeven 38 个、DSH Remote contributors 14 个、DeepSeek 8 个（本次检索统计）。第三方声明列出了来源 [14]：
  - PiPilot（MIT）：聊天页（`chat_header`、`chat_list`、`chat_screen`、`composer`、`model_sheet`）、Markdown 和代码块渲染、`diff_view`、`approval_card`、`question_card`、`tool_row` 等组件、抽屉外壳和主题；
  - ds-harness-remote（MIT）：`packages/dsh_remote` 的协议、分帧、校验、加密通道、WebRTC 和连接逻辑（Noise 状态机是 DSH Go 自己写的，经上游作者同意）；
  - DeepSeek Harness（MIT）：若干算法和图形；另外「消息操作、提及、输入区 dock、回合过程、产物、工作区、终端和定时任务」等组件的结构和行为参照其 Web 客户端，不逐文件列出。

  这些文件在 DSH Go 里多数改过（文件头写「Local changes」），DSH Go 的改动适用哪个许可，文件头没有另行说明。对 Pigcode 来说更干净的做法是直接去读 MIT 的上游，而不是 DSH Go 里改过的副本（推论）。
- **对 Pigcode 有用的 MIT 上游**：
  - ds-harness-remote（MIT，TypeScript，与 Pigcode 同语言）：线协议、Noise IK 包装和跨实现测试向量 `fixtures/crypto/v1/noise-ik.json`、自适应选路、Relay、扫码配对协议，以及它自己的 Expo 手机客户端 [51][58][59]。
  - PiPilot（MIT，Flutter，pi coding agent 的手机控制端；GitHub 上 `CikeSeven/pi_pilot` 现在重定向到 `ccch1mneyyy/pi_pilot`）：README 写了按 `hubId + sourceId + epoch + seq` 游标续传、环形缓冲不可用时退回快照、「插队 / 排队 / 中断并发送」三种投递、带 fencing token 的租约 [66]。本次只读了 README。
  - DeepSeek Harness（MIT）官方 Web 客户端 [65]。
- **MIT 的 `sdk/` 和 `examples/` 里有什么**：
  - `sdk/plugin-kit`（`@dsh-go/plugin-kit`，private，不发布到 npm）是 DSH Go「原生插件」的作者工具包：视图和清单的 TypeScript 类型、组件构造函数（`stack` `row` `text` `metric` `chart` `list` `keyValue` `progress` `table` `actions` `image` 等）、工具卡包装 `toolCard`（结果不超过 8 KiB）、按 App 能力降级的判断、效果、不启动 DSH 的测试宿主、`check` 命令和 JSON Schema [17]。视图 schema 的定义是「插件交给手机 App 的原生视图：一棵来自固定组件目录的组件树，值可以用 `{"$": "data.path"}` 绑定数据」，用在工具卡、面板和输入框状态条上 [17]。
  - `examples/plugins` 有 10 个示例：工具卡、状态条加面板加实时数据、胶囊和消息菜单、朗读、视图 v2 样式、图集、工具箱、网页浮层等 [18]。
  - 对 Pigcode 的用处：它回答的是「插件界面怎么在手机上原生显示」，而 Pigcode 的插件界面走 `pigcode-plugin://`、远程拿不到 [67]。「插件交一棵声明式视图树、手机按固定组件目录原生渲染」的思路可以留给迭代路线；代码绑定 DSH 的插件和桥接协议，第一版用不上，和连接、配对、会话、审批也无关（推论）。

## 9. 对 Pigcode 的启示

### 9.1 [原型：手机端的主要界面](https://github.com/pigcode/monorepo/issues/94)

值得借鉴（截图见 5.1）：

- **会话列表**：每行只放标题和最多一个标记，优先级「等你处理 > 运行中 > 未读」，等你处理用文字（「等你确认」「等你回答」）而不是只用颜色 [27]。筛选是一排胶囊，带数量；按今天、昨天、本周、更早分组 [27][19]（[f-adaptive](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-adaptive-zh-light.webp)）。DSH Go 把「待确认」和「未读」分成两个筛选；Pigcode 侧栏的「需要处理」本来就包括等你处理和未读 [67]，手机上沿用同一个分组即可（推论）。Pigcode 的列表要跨项目，按时间分组还是按项目分组要在原型里比较；DSH Go 是先选工作区再看列表 [26]。
- **电脑和连接状态放两处**：抽屉底部常驻「电脑名 · 状态」，点图标看连接详情（路径、耗时、延迟、回落原因）[26][25]；会话页标题下一行，连接问题优先于会话状态显示 [31]。状态永远是点加文字；连接中分步显示，用户知道卡在哪一步 [21]。Pigcode 第一版只有一台电脑，不需要「切换主机」面板，但抽屉底部这个位置以后可以展开成电脑列表（[f-remote](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-remote-zh-light.webp) 中间那台）。
- **断线时**：列表保留上次结果，标题后写「离线 · 上次结果」，隐藏需要处理和未读的标记，因为它们已经不可信 [29]。
- **过程折叠**：运行中逐行展开，跑完整轮收成一行「已完成 · N 次工具调用 · M 条消息」，下面紧跟回答和改动卡；收起和展开时摘要行不动 [32]（[f-steer](https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/assets/f-steer-zh-light.webp) 左右对比）。
- **活动条**：输入框正上方一颗胶囊写「此刻在做什么 + 本轮用时」，点开看本轮全部步骤；输入框上方的东西多了就叠成一摞 [37]。
- **排队消息**：运行中发出的消息贴在对话底部，一行写清状态和三个动作「立即发送 / 改为插话 / 撤回」，撤回的回到输入框 [4]（f-steer 左图）。Pigcode 第一版要求的是「发消息、停止 run」；能不能插话取决于 Agent 功能，原型里先把运行中发出的消息做成排队，并给插话留位置（推论）。
- **审批和提问**：卡片内联在时间线里，挂在对应的工具调用下面；同时顶栏状态变成「等你确认」，列表行显示「待确认」[35][31][27]。「拒绝」「允许本次」等宽并排，主色只给允许，更宽的授权降为文字按钮并二次确认 [35]。只有一个问题在等时，可以直接在输入框里回答 [4]。Pigcode 的审批卡和提问卡本来就由 props 驱动 [67]，手机上照这个层级重排即可。
- **新建会话**：空白页上一个项目胶囊，下面一行轻量胶囊放 Agent 实例和权限模式，模型放在输入框下方；第一条消息才建会话，和 Pigcode 的新会话草稿一致 [39][4]。没选项目时默认最近用过的项目并显示出来 [48]。
- **改动和 diff**：每轮末尾一张改动卡，最多列 3 个文件，点文件直达那个文件；全屏 diff 左右滑切文件、默认换行、带行号 [34]（f-remote 右图）。改动按工具调用算有盲区（shell 写的文件看不出来）[33]；Pigcode 若有更可靠的来源（比如回合前后的 git 状态），这张卡的样子照搬、数据换源（推论）。

要避开：

- **未读记在手机上**：电脑上看过，手机上仍是未读 [28]。Pigcode 的未读由 Host 计算和保存 [67]，手机端直接用 Host 的；「正在看就算已读」要由手机端报告给 Host。
- **自动允许只在手机内存里** [38]：Pigcode 用会话的权限模式，在 Host 上生效，手机端只是切换权限模式。
- **断线缓存只在内存里**：App 重启后什么都没有，用户要求「客户端缓存聊天记录」（#472）[29][50]。Pigcode 手机端应把会话列表和最近打开的会话落盘，打开时先显示缓存再增量更新（推论；落盘内容怎么保护见配对和加密那张票）。
- **首屏太重**：长对话首屏 1.2–4.3 MB、闪退（#1256、#370）[50]。手机端首屏按轮次取小窗口，工具输出默认只给摘要，展开时再取（类似 DSH Remote 的「精简历史」[3]）。Pigcode 现状「打开会话时从 0 全量回放、工具输出不截断」[67] 是同一类问题，归到弱网同步的票。
- **同一件事在三处同时提示**：同步期间顶栏、输入框上方、输入框占位同时写「正在同步对话」，用户嫌挤（#1256）[50]。
- **功能堆在一个外壳里**：DSH Go 的抽屉、右滑面板、桌宠、伙伴小屋、「全部功能」承载了大量本机功能 [2][26]；Pigcode 第一版只有七件事，外壳只需要会话列表、会话页和电脑状态（推论）。

### 9.2 [手机端技术栈](https://github.com/pigcode/monorepo/issues/95)

- DSH Go 说明 Flutter 能把聊天体验做到很细，代价是把 DSH 客户端和远程协议都用 Dart 重写，单这两个包约 3.1 万行 [2][6]。Pigcode 的 `contracts`、`client-runtime` 是 TS [67]，选 Flutter 就要付同样的成本，这和本仓库技术栈调研的结论一致 [68]。
- ds-harness-remote 的手机客户端是更直接的先例：Expo SDK 57、React Native 0.86，用 `workspace:*` 共享 TS 的协议和 Noise 包，Noise 在 Hermes 上跑纯 JS（clatterjs + noble），只补了 `getRandomValues` [59][58]。这支持「Expo + 一份 TS Noise 在 Host 和手机端共用」的倾向；性能不够时可以学它给 ChaCha20-Poly1305 加一个原生加速，前提是输出逐字节一致 [59]。
- 技术验证要专门测 DSH Go 列表解决的两件事：上方加载更早的历史、下方流式增长，都不能移动正在看的内容 [36]。React Native 里对应 LegendList 的 `maintainVisibleContentPosition` 和 `maintainScrollAtEnd` [68]。
- 流式 Markdown「只修补未完成的尾部」和 Enriched Markdown 的内置流式是同一个思路 [11][68]；diff 不需要额外的包，Pigcode 的 `file-changes.ts` 已经能算 [67]。
- WebRTC 让 DSH Go 的 APK 每个 ABI 多约 16.5 MiB [7]。Pigcode 第一版若只走中继，可以先不带 WebRTC（推论）。

### 9.3 [手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办](https://github.com/pigcode/monorepo/issues/96)

- DSH Remote 的形态和本仓库连接调研的结论一致：电脑和手机都连出，中继只转发 Noise 密文，LAN、P2P、TURN 是同一条加密连接的可选数据面 [53][68]。它把 Control（信令、握手中转、心跳）和数据（DataChannel 或独立的 Relay 数据 socket）分开，Relay 节点不需要数据库 [53]；Pigcode 第一版可以只做 Relay，协议里给选路留字段（推论）。
- 断线补齐放在会话协议里，不放在中继里：中继断了就关连接、重新握手、按 `seq` 从快照补齐 [53][55][40]。DSH 的四条订阅保证（快照开头、`seq` 连续、缺口回补、流式 revision）可以直接写进弱网同步的票里 [40]。
- 首连别等打洞：用户报告的 5–8 秒里，冷启动等本地状态、先拉全账号设备列表、等 WebRTC 打洞完才握手、首屏 2 MB JSON 各占一段 [50]。上游协议规定手机的自动连接先协商直连、再做 Noise 认证和首屏读取，只有回落到 Relay 之后才在同一 Noise 会话里升级到 WebRTC [55]，没有写这样规定的理由。Pigcode 第一版只走中继，不存在这个等待；以后加直连时，可以先走中继立即可用、直连在后台升级，这和上游的规定相反，要在连接那张票里明确取舍（推论）。
- 选路细节可以直接参考：确认蜂窝时跳过 LAN、失败路径冷却 45 秒、首连总预算 45 秒、网络变化或回前台立即重试、不等退避 [8][21]。
- 电脑睡眠：DSH Go 只显示「主机现在不在线」并退避重试，不显示最后在线时间，重试用完就停在「连接失败」[23][21][24]。Pigcode 应该由中继告诉手机「电脑离线」和最后在线时间，并在回前台、网络变化时自动再试，不让用户卡在失败态（推论）。「电脑离线」和「Pigcode 没在跑」中继分不清，除非 Host 退出时主动告知中继（推论）。
- 后台：学它「离开屏幕 30 秒后停止逐字推送、回来从快照接上」，省流量也省电 [38]。

### 9.4 [配对、设备身份与加密](https://github.com/pigcode/monorepo/issues/97)

- 套件：DSH Remote 用的就是 `Noise_IK_25519_ChaChaPoly_SHA256`，和本仓库技术栈调研选的同一个 [52][68]。上游的跨实现测试向量 `fixtures/crypto/v1/noise-ik.json` 是 MIT，DSH Go 的 Dart 实现逐字节通过 [6][58]；Pigcode 的 TS 实现可以直接拿它测。prologue 绑定连接 ID 和两端设备 ID 的做法也可以照搬 [52]。
- 配对流程值得借鉴：一次性、180 秒有效；二维码只放随机 ticket，服务器只存摘要；手机先确认服务器地址和电脑的完整指纹再领取；领取请求带私钥持有证明；8 位验证码只有一次机会；最终确认在电脑本机界面，模型工具和远程客户端都调不到 [54]。
- 信任根要比它强：DSH Remote 的短二维码里没有电脑公钥，信任押在服务器上 [54]；账号模式下同账号客户端被自动信任 [6]。Pigcode 的二维码里直接放电脑的静态公钥，中继就不在信任链上（本仓库连接调研的建议 [68]）；也不需要第三方账号。
- 撤销在电脑上做：DSH Remote 的撤销接口在服务器上、公开代码里没有界面 [54][60]。Pigcode 由 Host 保存已配对手机的公钥列表，在电脑上逐台撤销，撤销立即在 Host 本地生效，不依赖中继（推论）。
- 指纹用完整长度：账号模式的短指纹只有 48 位，DSH Go 的 `dsh_remote` README 自己把它列为安全边界 [6]；配对模式用完整 SHA-256 [54]。
- 身份不要绑在中继地址上：DSH Remote 的设备身份按服务器 origin 隔离，换服务器等于换身份 [6][54]。Pigcode 的身份是「电脑—手机」之间的，换中继地址不应该要求重新配对（推论）。
- 长期连接的 rekey 和独立安全审查，上游都还在待办里 [57]，Pigcode 自己做时同样要列为待办。

### 9.5 [通知怎么送到手机](https://github.com/pigcode/monorepo/issues/98)

- DSH Go 是反例：没有远程推送，iOS 上离开 App 就收不到「等你确认」[12][43]。Pigcode 仍按本仓库安装与推送调研的路线：免费阶段用 Bark，付费后电脑直连 APNs [68]。
- 可以照搬的规则：事件四类（完成、出错或被停下、等你确认、向你提问），各自可关 [41]；正在看的那个会话不提醒，前台用横幅 [41]；请求等 800 ms 再提醒，另一端立刻处理的就不打扰 [41][28]；锁屏只显示公共标题 [48]。
- 通知上直接审批：DSH Go 安卓版做了，条件是通知能完整显示要批准的命令，按钮只有「拒绝」「允许本次」，结果没回来时重发的通知不再给按钮 [42][48]。它依赖 App 进程活着、连着主机 [41]。Pigcode 的推送若要带审批按钮，要么让手机被唤醒后连回电脑再提交，要么经中继把决定交给 Host，第一版可以先只做「点通知进会话」（推论）。
- 实时活动：DSH Go 只做了安卓 16 的 Live Update，国行部分机型拿不到 [9]；对以 iPhone 为主的 Pigcode 参考价值有限。

## 待证实事项

- DSH Remote 托管服务器和 TURN 节点在哪、域名是否备案：首页和前端脚本里没有找到备案号，没有找到一手来源。
- 托管 Web 的设备管理能否逐台撤销手机：完整服务器不开源，没有核实。
- 扫码配对、TURN、公网 NAT、蜂窝网络在真机上的表现：DSH Go 的验证记录只覆盖模拟器上的 P2P 和 Relay，1.0.14、1.0.15 写明扫码配对没有真机验证 [7][8][48]。
- iOS 版远程连接的真机表现：iOS 工程说明的验收表里列了「远程连接」，没有找到结果记录 [12]。
- 用户报告的耗时和体积（5–8 秒、1.2–4.3 MB、闪退）来自 issue 里的个人测量，不是项目的基准测试 [50]。
- README 展示图是否来自真机截图：仓库里没有生成它们的脚本。
- 电脑醒来后 DSH Remote 多快能重新连上：只从代码推出「下一次重试或回前台时」，没有实测记录。
- PiPilot 的游标续传、租约和三种投递只读了 README，没有核对源码 [66]。
- `@lukeburns/clatterjs` 的维护状态和审计情况：npm 上没有仓库链接 [62]。
- DSH Go 中带 MIT 文件头、又被 DSH Go 修改过的文件，修改部分适用哪个许可：文件头没有另行说明；这不是法律意见。
- 维护者对 iOS 上架时间或阻碍的正式说明：没有找到。

## 参考来源

所有来源的访问日期都是 2026-11-21。DSH Go 的链接都在提交 `da798027013851328f83f59af4adb52c3afaab23` 上；ds-harness-remote 在 `7c9fc702a66fa631f8968086448ad97b77fcca91`；DeepSeek Harness 在 `2e39e70496aa02986ca6a820c5d497e816b69d7e`。

DSH Go 文档：

1. README.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/README.md
2. docs/architecture.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/architecture.md
3. 用户指南「本机引擎与远程主机」docs/guide/zh/03-engine-hosts.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/guide/zh/03-engine-hosts.md
4. 用户指南「对话」docs/guide/zh/01-chat.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/guide/zh/01-chat.md
5. 用户指南「工作区」docs/guide/zh/17-workspaces.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/guide/zh/17-workspaces.md
6. packages/dsh_remote/README.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_remote/README.md
7. packages/dsh_remote/VERIFICATION.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_remote/VERIFICATION.md
8. docs/testing/remote-auto-network.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/testing/remote-auto-network.md
9. docs/design/live-activity.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/design/live-activity.md
10. docs/design/background-execution.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/design/background-execution.md
11. docs/design/rendering.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/design/rendering.md
12. app/ios/README.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/ios/README.md
13. docs/roadmap.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/docs/roadmap.md
14. THIRD_PARTY_NOTICES.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/THIRD_PARTY_NOTICES.md
15. LICENSE（AGPL-3.0，第 5、13 条）: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/LICENSE
16. ASSETS.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/ASSETS.md
17. sdk/plugin-kit（README.md、LICENSE、schema/view.schema.json）: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/sdk/plugin-kit
18. examples/plugins/README.md: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/examples/plugins/README.md
19. README 展示图 docs/assets/（f-remote、f-steer、f-adaptive、f-web、f-phone、f-share、f-theme、f-lang）: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/docs/assets

DSH Go 源码（路径前缀 https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/ ）：

20. app/lib/state/connection_state.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/connection_state.dart
21. app/lib/remote/link_status.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/remote/link_status.dart
22. app/lib/remote/ssh/ssh_link.dart、remote_bootstrap.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/remote/ssh/ssh_link.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/remote/ssh/remote_bootstrap.dart
23. app/lib/remote/relay/relay_backend.dart、dsh_remote_backend.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/remote/relay/relay_backend.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/remote/relay/dsh_remote_backend.dart
24. packages/dsh_remote/lib/src/crypto/noise_ik.dart、pairing/device_pairing.dart、server/server_api.dart: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_remote/lib/src
25. app/lib/ui/remote/host_switcher.dart、host_status.dart、network_details_sheet.dart: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/remote
26. app/lib/ui/shell/sessions_drawer.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/shell/sessions_drawer.dart
27. app/lib/ui/shell/drawer/session_tile.dart、drawer_filter_bar.dart: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/shell/drawer
28. app/lib/state/session_attention_state.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/session_attention_state.dart
29. app/lib/state/drawer_view_state.dart、read_list_cache.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/drawer_view_state.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/read_list_cache.dart
30. app/lib/state/sessions_state.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/sessions_state.dart
31. app/lib/ui/chat/chat_screen.dart（`_status`）、chat_header.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/chat_screen.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/chat_header.dart
32. app/lib/ui/chat/widgets/turn_process.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/widgets/turn_process.dart
33. app/lib/ui/chat/turn_summary.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/turn_summary.dart
34. app/lib/ui/chat/widgets/change_card.dart、app/lib/ui/chat/diff_page.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/widgets/change_card.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/diff_page.dart
35. app/lib/ui/chat/widgets/approval_card.dart、question_card.dart、tool_row.dart: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/widgets
36. app/lib/ui/chat/chat_list.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/chat_list.dart
37. app/lib/ui/chat/widgets/activity_strip.dart、app/lib/ui/chat/dock/chat_dock.dart、dock_stack.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/widgets/activity_strip.dart ，https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/dock
38. app/lib/state/chat_state.dart（`PendingPrompt`、`quietAfter`、`setAutoApprove`、`loadOlder`）: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/chat_state.dart
39. app/lib/ui/chat/new_chat_options.dart、empty_actions.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/new_chat_options.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/ui/chat/empty_actions.dart
40. packages/dsh_client/README.md、lib/src/session_api.dart、lib/src/connection.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_client/README.md ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_client/lib/src/session_api.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_client/lib/src/connection.dart
41. app/lib/state/notify_state.dart: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/state/notify_state.dart
42. app/lib/notify/chat_alerts.dart、app/android/app/src/main/kotlin/io/github/ccch1mneyyy/dsh_app/notify/ChatNotifier.kt: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/lib/notify/chat_alerts.dart ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/android/app/src/main/kotlin/io/github/ccch1mneyyy/dsh_app/notify/ChatNotifier.kt
43. app/ios/Runner/Info.plist、Runner.entitlements，app/android/app/src/main/AndroidManifest.xml: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/app/ios/Runner ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/android/app/src/main/AndroidManifest.xml
44. app/pubspec.yaml: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/app/pubspec.yaml
45. tooling/setup-toolchain.sh、.github/workflows/ci.yml: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/tooling/setup-toolchain.sh ，https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/.github/workflows/ci.yml
46. tooling/ios/phone-self-runner（README.md、Cargo.toml）: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/tooling/ios/phone-self-runner
47. 中文界面文案 app/lib/l10n/parts/*_zh.arb: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/app/lib/l10n/parts

DSH Go 发布说明和 issues：

48. 发布说明 v1.0.2、v1.0.3、v1.0.4、v1.0.12、v1.0.14、v1.0.15、v1.0.16、v1.2.0、v1.3.0，以及版本列表: https://github.com/ccch1mneyyy/dsh-Go/releases ，例如 https://github.com/ccch1mneyyy/dsh-Go/releases/tag/v1.3.0 、https://github.com/ccch1mneyyy/dsh-Go/releases/tag/v1.2.0 、https://github.com/ccch1mneyyy/dsh-Go/releases/tag/v1.0.14
49. 维护者回复：#582 https://github.com/ccch1mneyyy/dsh-Go/issues/582 ；#1554 https://github.com/ccch1mneyyy/dsh-Go/issues/1554
50. 用户报告：#810 https://github.com/ccch1mneyyy/dsh-Go/issues/810 ；#1256 https://github.com/ccch1mneyyy/dsh-Go/issues/1256 ；#370（含 #444 的补充）https://github.com/ccch1mneyyy/dsh-Go/issues/370 ；#472 https://github.com/ccch1mneyyy/dsh-Go/issues/472

ds-harness-remote（MIT）：

51. README.zh.md: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/README.zh.md
52. docs/end-to-end-encryption.md: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/docs/end-to-end-encryption.md
53. docs/network.md: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/docs/network.md
54. docs/device-pairing-v1.md: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/docs/device-pairing-v1.md
55. docs/protocol.md（§20–§25、Optional independent connection racing、Optional in-band live transport upgrade）: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/docs/protocol.md
56. apps/server/README.zh.md: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/apps/server/README.zh.md
57. docs/TODO.md: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/docs/TODO.md
58. packages/crypto（package.json、src/noise.ts）和 fixtures/crypto/v1: https://github.com/liguobao/ds-harness-remote/tree/7c9fc702a66fa631f8968086448ad97b77fcca91/packages/crypto ，https://github.com/liguobao/ds-harness-remote/tree/7c9fc702a66fa631f8968086448ad97b77fcca91/fixtures/crypto
59. 手机客户端：apps/android（package.json、README.md、modules/remote-transport、plugins/remote-foreground-service）、apps/ios/package.json、packages/app-core/src（polyfills.ts、services/native-chacha-poly.ts、locales/zh-CN.ts）: https://github.com/liguobao/ds-harness-remote/tree/7c9fc702a66fa631f8968086448ad97b77fcca91/apps/android ，https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/apps/ios/package.json ，https://github.com/liguobao/ds-harness-remote/tree/7c9fc702a66fa631f8968086448ad97b77fcca91/packages/app-core/src
60. 主机插件 packages/plugin/src（host-pairing.ts、server-api.ts）: https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/packages/plugin/src/host-pairing.ts ，https://github.com/liguobao/ds-harness-remote/blob/7c9fc702a66fa631f8968086448ad97b77fcca91/packages/plugin/src/server-api.ts
61. 托管服务器的登录方式发现接口（2026-11-21 的响应）: https://dsh.r2049.cn/api/v1/auth/oauth/providers
62. npm registry，`@lukeburns/clatterjs` 1.0.0（MIT，依赖 `@noble/*`）: https://registry.npmjs.org/@lukeburns%2Fclatterjs

DeepSeek Harness（MIT）：

63. docs/subsystems/web-server.zh.md: https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/docs/subsystems/web-server.zh.md
64. packages/host/authentication-token/README.zh.md: https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/packages/host/authentication-token/README.zh.md
65. LICENSE: https://github.com/deepseek-ai/deepseek-harness/blob/2e39e70496aa02986ca6a820c5d497e816b69d7e/LICENSE

其他：

66. PiPilot README（提交 `d94aeaaf4922ba4f0c88766918bf835fa34ff5f5`；许可证 MIT 取自 GitHub 仓库元数据）: https://github.com/ccch1mneyyy/pi_pilot/blob/d94aeaaf4922ba4f0c88766918bf835fa34ff5f5/README.md

Pigcode：

67. 地图票「开始时的现状」（pigcode/frontend `54e2740`）: https://github.com/pigcode/monorepo/issues/86
68. 本仓库已有调研：同类产品 https://github.com/pigcode/monorepo/blob/research/mobile-prior-art/research/mobile-prior-art.md ；技术栈 https://github.com/pigcode/monorepo/blob/research/mobile-stack/research/mobile-stack.md ；连接 https://github.com/pigcode/monorepo/blob/research/mobile-connectivity/research/mobile-connectivity.md ；安装与推送 https://github.com/pigcode/monorepo/blob/research/mobile-install-push/research/mobile-install-push.md
