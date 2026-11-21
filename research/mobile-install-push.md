# 手机端自用时的安装与推送限制调研（#88）

调研日期 2026-11-21，下文来源的访问日期都是 2026-11-21。方括号里的数字对应「参考来源」的编号。标注「未经一手来源证实」的内容没有找到官方页面支持；标注「推断」的是根据所引来源推出的结论，没有找到直接写明它的文档。

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
- **侧载的 APK 在 OPPO、vivo 手机上会少一类消息。** 个推文档记录：不是从 OPPO 软件商店下载的应用不再提供公信消息，不是从 vivo 官方渠道安装的应用默认关闭运营消息 [64]。
- **聚合服务和 UnifiedPush 对自用没有帮助。** 极光、个推都有免费版，但各厂商的注册、上架和消息分类一样要做，iOS 一样要 APNs 凭据，还多了一个能看到通知内容的第三方 [56][57][61][63]。UnifiedPush 只有 Android 和 Linux，用户要另装分发器 App [65]。
- **APNs 在大陆没有替代品，可靠性没有一手数据。** Apple 的网络说明没有提到中国大陆 [55]，也没有公开可用性数据。但 App 不在前台时，iOS 上只有 APNs 能送达通知 [17]，极光、个推在 iOS 上的离线推送也走 APNs [56][63]。APNs 是尽力投递，可能延后或丢弃 [14]，所以通知只能当提醒，手机端打开后要自己从电脑补齐状态（推断）。
- **免费阶段把通知送到 iPhone，首选 Bark。** Bark 在中国区 App Store 可下载 [44]；bark-server 开源并内置 Bark 的 APNs 私钥，可以自建在云服务器上直连 APNs [47]；正文可以用自定义密钥加密，Bark 服务端和 APNs 都看不到明文 [45]；`level=timeSensitive` 能穿透专注模式，`url` 能跳回手机端 [46]。Host 发一个 HTTP 请求即可触发。
- **其他现成通道各有短板。** ntfy 的正文不经第三方，但自建服务器要能访问 ntfy.sh，手机要能连上自建服务器，唤醒信号还要经过 Firebase [48]。企业微信、飞书、钉钉机器人在大陆最稳，但正文明文经过平台，每个机器人限 20–100 条/分钟 [49][50][51]，只适合发摘要。Telegram 不在中国区 App Store [44]，不适合。
- **Expo 在免费阶段能用，但推送和云构建要付费。** Expo Go 在中国区 App Store 可下载（58.0.5）[44]，不要账号、不会 7 天过期，但不能加原生模块，也没有推送 [67][75]。开发构建可以在 Mac 上用 `npx expo run:ios --device` 加免费 Personal Team 签名，受 7 天和 3 个 App 的限制 [74]。EAS Build 做 iOS 真机构建要付费会员，只有模拟器构建不要 Apple 账号 [72][73][74]。
- **Expo 推送服务在大陆能否使用没有定论，而且不是必需的。** 手机和发送端都要连 `exp.host` [69][70]，大陆能否稳定访问未经一手来源证实；它在安卓上走 FCM，帮不了国行手机 [68]。可以不用它，直接对接 APNs 和 FCM [68]。
- **只给自己用时最省事的组合**：iPhone 付费前用 Bark，付费后由电脑直接调 APNs；安卓只在模拟器上验证，手机端自己保持连接并发本地通知，要验证真实推送链路时再接 FCM；国内厂商通道留到公开发布。
- **对「手机端技术栈」（#95）**：免费阶段任何技术栈都只能在开发者的 Mac 上用 Xcode 构建、每 7 天重装，EAS Build 帮不上忙；第一版要往 App 里加原生扩展 target（Notification Service Extension、分享扩展、实时活动用的 widget 扩展），技术栈必须支持；通知库要能拿到原生 APNs / FCM 令牌。付费后用 TestFlight 内部测试安装最省事。详见 9.1。
- **对「通知怎么送到手机」（#98）**：分两段走，免费阶段 Host 经 Bark 发通知，付费后 Host 用开发者自己的 `.p8` 密钥直连 APNs，自用不需要中转服务器；公开发布要有 Pigcode 运营的推送中转，正文在电脑上加密、由手机上的 Notification Service Extension 解密；协议要让手机端登记带类型和环境的推送目标，Host 里的发送做成可替换的通知通道。详见 9.2。

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

## 6. 大陆网络下的推送通道

### 6.1 APNs

- Apple 的网络说明：设备要和 Apple 的服务器保持一条长连接，走 TCP 5223，连不上时退到 443（443 可以穿过不解密的代理）；发送端用 TCP 443 或 2197 把通知发给 APNs；服务器在 Apple 的 17.0.0.0/8 地址段内做负载均衡 [55]。这份说明没有提到中国大陆。
- APNs 本身是尽力投递：它会根据设备电量、网络等情况立即投递、延后、多次重试或丢弃 [14]。
- Apple 没有公开 APNs 在中国大陆的可用性或时延数据，「APNs 在大陆可靠」未经一手来源证实。
- 间接证据：在 iOS 上，App 不在前台时能把它叫醒或弹出通知的只有 APNs [17]。国内的推送聚合服务在 iOS 上的离线推送也都走 APNs：极光要求在后台上传 APNs 证书或配置 token 认证 [56]，个推写明 iOS 要配置推送证书才能用离线推送 [63]。所以大陆所有需要离线通知的 iOS App 都依赖 APNs（推断）。
- 发送端：Pigcode 跑在大陆网络下的 MacBook 上，直接连 `api.push.apple.com:443` 是否稳定，未经一手来源证实；付费后用 Apple 的命令行示例发一条测试推送即可验证 [14]。
- 对设计的含义：通知只能当提醒用，不能当消息通道；手机端被点开后要自己从电脑补齐状态（推断）。

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
| 华为、荣耀 | 本次未读两家自己的文档 | 个推文档写华为、荣耀、魅族不要求上架 [64] | 未核实 |

- 小米的私信类型包括「任务进程」「审核进度」「设备状态」「监控报警」「工作聊天」等 41 种 [41]。Pigcode 的「会话跑完」「等你处理」能不能归进私信，要等申请时由小米审核（推断）。
- 这些规则都按「有很多用户的上架应用」设计。只给自己一台手机用时，测试推送的每天 1,000 条在数量上够用，但 vivo、OPPO 的测试推送要把手机登记为测试设备（推断，来自 vivo 文档里「测试设备」的说法 [35]）。

- 个推文档还记录了两条针对侧载的规则：2024-07-29 起，不是从 OPPO 软件商店官方渠道下载的应用不再提供公信消息服务；2025-02-17 起，不是从 vivo 官方渠道下载安装的应用默认关闭接收运营消息的权限 [64]。这两条的原始公告是 OPPO、vivo 发布的，本次没有读到原文。侧载的 APK 在这两家手机上只剩私信类和测试消息（推断）。

### 6.4 聚合服务、UnifiedPush 和自建长连接

**极光（JPush）**

- 免费版「永久免费」，最多 100 个应用；离线消息每台设备每天存 5 条、最长 3 天；免费版的下发策略只有「仅走极光通道」和「优先走极光，离线再走厂商」两种 [57]。
- 支持极光通道、APNs、FCM、华为、小米、OPPO、vivo、魅族等通道 [57]；厂商通道仍要开发者到各厂商平台申请参数 [57]。
- iOS 端要上传 APNs 证书或配置 token 认证 [56]，所以仍然需要付费 Apple 账号（推断）。
- 注册要提供真实身份信息，企业用户要提供营业执照 [58][59]。
- 极光自己的 FAQ 不建议把隐私内容明文放进通知，确有需要时由开发者自己做端到端加密 [60]。

**个推（Getui）**

- 免费接入、推送条数不限；厂商推送策略是 VIP 功能，VIP 按日联网设备数月峰值计费，1 万以内 3,000 元/月 [61][62]。
- Android 只集成个推主包时只有「在线推送」；离线推送要集成多厂商包，并在各厂商平台开通推送、把参数配到个推后台 [63]。iOS 要配置推送证书才能离线推送 [63]。
- 个推的说法是：华为、荣耀、魅族不要求上架应用商店，vivo、小米和 OPPO 的正式环境必须上架后才能用离线厂商推送 [63][64]。

**聚合服务对 Pigcode 的含义**：它们统一了 SDK 和服务端 API，但不能免掉各厂商的注册、上架和消息分类，还多了一个能看到通知内容的第三方（推断）。只给自己一台手机用时没有必要。

**UnifiedPush**

- 开放、去中心化的推送标准：应用服务器把消息发给用户自选的「分发器」服务器，分发器的手机 App 再转交给目标应用；可选的分发器有 Sunup、ntfy、Conversations、NextPush、gCompat-UP 等，能在不带 Google 服务的 Android 上用 [65]。
- 只有 Android 和 Linux，没有 iOS [65]。用户要另装一个分发器 App（推断），这对公开发布时的普通国内用户门槛太高。

**自建长连接**

- 在 Android 上，App 用前台服务保持到电脑或中转服务的连接，收到事件后自己发本地通知。前台服务要声明类型，并常驻一条通知 [29]；设备进入 Doze 后网络会被挂起，除非用户把 App 加入电池优化豁免 [30]。
- 国产 ROM 在系统电池优化之外还有各自的后台管理，会不会杀掉前台服务，未经一手来源证实。
- 模拟器上没有这些厂商限制，自建长连接和 FCM 都能验证（推断）。

### 6.5 只给自己用时哪条最省事

- **iPhone**：付费前用 Bark 这类现成 App（第 7 节）；付费后由电脑直接调用 APNs（第 2.3 节），不需要任何国内第三方。
- **安卓**：开发者没有安卓手机，只在模拟器上验证。最省事的是 App 在前台或前台服务期间用自己的连接收事件、发本地通知，不需要注册任何推送平台；要验证真实推送链路再接 FCM（模拟器用 Google APIs 镜像，Mac 整机走 VPN）。国内厂商通道、极光或个推留到公开发布。

## 7. 不用自家 APNs 权限也能到达 iPhone 的通道

免费 Apple ID 阶段手机端自己收不到推送（第 1 节）。这时可以让电脑上的 Host 调用一个现成 App 的推送接口，由那个 App 在 iPhone 上弹通知；用户点开通知再跳进手机端。下表的「App Store 中国区」一列是用 Apple 的 iTunes Search/Lookup API 在 2026-11-21 查询的结果 [44]。

| 通道 | App Store 中国区 | 消息怎么到 iPhone | 第三方能看到什么 | Host 怎么触发 |
|---|---|---|---|---|
| Bark | 有（「Bark - 给你的手机发推送」1.6.4）[44] | 发送端 → Bark 服务端 → APNs → Bark App [45] | 用官方服务器 `api.day.app` 时作者能看到请求日志；自建服务端加推送加密后，Bark 服务端和 APNs 都看不到正文 [45][47] | HTTP GET/POST 到 `https://<服务端>/<device_key>`，参数有 `title`、`body`、`url`、`level`、`group`、`ciphertext` 等 [46] |
| ntfy | 有（ntfy 1.7.0）[44] | 自建 ntfy 服务器 → ntfy.sh → Firebase → APNs → ntfy App，App 再回自建服务器取正文 [48] | ntfy.sh、Firebase、APNs 只拿到消息 ID 和 topic URL 的 SHA256；正文只在自建服务器和手机之间传 [48] | HTTP POST 到自建服务器的 topic |
| 企业微信群机器人 | 有（企业微信）[44] | 企业微信服务器 → 企业微信 App 的推送 | 全部正文经过腾讯服务器 | HTTP POST 到 `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=…` [49] |
| 飞书自定义机器人 | 有（飞书）[44] | 飞书服务器 → 飞书 App 的推送 | 全部正文经过飞书服务器 | HTTP POST 到 `https://open.feishu.cn/open-apis/bot/v2/hook/…` [50] |
| 钉钉自定义机器人 | 有（钉钉）[44] | 钉钉服务器 → 钉钉 App 的推送 | 全部正文经过钉钉服务器 | HTTP POST 到 `https://oapi.dingtalk.com/robot/send?access_token=…` [51][52] |
| Telegram Bot | 没有（Telegram Messenger 在中国区查不到）[44] | Telegram 服务器 → Telegram App 的推送 | 全部正文经过 Telegram 服务器 | Bot API `sendMessage` |

### 7.1 Bark

- Bark 是开源 iOS App（MIT 许可），服务端 bark-server 也开源，可以用 Docker 或二进制自建 [45][47]。
- bark-server 源码里直接写着 Bark App 的 APNs topic `me.fin.bark`、Key ID 和 Team ID，并内置了对应的 APNs 私钥，连接 APNs production [47]。所以自建的 bark-server 不经过作者的服务器，直接把推送发给 APNs。
- 推送加密：在 App 里设置自定义 AES 密钥，发送端把参数 JSON 加密后放进 `ciphertext`。Bark 文档写明这样「推送内容在传输过程中就不会被 Bark 服务器和苹果 APNs 服务器获取或泄露」[45]。
- `level=timeSensitive` 在专注模式下也能显示；`level=critical` 是重要警告，要用户在 App 里授权，需要 iOS 15 以上 [46]。这正好补上免费账号没有 Time Sensitive Notifications 能力的缺口（第 1.1 节）。
- `url` 参数：点击推送时跳转，支持 URL Scheme 和 Universal Link [46]。手机端注册自定义 URL Scheme 不需要任何 capability，所以点通知可以直接打开手机端里对应的会话（推断）。
- Bark 的隐私说明还指出，App Store 上的版本由 GitHub Actions 从公开源码构建并上传，可以用构建号核对 [45]。
- 大陆可靠性：送达靠 APNs（见 6.1）。官方服务器 `api.day.app` 在大陆能否稳定访问，未经一手来源证实；自建在开发者的云服务器上可以避开这个依赖。

### 7.2 ntfy

- iOS 限制后台运行，ntfy 无法在没有中心服务器的情况下做即时推送。自建服务器要设置 `upstream-base-url`（默认指向 `https://ntfy.sh`），把每条消息转成一个 poll request 发给上游 [48]。
- 流程：iOS App 订阅自建服务器上的 topic，同时订阅以该 topic URL 的 SHA256 命名的 Firebase topic；自建服务器收到消息后，向 ntfy.sh 发一个只含消息 ID（`X-Poll-ID`）和 topic 哈希的请求；ntfy.sh 经 Firebase 转 APNs 送到手机；手机再回自建服务器取正文 [48]。上游收到的正文固定是「New message」，手机连不上自建服务器时就显示这句 [48]。
- 不设上游时通知仍会到，但可能晚几个小时 [48]。
- 大陆可靠性：自建服务器要能访问 ntfy.sh，手机要能访问自建服务器；ntfy.sh 在大陆能否访问，未经一手来源证实。正文不经过第三方，这是它比 Bark 官方服务器、各家机器人好的地方。

### 7.3 企业微信、飞书、钉钉机器人

| | 企业微信群机器人 | 飞书自定义机器人 | 钉钉自定义机器人 |
|---|---|---|---|
| 频率限制 | 每个机器人 20 条/分钟 [49] | 单租户单机器人 100 次/分钟、5 次/秒；避开整点、半点 [50] | 每个机器人 20 条/分钟，超过限流 10 分钟 [51][52] |
| 消息大小和格式 | text、markdown、markdown_v2、图片、图文、文件、语音、模板卡片；markdown 不超过 4096 字节 [49] | 文本、富文本、图片、群名片、消息卡片；请求体不超过 20 KB [50] | text、link、markdown 等 [51][52] |
| 安全设置 | webhook 地址本身就是凭据，文档要求不要泄露 [49] | 自定义关键词、IP 白名单（最多 10 个）、签名校验 [50] | 自定义关键词（最多 10 个）、加签、IP 白名单 [53] |

- 三者都只能往群里发：开发者要建一个只有自己的群（或企业/租户），机器人消息作为群消息出现，由各自 App 的推送送到手机（推断）。
- 消息全文以明文经过腾讯、飞书或钉钉的服务器，不能端到端加密（推断：它们只接受明文消息体 [49][50][51]）。所以只能发「会话 X 跑完了」「会话 Y 等你审批」这类摘要，不能放代码和 diff。
- 三家都是国内服务，App 都在中国区 App Store [44]，大陆网络下最不受网络环境影响（推断）。
- 点击跳转：消息里可以放链接，飞书卡片按钮的 `open_url` 还能分别填 `ios_url`、`android_url` [50]。这些链接能否在 App 内直接拉起手机端的自定义 URL Scheme，未经一手来源证实。

### 7.4 Telegram Bot

- 同一会话里每秒不超过 1 条，群里每分钟不超过 20 条 [54]。
- Telegram Messenger 不在中国区 App Store [44]，开发者要用其他地区的 Apple 账户下载；在大陆网络下要开代理才能连上 Telegram 服务器（未经一手来源证实）。这条对开发者不合适。

### 7.5 小结

- 免费阶段最省事的是 Bark：App 在中国区可下载，自建 bark-server 直连 APNs，正文可以加密，支持 Time Sensitive，点开能跳回手机端。
- 想让正文完全不经第三方，用 ntfy 自建，代价是要能访问 ntfy.sh，而且手机要能连上自建服务器。
- 企业微信、飞书、钉钉在大陆最稳，但正文明文经过平台，适合只发摘要。
- 这些通道都只是过渡：付费后改成手机端自己收 APNs（第 2.3 节）。Host 里把它们做成可替换的「通知通道」，以后不需要改通知的触发逻辑（推断）。

## 8. Expo

Expo 文档现在把 EAS Build 称为 Expo Build [71][73]，下文沿用 EAS Build。

### 8.1 Expo Go

- Expo Go 能在 App Store 中国区下载：2026-11-21 查到的是 58.0.5（2026-10-22 发布，要求 iOS 16.4 以上），中国区和美国区版本相同 [44]。
- Expo Go 本身是从 App Store 安装的 App，用它运行项目不需要任何 Apple 账号，也不受 Personal Team 的 7 天期限约束（推断，依据 [2]）。
- 限制：Expo 把它定位为给学习者用的「playground」，不能加自定义原生模块 [75]；推送能力没有内置在 Expo Go 里，要用推送必须用开发构建 [67]；安卓上从 SDK 53 起 Expo Go 不再支持远程推送，本地通知仍然可用 [66]。
- 对 Pigcode：Expo Go 只适合在免费阶段快速试界面和到电脑的连接；推送、分享扩展、实时活动都要开发构建（推断，依据 [67][75] 和第 2.4、2.5 节）。

### 8.2 开发构建（development build）

- **在 Mac 上本地构建**：`npx expo run:ios --device` 由 Xcode 编译、签名并装到手机，签名可以用免费 Apple 账户的 Personal Team [74]。它受免费账号的全部限制：7 天过期、每台设备 3 个 App、只能装到自己的设备、带推送等付费能力的构建签不了 [2][74]。
- **EAS Build 云构建**：给真机用的 iOS 构建要用分发证书加 Ad hoc 描述文件签名 [73][76]；生成这些凭据（以及推送密钥）要登录 Apple Developer Program 会员账号 [72]；Ad hoc 内部分发每年最多 100 台 iPhone [71]。所以没有付费账号时，EAS Build 做不出能装到 iPhone 上的构建。
- EAS Build 给 iOS 模拟器的构建不需要 Apple 账号 [74]。
- 开发构建装到真机前要打开开发者模式 [8][76]。

### 8.3 Expo 推送服务

- 它是 Expo 运营的中转：服务端把消息 POST 到 `https://exp.host/--/api/v2/push/send`，Expo 再转给 APNs 或 FCM [68][69]。默认不需要鉴权，可以在控制台打开 access token；每次请求最多 100 条，每个项目每秒最多 600 条 [69]。
- 手机端调用 `getExpoPushTokenAsync` 时，会向 `https://exp.host/--/api/v2/push/getExpoPushToken` 请求令牌 [70]。所以手机和发送端都要能连到 `exp.host`。
- iOS 推送凭据要付费 Apple 账号才能生成；安卓要配置 FCM V1 凭据 [68]。安卓消息走 FCM，不带 Google 服务的国行手机收不到（推断，依据 [27][68]）。
- 消息的标题、正文和 data 都放在发给 Expo 的请求体里（推断，依据 [69]），Expo 能看到明文，除非应用自己先加密。
- `exp.host` 在中国大陆能否稳定访问，Expo 文档没有提到，未经一手来源证实。
- Expo 推送服务是可选的：`expo-notifications` 能取得原生设备推送令牌 [66]，Expo 文档也说明可以不用 Expo 的服务、直接对接 FCM 和 APNs [68]。
- 对 Pigcode：自用阶段由电脑直接调 APNs 更简单，不需要 Expo 中转；公开发布时，Expo 推送服务可以算作「推送中转」的一个现成选项，但它解决不了国内安卓（推断）。

## 9. 对「手机端技术栈」和「通知怎么送到手机」的含义

### 9.1 手机端技术栈（#95）

- 签名约束和技术栈无关。免费阶段 iOS 上任何技术栈都只能在开发者的 Mac 上用 Xcode 构建，每 7 天重装一次 [2]；Expo 也一样，EAS Build 在付费前做不出真机构建 [72][73]。候选技术栈要能在本地用 Xcode 构建（推断）。
- 第一版的通知、分享和实时活动要往 App 里加原生 iOS target：Notification Service Extension（解密推送正文，见 9.2）、分享扩展、widget 扩展。实时活动的界面只能用 WidgetKit 和 SwiftUI 写在 widget 扩展里 [16]。候选技术栈要能加这些扩展 target，并让它们和主 App 共享 App Group（推断，依据 [13][16][19]）。
- Expo Go 不能加原生模块、没有推送 [67][75]，只能用来早期试界面和到电脑的连接；正式开发要用开发构建 [74]。
- 通知库要能拿到原生 APNs / FCM 令牌，不能只拿某家中转服务的令牌。`expo-notifications` 能做到 [66][68]。
- 付费后最省事的安装方式是 TestFlight 内部测试：TestFlight 在中国区可下载 [44]，构建 90 天有效、不用审核，也不需要开发者模式 [7][8]。
- 安卓没有签名和验证上的约束：模拟器上用 adb 安装不受开发者验证影响 [25]。

### 9.2 通知怎么送到手机（#98）

- **分两段走。**
  - 免费 Apple ID 阶段：手机端收不到远程推送（第 1 节）。Host 通过 Bark 发通知：自建 bark-server，正文加密，审批类用 `timeSensitive`，`url` 指向手机端里对应会话的链接（第 7.1 节）。手机端在前台时用自己的连接更新界面。
  - 付费后：手机端把 APNs 设备令牌登记给电脑，Host 用开发者自己的 `.p8` 密钥直接调用 APNs [9][10]。自用阶段不需要任何中转服务器。
- **公开发布时要有 Pigcode 运营的推送中转。** APNs 的 `.p8` 密钥、FCM 和厂商推送的凭据都属于发布者 [9][68]，不能发到每个用户的电脑上（推断）。为了不让中转服务看到内容，正文在电脑上加密、在手机上由 Notification Service Extension 解密（推断）。NSE 用 `simctl push` 测不了，要用真实 APNs 测 [11][13]。
- **协议要预留的。** 手机端登记的推送目标要带类型（APNs、FCM、厂商通道、Bark、webhook 等）和令牌；APNs 令牌还要带环境（sandbox 或 production），因为令牌按「设备 + App」唯一，团队密钥可以按环境限定 [9][10][13]。Xcode 开发构建和 TestFlight 构建分别对应哪个环境，本次没有读到 Apple 的原文，未经一手来源证实。Host 里把发送做成可替换的「通知通道」，触发逻辑只描述「哪个会话、发生了什么」（推断）。
- **通知只放摘要。** 会话标题、状态和「等你处理」的类型即可，不放代码和 diff：机器人通道的正文明文经过平台 [49][50][51]，APNs 尽力投递、可能丢弃 [14]。用户点开后由手机端从电脑补齐（推断）。
- **审批要穿透专注模式。** 付费后靠 Time Sensitive Notifications 能力 [1]；免费阶段只有 Bark 的 `timeSensitive` 能做到 [46]。
- **实时活动适合显示「会话正在跑」。** 付费后由电脑发 ActivityKit 推送更新，推送有每小时预算 [15]，只适合在状态变化时更新，不适合推流式输出（推断）；run 超过 8 小时会被系统结束 [16]。
- **安卓。** 第一版只在模拟器上验证：手机端自己保持连接、发本地通知，要验证真实推送链路时接 FCM（Mac 整机走 VPN）[27][28]。国内安卓手机的通道（厂商推送或聚合服务）放进迭代路线里的公开发布，届时要面对上架、软著、消息分类和侧载限制 [33][36][37][40][64]。
- **所有通知都从电脑上的 Host 发出。** MacBook 合盖睡眠后 Host 不运行，什么通知都发不出去；ADR 0018 已记录这时手机端只能显示离线。要在电脑离线时提醒手机，只能靠云服务器做心跳检测，这属于[手机怎么连到电脑，电脑睡眠或 Pigcode 退出时怎么办](https://github.com/pigcode/monorepo/issues/96)的范围（推断）。

### 未经一手来源证实的事项

- APNs 在中国大陆的可用性和时延；大陆网络下的 Mac 直连 `api.push.apple.com` 是否稳定。
- Google 服务（FCM）在大陆不可达；模拟器经 Mac 整机 VPN 能否稳定收到 FCM。
- `api.day.app`（Bark 官方服务器）、`ntfy.sh`、`exp.host` 在大陆能否稳定访问。
- 企业微信、飞书、钉钉消息里的链接能否直接拉起手机端的自定义 URL Scheme。
- 小米推送是否要求上架；华为、荣耀推送的现行接入条件；OPPO 现行的推送接入规则（本次只读到 2020 年的官方帖子）；OPPO、vivo 关于侧载应用消息权限的原始公告。
- 国产 ROM 的后台管理会不会杀掉前台服务的长连接。
- Xcode 开发构建和 TestFlight 构建分别使用哪个 APNs 环境。

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
44. Apple iTunes Search / Lookup API，2026-11-21 查询中国区（`country=cn`）和美国区（`country=us`）：Bark `id=1403753865`、ntfy `id=1625396347`、Expo Go `id=982107779`、Telegram Messenger `id=686449807`、TestFlight `id=899247664`、企业微信 `id=1087897068`、飞书 `id=1401729613`、钉钉 `id=930368978`。例如 https://itunes.apple.com/lookup?id=686449807&country=cn
45. Bark 文档（仓库 Finb/Bark 的 docs 目录）：隐私说明 https://github.com/Finb/Bark/blob/master/docs/privacy.md ，推送加密 https://github.com/Finb/Bark/blob/master/docs/encryption.md ，部署 https://github.com/Finb/Bark/blob/master/docs/deploy.md
46. Bark 文档，推送参数: https://github.com/Finb/Bark/blob/master/docs/params.md
47. bark-server 源码: https://github.com/Finb/bark-server/blob/master/apns/apns.go ，https://github.com/Finb/bark-server/blob/master/apns/apns_certs.go
48. ntfy 文档，Configuring the ntfy server: iOS instant notifications: https://docs.ntfy.sh/config/#ios-instant-notifications （源文件 https://github.com/binwiederhier/ntfy/blob/main/docs/config.md ）
49. 企业微信开发者中心，消息推送配置说明（群机器人 webhook）: https://developer.work.weixin.qq.com/document/path/91770
50. 飞书开放平台，自定义机器人使用指南: https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot
51. 钉钉开放平台，自定义机器人发送群消息: https://open.dingtalk.com/document/orgapp/custom-robots-send-group-messages
52. 钉钉开放平台，自定义机器人接入: https://open.dingtalk.com/document/group/custom-robot-access
53. 钉钉开放平台，自定义机器人安全设置: https://open.dingtalk.com/document/orgapp/customize-robot-security-settings
54. Telegram, Bots FAQ（My bot is hitting limits）: https://core.telegram.org/bots/faq
55. Apple Support, If your Apple devices aren't getting Apple push notifications（2023-08-22）: https://support.apple.com/en-us/102266
56. 极光文档，iOS SDK 集成指南（2026-08-31 更新）: https://docs.jiguang.cn/jpush/client/iOS/ios_guide_new
57. 极光推送产品页（含免费版与高级版对比）: https://www.jiguang.cn/push
58. 极光用户服务协议: https://www.jiguang.cn/license
59. 极光隐私政策（2026-01-27 更新）: https://www.jiguang.cn/license/privacy
60. 极光文档，产品与场景 FAQ（2026-07-28 更新）: https://docs.jiguang.cn/jpush/faq/prod_faq
61. 个推消息推送产品页（含免费版、VIP 功能对比）: https://www.getui.com/notification-push
62. 个推文档，消息推送计费说明: https://docs.getui.com/getui/billing/rules/
63. 个推文档，快速接入指南: https://docs.getui.com/getui/start/accessGuide/
64. 个推文档，推送需要什么条件: https://docs.getui.com/getui/scene/pushCondition/
65. UnifiedPush 官网: https://unifiedpush.org/
66. Expo, Notifications（expo-notifications）: https://docs.expo.dev/versions/latest/sdk/notifications/
67. Expo, What you need to know about notifications: https://docs.expo.dev/push-notifications/what-you-need-to-know/
68. Expo, Push notifications setup: https://docs.expo.dev/push-notifications/push-notifications-setup/
69. Expo, Send notifications with the Expo push service: https://docs.expo.dev/push-notifications/sending-notifications/
70. expo-notifications 源码 `getExpoPushTokenAsync.ts`（main 分支）: https://github.com/expo/expo/blob/main/packages/expo-notifications/src/getExpoPushTokenAsync.ts
71. Expo, Internal distribution: https://docs.expo.dev/build/internal-distribution/
72. Expo, Using automatically managed credentials: https://docs.expo.dev/app-signing/managed-credentials/
73. Expo, Apple Developer Program roles and permissions for Expo Build: https://docs.expo.dev/app-signing/apple-developer-program-roles-and-permissions/
74. Expo Blog, Apple Developer Program explained: free vs paid: https://expo.dev/blog/apple-developer-program-explained-free-vs-paid
75. Expo, Expo Go: https://docs.expo.dev/get-started/expo-go/
76. Expo, Create and run a cloud build for iOS device: https://docs.expo.dev/tutorial/eas/ios-development-build-for-devices/
