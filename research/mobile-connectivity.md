# 手机在外网怎么连回电脑（pigcode/monorepo#89）

调研日期 2026-11-21，所有来源的访问日期都是 2026-11-21。方括号里的数字对应文末「参考来源」的编号。标「未经一手来源证实」的内容没有找到官方文档、源码、规范或一手测量支持；标「推论」的是根据所引来源推出的结论，原文没有直接这样写。推送通知不在本文范围。

## 问题

手机在外面（蜂窝网络、别人的 Wi-Fi）怎么连回家里或公司那台跑着 Pigcode 的 MacBook？比较：

- 局域网直连和发现（mDNS / Bonjour）；
- 组网：Tailscale、ZeroTier、自建 WireGuard 或 Headscale；
- 内网穿透和隧道：frp、Cloudflare Tunnel、ngrok；
- 自建中继：电脑和手机都主动连到开发者自己的云服务器，中继只转发、看不到内容；
- 点对点直连（WebRTC），中继兜底。

每个方案回答：中国大陆网络下能不能用、延迟和稳定性；iPhone 要额外装什么、大陆区 App Store 能不能装到；能不能集成进手机端；谁能看到流量；公开发布时还能不能用；电脑睡眠或断网恢复时会怎样。还要分别说明大陆云服务器（ICP 备案）和境外云服务器的差别。结论用于[手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办](https://github.com/pigcode/monorepo/issues/96)和[配对、设备身份与加密](https://github.com/pigcode/monorepo/issues/97)。

## 结论

- **只有「电脑和手机都主动连出」的方案不挑网络。** 自建中继、Cloudflare Tunnel、ngrok 只要求电脑发起出站连接；局域网直连、frp 的 TCP 端口、星型 WireGuard 之外的直连 WireGuard 都要求有一端能被直接连到，手机在蜂窝网络的 CGNAT 后面做不到。Claude Code Remote Control 也是这个形态：本地进程「makes outbound HTTPS requests only and never opens inbound ports」[35]；Happy 的电脑和手机都连出到中继 [34]。
- **Tailscale、WireGuard、ZeroTier 的 iOS App 都不在中国区 App Store。** 用 Apple 的 Lookup API 查，三者在 `country=cn` 返回 0 条，在美国区和香港区都能查到（Tailscale 1.104.7，2026-11-17 发布）[6]。开发者自用要换一个非中国大陆区的 Apple 账户下载（推论）；公开发布时不能要求大陆用户另装这些 App。
- **手机端里不能内嵌 VPN，但能内嵌用户态的 tailnet 节点。** Network Extension 和 Personal VPN 能力只给付费账号，免费 Apple 账户没有 [8]；提供 VPN 服务的 App「may only be offered by developers enrolled as an organization」[7]，个人账号上架不了。TailscaleKit（libtailscale 的 Swift 包，BSD-3）在 App 进程里跑一个用户态 Tailscale 节点，可以直接拨号、监听 tailnet 上的节点，不创建 VPN 配置 [13][14]，所以不受这两条限制（推论）。ZeroTier 的 libzt 也能编 iOS framework，许可证是 BSL 1.1，Change Date 2026-01-01 后转 Apache 2.0 [20]。
- **「中继看不到内容」只能靠应用层端到端加密，不能靠 TLS。** Tailscale 的 DERP 只转发 WireGuard 密文 [9]；Syncthing 中继只转发设备之间 TLS 的密文，但知道双方 IP、设备 ID 和流量大小 [33]；Happy 的中继只存取密文 [34]。反过来，frps 会把手机连进来的字节原样转给电脑，ngrok 的 HTTPS 端点在 ngrok 解开 TLS，Claude Code Remote Control 的会话记录存在 Anthropic 服务器上 [24][32][35]。Pigcode 应该在 Host 和手机端之间自己做一层端到端加密（Noise 或 libsodium 的构件），让同一层协议跑在局域网、tailnet 和中继上，传输层换来换去不影响安全性。
- **大陆云服务器：未备案的域名在任何端口都会被拦，纯 IP 访问在规章上也要备案。** 阿里云写明「ICP备案不区分端口号」，并点名「域名用于内网穿透、API 接口等非网站场景时，只要解析指向中国内地服务器 IP 地址，仍须完成 ICP 备案」[47]。腾讯云写「不论设置哪个端口都能被监测到」，但「仅通过服务器公网 IP 直接访问测试，可暂不备案」[50]。工信部规章把「仅能通过互联网IP地址访问的网站」也列入备案范围，违者责令改正并罚款一万元 [45][46][48]。只给自己设备用、不向公众提供信息的中继算不算「互联网信息服务」，没有找到一手说法（未经一手来源证实）。
- **境外云服务器（香港、日本、新加坡）不用备案，代价是跨境质量和封锁风险。** 腾讯云文档写港澳台和海外地域「从中国内地跨境访问时，受运营商网络线路影响可能出现较大延迟和丢包」，并单独销售香港、新加坡到大陆的优选流量包 [51]。防火长城对发往部分数据中心 IP 段、首包看起来是随机字节的 TCP 连接，按约 26.3% 的概率封锁；首包像 TLS 或 HTTP 的连接直接豁免 [52]。所以中继要走 `wss://`，不要用裸的 Noise-over-TCP（推论）。
- **点对点只是优化，不是 v1 的必需品。** Tailscale 估计做完基本的打洞约 90% 以上能直连，但两端都是困难 NAT 时 20 秒内成功率只有 0.01% [16]。没有找到中国三家运营商蜂窝 CGNAT 映射行为或打洞成功率的一手测量（未经一手来源证实）。大陆 IPv6 普及度高：2025 年底移动网络 IPv6 流量占比 70.85%，IPv6 活跃用户占网民 77.38% [44]，IPv6 直连值得实测。Pigcode 传的是文本和 JSON，中继带宽很小，P2P 带来的收益有限。
- **电脑睡眠时任何方案都连不上，只有中继能告诉手机「电脑离线了」。** （睡眠细节待补，见第 7 节。）

### 对 #96（手机怎么连到电脑）意味着什么

- 待补（见第 9 节）。

### 对 #97（配对、设备身份与加密）意味着什么

- 待补（见第 9 节）。

## 1. 局域网直连和 Bonjour 发现

### 1.1 iOS 的本地网络权限

- iOS 14 起有本地网络隐私（macOS 15 起也有）。程序第一次做本地网络操作时，系统弹框请用户允许，结果记在「设置 > 隐私与安全性 > 本地网络」里 [1]。
- 「本地网络」指挂在可广播接口（Wi-Fi、以太网）上的 IP 网络，**不包括蜂窝和 VPN 接口**；所有组播地址和 255.255.255.255 也算本地网络地址 [1]。所以手机通过 Tailscale 的 VPN 接口连电脑的 100.x 地址不会触发这个弹框（推论）。
- 需要权限的操作：向本地地址发起 TCP 连接、发 UDP、解析 `.local` 名字、所有 Bonjour 注册、浏览和解析。**监听并接受入站 TCP 连接不需要权限** [1]。这些检查做在网络栈深处，对 Network framework、BSD socket、`URLSession` 都生效 [1]。
- 例外：发自 WKWebView、SFSafariViewController 和 Safari 的流量不需要本地网络权限 [1]。
- Info.plist：用本地网络就要写 `NSLocalNetworkUsageDescription`，弹框里显示这段说明 [1][2]；浏览或注册特定 Bonjour 服务类型时，要把类型列进 `NSBonjourServices`，格式如 `_pigcode._tcp` [1][3]。只有收发原始组播或广播、浏览任意服务类型时，才需要 `com.apple.developer.networking.multicast` 授权 [1]。
- App 在后台、权限还没定时做本地网络操作，系统直接拒绝且不弹框，等回到前台再弹 [1]。弹框出现时操作可能被立即拒绝，Apple 建议用支持等待连通的 API（Network framework 或开启 `waitsForConnectivity` 的 `URLSession`），否则自己重试 [1]。
- **模拟器不支持本地网络隐私**，要在真机上测 [1]。

### 1.2 ATS 和明文 `ws://`

- ATS 要求 `URLSession` 的连接用 TLS 1.2 以上和受信证书 [5]。iOS 17 起 ATS 默认**不再放行直连 IP 地址**，可以在 `NSExceptionDomains` 里写单个 IP 或 CIDR；`NSAllowsLocalNetworking = YES` 放行无点主机名、`.local` 和 IP 地址 [4]。
- `NSAllowsLocalNetworking` 不在 App Review 需要说明理由的例外清单里；`NSAllowsArbitraryLoads`、`NSExceptionAllowsInsecureHTTPLoads` 等在清单里 [5]。
- ATS 不管 Network framework 和 CFNetwork 这类底层接口 [5]。手机端用哪个 WebSocket 实现，决定 ATS 管不管它（推论）。
- 局域网上跑明文 `ws://`，同一 Wi-Fi 上的其他设备能看到内容（推论）。这也是要在应用层做端到端加密的理由之一。

### 1.3 电脑这边（macOS 15 以上）

- macOS 15 起，Pigcode 向局域网地址发起连接、注册或浏览 Bonjour 服务都要本地网络权限；只监听、接受入站连接不需要 [1]。
- Host 是 Electron 拉起的子进程。macOS 会把权限算在「负责的代码」也就是 App 本身上，弹框显示 App 的名字和用途说明 [1]。所以 Pigcode 的 Info.plist 也要写 `NSLocalNetworkUsageDescription`；要可靠识别身份，还要用 Apple 签发的证书签名 [1]。
- 由 launchd 启动的守护进程、root 进程、从终端或 SSH 运行的命令行工具自动有权限，开发时从终端跑 Host 看不到这个弹框，正式包才会弹 [1]。
- 26.2 以前的 macOS 没法在系统设置里重置这项权限 [1]。

### 1.4 安卓和安卓模拟器

- Android 17 起，targetSdk 37 以上的 App 默认不能访问局域网，要声明并在运行时申请 `ACCESS_LOCAL_NETWORK`。和 iOS 不同，**接受入站 TCP 连接也要这个权限**；mDNS 和 `NsdManager` 都受影响，也可以改用系统的服务选择器，免去这个权限 [56]。Android 16 上这只是可选启用 [56]。
- Android 9（API 28）起默认禁止明文流量，局域网上用 `ws://` 要在网络安全配置里放行 [57]。
- 模拟器在自己的虚拟路由器后面，地址段是 `10.0.2/24`，`10.0.2.2` 是开发机 127.0.0.1 的别名。36.5 以前的模拟器「can't detect your development machine or other emulator instances on the network」[58]。所以在模拟器上测不了 Bonjour 发现，只能直接连 `10.0.2.2:<端口>`，而且 Host 要监听在开发机的回环地址上（推论）。开发者没有安卓真机，安卓的局域网路线和本地网络权限要等有真机才能测。

### 1.5 各维度

- **大陆可用性和延迟**：不经过公网，不受跨境和防火长城影响。只在手机和电脑在同一个 Wi-Fi 时可用，蜂窝网络下不可用。
- **iPhone 要装什么**：不用另装 App，手机端自己做。
- **集成**：完全在手机端和 Host 里实现；发现用 Bonjour，或者扫码拿到电脑的地址。
- **谁能看到流量**：同一局域网上的设备（明文时）。
- **公开发布**：能用，但只是「在家」的优化路线。
- **睡眠和换网**：见第 7 节。

## 2. 组网：Tailscale、Headscale、ZeroTier、自建 WireGuard

### 2.1 Tailscale

- **工作方式**：设备之间是 WireGuard 隧道，先尝试 NAT 穿透直连；直连不成时先走 tailnet 里的对等中继（peer relay），再退到 Tailscale 运营的 DERP 中继 [9][12]。DERP 只转发已经加密的 WireGuard 包，私钥不离开设备，DERP 解不开 [9]。
- **DERP 节点**：2026-11-21 的默认 DERP 地图有 28 个区域，离大陆最近的是香港（`hkg`，3 个节点）、东京、新加坡，没有大陆节点 [9][10]。
- **在开发者的云服务器上自建 DERP**：
  - 文档标为 alpha [11]；
  - 必须直连公网，不能在 NAT 或负载均衡后面；要开 HTTP 80（端口不能改）、HTTPS 443（可用 `DERPPort` 改）、STUN 3478（可用 `STUNPort` 改），并放行 ICMP [11]；
  - 启动要用域名：`derper --hostname=example.com` [11]；
  - 不加 `--verify-clients` 时，任何知道这台服务器的人都能把它写进自己的 DERP 地图来用；加这个参数要在同一台机器上跑 `tailscaled` [11]；
  - 每个区域只能有一个自建节点，可以用 `OmitDefaultRegions` 去掉官方区域 [11]。
  
  在没有备案的大陆服务器上，DERP 用的 HTTP 80 加域名正好落在第 6 节的拦截规则里（推论）。
- **对等中继（Peer Relays）**更适合「用自己的云服务器做中转」：任何非 iOS、非安卓的设备装 Tailscale 1.86 以上，`tailscale set --relay-server-port=<UDP 端口>` 就能当中继，iOS 可以使用它；需要在策略里用 `tailscale.com/cap/relay` 授权 [12]。官方说它比 DERP 延迟低、吞吐高 [9][12]。它只用一个 UDP 端口，不需要域名和 TLS，不碰第 6 节的域名拦截（推论）。
- **大陆可用性和延迟**：
  - 协调服务器和 DERP 都在境外，都走 TCP 443；`login.tailscale.com` 和 `controlplane.tailscale.com` 从 2025 年 7 月起解析到 `192.200.0.0/24` [61]。
  - GreatFire 的第三方探测显示，截至 2026-11-07，`controlplane.tailscale.com` 在大陆可以访问 [62]。这不是 Tailscale 的说法，也不能说明 DERP 和登录用的身份提供商都能用（未经一手来源证实）。
  - Tailscale 联合创始人 2021 年在官方仓库回复，防火长城「is an enormously large and never-ending problem, and is not our focus」[61]。
  - 直连成功时延迟就是两端之间的公网延迟；走香港 DERP 时多一段跨境（推论）。
- **iPhone 要装什么**：Tailscale App。中国区 App Store 没有 [6]，要用非中国大陆区的 Apple 账户下载（推论）。
- **集成进手机端**：可以用 TailscaleKit 内嵌：提供类似 `NWConnection` 的 listen/dial 接口和走 tailnet 的 `URLSession` 扩展；节点要用 auth key 或交互式网页登录授权；`controlURL` 可配，因此也能指向 Headscale [14]。tsnet 用的是用户态 TCP/IP 栈 [13]。没有找到官方的 React Native 或安卓封装（未经一手来源证实）。
- **谁能看到流量**：只有两端能解密；DERP 和对等中继看到的是 WireGuard 密文和 IP、时间、流量大小这些元数据 [9]（对等中继这一点是推论）。
- **公开发布**：每个用户都要有 Tailscale 账号并装 App，或者由 Pigcode 内嵌 TailscaleKit、让用户登录自己的 tailnet。Personal 计划免费、最多 6 个用户、用户设备不限，但只能非商业使用 [15]。中国区 App Store 没有 Tailscale [6]，大陆 iPhone 用户走不了「另装 App」这条路。适合作为高级用户的可选路线。
- **iPhone 上的其他限制**：Tailscale 的 iOS App 是 Packet Tunnel 类 VPN，而 iOS「Only one enterprise VPN configuration can be enabled on the system at a time」[54]。手机上已经开着另一个这类 VPN 或代理 App 时，两者不能同时用（推论）。
- **睡眠和换网**：电脑睡眠后 tailscaled 不运行，手机只会等到连接超时，Tailscale 不会唤醒电脑（推论）。Tailscale 的设计默认设备会「moving around the internet with some regularity」，换网后自己重新打洞或改走中继 [16]。手机端 App 进后台后很快会被挂起 [55]，内嵌的 TailscaleKit 节点跟着 App 一起停；独立 Tailscale App 的 VPN 扩展不受影响，但 Pigcode 自己的连接仍在被挂起的 App 里（推论）。

### 2.2 Headscale

- Headscale 是开源、自托管的 Tailscale 协调服务器，设计范围是「a single Tailscale network (tailnet), suitable for a personal use, or a small open-source organisation」[17]。
- 官方 Tailscale iOS App 可以在登录页选「Use custom coordination server」填 Headscale 地址 [17]。iPhone 仍然要装 Tailscale App，中国区仍然没有 [6]。
- 放在开发者的云服务器上时，协调服务器走 HTTPS 和域名，大陆未备案服务器会碰到第 6 节的拦截（推论）。
- 公开发布时，单 tailnet 的设计不适合 Pigcode 替所有用户托管（推论）。

### 2.3 ZeroTier

- 节点靠 ZeroTier 运营的根服务器（planet）互相发现，直连不成时经根服务器中转。自建补充根服务器叫 moon，但官方现在写「Private moons are no longer recommended for deployment and are not supported under the ZeroTier Service Level Agreement」；完全私有的根服务器要找销售走企业方案 [18]。
- 免费计划：个人非商业使用，10 台设备、1 个网络 [19]。
- iPhone 要装 ZeroTier One，中国区没有 [6]。
- 集成：libzt 可以 `./build.sh iphoneos-framework` 编出 iOS framework，也能编安卓 AAR；它的 Objective-C、Swift 示例放在 `attic/` 目录下 [20]。许可证是 BSL 1.1，Change Date 2026-01-01 后转 Apache 2.0；ZeroTierOne 主体是 MPL-2.0，`nonfree/` 目录除外 [20]。
- **谁能看到流量**：所有 VL1 包都用 Salsa20/Poly1305 端到端加密，根服务器读不到。目前没有前向保密，官方建议需要时在上面再跑 SSL 或 SSH [60]。直连不成时由根服务器免费中转（「free (but slow)」），全球共有四台根服务器 [60]。
- **大陆可用性**：没有一手资料（未经一手来源证实）。
- **睡眠和换网**：节点离线后对端只能等超时；VL1「never gives up」，会一直定期尝试直连 [60]。设备 60 天不活动，根服务器上的身份就会过期 [60]。
- **公开发布**：免费计划只允许个人非商业使用，商业计划按设备收费 [19]；iOS App 中国区没有 [6]。不适合作为默认路线（推论）。

### 2.4 自建 WireGuard

- WireGuard 用 `Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s` 握手，全部走 UDP [21]。在 NAT 后面要收入站包，就要开 PersistentKeepalive，官方建议 25 秒 [22]。
- 手机在 CGNAT 后面、电脑也在 NAT 后面时，两端没法直接互连，只能做星型：电脑和 iPhone 都连开发者的云服务器，由服务器转发（推论）。这时服务器解开两条隧道，**能看到内层的 IP 包**；Pigcode 自己的协议如果不再加密，服务器就能看到内容（推论）。
- iPhone 要装 WireGuard App（中国区没有 [6]），或者用 WireGuardKit 把隧道做进自己的 App。WireGuardKit 要在 Network Extension 目标里链接 [23]，这需要付费账号 [8]，上架又只能用组织账号 [7]。
- WireGuard 只用 UDP 和 IP，不涉及域名和 HTTP，第 6 节的域名拦截管不到（推论）。防火长城对 WireGuard 的干扰没有一手资料（未经一手来源证实）。
- **睡眠和换网**：WireGuard 按计时器自动重新握手，「You don't need to worry about asking it to reconnect or disconnect or reinitialize」[21]；电脑醒来后靠 PersistentKeepalive 重新打开 NAT 映射 [22]。睡眠期间对端只能等超时（推论）。
- **公开发布**：要给每个用户开 VPN，不可行（推论）。

## 3. 内网穿透和隧道

### 3.1 frp（自建在开发者的云服务器上）

- frp 是反向代理：电脑上跑 frpc，连到云服务器上的 frps，把本地端口暴露成 frps 上的 TCP、UDP 端口或 HTTP(S) 虚拟主机；另有需要访问端也跑 frpc 的 STCP（预共享密钥）和 XTCP（P2P 打洞）[24]。最新版 v0.72.0，2026-11-04 发布 [24]。
- frpc 到 frps 之间从 v0.50.0 起默认开 TLS，但默认**不校验 frps 的证书** [24][25]。手机连 frps 公网端口那一段是 Pigcode 自己的协议，frps 把字节原样转给 frpc；协议不加密时，frps 和路上的人都能看到（推论）。
- XTCP「打洞成功率取决于所处网络的 NAT 类型，所以 XTCP 的可用性和稳定性无法保证」，官方建议可靠场景用 STCP，并支持失败时回退到 STCP [26]。
- **iPhone 要装什么**：TCP 端口模式不用装，手机直接连 `云服务器IP:端口`。STCP/XTCP 要访问端也跑 frpc，等于要把 frp 的 Go 客户端编进手机端；没有找到官方移动端 SDK（未经一手来源证实）。
- **大陆服务器**：HTTP 虚拟主机要域名，未备案会被拦；阿里云明确把内网穿透算进去 [47]。只用 IP 加端口的 TCP 代理不经过域名拦截 [50]，但见第 6 节的规章问题。
- **安全**：frps 上的端口对全网开放，任何人都能连，Pigcode 要自己做认证（推论）。
- **睡眠和换网**：电脑睡眠或换网时 frpc 断开，frps 上的端口没有后端，手机连上也收不到数据；frpc 恢复后重新登录 frps（推论）。frp 是 Apache-2.0 [63]，frpc 可以随 Pigcode 分发（推论）。
- **公开发布**：要么每个用户自建 frps，要么 Pigcode 运营 frps，后者就是一个不加密的中继，不如第 4 节的自建中继（推论）。

### 3.2 Cloudflare Tunnel

- 电脑上跑 `cloudflared`，只向外连 Cloudflare 的 7844 端口（QUIC 走 UDP，HTTP/2 走 TCP），不用开入站端口 [27]。
- 正式隧道要求域名托管在 Cloudflare。临时的 Quick Tunnel 不要账号，给一个随机 `trycloudflare.com` 地址，但没有可用性保证、最多 200 个并发请求、不支持 SSE，每次启动地址都变 [28]。
- WebSocket 在所有套餐都支持；Cloudflare 发布新代码时会重启服务器并断开 WebSocket；空闲一段时间会被关闭，要自己做心跳 [29]。
- **大陆可用性**：Cloudflare 的大陆节点（China Network，京东云机房）只对 Enterprise 客户单独开通，每个根域名都要 ICP 备案或许可证 [30]。没有它，大陆用户走境外节点，Cloudflare 自己写「Traffic routed through servers outside the country faces significant latency and reliability issues」[30]。电脑和手机两端都要跨境（推论）。
- **谁能看到流量：Cloudflare 能看到明文。**
  - Cloudflare 的 SSL 文档说一条连接上有两张证书：边缘证书是 Cloudflare 出示给访问者的，源站证书保护 Cloudflare 到源站那一段 [59]。
  - Tunnel 的路由文档说，公开主机名上的请求先由 Cloudflare 做 CDN 缓存、WAF 和 DDoS 防护，再转给 `cloudflared` 后面的服务 [59]。
  - 所以手机到 Cloudflare 的 TLS 在 Cloudflare 边缘结束，HTTP 头和 WebSocket 帧在 Cloudflare 那里是明文（推论，文档没有直接用「明文」这个词）。
  - Tunnel 也能转发任意 TCP，但访问端要运行 `cloudflared access tcp` [59]，手机端做不到（推论）。
  - 内容保密只能靠应用层端到端加密。`cloudflared` 是 Apache-2.0 [63]。
- **睡眠和换网**：电脑睡眠时 `cloudflared` 断开，公开主机名后面没有可用的连接器，请求失败；恢复后 `cloudflared` 重新连出（推论）。
- **iPhone 要装什么**：不用装，手机端直接连 `wss://` 域名（推论）。
- **公开发布**：每个用户要有自己的 Cloudflare 账号和域名，不现实；Quick Tunnel 不适合正式使用 [28]（推论）。

### 3.3 ngrok

- 电脑上跑 ngrok agent 连出到 ngrok 边缘。接入点：美国俄亥俄、美国加州、法兰克福、新加坡、悉尼、孟买、东京、圣保罗，**没有大陆和香港** [31]。
- 免费版：每月出站流量 1 GB、HTTP 请求 2 万次、TCP 连接 5000 次，最多 3 个在线端点，1 个分配的开发域名；浏览器访问 HTML 时有拦截页，程序访问不受影响；免费版不提供自己终结 TLS 的「TLS endpoints」[32]。
- **谁能看到流量**：免费版只有 HTTPS 端点，TLS 在 ngrok 解开，ngrok 能看到明文（推论）。
- 大陆访问 ngrok 的质量没有一手资料（未经一手来源证实）。
- **睡眠和换网**：和 Cloudflare Tunnel 一样，agent 断开后端点失效，恢复后重新连出（推论）。
- **公开发布**：每个用户要有 ngrok 账号，不现实（推论）。

## 4. 自建中继：两端都连出，中继只看密文

### 4.1 先例

- **Happy**：电脑上的 CLI 和手机都连出到中继，中继「passes encrypted messages between them」，存储加密数据。电脑显示一个含一次性公钥的二维码，手机扫码后把账号公钥封装给电脑；每个会话一个随机数据密钥，加密后存在服务器上。服务器开源，可以自建 [34]。Happy Desktop 的配对页现在有 Relay 和 Direct 两种 [34]。
- **Claude Code Remote Control**：本地进程只发出站 HTTPS，在 Anthropic API 注册后轮询，手机连上后服务器在两端之间路由消息；全部走 TLS，但会话记录存放在 Anthropic 服务器上，不是端到端加密 [35]。电脑睡眠或断网后，机器恢复在线时自动重连 [35]。
- **Syncthing 中继**：设备连不上对方时经中继转发，设备间仍是端到端 TLS；中继知道设备的 IP 和设备 ID，能看到流量大小 [33]。
- **Tailscale DERP**：同时承担打洞协调和兜底转发，只转发 WireGuard 密文 [9][16]。

### 4.2 加密构件

- Noise 协议框架（第 34 版）按双方静态公钥的状态给握手命名：`K` 表示对方事先已知，`X` 表示握手中传送，`I` 表示发起方立即传送 [36]。配对后双方都知道对方公钥，可以用 `KK` 或 `IK`；WireGuard 就是 `IKpsk2` [21][36]。
- libsodium 的 `crypto_kx` 用 X25519 和 BLAKE2b 从双方静态密钥算出收发两把会话密钥 [37]。它只用静态密钥，没有前向保密，需要前向保密就要叠加临时密钥，Noise 已经内置这一点（推论）。
- 用户手输短码配对时，要用 PAKE 防止中继离线穷举短码。SPAKE2 有 RFC 9382，但没有在 CFRG 的 PAKE 评选中入选 [38]；入选的 CPace 还是草案（draft-irtf-cfrg-cpace-21）[38]。扫码配对把整把公钥放进二维码，不需要 PAKE（推论）。

### 4.3 各维度

- **大陆可用性和延迟**：取决于云服务器放在哪，见第 6 节。电脑和手机都是普通出站连接，任何 NAT 和 CGNAT 后面都能连（推论）。每条消息多经过一次云服务器。
- **iPhone 要装什么**：不用装。手机端用普通 WebSocket 加加密库，免费 Apple 账户就能用，不需要任何特殊能力（推论，依据 [8]）。
- **谁能看到流量**：中继只看到密文和元数据：两端 IP、在线时间、消息大小和频率、哪台手机连哪台电脑（推论，参照 [33]）。
- **公开发布**：可以沿用。Pigcode 运营一个多租户中继，同时允许用户自建；大陆用户的服务器放哪要另外决定（第 6 节）。
- **睡眠和换网**：中继知道电脑什么时候断开，可以告诉手机「电脑离线」；手机换网后重连中继即可（推论）。

## 5. WebRTC 点对点，TURN 兜底

- WebRTC 数据通道跑在 DTLS 上的 SCTP 里 [39]；ICE 用 STUN 找公网地址并打洞，失败时经 TURN 中转 [39]。TURN 只转发 DTLS 密文（推论）。
- 仍然需要一个信令服务器交换 ICE 候选和 DTLS 指纹，所以第 4 节的中继本来就要有（推论）。指纹要用配对时建立的密钥认证，否则信令服务器能做中间人（推论）。
- TURN 可以用 coturn 自建，最新发布是 2026-11-19 [41]。TURN 用 IP 加 UDP 3478 或 TLS 端口，不经过域名，不碰第 6 节的域名拦截（推论）。
- **打洞成功率**：
  - Tailscale 估计做完基本步骤「could get a direct connection over 90% of the time」；一端是困难 NAT 时靠生日攻击式探测还能过；两端都是困难 NAT 时 20 秒内只有 0.01%；家用路由器多是容易的 NAT，困难 NAT 多见于公司路由器和云 NAT 网关 [16]。
  - RFC 4787 要求 NAT 必须是「Endpoint-Independent Mapping」，RFC 6888 要求 CGN 遵守 RFC 4787 [40]，但运营商是否照做要实测。
  - 一项荷兰的实测里，4 家运营商的 5G 手机之间有 3 家能互相打通 [43]。
  - 没有找到中国移动、联通、电信蜂窝 CGNAT 映射类型和打洞成功率的一手测量（未经一手来源证实）。
  - 大陆 IPv6：2025 年底 IPv6 活跃用户占网民 77.38%，移动网络 IPv6 流量占比 70.85% [44]。蜂窝 IPv6 加家宽 IPv6 有机会直连，但家用光猫和路由器默认是否放行 IPv6 入站，没有一手资料（未经一手来源证实）。
- **集成**：react-native-webrtc 支持 iOS 和安卓的数据通道，不能在 Expo Go 里用，要开发构建 [42]。Host 在 Node 里，没有内置 WebRTC，要另找实现（推论）。
- **谁能看到流量**：只有两端；TURN 和信令服务器看到元数据（推论）。
- **公开发布**：可以作为中继之上的优化。

## 6. 开发者的云服务器和域名：大陆还是境外

### 6.1 大陆云服务器

- **规章**：《非经营性互联网信息服务备案管理办法》第五条：在境内提供非经营性互联网信息服务应当备案，「是指在中华人民共和国境内的组织或个人利用通过互联网域名访问的网站或者利用仅能通过互联网IP地址访问的网站，提供非经营性互联网信息服务」；第二十二条：未备案的「责令限期改正，并处一万元罚款；拒不改正的，关闭网站」[45]。福建省通信管理局的答疑：只有 IP、没有域名的网站也要备案；「非经营性互联网信息服务」指「通过互联网向上网用户无偿提供具有公开性、共享性信息的服务活动」[46]。
- **阿里云**：
  - 「ICP备案不区分端口号。只要域名解析指向中国内地服务器，无论使用标准端口（80、443）还是非标准端口（如 8080、8443），均须完成 ICP备案。」[47]
  - 「域名用于内网穿透、API 接口等非网站场景时，只要解析指向中国内地服务器 IP 地址，仍须完成 ICP 备案。」[47]
  - 「托管于中国内地服务器上的网站，如果网站没有绑定域名，直接通过 IP地址对外提供服务也需要进行 ICP备案」，阿里云的系统只受理域名备案，纯 IP 要去当地通信管理局 [48]。
  - 「只购买云服务器不使用域名，需要进行 ICP备案吗？不需要。当域名解析指向中国内地服务器且开通 Web服务时才需进行 ICP备案。」[49]
- **腾讯云**（2026-09-28 更新）：
  - 「托管于中国境内服务器的网站或 APP 需要完成备案。不论设置哪个端口都能被监测到。」[50]
  - 「若域名不解析到腾讯云中国境内云服务器……仅通过服务器公网 IP 直接访问测试，可暂不备案」；「当您不使用域名解析指向服务器时，不需要进行备案」[50]。
  - 域名指向大陆云服务器而未备案时「会封禁域名，不会封禁主机」[50]。
- **结论**：
  - 未备案的域名指向大陆云服务器，任何端口、任何用途都会被云厂商拦（两家文档原话）。
  - 不用域名、只用 IP 加端口：云厂商的自动拦截是按域名做的，腾讯云明说可以暂不备案 [50]；但规章和阿里云文档都说纯 IP 的网站也要备案 [45][48]。只连自己设备、内容端到端加密的中继，是否属于「向上网用户提供……公开性、共享性信息」，没有一手答复（未经一手来源证实）。
  - 云厂商拦截具体看 HTTP Host 还是 TLS SNI，还是别的特征，两家都没写（未经一手来源证实）。
  - 用 IP 时也能有受信 TLS：Let's Encrypt 2026-01-15 起正式签发 IP 地址证书，有效期 160 小时，只能用 http-01 或 tls-alpn-01 验证 [53]。手机端也可以把电脑或中继的公钥钉死，不依赖公共 CA（推论）。
  - 公开发布时，在大陆给其他用户提供中继，按规章就要备案；收费时还涉及经营性许可，见阿里云的说明 [47]。
- **备案流程**：阿里云初审 1–2 个工作日，管局审核 1–20 个工作日，开通后 30 天内做公安联网备案 [47]。

### 6.2 境外云服务器

- 不需要 ICP 备案；阿里云说如果网站在大陆可访问，开通后 30 天内仍要做公安联网备案 [47]。
- 跨境质量：腾讯云写港澳台和海外地域从内地跨境访问「可能出现较大延迟和丢包」[51]；香港「入门型套餐无法保障中国内地与中国香港之间的跨境公网质量」[51]；另有香港、新加坡到大陆的「优选流量包」，宣称「避免绕行国际运营商出口网络，降低访问时延」[51]。没有找到具体延迟数字的一手测量（未经一手来源证实）。
- 封锁：
  - 2021 年 11 月起，防火长城被动识别「全加密」TCP 流量：只看客户端第一个数据包，首包看起来是随机字节时可能封锁；首包匹配 TLS 或 HTTP、可打印字符多等情况豁免 [52]。
  - 只针对部分热门数据中心的 IP 段，每条连接约 26.3% 的概率被封；UDP 不受这套机制影响 [52]。
  - 对 Pigcode 的含义：中继连接用 TLS（`wss://`），首包就是 TLS 握手，落在豁免规则里（推论）。

## 7. 电脑睡眠、合盖、Pigcode 退出、换网络

### 7.1 MacBook 睡着以后

- **合盖就睡。** Apple 只描述了一种合盖继续运行的用法：先允许外接显示器、鼠标和键盘连接，再合盖使用 [67]。外接显示器的排障文档要求合盖时「make sure that the Mac is connected to power and using an external keyboard and mouse」[67]。带着 MacBook 出门时，这些条件都不满足（推论）。
- **Pigcode 现有的「保持唤醒」挡不住合盖。** 它用的是 Electron 的 `prevent-app-suspension`，文档说明是「Keeps system active but allows screen to be turned off」[70]。Chromium 在 macOS 上把它实现为 `kIOPMAssertionTypeNoIdleSleep` 断言 [71]。IOKit 头文件说这个类型已由 `kIOPMAssertPreventUserIdleSystemSleep` 取代，后者「The system may still sleep for lid close, Apple menu, low battery, or other sleep reasons」[69]。所以这个开关只能阻止空闲睡眠。
- **系统设置能做到的**：笔记本 Battery 设置里的「Prevent automatic sleeping on power adapter when the display is off」只在插电时阻止自动睡眠 [64]。文档没说它能阻止合盖睡眠（推论：不能）。
- **「唤醒以供网络访问」只管局域网上的共享资源**：
  - `pmset` 的 `womp` 就是系统设置里的「Wake for network access」[68]，笔记本上可以选总是、仅接电源时、从不 [64]。
  - Apple 的说明是「wake your Mac to provide access to shared resources, such as shared printers or Music playlists」。别的电脑访问共享资源时会唤醒，另外会定期醒来向网络通告这些资源 [64][65]；这需要一台支持 802.11n 的 Apple 无线设备 [65]。
  - 这套机制最早叫 Wake on Demand：Mac 睡前把共享服务登记到基站上的 Bonjour Sleep Proxy，有人访问时由代理请 Mac 醒来 [66]。
  - 能唤醒 Mac 的是同一局域网里的访问，手机在蜂窝网络上连不到睡着的 Mac（推论）。Pigcode 自己注册的 Bonjour 服务能不能让睡眠代理唤醒 Mac，现行文档没写（未经一手来源证实）。
  - `networkoversleep` 影响睡眠期间如何呈现共享网络服务，但「changing its value is unsupported」[68]。
- **手机这边**：iOS App 进后台后很快被挂起；没有让 App 在后台常驻、或被网络请求唤醒的通用办法，能在后台拉起 App 的是静默推送这类专门机制 [55]。所以手机端的长连接只在前台存在。

### 7.2 各方案在这些情况下的表现

| 方案 | 电脑睡眠或合盖 | Pigcode 退出或 Host 重启 | 电脑换网络 | 手机换网络或回到前台 |
|---|---|---|---|---|
| 局域网直连 | 连接断开或超时，手机分不清是睡眠还是离开了网络（推论） | 端口关闭，连接被拒（推论） | 电脑的局域网地址变了，要重新发现或扫码（推论） | 离开这个 Wi-Fi 就不能用 |
| Tailscale、ZeroTier、WireGuard | 节点离线，对端等到超时；醒来后自动恢复 [16][21][60] | tailnet 还在，端口没人监听，连接被拒（推论） | 组网自己重新打洞或走中继 [16][60] | 同左 |
| frp | frpc 断开，frps 端口没有后端（推论） | 同左 | frpc 重新登录 frps（推论） | 手机重连 frps |
| Cloudflare Tunnel、ngrok | 连接器断开，边缘请求失败（推论） | 同左 | 连接器重新连出（推论） | 手机重连边缘节点 |
| 自建中继 | 中继发现 Host 断开或心跳超时，能告诉手机「电脑离线」和最后在线时间（推论） | Host 退出前可以先通知中继，和睡眠区分开（推论） | Host 重新连出，中继地址不变（推论） | 手机重连中继，中继地址不变 |
| WebRTC | ICE 连接断开，醒来后要经信令重新建立（推论） | 同左 | 同左 | 同左 |

Claude Code Remote Control 用的就是中继这一行的做法：电脑睡眠或断网后，「Claude Code reconnects automatically when your machine comes back online」[35]。

### 7.3 对产品的含义

- 合盖后，从外网没有办法唤醒 MacBook。能做的只有三件：中继告诉手机「电脑离线，最后在线于某时」；有 run 在跑且插着电源时阻止空闲睡眠，这是现有开关的能力范围；在电脑上提醒用户合盖会断开（推论）。
- 手机端每次回到前台都要重连，并补齐断线期间的变化，这属于[弱网下怎么同步](https://github.com/pigcode/monorepo/issues/92)；后台提醒走推送，不在本文范围。

## 8. 对比表

（待补。）

## 9. 建议矩阵

（待补。）

## 未经一手来源证实的事项

- 从大陆连 Tailscale 协调服务器、DERP 和登录身份提供商的可用性。
- 中国三家运营商蜂窝 CGNAT 的映射类型和打洞成功率；家用光猫、路由器默认是否放行 IPv6 入站。
- 大陆到香港、日本、新加坡云服务器的实际延迟和丢包。
- 防火长城对 WireGuard、ngrok、Cloudflare Quick Tunnel 的干扰。
- 云厂商识别未备案域名的具体方式（Host、SNI 或其他）。
- 只连自己设备、端到端加密的中继是否算需要备案的「互联网信息服务」。
- TailscaleKit 或 libzt 是否有官方的 React Native、安卓封装。

## 参考来源

所有来源的访问日期都是 2026-11-21。

1. Apple, TN3179: Understanding local network privacy（修订记录到 2026-10-06）: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
2. Apple, NSLocalNetworkUsageDescription: https://developer.apple.com/documentation/bundleresources/information-property-list/nslocalnetworkusagedescription
3. Apple, NSBonjourServices: https://developer.apple.com/documentation/bundleresources/information-property-list/nsbonjourservices
4. Apple, NSAllowsLocalNetworking: https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking
5. Apple, Preventing Insecure Network Connections: https://developer.apple.com/documentation/security/preventing-insecure-network-connections
6. Apple iTunes Lookup API，本次实测：`https://itunes.apple.com/lookup?id=<id>&country=<cn|us|hk>`，id 为 Tailscale 1470499037、WireGuard 1441195209、ZeroTier One 1084101492。cn 区三者都返回 `resultCount: 0`；us、hk 区返回 Tailscale 1.104.7（2026-11-17）、WireGuard 1.0.16（2023-02-16）、ZeroTier One 1.16.0（2025-09-17）。
7. Apple, App Review Guidelines（Last Updated October 16, 2026）, 5.4 VPN Apps: https://developer.apple.com/app-store/review/guidelines/#vpn-apps
8. Apple, Supported capabilities (iOS): https://developer.apple.com/help/account/reference/supported-capabilities-ios （读原始 HTML 的勾选标记：Network extensions、Personal VPN、Push notifications 只勾了 ADP 和 ADEP；App groups、Background modes 三列都勾）
9. Tailscale, DERP servers（Last validated Jan 21, 2026）: https://tailscale.com/kb/1232/derp-servers
10. Tailscale 默认 DERP 地图（本次读取 JSON）: https://controlplane.tailscale.com/derpmap/default
11. Tailscale, Custom DERP servers（Last validated Oct 7, 2026）: https://tailscale.com/kb/1118/custom-derp-servers
12. Tailscale, Tailscale Peer Relays（Last validated Feb 4, 2026）: https://tailscale.com/kb/1591/peer-relays
13. Tailscale, tsnet（Last validated Jul 24, 2026）: https://tailscale.com/kb/1244/tsnet
14. tailscale/libtailscale（BSD-3-Clause）README 与 `swift/README.md`（TailscaleKit）: https://github.com/tailscale/libtailscale ，https://github.com/tailscale/libtailscale/blob/main/swift/README.md
15. Tailscale, Pricing: https://tailscale.com/pricing
16. Tailscale Blog, How NAT traversal works（David Anderson，2020-08-21）: https://tailscale.com/blog/how-nat-traversal-works
17. Headscale 文档（0.29.7）: https://headscale.net/stable/ ；Connecting an Apple client: https://headscale.net/stable/usage/connect/apple/
18. ZeroTier, Private Root Servers: https://docs.zerotier.com/roots/
19. ZeroTier, Pricing: https://www.zerotier.com/pricing/
20. zerotier/libzt README 与 LICENSE.txt: https://github.com/zerotier/libzt ；ZeroTierOne LICENSE.txt: https://github.com/zerotier/ZeroTierOne/blob/dev/LICENSE.txt
21. WireGuard, Protocol & Cryptography: https://www.wireguard.com/protocol/
22. WireGuard, Quick Start（NAT and Firewall Traversal Persistence）: https://www.wireguard.com/quickstart/
23. wireguard-apple README（WireGuardKit integration）: https://git.zx2c4.com/wireguard-apple/about/
24. fatedier/frp README（最新发布 v0.72.0，2026-11-04）: https://github.com/fatedier/frp
25. frp 文档，自定义 TLS 协议加密: https://gofrp.org/zh-cn/docs/features/common/network/network-tls/
26. frp 文档，XTCP: https://gofrp.org/zh-cn/docs/features/xtcp/
27. Cloudflare, Tunnel with firewall: https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/
28. Cloudflare, Quick Tunnels: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/
29. Cloudflare, WebSockets: https://developers.cloudflare.com/network/websockets/
30. Cloudflare China Network, Overview: https://developers.cloudflare.com/china-network/
31. ngrok, Points of Presence: https://ngrok.com/docs/gateway/points-of-presence
32. ngrok, Free Plan Limits: https://ngrok.com/docs/pricing-limits/free-plan-limits
33. Syncthing, Relaying: https://docs.syncthing.net/users/relaying.html
34. Happy, How it works: https://happy.engineering/docs/how-it-works/ ；Security & Encryption: https://happy.engineering/docs/security/ ；Mobile: https://happy.engineering/mobile/
35. Claude Code Docs, Remote Control: https://code.claude.com/docs/en/remote-control
36. Noise Protocol Framework, Revision 34（2018-07-11）: https://noiseprotocol.org/noise.html
37. libsodium, Key exchange: https://doc.libsodium.org/key_exchange
38. RFC 9382, SPAKE2: https://www.rfc-editor.org/rfc/rfc9382.html ；draft-irtf-cfrg-cpace-21, CPace: https://datatracker.ietf.org/doc/draft-irtf-cfrg-cpace/
39. RFC 8831, WebRTC Data Channels: https://www.rfc-editor.org/rfc/rfc8831.html ；RFC 8656, TURN: https://www.rfc-editor.org/rfc/rfc8656.html
40. RFC 4787 REQ-1: https://www.rfc-editor.org/rfc/rfc4787.html ；RFC 6888 REQ-1: https://www.rfc-editor.org/rfc/rfc6888.html
41. coturn（最新发布 docker/4.19.2-r0，2026-11-19）: https://github.com/coturn/coturn
42. react-native-webrtc README: https://github.com/react-native-webrtc/react-native-webrtc
43. O. Kanaris, J. Pouwelse, Mass Adoption of NATs: Survey and experiments on carrier-grade NATs, arXiv:2311.04658: https://arxiv.org/abs/2311.04658
44. 中央网信办，《深化互联网协议第六版（IPv6）技术创新和融合应用实施方案（2026—2030年）》答记者问（2026-07-21）: https://www.cac.gov.cn/2026-07/21/c_1786380790538547.htm
45. 工业和信息化部，《非经营性互联网信息服务备案管理办法》（2024 年修订）: https://www.miit.gov.cn/gyhxxhb/jgsj/cyzcyfgs/bmgz/xxtxl/art/2024/art_84a0cfa0ebd049bbbe751dca9a008e56.html ；含第二十二条的全文另见山东省通信管理局: https://sdca.miit.gov.cn/zwgk/fgbz/art/2026/art_f4a017d7fcb741238bdbdab836a60431.html
46. 福建省通信管理局，关于备案政策等问题的答疑（2020-05-25）: https://fjca.miit.gov.cn/bsfw/bszn/art/2020/art_592c546b35a44852bb9fdb59742537a1.html
47. 阿里云，ICP备案流程（含「域名不用于网站（如内网穿透）」「使用非标准端口」两条问答）: https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/icp-filing-application-overview
48. 阿里云，通用网站进行ICP备案（通过 IP 访问的网站）: https://help.aliyun.com/zh/icp-filing/basic-icp-service/product-overview/icp-filing-requirements-for-a-regular-website
49. 阿里云，不同场景下的ICP备案说明FAQ: https://help.aliyun.com/zh/icp-filing/basic-icp-service/product-overview/faq-about-icp-filing-applications-in-different-scenarios
50. 腾讯云，是否需要备案（2026-09-28 更新）: https://cloud.tencent.com/document/api/243/19630 ；「网站/APP 阻断相关」见同一套常见问题的 PDF: https://main.qcloudimg.com/raw/document/product/pdf/243_6206_cn.pdf
51. 腾讯云轻量应用服务器，地域与网络连通性（2026-09-23 更新）: https://cloud.tencent.com/document/product/1207/50103 ；优选流量包产品概述（2026-10-14 更新）: https://cloud.tencent.com/document/product/1207/104332 ；价格总览（香港入门型说明）: https://cloud.tencent.com/document/product/1207/73452
52. M. Wu et al., How the Great Firewall of China Detects and Blocks Fully Encrypted Traffic, USENIX Security 2023: https://gfw.report/publications/usenixsecurity23/en/
53. Let's Encrypt, 6-day and IP Address Certificates are Generally Available（2026-01-15）: https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability ；RFC 8738: https://www.rfc-editor.org/rfc/rfc8738.html
54. Apple, NETunnelProviderManager（Configuration Model 一节）: https://developer.apple.com/documentation/networkextension/netunnelprovidermanager
55. Apple Developer Forums，DTS 工程师 Quinn 的 iOS Background Execution Limits（修订到 2026-01-09）: https://developer.apple.com/forums/thread/685525
56. Android Developers, Local network permission: https://developer.android.com/privacy-and-security/local-network-permission ；Behavior changes: Apps targeting Android 17 or higher: https://developer.android.com/about/versions/17/behavior-changes-17
57. Android Developers, Network security configuration（cleartext 默认值）: https://developer.android.com/privacy-and-security/security-config
58. Android Developers, Network address space（模拟器，2026-11-12 更新）: https://developer.android.com/studio/run/emulator-networking-address
59. Cloudflare, SSL/TLS concepts（Edge certificate、Origin certificate）: https://developers.cloudflare.com/ssl/concepts/ ；Cloudflare Tunnel, Routing: https://developers.cloudflare.com/tunnel/concepts/routing/
60. ZeroTier, The Protocol: https://docs.zerotier.com/protocol/
61. Tailscale, What firewall ports should I open to use Tailscale?（Last validated Feb 2, 2026）: https://tailscale.com/docs/reference/faq/firewall-ports ；tailscale/tailscale#1263 中 Brad Fitzpatrick 的回复（2021-02-04）: https://github.com/tailscale/tailscale/issues/1263
62. GreatFire（第三方审查探测），controlplane.tailscale.com 测试页（最近一次测试 2026-11-07）: https://en.greatfire.org/controlplane.tailscale.com
63. GitHub API 仓库许可证字段，本次读取：fatedier/frp 和 cloudflare/cloudflared 都是 Apache-2.0。https://github.com/fatedier/frp ，https://github.com/cloudflare/cloudflared
64. Apple, Change Battery settings on a Mac laptop: https://support.apple.com/guide/mac-help/change-battery-settings-mchlfc3b7879/mac ；Set sleep and wake settings for your Mac: https://support.apple.com/guide/mac-help/set-sleep-and-wake-settings-mchle41a6ccd/mac
65. Apple, Share your Mac resources when it's in sleep: https://support.apple.com/guide/mac-help/share-your-mac-resources-when-its-in-sleep-mh27905/mac
66. Apple, Mac OS X v10.6: About Wake on Demand（HT3774，2009-08-27，原页已下线，archive.org 存档）: https://web.archive.org/web/20090831113247/http://support.apple.com/kb/HT3774
67. Apple, Allow USB and other accessories to connect to your Mac（2026-04-30）: https://support.apple.com/en-us/102282 ；If your external display is dark or low resolution（2026-04-06）: https://support.apple.com/en-us/102501
68. macOS `pmset(1)` 手册页（本机 macOS 15.6.1，`man pmset`）：`womp`、`networkoversleep` 两项
69. Apple IOKit `IOPMLib.h`（Xcode 16.4 的 macOS SDK）：`kIOPMAssertPreventUserIdleSystemSleep`、`kIOPMAssertionTypeNoIdleSleep` 的注释
70. Electron, powerSaveBlocker: https://github.com/electron/electron/blob/main/docs/api/power-save-blocker.md
71. Chromium 源码 `services/device/wake_lock/power_save_blocker/power_save_blocker_mac.cc`（main 分支）: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/services/device/wake_lock/power_save_blocker/power_save_blocker_mac.cc
