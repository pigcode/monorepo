# 手机端自用时的安装与推送限制调研（#88）

调研日期 2026-11-21，下文来源的访问日期都是 2026-11-21。方括号里的数字对应「参考来源」的编号。标注「未经一手来源证实」的内容没有找到官方页面支持；标注「推断」的是根据所引来源推出的结论，没有找到直接写明它的文档。

> 本文分段写入。标「待补」的小节还没有写完。

## 问题

开发者日常用 iPhone，开发阶段只用免费 Apple ID，之后可以付 Apple Developer Program（个人，99 美元/年）；手边没有安卓手机，安卓用模拟器；手机和电脑平时都在中国大陆网络下。要查清：

- **免费 Apple ID**：自己开发的 App 装到 iPhone 上能用多久、能装几个，哪些能力用不了（推送、后台运行、App Groups、各类扩展等）；开发阶段怎么测通知，比如模拟器上的 `simctl push` 或本地通知。
- **付费个人账号**：签名有效期，TestFlight 的限制，APNs 推送、实时活动和分享扩展分别需要什么。
- **安卓**：APK 直接侧载的现状，Google 对侧载应用开发者做身份验证的要求和时间表；模拟器上能不能测 FCM。
- **大陆网络下的推送**：APNs 是否可靠；国内安卓手机没有谷歌服务时有哪些通道（厂商推送、统一推送、自建长连接等），只给自己用时哪条最省事。
- **如果用 Expo**：Expo Go 和开发构建在免费账号下能做什么，Expo 的推送服务在大陆能不能用。
- **补充**：免费 Apple ID 阶段没有自己的 APNs 权限，哪些现成通道能把通知送到 iPhone（Bark、ntfy、企业微信/飞书/钉钉机器人、Telegram 机器人）。

## 结论

- **免费 Apple ID 下，手机端收不到远程推送。** Apple 的能力对照表里，免费账号（表中「Apple Developer」一列）没有 Push notifications，也没有 Time Sensitive Notifications、Communication Notifications、Associated domains、Network extensions、iCloud、Sign in with Apple [1]。实时活动的推送更新依赖 Push Notifications 能力 [15]，同样用不了。
- **免费 Apple ID 下能用的能力比预想的多。** App groups、Background modes、Keychain sharing、Data protection 都在免费一列里 [1]，所以分享扩展和主 App 共享数据（靠 App Groups [19][20]）在免费阶段就能做。
- **免费 Apple ID 的安装限制是 7 天。** Personal Team 最多注册 10 个 App ID、3 台设备，都是 7 天后过期；每台设备最多装 3 个 App；描述文件签发 7 天后过期，过期后要重新构建、重新安装 [2]。每个 App 扩展各自需要描述文件和 App ID [3]，主 App 加分享扩展、widget 扩展会占掉 3 个 App ID（推断）。
- **iOS 不允许 App 在后台常驻。** App 退到后台后很快被挂起，没有在后台持续运行、定时运行或因网络请求被唤醒的通用机制；能把 App 从服务器唤醒的只有推送（静默推送）[17]。所以免费阶段的本地通知 [18] 只能在手机端还在前台、刚退到后台时发出，「会话跑完 / 等你处理」时手机在口袋里就收不到（推断）。
- **开发阶段测通知不需要付费。** `xcrun simctl push` 和把 `.apns` 文件拖进模拟器，不经过 APNs、不需要账号，可以测通知的展示、点击和动作 [11][12]；它不能测 Notification Service Extension [11][13]。模拟器接收真实 APNs 推送要 Apple silicon 或 T2 的 Mac、macOS 13 以上，走 APNs sandbox [13]，但发送端要有 APNs 密钥，只有付费账号能创建（推断，免费账号没有 Certificates, Identifiers & Profiles [2]）。
- **付费个人账号够用。** 开发和分发证书一般一年 [4]，描述文件一般不超过一年 [3]；每类设备每个会员年最多 100 台 [6]。TestFlight 构建可测 90 天，内部测试员（App Store Connect 用户）最多 100 人、不用审核；外部测试员最多 10,000 人，第一个构建要过审 [7]。TestFlight 安装不需要打开开发者模式，Xcode 直装要 [8]。APNs 用 `.p8` 密钥签 JWT，JWT 每 20–60 分钟刷新一次；团队密钥可以限定只用于 sandbox 或 production [9]。
- **实时活动（Live Activities）要 widget 扩展加 Push Notifications 能力。** 推送启动（push-to-start）要 iOS 17.2 以上，iOS 18 起可以按 channel 广播更新 [15]；一个实时活动最多活跃 8 小时，结束后在锁屏最多再留 4 小时；静态加动态数据不超过 4 KB；它自己不能联网 [16]。用来显示「会话正在跑」合适，但跑超过 8 小时的会话会被系统结束。
- **安卓侧载对自用没有障碍。** Google 的开发者验证 2026-09-30 只在巴西、印尼、新加坡、泰国对 7 家商店的安装生效，2027 年 1 月开始全球逐步扩展到所有安装来源 [21][22][23][24]。adb 安装明确不受影响 [25]；只适用于 Google 认证的设备，不适用于不支持 Google 移动服务的地区 [26]。模拟器上用 adb 装、大陆国行手机都不受影响（后者是推断）。公开发布时，海外用户的认证设备需要开发者在 Android Developer Console 验证身份（完整账号 25 美元），或者让用户走一次「高级流程」（含 24 小时等待）[25]。
- **模拟器能测 FCM，但大陆网络下要整机 VPN。** FCM 客户端要 Android 7.0 以上、带 Google APIs 的模拟器镜像 [27]；FCM 的投递协议不能走网络代理 [28]，大陆网络下只能让 Mac 整机走 VPN（推断，Google 被屏蔽这一点没有一手来源）。
- **国内安卓没有一条现成的统一通道。** 统一推送工作委员会的标准是厂商系统推送服务要符合的接口规范 [31][32]，不是开发者能直接接入的一个服务。厂商推送要分别注册：vivo、OPPO 的正式推送要求应用先上架自家商店，未上架只有每天 1,000 条的测试推送 [33][34][37]；小米 2026 年新规把消息分成私信和公信，私信要用模板，公信每台设备每天最多 5 条 [40][41]。这些都是公开发布才需要面对的事。
- **自用时安卓最省事的做法**：开发者没有安卓手机，第一版的安卓通知只在模拟器上验证，用 FCM 即可；国内厂商通道（直接接或通过聚合服务）留到公开发布。
- 待补：APNs 在大陆的可靠性、不靠自家 APNs 权限的 iPhone 通道（Bark、ntfy、企业微信/飞书/钉钉、Telegram）、Expo、极光/个推、UnifiedPush/ntfy、华为/荣耀推送，以及对 #95、#98 的含义。

## 1. iPhone：免费 Apple ID（Personal Team）

### 1.1 能力对照

Apple 的「Supported capabilities (iOS)」表按会员类型列出描述文件能带的能力 [1]。「Apple Developer」一列指同意了 Apple Developer Agreement 的普通 Apple 账户，不收费、不能分发 App。

| 能力 | 免费账号 | 付费个人账号（ADP） |
|---|---|---|
| Push notifications | 不可用 | 可用 |
| Time Sensitive Notifications、Communication Notifications | 不可用 | 可用 |
| Associated domains（通用链接） | 不可用 | 可用 |
| Network extensions、Personal VPN | 不可用 | 可用 |
| iCloud（CloudKit、文档、键值存储）、Sign in with Apple、App Attest、Siri | 不可用 | 可用 |
| App groups | 可用 | 可用 |
| Background modes | 可用 | 可用 |
| Keychain sharing、Data protection | 可用 | 可用 |

- 表里没有「App 扩展」这一项。扩展本身不是 capability，分享扩展、widget 扩展的可用性取决于它们用到的能力：分享扩展和主 App 共享数据要 App Groups [19][20]，免费账号有。
- Background modes 可用，但它只打开 iOS 允许的几种专用后台场景（音频、定位等），不能让 App 常驻后台保持长连接 [17]。
- 通知被设为 Time Sensitive 才能穿透专注模式，这需要 Time Sensitive Notifications 能力 [1]，免费账号没有。审批提醒想要穿透专注模式，只能等付费后。

### 1.2 安装数量和有效期

Apple 的开发者账号说明页对 Personal Team 的限制 [2]：

- 最多注册 10 个 App ID，7 天后过期；
- 最多注册 3 台设备，7 天后过期；
- 每台设备最多装 3 个 App；描述文件签发 7 天后过期，过期后要重新构建并重新安装；
- 免费账号可以用 Xcode 在真机上测试，但没有 Certificates, Identifiers & Profiles、App Store Connect、TestFlight、Xcode Cloud [2]。

TN3125 说明，描述文件里的「App」包括 App 扩展和 App Clip，每个可执行包都要由描述文件授权 [3]。所以主 App 加一个分享扩展、一个 widget 扩展就要 3 个 App ID。每 7 天 10 个的额度够一个 App 反复重装，但一次改多个 bundle ID 容易用完（推断）。

Xcode 直接安装到真机需要在手机上打开开发者模式；App Store 和 TestFlight 安装不需要 [8]。

### 1.3 iOS 后台限制和本地通知

- Apple DTS 的说明（2026-01-09 更新）：iOS 默认在用户把 App 切到后台后很快挂起它；没有在后台持续运行代码、在指定时间运行、按固定间隔运行，或因网络、IPC 请求在后台恢复的通用机制。服务器要唤醒 App，只能发静默推送；`BGAppRefreshTaskRequest` 的执行时机由系统启发式决定，常见情况下可能一次都不给。用户上划强退后，系统不会再在后台启动它 [17]。
- 本地通知可以按时间、日历或位置触发，App 不在运行时也由系统展示 [18]。但手机端要知道「会话跑完了」必须先收到电脑发来的消息，App 被挂起后收不到，所以本地通知只覆盖 App 在前台或刚切到后台的那几秒（推断）。

## 2. iPhone：付费个人账号

### 2.1 签名和设备

- 证书：Apple 代码签名证书的有效期一般是签发后一年，具体因类型而异 [4]。分发证书属于团队，每种类型每个团队只能有一张（Developer ID 除外）；个人账号的注册人就是账号持有人，可以创建分发证书 [5]。
- 描述文件：每个描述文件有 `ExpirationDate`，一般不超过一年 [3]。
- 设备：每个会员年每类设备（iPhone、iPad 等）最多注册 100 台；年中停用设备不会退还名额，新会员年开始时可以清空重来 [6]。
- 会员到期：设备列表在会员到期 180 天后自动清除 [6]。分发证书过期或被吊销不影响已在 App Store 上的 App，但不能再上传用它签名的新构建 [5]。

### 2.2 TestFlight

- 一个构建最多测试 90 天 [7]。
- 内部测试员最多 100 人，必须是有权限的 App Store Connect 用户；外部测试员最多 10,000 人。往外部测试组加第一个构建要送 App Review，后续构建不一定要完整审核 [7]。
- 测试员在手机上装免费的 TestFlight App 接受邀请、安装和更新 [7]；不需要打开开发者模式 [8]。
- 对自用的含义：开发者本人作为内部测试员，用 TestFlight 拿到的构建 90 天有效、自动更新、不用审核；Xcode 直装的开发构建受描述文件一年期限约束（推断）。

### 2.3 APNs

- App 要打开 Push Notifications 能力（加上 `aps-environment` entitlement），并在开发者账号里为 App ID 打开推送服务 [10]。
- 推荐用基于 token 的认证：在开发者账号里生成 `.p8` 签名密钥，服务端用它按 ES256 签 JWT（`kid` 是 Key ID，`iss` 是 Team ID，`iat` 是签发时间）。JWT 至少每 60 分钟、最多每 20 分钟刷新一次 [9]。
- 同一个 JWT 可以从多台服务器发送，一个密钥可以覆盖团队的全部或部分 App [9]。团队级密钥可以限定只用于 sandbox 或 production，每个环境最多两个；另有按 topic 限定的密钥 [9]。一条到 APNs 的连接不能混用多个团队的凭据 [9]。
- 另一种方式是 Apple Push Services 证书，证书过期后就不能再发推送 [5]。
- `.p8` 密钥属于开发者团队，必须保密 [9]。这意味着公开发布后，用户自己的电脑不能直接持有 Pigcode 的 APNs 密钥，推送要经过 Pigcode 运营的中转服务（推断）。

### 2.4 实时活动（Live Activities）

- 实时活动的界面写在 widget 扩展里，没有 widget 也可以只为它建一个 widget 扩展 [16]。
- 生命周期：最多活跃 8 小时，到时系统自动结束并从灵动岛移除；结束后在锁屏最多再留 4 小时，合计最多 12 小时 [16]。
- 实时活动运行在自己的沙箱里，不能联网；静态和动态数据合计不超过 4 KB。更新途径只有两种：App 自己用 ActivityKit 更新，或服务器发 ActivityKit 推送 [16]。
- ActivityKit 推送要先给 App 加 Push Notifications 能力 [15]。iOS 17.1 及以前不能用推送启动实时活动，只能用推送更新和结束；push-to-start 令牌不需要先从 App 里启动过实时活动 [15]。iOS 18 起可以用 channel 广播更新（不能用广播启动）；broadcast 能力只能在 developer.apple.com 上打开 [15]。
- ActivityKit 推送有每小时的预算，超出会被限流 [15]。
- 在模拟器上测 ActivityKit 推送要 T2 或 Apple silicon 的 Mac、macOS 13 以上 [15]。

### 2.5 分享扩展

- 分享扩展和主 App 共享偏好设置或文件，要给两者打开 App Groups 并在账号里注册 app group；扩展里发起后台 `URLSession` 上传下载时必须设置共享容器 [19]。
- app group 的 ID 以 `group.` 开头，iOS 上要注册；每个开发者账号最多 1,000 个 [20]。
- App Groups 在免费账号下可用 [1]，所以分享扩展不依赖付费会员；它额外占一个 App ID（见 1.2）。

## 3. 开发阶段怎么测通知

| 方法 | 需要付费账号 | 经过 APNs | 能测什么 | 限制 |
|---|---|---|---|---|
| `xcrun simctl push <设备> <bundle ID> <文件>`，或把 `.apns` 文件拖进模拟器 | 否 | 否 | 通知展示、点击、动作按钮、后台内容更新通知 [11][12] | 载荷顶层是对象、要有 `aps` 键、不超过 4096 字节；只支持应用的远程推送，VoIP、File Provider 等类型不支持 [43]；拖放时要有 `Simulator Target Bundle` 键 [11]；不支持 Notification Service Extension，`mutable-content` 不生效 [11] |
| 模拟器接收真实远程推送 | 是（推断：要 APNs 密钥） | 是，sandbox | 完整链路，包括 Notification Service Extension [13] | iOS 16 模拟器、macOS 13、Apple silicon 或 T2 Mac；令牌按「模拟器 + Mac」唯一，长度可变 [13] |
| Push Notifications Console（网页） | 是 | 是 | 给设备令牌或 channel 发测试推送，看 development 环境的投递日志，校验 JWT 和设备令牌 [14] | production 环境只有 admin 角色能发；投递日志只保留 7 天、只有 development 环境 [14] |
| 本地通知（`UNUserNotificationCenter`） | 否 | 否 | 真机上的通知展示和交互 [18] | App 被挂起后无法根据电脑上的事件发出（见 1.3） |

- 免费阶段在真机上能验证的只有本地通知；远程推送链路只能在付费后验证（推断）。
- Pigcode 跑在 MacBook 上，正好能跑模拟器。`simctl push` 可以在 Host 侧写一个开发用的「通知通道」，直接调用 `xcrun simctl push` 把通知送进模拟器，用来调通知内容和点击跳转（推断）。

## 4. 安卓：侧载与 Google 开发者验证

### 4.1 时间表（截至 2026-11-21）

- 2025 年宣布，2026 年 3 月对所有开发者开放验证 [23]。
- 2026 年 6 月起在多数设备上自动安装系统服务 Android Developer Verifier（包名 `com.google.android.verifier`），用来校验应用是否由已验证的开发者注册 [22][26]。
- 2026 年 8 月：上线 Android Developer ID Status API、Android Developer Console API、免费的有限分发账号和「高级流程」[21][22]。
- 2026-09-30：在巴西、印尼、新加坡、泰国，从 7 家参与商店（Google Play、HONOR App Market、OPPO App Market、Galaxy Store、Palm Store、V-Appstore、小米 GetApps）安装到运行 Android 8 以上的认证设备时开始校验 [21][22]。
- 2027 年 1 月：和同样 7 家分发方一起开始全球推行，之后几个月逐步扩展到所有国家、认证设备上的所有安装来源 [23]；面向分发方的指南写其他商店在 2027 年 3 月前生效 [24]。
- 2026-11-19 的博客把有限分发账号的设备上限从 20 台提高到 50 台 [23]（FAQ 里有的条目还写着 20 台 [25]）。

### 4.2 谁不受影响

- **adb 安装**：FAQ 写明开发者可以不经验证用 adb 安装，用于开发和测试；高级流程的 24 小时等待也不适用于 adb [25]。
- **非认证设备、不支持 Google 移动服务的地区**：要求只适用于 Google 认证的 Android 设备，AOSP 和非认证设备豁免；在不支持 Google 移动服务的地区和受制裁地区也不适用 [26]。Google 没有点名中国大陆。大陆国行手机大多不带 Google 移动服务，按这条应不受影响（推断）。
- **当前阶段的直接侧载**：2026-09-30 这一阶段只针对参与商店，用户直接侧载或从其他商店安装还不受影响 [25]。

### 4.3 受影响时怎么办

- 发布者在 Android Developer Console 验证身份、登记包名和签名密钥。完整分发账号 25 美元；有限分发账号免费、不验证证件，最多 50 台设备 [23][25]。签名密钥丢失就无法登记包名 [25]。
- 用户一侧的「高级流程」：在设置里打开开发者模式，确认没有人在指导操作，重启并重新认证，等 24 小时后用生物识别或 PIN 确认，之后可以选择 7 天或永久允许安装未登记的应用；关掉高级流程后，未登记的应用只能用 adb 安装或更新 [25]。
- 对 Pigcode：第一版只在模拟器上用 adb 装，不受影响。公开发布时，面向海外认证设备的 APK 应在 Android Developer Console 登记（推断）。

## 5. 安卓：FCM 与模拟器

- FCM 客户端要求 Android 7.0 以上并装有 Google Play 商店，或者 Android 7.0 以上、带 Google APIs 的模拟器；应用不必从 Play 商店分发 [27]。
- Android 13 起，显示通知要申请运行时权限 `POST_NOTIFICATIONS` [27]。
- 网络：设备通过 TCP 5228（有时 5229、5230、443）连接 `mtalk.google.com` 等主机；发送端通过 HTTPS 访问 `fcm.googleapis.com`、`accounts.google.com` [28]。Firebase 文档写明 FCM 的设备投递协议「不能通过网络代理转发」，设备必须能直连 Google 的服务器 [28]。
- 大陆网络下的含义：只给模拟器设置 HTTP 代理不够，要让 Mac 整机走 VPN 或透明代理，模拟器流量随宿主机一起出去（推断）。Google 服务在大陆不可达这一点，没有找到 Google 的一手说明。
- Android 的省电机制：设备进入 Doze 后挂起所有应用的网络访问、忽略 wake lock；Google 的建议是用 FCM，`RemoteNotification` 类型的消息在 Doze 下也会投递，并给应用临时联网的机会 [30]。不用 FCM 的应用可以请用户把它加入电池优化豁免名单，名单里的应用在 Doze 下能联网，但 Play 政策限制直接请求豁免 [30]。有前台服务的应用不会被判为 App Standby [30]。
- 自建长连接要跑前台服务：Android 14 起前台服务必须声明类型，可选的有 `remoteMessaging`（设备之间传文字消息）、`dataSync`、`specialUse`（Play 上架时审核用途说明）等 [29]。自用侧载不经过 Play 审核（推断）。

## 6. 大陆网络下的推送通道（部分待补）

### 6.1 APNs（待补）

### 6.2 统一推送

- 「统一推送联盟」2017 年 10 月成立，2018 年完成标准制定，2019 年底主要终端厂商完成适配；2022 年按主管部门要求升级为「统一推送工作委员会」[31]。
- 工委会测试厂商系统推送服务依据的是《T-UPA0002-2019 统一推送接口层规范》，例如 nubia 的系统推送服务通过测试后在存量机和新机上支持 [32]。也就是说，它规范的是各厂商的系统推送服务，开发者仍要分别接入各厂商的推送（推断，工委会材料里没有面向开发者的统一接入服务）。
- 联盟早期官网 chinaupa.com 在 2026-11-21 打开显示的是无关的垃圾内容（本次实测），现在只能从工委会公众号看到它的公告 [31][32]。

### 6.3 厂商推送

| 厂商 | 开发者账号 | 是否要上架自家商店 | 消息数量和分类 |
|---|---|---|---|
| vivo | vivo 开放平台账号；个人开发者上架需本人持有软著、App 备案等资质 [36] | 正式推送要上架；未上架时推送权限「受限」，只能发测试消息（`pushMode=1`），每个应用每天 1,000 条；也可以走「非公开应用分发」申请 [33][34][35] | 正式推送见 vivo 的消息限制说明（本次未读） |
| OPPO | 要注册并认证 OPPO 企业开发者账号 [37][38] | 通知栏推送要上架 OPPO 软件商店；测试权限每天 1,000 条 [37][38] | 基础服务免费；只支持通知栏消息，不支持透传 [38]。这两篇是 2020 年的官方帖子，现行规则未核实 |
| 小米 | 小米开发者账号，审核 1–3 个工作日；启用推送时要创建通知类别，审核 3–5 个工作日 [39] | 官方启用指南没有提到上架要求 [39]；是否需要上架，未经一手来源证实 | 私信不限量；公信按「安装且通知开启数 × 2」限总量，每台设备每应用每天 5 条；不接入分类时走默认通道，每台设备每天 1 条 [40]。2026-07-01 起私信要用模板，2026-08-01 起按新分类申请 channel [40][41][42] |
| 华为、荣耀 | 待补 | 待补 | 待补 |

- 小米的私信类型包括「任务进程」「审核进度」「设备状态」「监控报警」「工作聊天」等 41 种 [41]。Pigcode 的「会话跑完」「等你处理」能不能归进私信，要等申请时由小米审核（推断）。
- 这些规则都按「有很多用户的上架应用」设计。只给自己一台手机用时，测试推送的每天 1,000 条在数量上够用，但 vivo、OPPO 的测试推送要把手机登记为测试设备（推断，来自 vivo 文档里「测试设备」的说法 [35]）。

### 6.4 聚合服务、UnifiedPush 和自建长连接（待补）

## 7. 不用自家 APNs 权限也能到达 iPhone 的通道（待补）

## 8. Expo（待补）

## 9. 对「手机端技术栈」和「通知怎么送到手机」的含义（待补）

## 参考来源

所有来源的访问日期都是 2026-11-21。

1. Apple, Supported capabilities (iOS): https://developer.apple.com/help/account/reference/supported-capabilities-ios
2. Apple, Developer account overview: https://developer.apple.com/help/account/basics/about-your-developer-account/ （原 https://developer.apple.com/support/compare-memberships/ ）
3. Apple, TN3125: Inside Code Signing: Provisioning Profiles: https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles
4. Apple, TN3161: Inside Code Signing: Certificates: https://developer.apple.com/documentation/technotes/tn3161-inside-code-signing-certificates
5. Apple, Certificates overview: https://developer.apple.com/help/account/certificates/certificates-overview/
6. Apple, Devices overview: https://developer.apple.com/help/account/devices/devices-overview/
7. Apple, TestFlight overview: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
8. Apple, Enabling Developer Mode on a device: https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device
9. Apple, Establishing a token-based connection to APNs: https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns
10. Apple, Registering your app with APNs: https://developer.apple.com/documentation/usernotifications/registering-your-app-with-apns
11. Apple, Xcode 11.4 Release Notes（Internet Archive 存档）: https://web.archive.org/web/20200502181924/https://developer.apple.com/documentation/xcode_release_notes/xcode_11_4_release_notes
12. Apple, WWDC20「Become a Simulator expert」: https://developer.apple.com/videos/play/wwdc2020/10647/
13. Apple, Xcode 14 Release Notes（Simulator 一节）: https://developer.apple.com/documentation/xcode-release-notes/xcode-14-release-notes
14. Apple, Testing notifications using the Push Notification Console: https://developer.apple.com/documentation/usernotifications/testing-notifications-using-the-push-notification-console
15. Apple, Starting and updating Live Activities with ActivityKit push notifications: https://developer.apple.com/documentation/activitykit/starting-and-updating-live-activities-with-activitykit-push-notifications
16. Apple, Displaying live data with Live Activities: https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities
17. Apple Developer Forums，Apple DTS（Quinn）, iOS Background Execution Limits（2026-01-09 更新）: https://developer.apple.com/forums/thread/685525
18. Apple, Scheduling a notification locally from your app: https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app
19. Apple, App Extension Programming Guide: Handling Common Scenarios: https://developer.apple.com/library/archive/documentation/General/Conceptual/ExtensibilityPG/ExtensionScenarios.html
20. Apple, Configuring app groups: https://developer.apple.com/documentation/xcode/configuring-app-groups
21. Android Developers, Android developer verification: https://developer.android.com/developer-verification
22. Android Developers Blog, Android developer verification: Building a safer ecosystem together（2026-06-18）: https://developer.android.com/blog/posts/android-developer-verification-building-a-safer-ecosystem-together
23. Android Developers Blog, Expanding Android developer verification in 2027（2026-11-19）: https://developer.android.com/blog/posts/android-developer-verification-2027
24. Android Developers, Resources for app distributors: https://developer.android.com/developer-verification/guides/distributor-resources
25. Android Developers, Android developer verification FAQ（2026-11-17 更新）: https://developer.android.com/developer-verification/guides/faq
26. Google, Android Help: Learn about Android developer verification: https://support.google.com/android/answer/17065026
27. Firebase, Set up a Firebase Cloud Messaging client app on Android: https://firebase.google.com/docs/cloud-messaging/android/client
28. Firebase, Configure your Network for FCM（2026-11-18 更新）: https://firebase.google.com/docs/cloud-messaging/network-configuration
29. Android Developers, Foreground service types: https://developer.android.com/develop/background-work/services/fgs/service-types
30. Android Developers, Optimize for Doze and App Standby（2026-10-22 更新）: https://developer.android.com/training/monitoring-device-state/doze-standby
31. 统一推送工作委员会公众号，开启新征程：「统一推送联盟」全面升级为「统一推送工作委员会」: https://mp.weixin.qq.com/s/3HYcX7Cet7LW1__lc3d3Xg
32. 统一推送工作委员会公众号，快讯：nubia 完成统一推送标准适配: https://mp.weixin.qq.com/s/pdoS55owpP295UVGpc2JfQ
33. vivo 开放平台，应用管理常见问题（2026-11-17 更新）: https://dev.vivo.com.cn/documentCenter/doc/62
34. vivo 开放平台，推送常见问题（2026-09-20 更新）: https://dev.vivo.com.cn/documentCenter/doc/156
35. vivo 开放平台，推送服务端常见问题（2026-10-27 更新）: https://dev.vivo.com.cn/documentCenter/doc/614
36. vivo 开放平台，应用审核规范: https://dev.vivo.com.cn/documentCenter/doc/12
37. OPPO 开放平台社区，OPPO PUSH 服务开启指南（2020-06-23）: https://open.oppomobile.com/bbs/forum.php?mod=viewthread&tid=1906
38. OPPO 开放平台社区，OPPO PUSH 常见问题解答集锦（一）（2020-06-23）: https://open.oppomobile.com/bbs/forum.php?mod=viewthread&tid=1910
39. 小米澎湃OS开发者平台，推送服务启用指南（2026-08-03 更新）: https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1542
40. 小米澎湃OS开发者平台，推送消息限制说明（2026-07-02 更新）: https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1656
41. 小米澎湃OS开发者平台，小米推送 2026 年消息分类新规（2026-08-07 更新）: https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2321
42. 小米澎湃OS开发者平台，关于订阅消息及消息分类新规的通知（2026-07-02 更新）: https://dev.mi.com/xiaomihyperos/documentation/detail?pId=2322
43. 本机实测：在调研用的 Mac（macOS 15.6.1、Apple silicon、Xcode 16.4）上运行 `xcrun simctl help push` 的输出。这不是公开来源。
