# ds-harness-remote 的中继、Noise 和配对能复用多少，手机端用 Dart 怎么接（pigcode/monorepo#107）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。方括号里的数字对应「参考来源」的编号。源码结论基于这些提交：ds-harness-remote `839d74a`（main，2026-11-21）；它比[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105)用的 `7c9fc70` 只多一个提交（#550），只改了 `packages/app-core` 的侧栏，所以中继、协议、Noise、配对和插件代码与 `7c9fc70` 相同 [27]。DSH Go 是 `da79802`（main，1.3.0 合并后，`packages/dsh_remote` 最近一次修改在 2026-11-19）[46]；clatterjs 看的是 npm 上唯一的 1.0.0 发布包 [31][32]；Pigcode 是 pigcode/frontend `54e2740`（只读）[47]。

标注「推论」的是根据所引代码或文档推出、来源本身没有直接写明的结论；查不到的写「没有找到一手来源」。「本机实测」是在开发机（Apple M4、macOS 15.6.1、Dart 3.12.2、Node 22）上跑的一次性检查，代码放在临时目录、没有提交，不是公开来源。行数都是本次用 `wc -l` 数的，源码不含测试、`dist/` 和 `.d.ts`。

用词：描述 ds-harness-remote 自己的概念时沿用它的叫法并注明，即 Host（上游的被连一端，装了插件的 DSH）、Client（上游的发起一端）、Server（上游的协调和中转服务器）、Relay、membership、connection。指 Pigcode 时用 `GLOSSARY.md` 的用词：电脑、手机端、会话；「Host」单独出现时指 Pigcode 的 Host 进程，「中继」指 Pigcode 要部署的那台转发服务器。

## 问题

[ds-harness-remote](https://github.com/liguobao/ds-harness-remote)（MIT，TypeScript）是 DSH Go 远程连接的上游：电脑和手机都连出到中继，LAN、P2P、TURN、Relay 自动选路，全程 `Noise_IK_25519_ChaChaPoly_SHA256`，还有扫码配对协议 dsh-pairing-v1 和跨实现的测试向量。它和[调研：手机在外网怎么连回电脑](https://github.com/pigcode/monorepo/issues/89)的建议几乎一样。手机端已定用 Flutter（见[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)的评论），逐项回答：

- **中继服务器**：仓库里的自部署服务器（单账号）能不能直接给 Pigcode 用，要改什么；只做 Relay、不做 P2P 和 TURN 时能裁掉多少；部署到开发者自己的云服务器上要准备什么。
- **电脑一侧**：Host 插件里的协议、Noise 包装、分帧、选路和重连，哪些能直接搬进 Pigcode 的 Host（同是 TS），和 DSH 耦合的地方有多少。
- **手机一侧（Flutter）**：协议和 Noise IK 要用 Dart 实现。上游的 TS 实现和测试向量（`fixtures/crypto/v1/noise-ik.json`、配对的 fixture）怎么用来做互通测试；Dart 的密码学原语用哪个；DSH Go 的 `packages/dsh_remote` 是 AGPL，但其中有标着 MIT、版权属于 DSH Remote contributors 的文件，哪些可以合法参考；工作量大概多大。
- **配对**：dsh-pairing-v1 能不能直接沿用；改成「二维码里放电脑公钥、撤销在电脑上做、不用第三方账号」要动哪些地方。
- **风险**：`@lukeburns/clatterjs` 的维护和审计情况，上游列出的安全待办（rekey、独立审查），MIT 的署名要求。

结论要能直接用在[手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办](https://github.com/pigcode/monorepo/issues/96)、[配对、设备身份与加密](https://github.com/pigcode/monorepo/issues/97)和[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)上。只认一手来源：仓库源码、文档和发布说明。

## 结论

- **上游的最小自部署 Server 可以直接当 Pigcode 第一版的中继，只走中继时服务器一行都不用改。** 它的网关只做 hello、连接协调、两条 Noise 握手消息和 `relay` 密文的转发，不解析 Noise；单进程，状态存一个 JSON 文件；源码 1,664 行，有现成的 amd64/arm64 Docker 镜像 [2][3][4][29]。客户端在 hello 里只声明 `transport.relay`，协商结果就是纯中继；不配 STUN/TURN 时服务器也不会声明 TURN [2][1]。真要删掉 WebRTC 和 TURN，只能少约 210 行（13%），再加上可以不要的网页界面 [2][3][5]。
- **但它的身份模型和 Pigcode 的配对方向相反，扫码配对也不在里面。** 两端都用部署时配置的单个账号密码登录、注册设备，同账号的设备自动互相授权，电脑公钥由服务器分发 [3][4][11]；dsh-pairing-v1、按关系撤销、独立 Relay 节点都只在闭源的完整 Server 里，最小 Server「不声明未实现能力」[8][12]。设备的 `lastSeenAt` 只在 hello 时更新，显示不了「最后在线时间」[2][4]。自用第一版可以原样部署，信任、配对和撤销放在 Pigcode 的 Host 和手机端自己做；公开发布前要换掉账号模型（推论）。
- **电脑一侧能搬进 Pigcode Host 的是传输和加密，约 2,400 行 TS；DSH 的业务全在路由层后面。** 插件 53,298 行里只有 3 个文件直接 import `@deepseek-ai/*`（共 6 行）[21]。连接核心 `server-connection.ts`（1,941 行）只 `import type` 了 4 个配置字段，去掉 WebRTC、Relay attach 和控制租约约 650 行；要改的是握手前向服务器查 membership 的那段，换成查电脑上的已配对手机 [17]。它给出的 `send`、`onMessage`、`close` 和 Pigcode 的 `HostTransport` 对得上 [18][47]。
- **手机一侧 Dart 的最小实现约 1,400 到 2,100 行；Noise IK 本身照规范写 200 行左右，就能逐字节通过上游向量。** 本机实测：用 `cryptography` 2.9.0 的同步 Dart 实现加 `crypto`，照 Noise 规范写的 211 行 Dart，一次通过上游 `noise-ik.json`、cacophony 和 snow 里的 IK 向量和上游的配对 proof 向量，共 33 项检查；AOT 下完整握手约 4.3 ms，48 KiB 帧加密加解密约 17 MiB/s [42]。`cryptography` 的 X25519 遇到低阶点会静默返回全零，TS 侧的 noble 会报错，Dart 版要自己加这项检查 [35][37][42]。
- **pub.dev 上仍然没有能直接用的纯 Dart Noise IK；新出的 Torann（MIT）支持 IK，但走原生代码、要求 iOS 18 和 Android 13，未经审计，几乎没人用。** `noise_protocol_framework` 只有 NK、KN 两种握手和 P-256；cipherbird 和 dart_libp2p 只有 XX [36][38][39]。Torann 自带 1,352 条标准向量的测试，适合当交叉验证的第二实现，不适合当依赖（推论）。
- **DSH Go `dsh_remote` 里标 MIT 的 14 个文件共 7,122 行，版权行都是 `SPDX-FileCopyrightText: 2026 DSH Remote contributors`，没有一个写 Local changes；其余 7 个文件、全部测试和 e2e 工具没有许可头，按仓库的 AGPL-3.0。** 第三方声明把其中 13 个对应到上游的具体源码；`noise_ik.dart` 的文件头写明状态机是 DSH Go 自己写的、经上游作者同意；有 3 个 MIT 文件 import 了没有许可头的文件 [43][44][45]。以上按许可证原文说事实，不是法律意见：AGPL 的部分 Pigcode 不复制、不改写；更干净的做法是以上游 TS 和 Noise 规范为准自己写，DSH Go 的 MIT 文件只当对照（推论）。
- **dsh-pairing-v1 不宜直接沿用：它要服务器来管配对会话、私钥持有证明、8 位验证码和内部账号，而 Pigcode 用 Noise IK 本身就能完成配对。** 二维码放中继地址、电脑公钥和一次性秘密；手机把秘密放进 IK 第一条消息的加密载荷，电脑本机界面确认，秘密用一次就作废 [12][30]。撤销改成 Host 删掉本地记录并拒绝握手；上游现在删了本地固定的公钥，下次还会被服务器的 membership 重新信任 [17][19]。它的约束可以照搬：180 秒有效、32 字节随机、只存摘要、确认只能在电脑本机界面，手机端、模型工具和远程 RPC 都调不到 [12]。
- **`@lukeburns/clatterjs` 只发过一个版本（1.0.0，2026-04-24），没有公开仓库，也没有找到审计记录，而且它的 rekey 不符合 Noise 规范。** 发布包里只有编译后的 JS，不带源码和测试；LICENSE 的版权行是 Rust 版 clatter 的作者；README 说非 PQ 向量的测试目前只做解析冒烟 [31][32][33][34]。它把 `U64_MAX` 写成 2^60−1，rekey 用的 nonce 因此不是规范要求的 2^64−1，Rust 版用的是 `u64::MAX`；上游没有调用 rekey，所以眼下不出错 [30][32][33]。上游自己的待办里还列着 Noise 独立审查、长连接 rekey 和最大生命周期、私钥进系统钥匙串 [11][13]。
- **MIT 只要求在副本里保留版权声明和许可全文。** 复制上游代码或 fixture 时带上「Copyright (c) 2026 DSH Remote contributors」和 MIT 全文；插件里的 `src/hostc/` 是 Apache-2.0，不要搬；cacophony 向量按 Unlicense 进入公有领域，snow 向量可选 MIT 或 Apache-2.0 [21][26][38]。

### 对决策票的直接含义（详见第 7 节）

- 手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办：中继从上游最小 Server 起步，第一版只走 Relay；要补的是断开时记最后在线时间、Host 退出时的告别信号，以及 Host 同时服务窗口和手机。
- 配对、设备身份与加密：套件、prologue 绑定、分片和「出错就关」照搬；配对不走 dsh-pairing-v1，改成二维码加 IK 首条消息里的一次性秘密；撤销以电脑上的已配对列表为准；第一版不做 rekey，靠重连换密钥。
- 手机端技术栈：传输和加密放进不依赖 Flutter 的纯 Dart 包，约 1,400 到 2,100 行；Noise 用 `cryptography` 自己写；Host 一侧也照规范用 noble 写，不用 clatterjs，两份实现跑同一套向量。

## 1. 范围和规模

- 上游仓库建于 2026-08-14，3,470 星，252 个 fork；最新发布 v0.6.7（2026-11-21），v0.6.2 到 v0.6.7 的 6 个版本间隔 2 到 5 天，最近 30 天的提交超过 100 个 [28]。v1 线协议规定只能新增可选字段和 capability，不改已有字段的语义 [10]。
- 各部分规模（`839d74a`）：

| 部分 | 作用 | 源码 | 测试 |
|---|---|---|---|
| `apps/server` | 单账号自部署 Server | 1,664 行 TS；另有网页界面 356 行 TS/TSX、2,222 行 CSS | 1,730（65 个用例） |
| `packages/protocol` | 线协议的类型、zod schema、编解码、DSHF 分片 | 2,113 | 2,047 |
| `packages/crypto` | Noise IK 包装 | 248 | 366 |
| `packages/webrtc` | Client 侧传输：Relay、WebRTC、自适应选路 | 3,131 | 2,526 |
| `packages/client-core` | Client 侧 RPC 关联和 DSH 业务客户端 | 5,015 | 3,013 |
| `packages/plugin` | 装在 DSH 里的插件（上游的 Host 和桌面 Client 两种角色） | 53,298 | 约 41,300 |
| `packages/app-core` | Expo 手机客户端的共享界面和状态 | 72,230 | 21,166 |
| `fixtures/` | 跨实现向量：`crypto/v1` 1 条 Noise 向量；`pairing/v1` 3 条 proof 向量；`protocol/v1` 12 个套件 123 个用例（48 个应接受、75 个应拒绝） | — | — |

- 上游自己的手机客户端是 Expo（Android 和 iOS 两个壳加 `app-core`），用 `workspace:*` 共享 TS 的协议和 Noise 包，见[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105) [49]。本票只把它当参照。

## 2. 中继服务器

### 2.1 最小 Server 做什么

- **两类入口**：REST 和一个 WebSocket `/ws/v1/connect` [3][2]。
  - REST：账号登录（Web 会话 8 小时，HttpOnly Cookie）、设备注册、为同一安装注册另一角色、token 刷新、撤销本设备、查看自己、列出 Host、改名、查某台设备详情和在线状态，以及按连接签发 TURN 凭据 [3]。
  - 设备 token：access 1 小时，refresh 30 天，刷新时轮换；响应丢了可以用旧 refresh token 取回同一组后继凭据 [4][1]。
- **一条连接怎么建立**（只走中继时）[2][10]：
  1. 两端各自连上 `/ws/v1/connect`，5 秒内必须发 `hello`（带 device access token、角色、协议版本和 capability）；服务器回 `hello.ack`，其中的 capability 是双方声明的交集。
  2. Client 发 `connect.request`，列表里必须有 `relay`，且双方都声明了 `transport.relay`，否则报 `CAPABILITY_NOT_SUPPORTED`；Host 不在线就回 `HOST_OFFLINE`（可重试）。
  3. 服务器生成 `connectionId`，向 Host 发 `connect.incoming`，带 Client 的设备 ID 和公钥，`authorization` 固定为 `account`；Host 回 `connect.accepted` 或 `connect.rejected`。
  4. Client 发 `secure.handshake` 第 1 步、Host 回第 2 步，服务器只检查步骤顺序和连接归属，不解析内容。
  5. 之后双方发 `relay` 帧，里面是 base64url 的 Noise 密文；服务器要求每个发送方的 `counter` 严格递增，再原样转给另一端。最小 Server 的 `relay` 帧走的就是这条控制 WebSocket，没有独立的 Relay 数据连接 [2][9]。
- **限额和保活** [2][5][10]：同时最多 256 条 WebSocket、256 条连接、256 台设备；每条 WebSocket 每秒最多 512 帧；单帧上限 1 MiB，关闭了 permessage-deflate；30 秒内没走完握手的连接被丢弃；服务器每 25 秒发一次 ping，75 秒收不到对应的 pong 就断开。同一台 Client 设备同时只能有一条连接，新的会顶掉旧的；同一设备重新 hello 时旧 socket 以 4003 `CONNECTION_REPLACED` 关闭；服务器正常停机时以 4009 `server shutdown` 关闭。
- **存储** [4]：一个 `state.json`，存账号、密码的 scrypt 校验值、设备描述（含公钥）、是否撤销、`lastSeenAt` 和 token 的 SHA-256 摘要，不存明文 token。`lastSeenAt` 只在 hello 通过时更新 [2][4]，所以它是「最后一次连上的时间」，不是「最后在线的时间」。
- **没有的东西**：没有 `/api/v1/device-pairing/*`、没有 `device-memberships`、没有 `relay.attach`，也不声明控制租约恢复；`docs/server.md` 的对照表写着「可选配对/Relay 恢复：不声明未实现能力」，配对文档第一段写「本仓库最小自部署 Server 不提供此能力」[8][12]。完整多账号 Server、Remote Web 和 Admin 在独立仓库，README 的问答写「暂不考虑」开源 [1][8]。
- **测试和实测**：`server.test.ts` 65 个用例 [7]。README 写「真实跨机与长期连接仍待回归」，待办里还有「自部署 Server 的真实 coturn、多种 NAT/UDP 限制、Relay fallback、容器重启后凭据持久化与反向代理长连接」[1][13]。DSH Go 的 Dart 客户端在本机回环上跑通过对这个 Server 的端到端测试 [43]。

### 2.2 只做 Relay、不做 P2P 和 TURN 时能裁掉多少

- **不改服务器也能只走中继**：服务器只在配置了 TURN 地址时才声明 `transport.turn` [2][5]；Client 在 hello 里只写 `transport.relay`、`connect.request` 里只写 `relay`，协商结果就只有中继。上游 Client 侧的 `RelayTransport` 在 `connect.request` 里就只写 `relay` [16]。
- **真要删，能删的不多**：

| 部分 | 行数 |
|---|---|
| `ice.ts`（STUN/TURN 配置、coturn 短期凭据） | 108 |
| `GET /api/v1/turn/credentials` 路由 | 7 |
| `authorizeIce`（谁能取 TURN 凭据） | 17 |
| `forwardSignal`、`forwardTransportSelected`（信令和选路转发） | 49 |
| WebRTC 相关常量、capability 计算、hello.ack 里的回落超时 | 21 |
| 消息分发里的 `signal.*`、`transport.selected` 分支 | 8 |
| **合计** | **约 210，占 1,664 行的 13%** |

  另外，Pigcode 不需要网页时，`web/` 的 356 行 TS/TSX 和 2,222 行 CSS 以及账号网页登录的几个路由也可以不要 [3][6]。推论：裁剪的意义是缩小暴露面，不是减少维护量。
- **协议上**：上游定义了 18 种 Control 帧，只走中继要 11 种：`hello`、`hello.ack`、`connect.request`、`connect.incoming`、`connect.accepted`、`connect.rejected`、`secure.handshake`、`relay`、`ping`、`pong`、`error`；`signal.offer/answer/ice`、`transport.selected` 和三种 `connection.lease.*` 不需要 [15]。

### 2.3 能不能直接给 Pigcode 用，要改什么

- **原样部署可以跑通**（推论）：开发者在自己的服务器上配一个账号密码；Pigcode 的 Host 按上游的 Host 角色注册和连接，手机端按 Client 角色；网关不看 Noise 内容，Pigcode 在 Noise 里传什么协议它都不管 [2][10]。这时账号只决定「谁能用这台中继」，不决定「谁能控制电脑」：只要 Host 只认电脑上的已配对手机、手机只认二维码里的电脑公钥，信任根就不在中继上（推论，与[调研：手机在外网怎么连回电脑](https://github.com/pigcode/monorepo/issues/89)的建议一致 [49]）。
- **和 Pigcode 的配对决定冲突、需要改的地方**：

| 方面 | 上游最小 Server 的做法 | Pigcode 要的 | 改在哪 |
|---|---|---|---|
| 账号 | 两端都用部署时配置的同一个账号密码登录，再注册设备 [3][4] | 不用第三方账号，手机不需要知道任何密码 | 自用阶段可以接受开发者自己的账号；要去掉就得改登录和注册的路由（约 40 行）和存储里的账号字段，换成 Host 签发、随二维码交给手机的一次性中继凭据（推论） |
| 授权 | 同账号的设备互相自动授权，`connect.incoming` 的 `authorization` 固定是 `account` [2] | 以电脑上的已配对手机列表为准 | 服务器可以不改；Host 不再信服务器的授权，自己查本地列表（第 3 节） |
| 电脑公钥 | Client 从服务器的设备详情取 Host 公钥，首次连接时固定 [11] | 从二维码取 | 改在手机端，服务器不用改 |
| 配对和撤销 | 最小 Server 没有配对；只能撤销「本设备」[3][8] | 二维码配对、在电脑上逐台撤销 | 全在 Host 和手机端做（第 5 节） |
| 在线状态 | 心跳 25 秒、75 秒断开；`lastSeenAt` 只在 hello 时更新 [2][4] | 「电脑离线，最后在线于某时」 | 断开时也写 `lastSeenAt`，约 5 行（推论） |
| 退出和离线 | 协议里没有 Host 主动告别的帧 [10] | 区分「Pigcode 已退出」和「电脑离线」 | 加一条告别帧或约定关闭原因（推论） |
| 协议标识 | prologue 以 `DSH-REMOTE` 开头，设备描述有 `harnessVersion` 字段 [14][10] | Pigcode 自己的协议 | 分叉后改成 Pigcode 自己的标签、版本和向量（推论） |
| 多用户 | 单账号；完整多账号 Server 不开源 [1][8] | 公开发布时多租户 | 公开发布前要自己实现（推论） |

### 2.4 部署到开发者自己的云服务器要准备什么

- **运行方式**：拉 `ghcr.io/liguobao/ds-harness-remote/server:latest`（`latest` 指最近一次 Tag 发布，本次看到 97 个标签，`latest` 有 linux/amd64 和 linux/arm64 两种），或在服务器上用仓库里的 Dockerfile 从源码构建（Node 22、pnpm 9.15.4）[1][6][29]。镜像以非 root 用户运行，带 `/healthz` 健康检查，数据卷挂在 `/data` [6]。
- **必须配的环境变量** [1][6]：`DSH_SERVER_ACCOUNT`、`DSH_SERVER_PASSWORD`（至少 12 个字符）、`DSH_SERVER_PUBLIC_URL`（必须和客户端实际访问的 origin 完全一致，包括协议、域名或 IP 和非默认端口）。可选：`DSH_SERVER_HELLO_TIMEOUT_MS`，`.env.example` 的注释建议高延迟蜂窝网把它从 5 秒调到 10 到 15 秒；心跳间隔和断开阈值；日志级别。STUN/TURN 全部留空即可。
- **HTTPS 反向代理** [1]：生产环境不要把 Node 端口直接暴露到公网；代理要支持 `/ws/v1/connect` 的 WebSocket Upgrade，空闲超时大于 75 秒；所有连接都从代理进来时，要把代理在容器里看到的地址写进 `DSH_SERVER_TRUSTED_PROXY_IPS`，否则所有客户端共用每分钟 240 次的 API 限额和 20 次的登录限额。
- **Origin 校验**：服务器拒绝 Origin 与 `DSH_SERVER_PUBLIC_URL` 不一致的 WebSocket 升级，但不带 Origin 的请求放行 [2]；Dart `dart:io` 的 WebSocket 客户端不会自动加 Origin 头 [41]，所以手机端按代码不受影响（推论，没有实测）。
- **域名、证书和网络**：沿用[调研：手机在外网怎么连回电脑](https://github.com/pigcode/monorepo/issues/89)的结论 [49]：境外服务器直接用域名和 `wss://`；大陆服务器的域名未备案时不能解析过去，只能用 IP 加端口，配 Let's Encrypt 的 IP 证书（有效期 160 小时）或者让手机端固定中继的证书公钥；连接要走 TLS，不要裸 TCP。
- **不需要的**：只走中继时不用部署 coturn、不用开 UDP 端口 [1]。
- ghcr.io 在大陆服务器上能不能顺利拉取，没有找到一手来源；拉不下来就在服务器上从源码构建（推论）。

## 3. 电脑一侧

### 3.1 插件里哪些是传输和加密，哪些是 DSH 业务

| 上游文件 | 行数 | 做什么 | 对 Pigcode | 和 DSH 的耦合 |
|---|---|---|---|---|
| `crypto/src/noise.ts`、`index.ts` | 173 + 75 | Noise IK 会话包装（只开放固定套件，握手完成前核对对端静态公钥），prologue，base64url，密钥生成 [14] | 可以直接搬，或照它的接口用 noble 重写（见 6.1） | prologue 里的 `DSH-REMOTE`；依赖 clatterjs |
| `protocol/src/index.ts` | 1,633 | Control 帧 schema、限额、版本和 capability 协商、`SecureMessageCodec`（DSHF 分片）[15] | 抽出 11 种帧的 schema 和分片编解码（推论：约 400 到 500 行） | 1,633 行里有 152 行带 Harness、Codex、ACP、FileViewer 等 DSH 业务名词，`rpcMethods`、`remoteEvents` 整段是业务 |
| `protocol/src/wire-json.ts`、`close-semantics.ts` | 32 + 114 | 拒绝重复字段的 JSON 解析；关闭码和关闭原因的分类 [15] | 直接搬 | 无 |
| `plugin/src/server-connection.ts` | 1,941 | 上游 Host 角色的控制连接：注册后 hello、重连、处理 `connect.incoming`、Noise 应答、Relay 收发，以及 WebRTC、Relay attach、控制租约、带内升级 [17] | 只走中继时保留约 1,300 行（下面细说） | 只 `import type` 了配置（用到 4 个字段）和 `types.ts` |
| `plugin/src/connection-controller.ts` | 283 | 按 `connectionId` 管多条已认证连接，RPC 路由由外部工厂注入 [18] | 直接搬，工厂换成 Pigcode 的 RPC 服务 | `import type` 了 DSH 的 `RpcRouter` |
| `plugin/src/client-secure-transport.ts` | 155 | Client 侧的 Noise 包装 [18] | 手机端 Dart 版的对照；也可以当 Node 里的测试客户端 | 无 |
| `webrtc/src/index.ts` 的 `RelayTransport` | 365 | Client 侧中继传输，其中约 120 行是 Relay attach [16] | 同上 | 无 |
| `plugin/src/identity-store.ts` | 1,146 | 设备身份和已固定的对端 [19] | 只借鉴前约 300 行的数据结构 | 其余约 850 行是 DSH 的存储目录迁移和进程锁 |
| `plugin/src/server-api.ts`、`server-credentials.ts` | 839 + 286 | 账号登录、设备注册、token 刷新和落盘 [20] | 随中继鉴权方案重写 | 账号模型 |
| `plugin/src/host-pairing.ts` | 219 | dsh-pairing-v1 的电脑端，调用完整 Server 的配对接口 [20] | 不用 | 依赖闭源的完整 Server |
| `plugin/src/werift-rtc.ts`、`native-rtc-helper.ts` | 820 + 637 | 电脑一侧的 WebRTC（纯 TS 的 werift，或可选的原生 `@roamhq/wrtc`）[21] | 第一版不用 | — |
| `plugin/src/rpc-router.ts` 和 Harness、Codex、ACP 的桥接 | 387 + 上万 | DSH 业务的白名单路由 [21] | 不用，换成 Pigcode 自己的 89 个方法 | 全部是 DSH |
| `plugin/src/config.ts`、`index.ts`、`service.ts` | 411 + 975 + 806 | Cordis 插件生命周期和 schemastery 配置 [21] | 不用 | `config.ts`、`index.ts` 直接 import `@deepseek-ai/*` |

- **直接 import DSH 包的只有 3 个文件、6 行**：`config.ts`（cordis 的类型和 schemastery）、`index.ts`（cordis、`dsh-client-connection`、`dsh-settings`）、`remote-tools.ts`（cordis）[21]。传输核心不 import 它们；业务耦合集中在 `rpc-router.ts`，它 import 了 Harness、Codex、ACP、文件预览、上传、会话传输等 12 个业务模块 [21]。
- **能直接搬的合计约 2,400 行 TS**（推论）：Noise 包装 248、wire-json 和关闭语义 146、协议子集约 400 到 500、`server-connection.ts` 保留部分约 1,300、`connection-controller.ts` 283，加上串行发送、背压这类十几行的小工具。可以跟着改的测试：`server-connection.test.ts` 2,469 行、`connection-controller.test.ts` 253 行、crypto 的 366 行和 protocol 测试里控制帧那部分 [14][15][17][18]。

### 3.2 `server-connection.ts` 只走中继时留什么、改什么

- **可以删掉约 650 行**（按方法的行号区间估算）[17]：
  - WebRTC 约 480 行：`handleSignalOffer`、`handleSignalIce`、`handleTransportSelected`、`handleRtcOpened`、信令发送、同链路 IPv6 判定、带内升级的建立和排空；
  - Relay attach 约 160 行：`attachRelayDataSocket`、`retireDataSocket`、`openDataSocket`（最小 Server 不支持）；
  - 控制租约约 30 行。
- **留下的是通用部分**：注册后用 full jitter 退避重连（窗口 0 到 30 秒）、hello 和 hello.ack、心跳活性、按 (关闭码, 关闭原因) 分类关闭、按 `connectionId` 存放进行中的连接、握手到达顺序的处理、`relay` 收发，以及 `ServerNoiseChannel`：串行发送、加密前分片、解密后重组、计数器检查、任何错误都关闭这条连接 [17][9][10]。
- **必须改的是 `handleConnectIncoming`**（约 80 行）[17]：
  - 现在：收到 `connect.incoming` 后用 Host 自己的设备 token 调 `GET /api/v1/devices/{clientDeviceId}`，确认服务器认可这台 Client；本地没有固定过就直接把服务器给的公钥写进本地 `trusted-peers.json`；本地固定的公钥和服务器给的不同时拒绝，除非开了 `rotatePinnedPeerKey` 且 membership 没变 [17][19]。
  - Pigcode：不调服务器，只查电脑上的已配对手机列表；查不到就 `connect.rejected`，配对窗口打开时走配对分支（第 5 节）（推论）。
- **接进 Pigcode 的 Host**（推论）：`ServerNoiseChannel` 对外是 `send(message)`、`onMessage(handler)`、`close()` [17]，Pigcode 的 `HostTransport` 是同名的三个方法 [47]，包一层适配器的规模和现有 47 行的 `MessagePortTransport` 相当 [47]。但 Pigcode 的 Host 现在「新连接会关掉旧连接」[48]，要同时服务窗口和手机，就得先像 `ConnectionController` 那样按连接隔离订阅和流 [18]。
- **重连不重放**：上游断线后关闭这条连接，重新做授权和 Noise，再由上层重开订阅、重读基线；不维护通用的事件重放缓冲，也不重发结果未知的修改 [9][10]。Pigcode 按 cursor 续订的模型可以直接接在这上面（推论）。

## 4. 手机一侧（Dart）

### 4.1 现成的 Dart 实现

在 pub.dev 用「noise protocol」「noise handshake」「Noise_IK」「noise framework」「libp2p noise」搜索，和 Noise 相关的包如下 [36][38][39]：

| 包 | 版本、发布日期 | 许可 | 能不能用于 IK + 25519_ChaChaPoly_SHA256 |
|---|---|---|---|
| `noise_protocol_framework` | 1.2.0，2026-03-10；30 天下载 113 次 | MIT | 不能：只有 NKpsk0、KNpsk0，DH 是 P-256（[调研：用 Flutter 做手机端，能不能顺带覆盖所有端](https://github.com/pigcode/monorepo/issues/106)已核对源码 [49]） |
| `noise_protocol` | 0.1.1，2020-05-11，已停止维护 | — | 不能：不兼容 Dart 3 |
| `torann` | 0.3.1，2026-10-11；0 个赞，30 天下载 19 次；仓库建于 2026-08-24，0 星 | MIT | 能，但不是纯 Dart：Flutter 插件包着 iOS 上的 Swift（CryptoKit）和 Android 上的 Kotlin（JCA、Bouncy Castle）实现，经 Pigeon 调用，所有方法都是异步的；要求 iOS 18 以上、Android 13（API 33）以上；实现了规范的全部 38 种握手；测试跑 cacophony 的 944 条和 snow 的 408 条向量（iOS 上是其中 440 条）；README 写「not production ready」「has not been independently audited」 |
| `cipherbird` | 1.6.0，2026-11-20 | MIT | 不能：经 FFI 调随包分发的原生引擎，Noise 只有 XX |
| `dart_libp2p` | 4.12.2，2026-11-12 | MIT | 不能：Noise 只有 libp2p 用的 XX |
| DSH Go `packages/dsh_remote` | 不在 pub.dev，`publish_to: none` | 文件级 MIT 和 AGPL 混合，见 6.6 | 能，纯 Dart，逐字节通过上游向量 [43]；但它是 DSH Go 的内部包 |

[调研：用 Flutter 做手机端，能不能顺带覆盖所有端](https://github.com/pigcode/monorepo/issues/106)「Noise 没有能用的 Dart 现成实现」的结论基本成立，只是没有列出 Torann [49]。

### 4.2 密码学原语

| 包 | 版本、发布日期 | 要点 |
|---|---|---|
| `cryptography` | 2.9.0，2025-11-21（已经一年没有发布） | X25519、ChaCha20-Poly1305、SHA-256、HKDF、HMAC 都有 [36][49]。`package:cryptography/dart.dart` 里的 `DartX25519.sharedSecretSync` 和 `DartChacha20.poly1305Aead().encryptSync/decryptSync` 是同步的纯 Dart 实现，在调用方的 isolate 上运行 [37]。`sharedSecretSync` 不检查低阶点：本机实测对全零公钥返回全零结果 [37][42]。`cryptography_flutter` 2.3.4 可以在 Android 和 Apple 系统上改用系统实现 [36][49]，本次没有核对它有没有同步接口 |
| `crypto` | 3.0.8，2026-10-26 | Dart 团队的 SHA-256 和 HMAC [36] |
| `sodium` | 4.1.5，2026-11-20 | 原始 X25519 只在 Sumo 版里，SHA-256、HMAC-SHA2 还没实现 [49]；新版本要求 Dart SDK `^3.14.0` [36] |
| `pointycastle` | 4.0.0，2025-02-19 | 不需要 |

推论：照规范自己实现时，用 `cryptography` 的同步 X25519 和 ChaCha20-Poly1305，加 `crypto` 的 SHA-256 和 HMAC 就够了，和 DSH Go 的选择相同 [43]。

### 4.3 用 `cryptography` 实现 Noise IK 的要点

依据 Noise 规范第 34 版 [30]，以及上游 TS 实现的约束 [10][14]：

- **初始化**：协议名 `Noise_IK_25519_ChaChaPoly_SHA256` 恰好 32 字节，等于 SHA-256 的输出长度，所以 `h` 直接取协议名本身、不做哈希，`ck = h`；先 `MixHash(prologue)`，再 `MixHash(响应方静态公钥)`（IK 的预消息 `<- s`）。
- **两条握手消息**：发起方（手机，上游的 Client）`-> e, es, s, ss`，响应方（Host）`<- e, ee, se`；第一条消息里发起方的静态公钥是加密的（48 字节，含 16 字节标签），之后两边各自 `Split()`，第一把密钥用于发起方到响应方。
- **HKDF**：Noise 自己的 HKDF，即 `temp = HMAC(ck, ikm)`，输出依次是 `HMAC(temp, 0x01)` 和 `HMAC(temp, 输出1 || 0x02)`，不是直接调 RFC 5869 的接口。
- **nonce**：4 个零字节加 8 字节小端计数；解密失败时计数不加一；上游要求收到重复、过旧、乱序或认证失败的帧就关闭整条安全通道 [10]。
- **低阶点**：noble 在 X25519 结果全零时报错（本机实测 noble 1.9.7 和 2.3.0 都如此）[35]，`cryptography` 不报错 [42]；Dart 版要自己检查并报错，两端的失败行为才一致（规范允许这样做，但不鼓励 [30]）。
- **prologue**：上游格式是 `DSH-REMOTE\0v=1\0connection=<connectionId>\0host=<Host deviceId>\0client=<Client deviceId>` [14]；Pigcode 改标签后要生成自己的向量。
- **rekey 的 nonce**：规范的 `REKEY` 用 nonce 2^64−1 [30]。Dart 原生平台的 `int` 是有符号 64 位，字面量 `0xFFFFFFFFFFFFFFFF` 的值是 -1，用 `setUint64` 写出来正好是 8 个 0xFF（本机实测 [42]）；写代码时要注意别把它当成溢出处理掉。clatterjs 在这一点上写错了（6.1）。
- **测试入口**：向量会固定临时密钥，实现里要有只给测试用的注入口（上游 TS 是把临时私钥当作随机数源注入 [14]，Torann 把这个入口放在单独的 `testing` 库里 [38]）。
- **线程**：同步实现在调用方的 isolate 上算；DSH Go 的 README 写桌面 JIT 约 55 MB/s，4 MiB 的消息每个方向约 75 ms，并建议低端手机的大图片传输以后再挪到别的 isolate [43]。

### 4.4 本机实测：照规范写的 Dart Noise IK 和三套向量

在临时目录里只照规范写了一份 Dart 实现（没有参考 DSH Go 的代码），依赖 `cryptography` 2.9.0 和 `crypto` 3.0.8 [42]：

- **规模**：实现 211 行（去掉空行和注释 181 行），向量运行器 139 行。
- **结果**：33 项检查全部通过：
  - 上游 `fixtures/crypto/v1/noise-ik.json`：prologue 字节、两把静态公钥、两条握手消息、双方的载荷、Host 学到的手机静态公钥、三条传输消息的密文和每一步的四个计数器 [23]；
  - cacophony 的 `Noise_IK_25519_ChaChaPoly_SHA256` 向量：6 条消息和 `handshake_hash` [40]；
  - snow 的同名向量：4 条消息 [40]；
  - 上游 `fixtures/pairing/v1/proof.json` 的 3 条 proof（X25519 加 RFC 5869 HKDF-SHA256 加 HMAC-SHA256）[24]。
- **含义**：同一份照规范写的代码同时通过上游向量和两个独立实现（Haskell 的 cacophony、Rust 的 snow）的向量，说明上游向量符合标准 Noise，不只是 clatterjs 自己和自己一致；而 clatterjs 的 README 说它的非 PQ 向量测试只做了解析冒烟 [32]（推论）。
- **性能**（Apple M4，`dart compile exe` 的 AOT 版本）：一次完整的 IK 握手（两端都算）约 4.3 ms；48 KiB 的帧先加密再解密，约 17 MiB/s，即单方向约 34 MiB/s；JIT 下分别约 6.5 ms 和 19 MiB/s。手机上要在 profile 包里再测（推论）。

### 4.5 最小可行的 Dart 实现清单

只走中继、协议是 Pigcode 改过 prologue 和配对的 v1 子集时（行数是推论，依据见最后一列）：

| 模块 | 职责 | 估计行数 | 依赖 | 依据 |
|---|---|---|---|---|
| `noise` | IK 状态机、CipherState、Split、低阶点检查、尽力清零密钥 | 200 到 350 | `cryptography`、`crypto` | 本机实测 211 行；DSH Go `noise_ik.dart` 500 行（含会话包装、错误码和注释）[42][43] |
| `wire` | 规范的无填充 base64url；拒绝重复字段的 JSON 解析（`jsonDecode` 对重复字段只取最后一个） | 100 到 150 | `dart:convert` | 上游 `wire-json.ts` 32 行；DSH Go `bytes.dart` 150 行 [15][43] |
| `control` | 11 种 Control 帧的编解码和校验、64 KiB 和 1 MiB 两个上限、版本和 capability 协商 | 250 到 350 | — | DSH Go `control.dart` 376 行（含全部 18 种帧）[43] |
| `fragments` | DSHF 分片：超过 48 KiB 切片，重组上限 4 MiB，同时最多 8 条 | 约 120 | — | 上游 `SecureMessageCodec` 约 110 行 [15] |
| `relay_transport` | `wss://<中继>/ws/v1/connect`；hello、`connect.request`、握手中转、带计数的 `relay` 帧、回 pong、关闭分类、发送背压 | 300 到 450 | `web_socket_channel` 3.0.3 或 `dart:io` 的 WebSocket | 上游 `RelayTransport` 365 行，其中约 120 行是 attach；DSH Go 647 行（含 attach 和信令）[16][43] |
| `secure_channel` | 在传输上跑 Noise：串行发送、解密后重组、任何错误都关闭、full jitter 重连、跟随前后台 | 200 到 300 | — | 上游 `ClientSecureTransport` 155 行；DSH Go 251 行 [18][43] |
| `identity` 和 `pairing` | 手机静态密钥的生成和安全存储、固定电脑公钥；二维码严格解析；首连带配对秘密 | 200 到 350 | `flutter_secure_storage` 11.2.0；扫码放在 Flutter 界面里，用 `mobile_scanner` | 配对方案见第 5 节 |
| **合计** | | **约 1,400 到 2,100 行 Dart，另加同量级的测试** | | DSH Go 对应的 7 个 MIT 文件共 2,350 行，范围比这里大（含 Relay attach、全部帧和 DSH 的 RPC）[43] |

不在这张表里的：Pigcode 自己的 RPC 客户端、返回值和事件的模型、时间线逻辑；上游对应的通用部分是 `client-core` 里按请求 ID 关联响应和超时的 `RemoteClientCore`（242 行）[22]，DSH Go 的 Dart 版 `rpc_client.dart` 是 214 行 [43]。[调研：用 Flutter 做手机端，能不能顺带覆盖所有端](https://github.com/pigcode/monorepo/issues/106)估过这部分 TS 约 4,500 行要用 Dart 重写 [49]。推论：传输、加密和配对这一层放在一个不依赖 Flutter 的纯 Dart 包里，CI 里用 `dart test` 就能跑互通测试，DSH Go 的 `dsh_client`、`dsh_remote` 也是这样分的 [43]。

### 4.6 用上游测试向量做互通测试

推论，按从快到慢排：

1. **把向量复制进 Pigcode 仓库**：上游 `fixtures/crypto/v1/noise-ik.json`、`fixtures/pairing/v1/proof.json`、`fixtures/protocol/v1/`（MIT，保留署名）[23][24][25]，加上 cacophony 和 snow 里的 IK 向量（Unlicense；MIT 或 Apache-2.0）[38][40]。不要从 DSH Go 复制它的副本（测试目录没有许可头，按 AGPL）[43]。
2. **Dart 和 TS 各跑一遍确定性向量**：`dart test` 和 vitest 读同一份 JSON；比对握手消息、传输密文、计数器和 `handshake_hash`。4.4 的运行器就是这一层，139 行 [42]。上游 TS 的跑法是把向量里的临时私钥当作随机数源注入 [14]。
3. **生成 Pigcode 自己的向量**：改了 prologue 以后，用 TS 实现以固定密钥生成一份，除了上游已有的字段，再记下握手哈希（clatterjs 的握手对象有 `getHash()` [32]）、两个方向的密钥、一次超过 48 KiB 的分片消息；做了 rekey 就再加 rekey 前后的密文。上游规定向量是兼容基线，依赖升级后不得直接重写 [10][23]，Pigcode 照这条执行。
4. **控制帧一致性**：复用上游 `protocol/v1` 的用例格式（每个用例有 operation、input 和应接受或应拒绝）[25]，只留 11 种帧相关的；DSH Go 用了其中 84 个 Client 侧用例 [43]。
5. **负面用例**：照上游 `noise.test.ts` 的 4 个用例（双向正常收发、对端公钥不符和密文篡改、重放、关闭后再用）[14]，加上低阶点、prologue 不同、握手顺序错、计数跳号、分片乱序或超限。
6. **真连接**：CI 里起裁剪后的中继和 Node 里的 Host 安全通道，再用 Dart VM 上的客户端连过去：握手、往返几条 RPC、收一条超过 48 KiB 的消息、断开重连。DSH Go 的 `tool/e2e/run_e2e.sh` 对真实的上游 Server 做过同样的事 [43]（脚本是 AGPL，只借思路）。
7. **设备上**：iOS 模拟器和开发者的 iPhone 上跑 Flutter 集成测试，用 profile 包测加解密耗时和首屏。

### 4.7 工作量

推论：传输、加密和配对这一层按 4.5 约 1,400 到 2,100 行 Dart，测试和它同量级；对照 DSH Go，同一层的 7 个 MIT 文件是 2,350 行，整个 `dsh_remote` 的测试是 9,184 行 [43]。Noise 本身最容易验证（三套向量，本机实测一次通过）；花时间的是传输、重连和生命周期的边界情况，DSH Go 的测试大多数也在测这些（文件名如 `relay_late_socket_test`、`rpc_queued_deadline_test`、`secure_handshake_close_test`）[43]。

## 5. 配对

### 5.1 dsh-pairing-v1 的现状

流程和信任边界已在[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105)里写过 [49]：电脑插件出示 180 秒有效的二维码，手机确认服务器和电脑指纹后领取 8 位验证码，用户在电脑上输入，服务器只校验一次，双方各自拿到设备凭据。本次补充：

- **谁实现了**：文档第一句是「独立完整 Server 与 Remote Host 已实现此契约……本仓库最小自部署 Server 不提供此能力」[12]。文档里的互操作检查要连「隔离的 C# Server API/Gateway」，命令是 `dotnet run`；proof 向量由 Python cryptography 生成、用 NSec 独立核对 [12][24]。推论：完整 Server 是 .NET 写的，不开源，Pigcode 想沿用就得自己实现服务端。
- **服务端要做的事**：配对会话的状态机（created、claimed、approved、completed，以及 failed、cancelled、expired）、每个会话一把临时 X25519 密钥、每个请求的 HMAC 持有证明、8 位验证码只校验一次、按提交 ID 和请求字节去重、结果恢复窗口（创建后 480 秒）、`dsh-device:<UUID>` 内部账号、单条 membership、按 IP 限流 [12]。推论：这比整个最小 Server（1,664 行）还复杂。
- **信任根**：短二维码 `https://<server>/pair#v1.<ticket>` 里只有 ticket，电脑公钥来自用户确认过的 HTTPS 服务器；文档承认「若服务端被攻破，短格式没有独立于该服务的身份保证」[12]。旧的完整 JSON 二维码里直接带了电脑的设备描述和公钥 [12]。
- **电脑端的指纹**：配对界面用完整的 `lowercaseHex(SHA256(公钥))` [20]；但 `crypto` 包的 `identityFingerprint` 只取 SHA-256 的前 6 字节，`identity-store.ts` 的 `fingerprint` 也只取 12 个十六进制字符，都是 48 位 [14][19]。

### 5.2 能不能直接沿用

不宜直接沿用（推论）：

- 它要求服务器参与配对的每一步，而 Pigcode 的方向是中继不在信任链上；
- 它的身份按服务器 origin 隔离，换中继地址就要重新配对 [19][12]；
- 它的「私钥持有证明」和「8 位验证码」都是为了让服务器能核对设备，Pigcode 让电脑直接在加密通道里核对手机，这两样都用不上。

### 5.3 改成「二维码里放电脑公钥、撤销在电脑上做、不用第三方账号」要动哪些地方

方案（推论）：

| 环节 | dsh-pairing-v1 | Pigcode |
|---|---|---|
| 二维码内容 | 服务器地址加 ticket [12] | 中继地址、电脑的设备 ID、电脑的静态 X25519 公钥（43 个字符）、一次性配对秘密（32 字节随机）、过期时间；接近旧的完整 JSON 格式，去掉服务器公钥和会话 ID |
| 配对会话 | 服务器创建，180 秒，只存 ticket 的摘要 [12] | 电脑上的 Host 创建，180 秒，只存秘密的摘要 |
| 核对电脑身份 | 手机向服务器解析 ticket，显示电脑名、服务器和完整指纹 [12] | 不需要解析：手机把二维码里的公钥作为 IK 的响应方静态公钥，对面不是这台电脑，握手第二条消息就解不开 [30] |
| 证明持有私钥 | 每个请求带 HMAC [12] | Noise IK 的 `es`、`ss`、`se` 本身就证明双方持有各自的静态私钥，不需要额外的证明 [30] |
| 证明人在场 | 手机显示 8 位码，用户在电脑上输入，只有一次机会 [12] | 秘密放进 IK 第一条消息的加密载荷交给电脑，电脑本机界面显示「这台手机请求配对」和手机指纹，由用户确认 |
| 防重放 | 服务器只校验一次 [12] | 规范说 IK 第一条消息的载荷「vulnerable to replay」[30]，所以秘密用过一次就作废，电脑同时只开一个配对窗口 |
| 凭据 | 服务器建内部账号和 membership，签发双方 token [12] | Host 把手机的设备 ID 和公钥写进电脑上的已配对列表；中继凭据另定（2.3） |
| 撤销 | 服务器 `DELETE /api/v1/device-memberships/{peer}`，公开代码里没有调用它的界面 [12][49] | 在电脑上删除这台手机：Host 拒绝它之后的握手，并立即关闭它现有的连接，不依赖中继 |
| 身份范围 | 按服务器 origin 隔离 [12][19] | 按「电脑—手机」这一对，换中继地址不用重新配对 |

要改的代码位置（推论）：

- **Noise 包装**：上游 `NoiseIkSession` 要求响应方事先给出对端公钥，握手里拿到的公钥不一致就报 `PEER_IDENTITY_MISMATCH` [14]。配对时电脑还不知道手机公钥，要加一个配对模式：先接受未知的发起方，读出第一条消息的载荷校验秘密，通过后再进入后续流程。
- **`handleConnectIncoming`**：上游信服务器给的 Client 公钥 [17]；改成先查已配对列表，查不到且配对窗口开着才进配对模式，否则 `connect.rejected`。
- **自动信任**：上游本地没有固定过就直接写入服务器给的公钥 [17]。`service.ts` 里有 `revokePeer`（删掉本地固定并关闭连接），但仓库里没有调用它的地方 [19]；而且删掉以后，下一次连接会按服务器的 membership 重新固定（推论）。Pigcode 不能保留这个自动信任。
- **确认界面**：上游要求最终提交「放在专用本机用户界面，禁止模型工具、远程 Client 或普通远程 RPC 调用」[12]。Pigcode 的确认按钮要放在 Electron 窗口里，不能做成手机端或 Agent 能调用的 RPC（推论）。

### 5.4 可以照搬的约束

来自配对文档 [12]：会话 180 秒有效；秘密 32 字节随机、规范 base64url，只存摘要；手机直接解析扫码文本，不打开网页、不跟随重定向，限制文本长度（建议最多 2048 字节）；不把秘密写进日志、剪贴板、崩溃上报和分析；失败后重新生成二维码，不在后台自动重试；最终确认只在电脑本机界面。

## 6. 风险和许可

### 6.1 `@lukeburns/clatterjs`

- **发布情况** [31]：npm 上只有 1.0.0 一个版本，发布于 2026-04-24；维护者 `lukeburns`；没有 `repository`、`homepage`、`bugs` 字段，`gitHead` 指向的提交找不到公开仓库，GitHub 上搜「clatterjs」没有结果，`lukeburns/clatterjs` 返回 404 [34]。最近 30 天下载 17,561 次，最近 7 天 13,087 次 [31]；这些下载有多少来自 ds-harness-remote，没有找到一手来源。
- **包里有什么** [32]：95 个文件，只有编译后的 `dist/`（JS、类型声明和不含源码的 source map），没有测试。依赖 `@noble/ciphers`、`@noble/curves`、`@noble/hashes` 的 2.x 和 `@noble/post-quantum` 0.6.1；上游 `crypto` 包自己又直接依赖 noble 1.x，锁文件里两个大版本同时存在 [14]。
- **来历** [32][33]：README 的定位是「Noise post-quantum (PQ) handshakes in TypeScript」，并逐项对照 Rust 版 clatter 的测试；LICENSE 是 MIT，版权行是「Copyright (c) 2025 Joni Lepistö」，和 Rust 版 clatter（jmlepisto/clatter，MIT，45 星，最近一次推送 2026-08-30）的 LICENSE 文字相同，只差每行开头的空格和空行。
- **测试**：README 的对照表里，非 PQ 握手的向量测试一栏写着「optional vectors file currently parse-smoke only」[32]。
- **rekey 不符合规范**：`dist/crypto/cipher.js` 和 `dist/cipherState.js` 把 `U64_MAX` 定义为 `0xfffffffffffffffn`，只有 15 个 f，本机核对等于 2^60−1 [32]。`rekey()` 用它作 nonce，而规范要求 `REKEY` 用 2^64−1 [30]；Rust 版 clatter 用的是 `u64::MAX` [33]。所以 clatterjs 的 rekey 和任何照规范实现的一端都对不上；nonce 耗尽的判断也提前到 2^60−1（实际用不到）。上游没有调用 rekey [14]，眼下不受影响。
- **审计**：没有找到 clatterjs 的审计记录。noble 的 curves 有 Cure53、Trail of Bits 等审计 [49]，但那是 noble，不是 clatterjs 的 Noise 状态机。
- **清零**：上游的 `destroy()` 注释写「clatterjs has no key erase API」，只能丢掉引用 [14]。
- 推论：Pigcode 的 Host 一侧不依赖 clatterjs，而是按[调研：手机端技术栈的候选](https://github.com/pigcode/monorepo/issues/90)原来的建议，用 noble 的 `x25519`、`chacha20poly1305`、`sha256` 和 `hmac` 照规范写一份（规模和 4.4 的 Dart 版相当），保留上游 `NoiseIkSession` 的接口和检查，和 Dart 版跑同一套向量 [49]。

### 6.2 上游列出的安全待办

- 「完成 Noise 独立安全审查，定义长期连接 rekey 与最大生命周期，核对断线密钥清理」[13]；端到端加密文档也写「长期连接 rekey 和独立密码安全审查仍在路线图中」[11]。
- 「将 Plugin 身份私钥与 refresh token 接入系统 Keychain / Secret Service」[13]：上游电脑一侧的私钥现在是权限 0600 的文件 [19]。
- 「复查构建链依赖安全公告并做兼容升级」[13]。
- 「逐项对齐 `packages/protocol`、线协议与消费端……补齐 golden vectors」[13]。
- 首次信任押在服务器上：「若服务端被攻破或恶意运行，它可能为同账号伪造新设备描述，使首次连接固定攻击者的公钥」[11]。Pigcode 用二维码里的公钥避开这一条（5.3）。

### 6.3 自己实现 Noise 状态机的风险

- 上游协议规定「禁止自行实现 Noise state machine 或修改算法组合」[10]；DSH Go 的 Dart 版是例外，文件头写明经上游作者同意 [43]。
- Dart 没有成熟的纯 Dart IK 实现（4.1），Pigcode 无论如何要自己写或依赖原生插件。推论：风险在于少见路径上的差错（计数、空载荷、低阶点、清零），对策是三套向量、负面用例、TS 和 Dart 两份实现互测，必要时再用 Torann 做第三份交叉验证 [38][42]。

### 6.4 上游变化快

v0.6.2 到 v0.6.7 只隔了 19 天 [28]。推论：Pigcode 复制它当前的协议子集后自己维护，不跟着上游升级；上游 v1 只做加法的规则 [10] 让这样分叉的成本较低。

### 6.5 MIT 的署名要求

- MIT 原文：「The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.」[26]
- 推论（不是法律意见）：
  - 复制或改写上游代码、fixture 时，在 Pigcode 仓库里保留「Copyright (c) 2026 DSH Remote contributors」和 MIT 全文，例如放一份 `LICENSE-ds-harness-remote` 并在第三方声明里写明来源和提交。DSH Go 就是这样做的：包里放 `LICENSE-ds-harness-remote`，源码文件头加 SPDX 标记 [43][44]。
  - 依赖 clatterjs 或 noble 时，它们的 LICENSE 随 npm 包分发；打进 Electron 安装包时，要把这些许可证放进应用的第三方许可清单。
  - `packages/plugin/src/hostc/` 来自 akazwz/hostc，许可是 Apache-2.0（`LICENSE-hostc`）[21]，和中继无关，不要搬。
  - cacophony 向量按 Unlicense 进入公有领域；snow 向量是 MIT 和 Apache-2.0 双许可，任选其一 [38]。

### 6.6 DSH Go `packages/dsh_remote` 的许可

以下按文件头和许可证原文说事实，不是法律意见。DSH Go 仓库以 AGPL-3.0 发布 [45]；`dsh_remote` 里有 14 个文件的文件头是 `SPDX-FileCopyrightText: 2026 DSH Remote contributors` 加 `SPDX-License-Identifier: MIT`，后面一行是「See THIRD_PARTY_NOTICES.md.」[43]。

| 文件（`lib/src/` 下） | 行数 | 写了 Local changes 吗 | 第三方声明里对应的上游来源 [44] | 是否 import 没有许可头的文件 |
|---|---|---|---|---|
| `account/remote_account.dart` | 1,673 | 没有 | `apps/android` 的 `server-session-manager.ts`、`device-directory.ts`、`connection.ts`，插件的 `cli.ts` | 是：`state.dart`、`transport/transport.dart`，另依赖 AGPL 的 `dsh_client` 包 |
| `carrier/tunnel_carrier.dart` | 1,021 | 没有 | `client-core` 的 `remote-gateway.ts`；白名单来自插件的 `harness-remote-bridge.ts`、`terminal-policy.ts`；上传参考上游文档和插件代码 | 是：`state.dart`、`transport/transport.dart`、`dsh_client` |
| `channel/rpc_client.dart` | 214 | 没有 | `client-core` 的 `index.ts`（`RemoteClientCore`） | 否 |
| `channel/secure_channel.dart` | 251 | 没有 | 插件的 `client-secure-transport.ts`、`server-connection.ts` | 是：`transport/transport.dart` |
| `crypto/noise_ik.dart` | 500 | 没有；文件头写 IK 状态机「is our own implementation, written with the upstream author's agreement」 | `crypto` 的 `noise.ts`、`index.ts`（会话封装） | 否 |
| `pairing/device_pairing.dart` | 507 | 没有 | 第三方声明里没有列；文件头写按上游 `docs/device-pairing-v1.md` 实现，proof 向量复制自上游 | 否 |
| `protocol/control.dart` | 376 | 没有 | `protocol` 的 `index.ts`（信封、校验、限额、协商、Relay data frame） | 否 |
| `protocol/messages.dart` | 212 | 没有 | `protocol` 的 `index.ts`（`RemoteMessage`、`SecureMessageCodec`、RPC 载荷） | 否 |
| `server/server_api.dart` | 722 | 没有 | `apps/android` 的 `services/api.ts`，上游协议和接入文档 | 否 |
| `transport/peer_connection.dart` | 245 | 没有 | `webrtc` 的 `rtc-data-channel.ts`、`rtc-adapter.ts` | 否 |
| `transport/relay_transport.dart` | 647 | 没有 | `webrtc` 的 `index.ts`（`RelayTransport`）、`adaptive-transport.ts` | 否 |
| `transport/rtc_chunking.dart` | 130 | 没有 | `webrtc` 的 `rtc-chunking.ts`（`RTCH` 分块，线格式逐字节一致） | 否 |
| `transport/webrtc_transport.dart` | 474 | 没有 | `webrtc` 的 `adaptive-transport.ts`、`rtc-data-channel.ts` | 否 |
| `util/bytes.dart` | 150 | 没有 | `protocol` 的 `wire-json.ts`、`index.ts` | 否 |

- 14 个文件共 7,122 行。整个 `dsh_remote` 里没有一处写 Local changes；DSH Go 里写了 Local changes 的是 7 个聊天界面的 Dart 文件和 7 个手机操控的 Kotlin 文件 [43]。[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105)说 DSH Go 的 MIT 文件「多数改过（文件头写 Local changes）」，这句话不适用于 `dsh_remote` [49]。
- 没有许可头、按仓库 AGPL-3.0 的：`lib/dsh_remote.dart`、`account/secret_store.dart`、`dsh_web.dart`、`session_transfer.dart`、`state.dart`、`transport/transport.dart`（共 774 行），`bin/remote_probe.dart`（203 行），全部测试（9,184 行 Dart，包括 `test/support/fake_remote.dart`），`tool/e2e/`（419 行）[43]。测试目录里的上游 fixture 是「原样复制」的上游 MIT 内容 [44]。
- DSH Go 的作者 `ccch1mneyyy` 在上游贡献者名单里，有 8 个提交 [28]，所以「DSH Remote contributors」这个署名可以包括他；DSH Go 自己的改动适用哪个许可，第三方声明没有另行说明 [44]。
- AGPL-3.0 第 5 条 (c) 要求修改版在传递时把整个作品按 AGPL 授权（[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105)已引原文 [49]）。
- 推论：
  - 阅读、学习这 14 个文件的思路不受许可证限制；按文件头的字面意思，它们可以在 MIT 条件下使用（保留署名）。
  - 但其中 3 个 import 了 AGPL 文件，单独拿出来编译不了，补齐时不能照抄那些 AGPL 文件；而且 Pigcode 会改 prologue、配对和中继鉴权，直接搬也要大改。
  - 所以更干净的做法是以上游的 TS、fixture 和 Noise 规范为准自己写，DSH Go 的 MIT 文件当对照；AGPL 的文件和全部测试不复制、不改写。

## 7. 对 Pigcode 的启示

### 7.1 [手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办](https://github.com/pigcode/monorepo/issues/96)

- **拓扑**：Host 和手机端都连出到 `wss://<中继>/ws/v1/connect`，电脑不监听端口；第一版客户端只声明 `transport.relay` [2][10]。架构稿 §15「v1.0 无本地网络监听」可以保留（推论，与[调研：手机在外网怎么连回电脑](https://github.com/pigcode/monorepo/issues/89)一致 [49]）。
- **中继从哪来**（推论，两条路可以先后走）：
  - 自用第一版先原样部署上游最小 Server，用开发者自己的账号密码，Pigcode 只在 Host 和手机端做配对和撤销；改动全在 Pigcode 这边，最快能连通（2.3）。
  - 之后把网关、存储和协议子集复制进 Pigcode 自己维护（保留 MIT 署名），去掉账号密码，换成 Host 签发的中继凭据，并补上下面两项。公开发布只能走这条路，因为上游的多账号 Server 不开源 [1][8]。
- **电脑离线时手机看到什么**：中继 25 秒心跳、75 秒判离线，`connect.request` 会立即得到 `HOST_OFFLINE` [2]。要显示「最后在线时间」，中继得在断开时也更新 `lastSeenAt`（上游只在 hello 时更新）[2][4]；要区分「Pigcode 已退出」和「电脑睡眠或断网」，Host 退出前要发一条告别帧或用约定的关闭原因，上游协议没有这个帧（推论）。
- **重连**：断线后新建连接、重新握手、按 cursor 续订，中继不缓存也不重放 [9][10]。手机回前台或网络变化时立即重连；退避用 full jitter，上游的上限是 Host 和 Client 载体默认 30 秒、WebRTC 和 Relay 控制面恢复 15 秒 [10]。
- **Host 要先支持多条连接**：上游按 `connectionId` 隔离 RPC、流和清理 [18]；Pigcode 的 Host 现在新连接会关掉旧连接 [48]，窗口和手机同时在线之前要先改（推论）。
- **部署**：按 2.4 准备；大陆服务器的备案和 IP 证书问题按连接调研的建议处理 [49]；蜂窝网下把 hello 超时调到 10 到 15 秒 [6]。

### 7.2 [配对、设备身份与加密](https://github.com/pigcode/monorepo/issues/97)

- **照搬的**：套件 `Noise_IK_25519_ChaChaPoly_SHA256`；prologue 绑定协议名、版本、`connectionId` 和两端设备 ID；超过 48 KiB 先分片、重组上限 4 MiB；重复、乱序、篡改或身份不符一律关闭整条通道 [10][11][14][15]。prologue 换成 Pigcode 自己的标签和版本，并生成 Pigcode 自己的向量；上游向量和 cacophony、snow 的 IK 向量作为实现正确性的基线，本机实测都能通过（4.4）。
- **配对**：不走 dsh-pairing-v1，按 5.3：二维码放中继地址、电脑设备 ID、电脑公钥、一次性秘密和过期时间；秘密放进 IK 第一条消息的加密载荷，用一次就作废；电脑本机界面确认，手机端和 Agent 都调不到这个确认（推论）。安卓模拟器上用粘贴配对链接代替扫码，见连接调研 [49]。
- **撤销**：以电脑上的已配对列表为准，删除后 Host 拒绝握手并立即关闭现有连接 [19]；不保留上游「本地没有就信服务器」的自动信任 [17]。
- **指纹**：上游两处显示用的指纹都只有 48 位 [14][19]，配对文档自己建议用完整 SHA-256 [12]；在电脑上显示手机指纹时用完整摘要的分组形式（推论）。
- **私钥存放**：电脑一侧放系统钥匙串，不学上游现在的 0600 文件（它自己也列为待办）[13][19]；手机端放 `flutter_secure_storage`（推论）。
- **rekey 和审查**：上游都没做 [11][13]，clatterjs 的 rekey 不符合规范 [32]。推论：第一版不做 rekey，每次重连都是新握手、新密钥，并在协议里写明单条连接的最长寿命；独立审查列为公开发布前的待办。
- **中继能看到的**：设备 ID、在线时间、连接时间、帧的大小、方向和时序，看不到内容 [11]；这些要写进隐私说明（连接调研的建议 [49]）。
- **这张票要定的新词**至少有「配对」「已配对的手机」「中继」（推论）。

### 7.3 [手机端技术栈](https://github.com/pigcode/monorepo/issues/95)

- **工程分层**：传输、加密和配对放进一个不依赖 Flutter 的纯 Dart 包，CI 里用 `dart test` 和 Node 里的 Host 互通；界面和平台能力放在 Flutter 工程里（推论，DSH Go 也是这样分的 [43]）。
- **Noise**：用 `cryptography` 的同步 Dart 实现加 `crypto` 照规范自己写，约 200 到 350 行（4.4、4.5）。不依赖 Torann（原生、异步、iOS 18 和 Android 13 门槛、未审计），可以拿它做交叉测试的第二实现 [38]（推论）。
- **规模**：这一层约 1,400 到 2,100 行 Dart，另加测试；不含 Pigcode 的 RPC、模型和时间线（4.5）。
- **Host 一侧**：也照规范用 noble 写一份，不用 clatterjs；两份实现跑同一套向量（6.1，推论）。
- **性能**：本机 AOT 单方向约 34 MiB/s，DSH Go 报告桌面 JIT 约 55 MB/s、4 MiB 每个方向约 75 ms [42][43]。推论：首屏和大工具输出要在 Host 端先裁小（弱网同步那张票），超过 1 MiB 的解密可以挪到别的 isolate。
- **许可**：上游的 TS 和 fixture 是 MIT，保留署名就能用；DSH Go 的 MIT 文件当对照，AGPL 的文件和测试不碰（6.5、6.6，不是法律意见）。

## 待证实事项

- 上游最小 Server 在真实蜂窝网络、长时间连接和反向代理下的表现：上游 README 写「真实跨机与长期连接仍待回归」[1][13]；DSH Go 的端到端测试只在本机回环上跑过 [43]。
- ghcr.io 在大陆云服务器上能不能拉取镜像：没有找到一手来源。
- 完整多账号 Server 和 dsh-pairing-v1 的服务端实现：不开源，没有核实；「完整 Server 是 .NET」是根据文档里的 C# 和 `dotnet` 命令推出的。
- clatterjs 的源码仓库、测试和审计：没有找到一手来源，npm 包里只有编译后的 JS；上游有没有向 clatterjs 报告 rekey 常数的问题：没有找到。
- 4.4 的性能数字是 Apple M4 上的 AOT 结果，iPhone 上要在 profile 包里再测。
- 「秘密放进 IK 第一条消息」的配对方案只是推论，没有做原型；配对票里要确认一次性、单窗口和限流怎么落地。
- Torann 在 iPhone 上的表现和 Pigeon 异步调用的开销：只读了 README。
- Dart 的 `web_socket_channel` 和 `dart:io` WebSocket 在 iOS 进后台、切网络时的行为：本次没有核对。
- 中继只用 IP 加端口时，`DSH_SERVER_PUBLIC_URL` 和 Origin 校验怎么配：README 只举了域名的例子 [1]；Dart 客户端不发 Origin，按代码不受影响 [2][41]，没有实测。

## 参考来源

所有来源的访问日期都是 2026-11-21。ds-harness-remote 的链接都在提交 `839d74aadc74627c4d5d4c9df83bdd3bd50d47cd` 上；DSH Go 在 `da798027013851328f83f59af4adb52c3afaab23` 上。

ds-harness-remote（MIT）：

1. apps/server/README.zh.md: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server/README.zh.md
2. apps/server/src/gateway.ts（WebSocket 升级和 Origin 校验 L140–L169，心跳和未就绪连接 L170–L194，hello L431–L472，`connect.request` 与 `authorization: 'account'` L529–L574，握手步骤和 relay 计数 L601–L611，信令转发 L621–L661）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server/src/gateway.ts
3. apps/server/src/server.ts（REST 路由 L245–L311）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server/src/server.ts
4. apps/server/src/store.ts（token 有效期 L66–L79，`touch` 更新 `lastSeenAt` L125–L131）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server/src/store.ts
5. apps/server/src/ice.ts、config.ts、main.ts: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server/src
6. apps/server/.env.example、compose.yaml、Dockerfile、web/UPSTREAM.md: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server
7. apps/server/tests（server.test.ts、refresh-recovery.test.ts）: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/apps/server/tests
8. docs/server.md: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/docs/server.md
9. docs/network.md: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/docs/network.md
10. docs/protocol.md（§0、§5、§10–§13、§20–§25、Device pairing v1）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/docs/protocol.md
11. docs/end-to-end-encryption.md: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/docs/end-to-end-encryption.md
12. docs/device-pairing-v1.md: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/docs/device-pairing-v1.md
13. docs/TODO.md: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/docs/TODO.md
14. packages/crypto（package.json；src/noise.ts，prologue L153–L160；src/index.ts，`identityFingerprint` L63–L67；tests/）: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/crypto
15. packages/protocol（src/index.ts 的 `controlFrameTypes` L185–L204 和 `SecureMessageCodec` L1526 起；src/wire-json.ts；src/close-semantics.ts；tests/）: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/protocol
16. packages/webrtc/src/index.ts（`RelayTransport`）、src/transport.ts: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/webrtc/src/index.ts
17. packages/plugin/src/server-connection.ts（`handleConnectIncoming` L680–L761，`completeHandshake` L799–L942，`ServerNoiseChannel` L1563–L1800）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin/src/server-connection.ts
18. packages/plugin/src/connection-controller.ts、client-secure-transport.ts、types.ts: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin/src/connection-controller.ts ，https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin/src/client-secure-transport.ts
19. packages/plugin/src/identity-store.ts（`trustPeer`、`revokePeer` L253–L269，`serverStorageDirectory` 和 `fingerprint` L793–L802）、service.ts（`revokePeer` L503–L507）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin/src/identity-store.ts ，https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin/src/service.ts
20. packages/plugin/src/host-pairing.ts、pairing-contract.ts、server-api.ts、server-credentials.ts: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin/src/host-pairing.ts
21. packages/plugin（package.json、src/config.ts、src/index.ts、src/remote-tools.ts、src/rpc-router.ts、LICENSE、LICENSE-hostc、src/hostc/）: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/plugin
22. packages/client-core/src/index.ts（`RemoteClientCore`）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/packages/client-core/src/index.ts
23. fixtures/crypto/v1（noise-ik.json、README.md）: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/fixtures/crypto/v1
24. fixtures/pairing/v1/proof.json: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/fixtures/pairing/v1/proof.json
25. fixtures/protocol/v1（manifest.json、README.md 和 12 个套件）: https://github.com/liguobao/ds-harness-remote/tree/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/fixtures/protocol/v1
26. LICENSE（MIT，Copyright (c) 2026 DSH Remote contributors）: https://github.com/liguobao/ds-harness-remote/blob/839d74aadc74627c4d5d4c9df83bdd3bd50d47cd/LICENSE
27. `7c9fc70` 与 `839d74a` 的比较（1 个提交，改动的 20 个文件都在 packages/app-core）: https://github.com/liguobao/ds-harness-remote/compare/7c9fc702a66fa631f8968086448ad97b77fcca91...839d74aadc74627c4d5d4c9df83bdd3bd50d47cd
28. GitHub 仓库元数据、发布列表和贡献者列表（`gh api repos/liguobao/ds-harness-remote`、`gh release list`、`/contributors`）: https://github.com/liguobao/ds-harness-remote/releases ，https://github.com/liguobao/ds-harness-remote/graphs/contributors
29. 容器镜像 `ghcr.io/liguobao/ds-harness-remote/server` 的标签列表和 `latest` 清单（经 ghcr.io 的 registry API 读取）: https://github.com/liguobao/ds-harness-remote/pkgs/container/ds-harness-remote%2Fserver

Noise、clatterjs 和 noble：

30. Trevor Perrin, The Noise Protocol Framework, Revision 34（§4.2 `REKEY`，§5.1 `CipherState`，§7.5 的 IK 模式，§7.7 载荷安全属性，§11.3 Rekey，§12.1 的 25519）: https://noiseprotocol.org/noise.html
31. npm registry 上的 `@lukeburns/clatterjs`（registry.npmjs.org 的元数据；api.npmjs.org 的最近 30 天和 7 天下载量）: https://registry.npmjs.org/@lukeburns%2Fclatterjs ，https://api.npmjs.org/downloads/point/last-month/@lukeburns/clatterjs
32. clatterjs 1.0.0 发布包（LICENSE、README.md、package.json、dist/crypto/cipher.js 第 5 行、dist/cipherState.js 第 2 行、dist/nqHandshake.js）: https://registry.npmjs.org/@lukeburns/clatterjs/-/clatterjs-1.0.0.tgz
33. Rust 版 clatter（crates.io 元数据；仓库的 LICENSE、src/cipherstate.rs、src/traits.rs 里 `rekey` 用 `u64::MAX`，提交 `9a8d15c`）: https://crates.io/crates/clatter ，https://github.com/jmlepisto/clatter/blob/9a8d15c4f80d5911ca0403aa22e0de99ea59df08/src/traits.rs
34. GitHub 搜索「clatterjs」（无结果）和 `repos/lukeburns/clatterjs`（404）: https://github.com/search?q=clatterjs&type=repositories
35. 本机实测：用 `@noble/curves` 1.9.7 和 2.3.0 的 `x25519.getSharedSecret` 传入全零公钥，两版都报「invalid private or public key received」。这不是公开来源。

Dart：

36. pub.dev API（`https://pub.dev/api/packages/<包名>` 及 `/score`；搜索 API `https://pub.dev/api/search?q=...`）：`cryptography`、`cryptography_flutter`、`crypto`、`pointycastle`、`sodium`、`sodium_libs`、`noise_protocol_framework`、`noise_protocol`、`torann`、`cipherbird`、`dart_libp2p`、`msgp2p_core`、`universal_storage_session_aead`、`trezor_flutter`、`web_socket_channel`、`flutter_secure_storage`: https://pub.dev/api/packages/cryptography
37. `cryptography` 2.9.0 发布包源码（lib/src/dart/x25519.dart 的 `sharedSecretSync`，lib/src/dart/dart_cipher.dart 的 `encryptSync`、`decryptSync`，lib/src/cryptography/key_pair_type.dart）: https://pub.dev/packages/cryptography/versions/2.9.0
38. Torann（提交 `8697fdb`：README.md、flutter/torann/README.md、vectors/README.md；仓库元数据）: https://github.com/stonygrey/torann/blob/8697fdbf0100a17d5935c0f21ac65c5a01321b82/README.md ，https://github.com/stonygrey/torann/blob/8697fdbf0100a17d5935c0f21ac65c5a01321b82/flutter/torann/README.md ，https://github.com/stonygrey/torann/blob/8697fdbf0100a17d5935c0f21ac65c5a01321b82/vectors/README.md
39. CipherBird README（Noise 只有 XX）；dart_libp2p 的 `lib/p2p/security/noise/xx_pattern.dart`: https://github.com/Crdzbird/CipherBird ，https://github.com/stephanfeb/dart_libp2p
40. cacophony 的 `vectors/cacophony.txt`（提交 `8ee9d41`，这个文件最后一次修改在 `18b7348`）和 snow 的 `tests/vectors/snow.txt`（提交 `8ac60f5`）: https://github.com/haskell-cryptography/cacophony/blob/8ee9d41e34a1a596cfa3ab12aa4069ff87dc1247/vectors/cacophony.txt ，https://github.com/mcginty/snow/blob/8ac60f51cfe3e010c84f0a454cc575ad9204fa12/tests/vectors/snow.txt
41. Dart SDK 的 `sdk/lib/_http/websocket_impl.dart`（本次在本机 Dart 3.12.2 的同一文件里检索，没有任何 Origin 处理）: https://github.com/dart-lang/sdk/blob/main/sdk/lib/_http/websocket_impl.dart
42. 本机实测：Dart 3.12.2，依赖 `cryptography` 2.9.0 和 `crypto` 3.0.8，照 Noise 规范写的 IK 实现（211 行）和向量运行器（139 行），对上游 `noise-ik.json`、cacophony 和 snow 的 `Noise_IK_25519_ChaChaPoly_SHA256` 向量、上游配对 proof 向量共 33 项检查全部通过；`DartX25519` 对全零公钥返回全零；`0xFFFFFFFFFFFFFFFF` 经 `setUint64` 写出 8 个 0xFF；Apple M4 上 AOT 和 JIT 的握手与加解密耗时。代码在临时目录，没有提交。这不是公开来源。

DSH Go（AGPL-3.0）：

43. packages/dsh_remote（pubspec.yaml、README.md、VERIFICATION.md、LICENSE-ds-harness-remote、lib/src/ 下各文件的文件头、test/、tool/e2e/）: https://github.com/ccch1mneyyy/dsh-Go/tree/da798027013851328f83f59af4adb52c3afaab23/packages/dsh_remote
44. THIRD_PARTY_NOTICES.md（「ds-harness-remote（MIT）」一节）: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/THIRD_PARTY_NOTICES.md
45. LICENSE（AGPL-3.0）: https://github.com/ccch1mneyyy/dsh-Go/blob/da798027013851328f83f59af4adb52c3afaab23/LICENSE
46. GitHub API：main 的最新提交，以及 `packages/dsh_remote` 的提交历史（最近一次 `a3d9e56`，2026-11-19）: https://github.com/ccch1mneyyy/dsh-Go/commits/main/packages/dsh_remote

Pigcode：

47. 本地代码：pigcode/frontend `54e2740`，`packages/client-runtime/src/transport.ts`（`HostTransport`）、`apps/host/src/rpc/message-port-transport.ts`、`LICENSE`。这不是公开来源。
48. 地图票「开始时的现状」（pigcode/frontend `54e2740`）: https://github.com/pigcode/monorepo/issues/86
49. 本仓库已有调研：DSH Go https://github.com/pigcode/monorepo/blob/research/mobile-dsh-go/research/mobile-dsh-go.md ；连接 https://github.com/pigcode/monorepo/blob/research/mobile-connectivity/research/mobile-connectivity.md ；Flutter https://github.com/pigcode/monorepo/blob/research/mobile-flutter/research/mobile-flutter.md ；技术栈 https://github.com/pigcode/monorepo/blob/research/mobile-stack/research/mobile-stack.md
