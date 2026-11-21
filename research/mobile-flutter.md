# 用 Flutter 做手机端，能不能顺带覆盖所有端（pigcode/monorepo#106）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。方括号里的数字对应「参考来源」的编号。标注「推论」的是根据所引来源推出、来源本身没有直接写明的结论；标注「没有找到一手来源」的内容没有找到官方页面、源码或发布说明支持。本地代码的事实来自 pigcode/frontend `54e2740`（只读）[24]。Expo 一侧的事实不重查，直接引用[调研：手机端技术栈的候选](https://github.com/pigcode/monorepo/issues/90)（`research/mobile-stack.md`）[60]。

## 问题

[调研：手机端技术栈的候选](https://github.com/pigcode/monorepo/issues/90) 对 Flutter 只核对了版本、稳定状态和加密包，键盘和长列表的表现没有查。把 Flutter 这一项补齐，并回答「用 Flutter 一套代码覆盖所有端」对 Pigcode 意味着什么：

- **手机上的体验**：键盘和输入框、长时间线的流式渲染、流式 Markdown、代码高亮、diff、终端，分别用哪些包，成熟度如何；iOS 上的观感（Cupertino 控件、滚动手感、字体、深色模式、Impeller 渲染）。
- **复用和工程**：不能复用 TS 时，`contracts` 的 89 个方法和事件怎么在 Dart 里实现（从 zod 导出 JSON Schema 再生成 Dart 类型，或者手写），协议改动后两边怎么保持一致；Noise 握手在 Dart 和 Host 的 TS 里各写一份，互通的风险；Flutter 工程怎么放进 frontend 的 pnpm monorepo。
- **原生能力**：不用 Firebase 时怎么拿 APNs 和 FCM 令牌，Notification Service Extension、实时活动、小组件、分享扩展在 Flutter 里怎么接。
- **开发和发布**：免费 Apple ID 下怎么装到 iPhone、热重载；OTA（如 Shorebird）在中国大陆能不能用、能不能自建；以后上架的阻碍。
- **自动化测试**：integration_test、golden 测试、Maestro、Patrol 能不能在 Mac 模拟器和 CI 上无人值守地跑。
- **覆盖所有端**：Flutter 的桌面端（macOS、Windows、Linux）和网页端能不能替换现在的 Electron 桌面端，替换要放弃或重写什么：UI 插件是和宿主共用 React 的组件（[ADR 0002](https://github.com/pigcode/monorepo/blob/main/adr/0002-plugins-share-host-react.md)）、`pigcode-plugin://` 协议、`ui-*` 包、跑在 Electron utilityProcess 里的 Host。只做手机端时，Flutter 比 Expo 多了什么、少了什么。
- **先例**：除了[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105)，还有哪些用 Flutter 做 AI 编程或聊天客户端的开源项目，踩过什么坑。

结论要能直接用在[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)、[技术验证：长会话时间线用 RN 原生实现和放进 DOM 组件的对比](https://github.com/pigcode/monorepo/issues/104)和[手机端怎么测试和验收](https://github.com/pigcode/monorepo/issues/100)上。只认一手来源：官方文档、pub.dev、源码和发布说明。

## 结论

- **Flutter 覆盖不了 Pigcode 的所有端：把桌面端换成 Flutter，等于重写整个界面并放弃现在的插件模型。** `ui-*` 包和桌面端 renderer 共 58,670 行（TSX 31,590、TS 13,723、CSS 13,357），加上 Electron main 和 preload 的 4,803 行，都要用 Dart 重写 [24]。UI 插件靠 renderer 的 import map 和宿主共用同一个 React、ReactDOM 和 `@pigcode/ui-primitives`（ADR 0002），插件代码由 `pigcode-plugin://` 从 profile 里加载 [24]；Flutter 里 React 组件只能放进 webview，每个 webview 是独立页面，「和宿主共用 React」的前提不再成立（推论）。桌面 webview 也不齐：`webview_flutter` 只支持 Android、iOS、macOS，`flutter_inappwebview` 的 Linux 实现只有 0.1.0-beta.1，`desktop_webview_window` 是另开一个原生窗口 [4][53]。Host 的入口要求运行在 Electron utilityProcess 里，下载插件时用 Electron 的 `net.fetch` [24]，换成 Flutter 桌面要另起 Node 进程并随应用打包 Node 运行时（推论）。网页端已经被地图排除；Flutter 网页端用 CanvasKit、Skwasm 在画布上渲染，官方自己说文本为主的内容更适合 DOM [52]。所以「一网打尽」实际可比的只有手机端这一项。
- **只做手机端时，Flutter 最大的代价是一行 TS 都复用不了，而协议的返回值和事件本来就没有 schema。** 本机实测：89 个方法的参数按 `io: "input"` 全部能用 `z.toJSONSchema()` 导出，但 `refine` 约束被静默丢掉（例如 `workspace.*` 的「`threadId` 和 `projectId` 只给一个」）；按输出方向导出时 `agent.createInstance`、`agent.updateInstance` 因为 `transform` 报错；`thread.subscribe` 返回的快照导出后只剩空对象；线程事件的 `payload` 是 `unknown` [23][24]。所以 Dart 侧的模型大部分要手写（`json_serializable`、`freezed`），`client-runtime` 的连接层（约 830 行）和 `ui-chat` 的时间线逻辑（约 1,860 行）也要重写 [4][24]。两边一致只能靠共享的 JSON fixture 和契约测试（推论）。
- **Noise 没有能用的 Dart 现成实现，要在 TS 之外再写一份并做互通测试。** 在 pub.dev 搜「noise protocol」得到的独立 Noise 包里，还在更新的只有 `noise_protocol_framework` 1.2.0，它只实现了 NKpsk0、KNpsk0 两种握手，DH 用的是 P-256（源码里的示例协议名是 `Noise_NKpsk0_P256_AESGCM_SHA256`），不是规范定义的 25519 或 448，30 天下载 113 次 [4][25][28]。原语可以用 `cryptography` 2.9.0（X25519、ChaCha20-Poly1305、SHA-256、HKDF、BLAKE2s 都有，最后一次发布是 2025-11-21）[4][26]。`sodium_libs` 已标为停止维护、指向 `sodium` 4.1.5；`sodium` 的原始 X25519 只在 Sumo 版里，SHA-256 和 HMAC-SHA2 还没有实现 [4][27]。加上 Notification Service Extension 里的 Swift 版，Flutter 路线要维护三份握手代码，Expo 路线是两份（推论，Expo 的做法见 [60]）。
- **手机上的聊天体验能做出来，但键盘和长列表要自己补的比 React Native 多。** 键盘：iOS 上键盘随手指滑动收起，2020 年起一直没做（#57609，P3）[6]；中文拼音没确认就切到另一个输入框，会留下不可见字符（#171068，P2，未关闭）[7]；iOS 26 的半透明键盘会露出底下没绘制的区域（#179482，P1，未关闭）[8]。React Native 这边有 keyboard-controller 的 `KeyboardChatScrollView` 现成部件 [60]。长列表：核心的 `ListView` 没有跳到某一项的 API（#12319 指向第三方包）[10]，懒构建时滚到 `maxScrollExtent` 到不了底（#129768）[11]，条目高度不一时快速跳转很慢（#52207）[12]；`super_sliver_list` 解决了这两点，但最后一次发布是 2024-03-26 [4][13]。三个开源先例 ccpocket、Kelivo、Conduit 都有长会话卡顿的公开 issue [55][56][57]。
- **流式 Markdown、代码高亮、diff、终端都有包，成熟度参差。** `flutter_markdown` 已停止维护，接替它的 `flutter_markdown_plus` 1.0.12 没有提流式 [4][15]；`gpt_markdown` 1.4.1（verified publisher，2026-11-04）专为流式 AI 输出设计，已经写完的段落复用、只更新正在输出的尾部，并提供懒加载的 sliver [4][14]。高亮可选 `re_highlight`（highlight.js 11.9.0 的 Dart 移植，最后一次发布 2024-02-05）或 `syntax_highlight`（TextMate 语法，内置 15 种语言）[4][16][17]，都不是桌面端用的 Shiki，配色和语法覆盖会和桌面端不一致（推论）。diff 没有成熟的渲染包，几个候选都没有 verified publisher，要自己画 [4]。终端有 `xterm` 4.0.0（2024-02-27）[4][18]。
- **iOS 观感：Impeller 是 iOS 上唯一的渲染器；Cupertino 控件已拆成独立包，Liquid Glass 官方还没做。** iOS 上不能切回 Skia [3]。`cupertino_ui` 由 flutter.dev 发布，1.0.0 于 2026-08-12 发布，changelog 到 1.1.7 都没有 Liquid Glass 控件 [4][21]。#170310 仍未关闭（P3）：Flutter 团队 2025-06-10 说暂不开发也不接受这部分贡献，2025-07-29 说 iOS 26 的新工作放进拆出来的包 [19]。暂时可以在 Info.plist 里设 `UIDesignRequiresCompatibility`，让整个应用退回旧外观 [8]。
- **原生能力在 Flutter 里一样要写 Swift。** Notification Service Extension、分享扩展、小组件和实时活动都是在 Xcode 里加的原生 target [33][34][60]；`home_widget` 明说不能用 Flutter 写小组件 [35]，`live_activities` 说「不可能只用 Flutter」，实时活动的界面要用 Swift 写，安装步骤还要给 Runner 加 Push Notifications 能力，而免费 Apple ID 没有这项能力 [34][61]。扩展在 debug 模式下只能在模拟器里测 [33]。不用 Firebase 拿令牌：iOS 可以用 `push` 3.3.3 直接拿 APNs 令牌，但它在 Android 上仍然走 FCM [32]；Android 不用 FCM 时只剩 `unifiedpush`（只支持 Android，用户要另装分发器）或前台服务加本地通知 [4][61]。
- **开发阶段：免费 Apple ID 能用 `flutter run` 装到 iPhone；新版 iOS 上的热重载靠 LLDB 绕过 JIT 限制；OTA 只能用托管的 Shorebird。** iOS 18.4 和 iOS 26 收紧 JIT 后，Flutter 的 debug 模式一度不能在真机上运行（#163984）；现在靠 LLDB 集成和解释执行兜底，iOS 26 真机要在 Xcode scheme 里设 LLDB Init File [39][40]。debug 包在 iOS 14 以上只能从 Flutter 工具、IDE 或 Xcode 启动（#68215）[41]，离开 Mac 日常使用要装 profile 或 release 包（推论）。Shorebird 只作用于 release 包，iOS 上改动过的函数在解释器里运行；不提供自建（「no plans」）；免费档每月 5,000 次补丁安装；设备要能访问 `api.shorebird.dev` 和 `cdn.shorebird.cloud`，在中国大陆能不能访问，没有找到一手来源 [42][43][44]。开发机在大陆要配镜像，Flutter 官方列了 CFUG、上海交大、清华的镜像，但声明无法担保 [31]。
- **自动化测试 Flutter 不比 Expo 差，有一项更好：widget 测试和 golden 截图比对不需要模拟器。** `matchesGoldenFile` 在测试进程里渲染比对，但字体会随平台和 Flutter 版本变化，基线要固定在一个平台上生成 [47]；`integration_test` 能在模拟器、真机和桌面上跑，Linux CI 要用 xvfb [48]；Patrol 4.11.0 能在 Android 和 iOS 上授予运行时权限、点通知、处理 WebView 登录 [49]；Maestro 通过语义树操作 Flutter，界面代码要给控件加 `Semantics(identifier:)`（Flutter 3.19 起），不支持 Flutter 桌面，iOS 只支持模拟器 [50][60]。
- **用 Flutter 做编程 Agent 手机客户端有直接先例，但都没有复用 TS。** ccpocket（Codex、Claude、Antigravity 的手机客户端，MIT）电脑端是 TS 写的 bridge，手机端是 Flutter，放在同一个 npm monorepo 里，Flutter 工程不在 npm workspaces 里 [55]。DSH Go 用 Flutter 3.47.7，Android 版已发布，iOS 版还没有公开安装包、要在 Mac 上自己签名编译 [54]。T3 Code 走的是 Expo，直接复用同名的 `contracts`、`client-runtime` [60][63]。
- **对决策票：**
  - [手机端技术栈](https://github.com/pigcode/monorepo/issues/95)：按上面的代价，桌面端应留在 Electron（推论），要比的是「手机端单独用 Flutter」和「手机端用 Expo」。倾向仍是 Expo；Flutter 多的是自绘渲染、两端一致和两个直接先例，少的是 TS 复用（协议、连接层、时间线逻辑约 4,500 行）、一份共用的 Noise、可自建的 OTA 和 DOM 组件兜底。
  - [技术验证：长会话时间线用 RN 原生实现和放进 DOM 组件的对比](https://github.com/pigcode/monorepo/issues/104)：本调研不要求改比较对象。只有 Flutter 在手机端技术栈的讨论里仍是候选时，才加第三个页面（Flutter 简版时间线），用同一份录制事件回放。
  - [手机端怎么测试和验收](https://github.com/pigcode/monorepo/issues/100)：选 Flutter 时，第一层可以用不需要模拟器的 widget 测试和 golden 截图；界面流程用 Patrol 或 Maestro，后者要求统一加语义标识；两种技术栈都应该有共享 JSON fixture 的契约测试和 Noise 互通测试。

## 1. 手机上的体验

### 1.1 版本和平台

- 当前稳定版 Flutter 3.50.1（2026-11-20），Dart 3.14.0；3.50.0 于 2026-11-11 发布，上一条稳定线是 3.47（3.47.0 于 2026-08-12，最新补丁 3.47.9）；beta 是 3.51.0-0.2.pre [1]。mobile-stack 记的 3.50.1 与此一致 [60]。
- Flutter 3.50 支持 iOS 15 到 27（CI 测 18 和 26）、Android API 24 到 37 [2]。
- 渲染：Impeller 自 3.27 起是 iOS 和 Android API 29 以上的默认引擎；iOS 上它是唯一的渲染器，不能切回 Skia；Android 低版本或不支持 Vulkan 时退回 OpenGL 渲染器 [3]。Impeller 在构建时预编译着色器，运行时不再编译 [3]。

### 1.2 包一览

「verified publisher」指 pub.dev 用 DNS 域名核实过身份的发布者 [5]；「无」表示由个人账号上传。

| 用途 | 包 | 版本 | 最后发布 | 发布者 | iOS / Android | 备注 |
|---|---|---|---|---|---|---|
| 列表 | `super_sliver_list` | 0.4.1 | 2024-03-26 | matejknopp.com | 是 / 是 | 仓库 2026-10 仍有推送，34 个未关的 issue 和 PR [13] |
| 列表 | `scrollable_positioned_list` | 0.3.8 | 2023-05-08 | google.dev | 是 / 是 | |
| 聊天界面 | `flutter_chat_ui` | 2.12.0 | 2026-09-12 | flyer.chat | 是 / 是 | |
| 键盘 | `cupertino_interactive_keyboard` | 1.0.0 | 2026-01-06 | ky1vstar.dev | 是 / 否 | 只支持 iOS |
| Markdown | `flutter_markdown` | 0.7.7+1 | 2025-05-06 | flutter.dev | 是 / 是 | 已停止维护，指向 `flutter_markdown_plus` |
| Markdown | `flutter_markdown_plus` | 1.0.12 | 2026-07-10 | foresightmobile.com | 是 / 是 | 106 个未关的 issue 和 PR [15] |
| Markdown | `gpt_markdown` | 1.4.1 | 2026-11-04 | useval.io | 是 / 是 | 要求 Flutter 3.44 以上 |
| Markdown | `flutter_streaming_text_markdown` | 1.11.2 | 2026-10-20 | dilacode.com | 是 / 是 | 以 `Stream<String>` 为输入 |
| Markdown | `markdown_widget` | 2.3.2+8 | 2025-04-26 | morn.fun | 是 / 是 | |
| Markdown 解析 | `markdown` | 7.3.1 | 2026-03-18 | tools.dart.dev | 是 / 是 | 只解析，不渲染 |
| 高亮 | `re_highlight` | 0.0.3 | 2024-02-05 | reqable.com | 是 / 是 | highlight.js 11.9.0 的移植 [16] |
| 高亮 | `syntax_highlight` | 0.5.0 | 2025-08-19 | serverpod.dev | 是 / 是 | TextMate 语法，15 种语言 [17] |
| 高亮 | `flutter_highlight` | 0.7.0 | 2021-03-07 | 无 | 是 / 是 | |
| diff 算法 | `diff_match_patch` | 0.4.1 | 2021-06-03 | 无 | 是 / 是 | |
| diff 渲染 | `pretty_diff_text` | 2.1.0 | 2025-04-23 | 无 | 是 / 是 | |
| diff 渲染 | `diff_view` | 0.2.0 | 2026-11-09 | 无 | 是 / 是 | 0 个 like |
| 终端 | `xterm` | 4.0.0 | 2024-02-27 | terminal.studio | 是 / 是 | 111 个未关的 issue 和 PR，仓库最后推送 2025-06-19 [18] |

（版本、日期、发布者、平台标签都来自 pub.dev 的 API [4]。）

### 1.3 键盘和输入框

- **随手指收起键盘**：#21814 之后，Flutter 只能在滚动时一次性收起键盘；让键盘跟着手势逐步收起（iOS 信息 App 的做法）的 #57609 自 2020-05-19 开着，标为 P3 [6]。pub.dev 上的 `cupertino_interactive_keyboard` 只支持 iOS [4]。React Native 的 `KeyboardChatScrollView` 直接提供这一行为和四种抬升策略 [60]。
- **中文输入法**：#171068（2025-06-24，P2，`a: internationalization`，未关闭）：iOS 拼音输入未确认就点另一个输入框，第一个输入框会留下 U+2006 这类不可见的空格 [7]。更早的几个中文输入问题（#113254、#130880、#79025）都已关闭。
- **iOS 26 键盘**：#179482（P1，未关闭）：iOS 26 的半透明键盘会露出底下没有绘制的区域；临时办法是不自定义复现例子里的那两处颜色、保留默认行为，或者在 Info.plist 里设 `UIDesignRequiresCompatibility` 整体关掉 Liquid Glass [8]。另有 iPadOS 上键盘收起后输入框仍保持焦点（#181474）、接受系统生成的强密码后键盘打不开（#193765）两个未关闭的问题 [9]。
- **先例**：Kelivo #1094 记录 Android 上键盘弹起和收起有顿挫、长文本编辑后最卡，作者怀疑是 `adjustResize` 加 `viewInsets` 引起的重建，iOS 用户反馈流畅 [56]。
- **输入框的 `@`、`/`、`$`**：现在的输入框用 TipTap [24]，Flutter 里要用 `TextField` 加触发词检测和候选列表自己做（推论）。

### 1.4 长时间线的流式渲染

- `ListView.builder` 按需构建条目，但核心里没有「跳到第 N 项」的 API：#12319（140 条评论）2019-12-27 关闭，2020-04 维护者在里面留言，请大家改用单独发布的 `scrollable_positioned_list` [10]。
- #129768（P2，未关闭）：懒构建的列表里，用户先手动滚到中间或顶部，再追加条目后滚到 `maxScrollExtent`，到不了真正的底部 [11]。这正是聊天「跟随到底」的场景（推论）。
- #52207（P2，未关闭）：大量高度不一的条目配合 `jumpTo`、滚动条、触控板时性能很差 [12]。
- `super_sliver_list` 的 README 说它换了布局算法，能处理几乎无限多的变高条目，并能可靠地跳到或滚到还没构建的条目；也提到 `scrollable_positioned_list` 不能和其他 sliver 组合、滚动条表现不好 [13]。它的最后一次发布是 2024-03-26 [4]。
- 先例的问题：ccpocket #80（Android，长会话加载后滚动卡顿、弹键盘掉帧，会话里有很多代码块、命令输出、diff 和长 Markdown）在 2026-07-14 关闭，#194 说新版仍然发慢，2026-11-04 关闭 [55]；Conduit #861（iPhone 13 Pro，收到长消息后滚动很慢甚至卡死）未关闭 [57]；Kelivo #571（长思考时性能严重下降）未关闭 [56]。
- 对照：React Native 有 LegendList 的 `maintainScrollAtEnd` 和 FlashList 的 `startRenderingFromBottom` [60]。Flutter 核心里没有同类的「贴底跟随」语义，要用第三方列表或自己写（推论）。

### 1.5 流式 Markdown、代码高亮、diff、终端

- **Markdown**：
  - `flutter_markdown` 由 flutter.dev 标为停止维护，pub.dev 指向 `flutter_markdown_plus` [4]。后者的 README 列出表格、代码块、文本选择、`contextMenuBuilder`，LaTeX 要另装扩展包，没有提流式 [15]。
  - `gpt_markdown` 的 README：「Production-grade Markdown and LaTeX rendering for streaming Flutter AI interfaces」；流式时「settled segments are reused while the live tail updates」，另有懒加载的 sliver；支持代码高亮、表格、文本选择和字号缩放 [14]。
  - Conduit 没有用现成的渲染包，而是基于 `markdown` 解析器写了自己的 `conduit_markdown` [57]。Pigcode 的 `markdown-blocks.ts` 是纯 TS 的流式块解析 [24]，Flutter 里要么移植，要么换成上面的包（推论）。
- **代码高亮**：`re_highlight` 是 Reqable 的子项目，从 highlight.js 翻译成 Dart，已同步到 11.9.0 并通过全部测试用例 [16]；`syntax_highlight` 用 TextMate 规则，内置 css、dart、go、html、java、javascript、json、kotlin、python、rust、sql、swift、typescript、yaml 等 15 种 [17]。桌面端的 `highlight.ts` 用 Shiki 输出带浅色、深色两套变量的 token [24]，换成这两个包后主题和语法覆盖要重新对齐（推论）。
- **diff**：没有成熟的渲染包，候选都没有 verified publisher [4]。桌面端的 `file-changes.ts` 用 `diff` 包的 `structuredPatch` 算行级差异 [24]，Dart 里要换算法实现，或者让 Host 直接下发算好的 hunk（推论）。
- **终端**：`xterm`（xterm.dart）自称支持手机和桌面的终端模拟器 [18]；第一版只读 diff，不需要终端 [60]。

## 2. iOS 上的观感

- **Cupertino 控件**：Material 和 Cupertino 正在从框架拆成独立的一方包（#101479）[20]。`cupertino_ui` 的 README 说它是「官方 Flutter Cupertino 库」，提供完整的组件、动效、字体、配色和主题；原来的 `package:flutter/cupertino.dart` 可以用 `dart fix --apply --code=migrate_design_widgets` 迁移 [21]。官方的集成测试示例已经改为 import `material_ui` [48]。
- **Liquid Glass**：#170310 自 2025-06-10 开着，标签是 P3、`p: cupertino_ui`。2025-06-10 的说明：「we are not developing the new Apple’26 UI design features in the Cupertino library right now, and we will not be accepting contributions for these updates at this time」；2025-07-29 的说明：iOS 26 的 Cupertino 新工作都放在拆出来的新包里 [19]。`cupertino_ui` 的 changelog 到 1.1.7 只有修复和小功能，没有 Liquid Glass 控件 [21]。issue 里有人贴出社区包（`liquid_glass_renderer`、`cupertino_native`、`prism_glass`），本次没有核对它们 [19]。
- **渲染和滚动**：iOS 上只有 Impeller [3]。#190815（未关闭）：屏幕上有 platform view 时，iOS 因为平台线程和 UI 线程合并而掉帧 [22]；手机端如果在 Flutter 里嵌原生视图或 WebView，要注意这一点（推论）。
- **设计层面**：Flutter 自己绘制控件，系统改版时要等 `cupertino_ui` 跟进（推论，依据 [3][19]）。React Native 的 Expo Router 用系统自己的导航栏和标签栏 [60]，这一项天然跟随系统。
- **字体、深色模式、动态字体、无障碍**：本次没有核对 Flutter 在 iOS 上默认用 SF、苹方的方式，以及动态字体和无障碍的官方文档，列入待证实事项。无障碍至少有一个旁证：Maestro 就是通过 Flutter 暴露给系统的语义树来操作界面的 [50]。

## 3. 复用和工程

### 3.1 协议在 Dart 里怎么实现

- **规模**：`commandSchemas` 有 89 个方法、13 个命名空间（agent 20、thread 12、plugin 10……）；`contracts` 不含测试约 1,790 行 [24]。线程事件、Agent 事件和订阅快照在 `events.ts` 里 [24]。
- **从 zod 导出 JSON Schema（本机实测 [23]）**：
  - 89 个方法的参数按 `io: "input"`（客户端发出的形状）全部导出成功；按输出方向导出时，`agent.createInstance`、`agent.updateInstance` 因为 `agents.ts` 里的 `transform` 报「Transforms cannot be represented in JSON Schema」。
  - `refine` 不会出现在 JSON Schema 里：用 `scoped()` 包装的 `workspace.*`、`git.status`、`git.diff`、`pr.status`、`pr.create`、`terminal.open`，导出后只剩 `threadId`、`projectId` 两个可选字段，「只给一个」的约束没了 [23][24]。
  - `contracts` 里有 7 处 `refine`、1 处 `superRefine`、1 处 `transform`、13 处 `z.unknown()`、4 处 `passthrough()` [24]。
- **返回值和事件**：协议信封的 `result` 是 `unknown`，命令只定义了参数 schema；线程事件的 `payload`、`tool.started` 的 `input`、`tool.completed` 的 `output`、`usage.updated`、`plan.updated` 都是 `unknown`；`thread.subscribe` 的快照里 `thread`、`runs`、`items`、`pendingRequests` 都是 `z.object({}).passthrough()`，导出后是不带字段的对象 [23][24]。这和地图「开始时的现状」写的「返回值没有 schema」一致。
- **生成路线**：
  - 参数：zod 导出 JSON Schema，再交给代码生成器生成 Dart 类（推论；quicktype 的 Dart 输出本次没有核对）；`refine` 的约束要在 Dart 里另写。
  - 返回值和事件：没有 schema 可用，只能参照 Host 的实现手写 Dart 模型，用 `json_serializable` 6.15.2（google.dev）或 `freezed` 4.0.3（dash-overflow.net），两者都是 Flutter Favorite [4]。ccpocket 的手机端就依赖这两个包，它的电脑端是 TS [55]；它怎么保持两边一致，本次没有核对。
- **连接层和时间线逻辑也要重写**：`client-runtime` 的 `rpc-client.ts`（86 行）、`connection.ts`（227）、`store.ts`（474）、`thread-patch.ts`（38）负责 id 关联、按 cursor 续订、断线重订阅和批量更新状态；`ui-chat` 里约 1,860 行纯 TS 的时间线逻辑（`turns.ts`、`event-parsers.ts`、`markdown-blocks.ts`、`file-changes.ts` 等）[24][60]。三项合计约 4,500 行（`contracts` 约 1,790 + 连接层约 830 + 时间线逻辑约 1,860）。
- **怎么保持一致（推论）**：
  - 把 Host 录下来的真实会话事件存成 JSON fixture，TS 的 vitest 和 Dart 的 `dart test` 读同一份，各自解析并比对时间线的结果；
  - 每个方法的参数从 zod 导出的 JSON Schema 做一次往返校验，`refine` 的约束各写一条用例；
  - 协议加版本握手（现状是 `PROTOCOL_VERSION` 只在测试里用到 [24]），手机端遇到不认识的字段和事件类型时忽略而不是崩溃。
- **对照**：Expo 路线直接 import `contracts` 和 `client-runtime`，只需另写一个传输层；T3 Code 就是这样做的 [60][63]。

### 3.2 Noise 握手

- **pub.dev 上的现成实现** [4][25]：
  - `noise_protocol` 0.1.1（2020-05-11）已停止维护，不兼容 Dart 3。
  - `noise_protocol_framework` 1.2.0（2026-03-10，发布者 omnistar.io）：纯 Dart，依赖 `cryptography`、`pointycastle`、`elliptic`；`lib/protocols/` 下只有 `knpsk0` 和 `nkpsk0` 两种握手；密钥对用 `elliptic` 包的曲线，示例协议名是 `Noise_NKpsk0_P256_AESGCM_SHA256`；仓库里没有看到测试向量文件；GitHub 3 星，pub.dev 30 天下载 113 次。
  - Noise 规范（第 34 版）只定义了 25519 和 448 两种 DH [28]。这个包不能直接用于 Pigcode 倾向的 `IK`/`KK` 握手和 25519 套件（推论，套件选择见 [60][62]）。
  - 搜索结果里还有 `dart_libp2p` 这类 libp2p 实现，本次没有核对其中的 Noise 能否单独使用 [4]。
- **原语** [26][27]：
  - `cryptography` 2.9.0：X25519、Ed25519、ChaCha20-Poly1305、XChaCha20-Poly1305、HKDF、HMAC、SHA-256、BLAKE2s、BLAKE2b 都有；纯 Dart 实现，浏览器里用 Web Crypto，`cryptography_flutter` 在 Android 和 Apple 系统上改用系统 API。最后一次发布是 2025-11-21，仓库有 40 个未关的 issue 和 PR。
  - `sodium` 4.1.5（2026-11-20）：4.0 起用 Dart 的 build hooks 按需编译 libsodium，支持 Android、iOS、Linux、Windows、macOS、Web；`crypto_scalarmult`（原始 X25519）只在 Sumo 版里；`crypto_hash_sha`、`crypto_auth_hmacsha` 列在「以后考虑」里，还没有实现。`sodium_libs` 已标为停止维护，指向 `sodium`。
- **工作量和风险（推论）**：
  - 用 `cryptography` 照规范实现 CipherState、SymmetricState、HandshakeState，只做 `IK`、`KK` 和 `25519_ChaChaPoly_SHA256` 一种套件，代码量在几百行，和 TS 版相当。
  - 风险在互通：两份实现在消息顺序、nonce 计数、空载荷、`HKDF` 输出切分上的差错，单测各自通过也可能连不上。
  - 互通测试的做法：TS 版用固定的静态密钥和临时密钥生成握手记录（每条消息的十六进制、最终的握手哈希和两个方向的密钥），存成 fixture，Dart 版逐字节复现；CI 里再跑一条真连接，让 Dart 客户端和 Node 里的 Host 握手并互发几条加密消息。
  - Notification Service Extension 里还要有一份 Swift（CryptoKit）的传输层解密 [60]，所以 Flutter 路线是 TS、Dart、Swift 三份，Expo 路线是 TS 一份（Host 和 Hermes 共用）加 Swift 一份 [60]。

### 3.3 Flutter 工程怎么放进 frontend 的 pnpm monorepo

- frontend 的 `pnpm-workspace.yaml` 包含 `apps/*`、`packages/*`、`vendor/*`、`examples/*` 和 `marketplace` [24]。本机用 pnpm 10.32.1 实测：`apps/*` 下只有 `pubspec.yaml`、没有 `package.json` 的目录，pnpm 不把它当成工作区项目，`pnpm install` 正常 [30]。所以 Flutter 工程可以放在 `frontend/apps/mobile`，但它不走 pnpm，脚本和 CI 要另写一套（推论）。
- Dart 侧的多包管理用 pub workspaces：Dart 3.6 起支持，根 `pubspec.yaml` 列出成员，所有成员共用一份 `pubspec.lock`；Dart 3.11 起支持通配；根和成员之间夹着不是成员的 `pubspec.yaml` 时，`pub get` 会报错 [29]。`melos` 8.10.1（invertase.io）是另一种选择 [4]。
- 先例：ccpocket 的根 `package.json` 只把 `packages/*` 列进 npm workspaces，Flutter 工程 `apps/mobile` 在外面，用 `package-lock.json` [55]；Conduit 以 Flutter 应用为 pub workspace 的根，`conduit_core`、`conduit_markdown`、`conduit_protocol`、`conduit_theme` 和 `apps/daemon` 是成员 [57]。
- 中国大陆网络下：要设 `PUB_HOSTED_URL` 和 `FLUTTER_STORAGE_BASE_URL` 指向镜像；Flutter 官方列出 CFUG（flutter-io.cn）、上海交大、清华 TUNA，同时说明「The Flutter team can't verify their reliability or security」[31]。往 pub.dev 发布包要能访问 Google 登录和 pub.dev [31]，Pigcode 不发布包，这一条无关（推论）。

## 4. 原生能力

### 4.1 推送令牌

| 包 | 版本 | 最后发布 | 发布者 | 平台 | 说明 |
|---|---|---|---|---|---|
| `firebase_messaging` | 17.1.0 | 2026-11-16 | firebase.google.com | Android、iOS、macOS、web | 依赖 Firebase，iOS 上也经 FCM [32] |
| `push` | 3.3.3 | 2025-01-14 | orth.uk | Android、iOS、macOS | iOS、macOS 直接用 APNs；Android 仍用 Firebase [32] |
| `flutter_apns`、`flutter_apns_only` | 1.6.0 | 2022-08-08 | 无 | iOS | 都已停止维护 |
| `unifiedpush` | 6.2.0 | 2025-10-13 | unifiedpush.org | 只有 Android | |
| `flutter_local_notifications` | 23.0.3 | 2026-11-18 | dexterx.dev | 全平台 | 本地通知，Flutter Favorite |

（版本信息来自 [4]。）

- **iOS 拿 APNs 令牌**：用 `push`，或者在 `AppDelegate` 里调 `registerForRemoteNotifications`，在回调里把令牌经 platform channel 交给 Dart，大约几十行 Swift（推论）。免费 Apple ID 没有推送能力，付费前都用不上 [61]。
- **Android 不用 FCM**：`unifiedpush` 只支持 Android，用户要另装分发器 App [4][61]；另一条路是 App 在前台或前台服务里自己保持连接，用 `flutter_local_notifications` 发本地通知。mobile-install-push 的建议是第一版安卓只在模拟器上这样验证 [61]。

### 4.2 扩展

- **怎么加**：Flutter 官方文档的做法和原生项目一样，在 `ios/Runner.xcworkspace` 里 File > New > Target 加扩展，把「Embed Foundation Extensions」拖到「Run Script」前面，主 App 和扩展放进同一个 App Group 共享数据 [33]。Flutter 工程的 `ios/` 目录直接提交、直接编辑，不需要 Expo 那样的 config plugin（推论，Expo 的做法见 [60]）。
- **限制** [33]：
  - 扩展在 debug 模式下只能在模拟器里测，真机要用 release 模式；
  - 用 Flutter 画扩展界面时，Flutter 不完全支持在真机上以 debug 模式运行，因为可能内存不足；建议只在扩展有至少 100 MB 内存时才用 Flutter 画界面；
  - 分享扩展里可以直接放一个 `FlutterViewController`。
- **Notification Service Extension**：是独立的扩展进程，要用 Swift 写解密（推论，依据 [33][60]）。没有找到 Flutter 官方关于 NSE 的专门文档。
- **实时活动**：`live_activities` 2.6.0（2026-09-11，dimitridessus.fr）的 README：「Due to technical restriction, it's not currently possible to only use Flutter」；iOS 上要加 Widget Extension，用 Swift 写实时活动和灵动岛的界面，Runner 要加 Push Notifications 能力，Runner 和扩展都要加 App Group；Android 上要用 Kotlin 写 RemoteViews [34]。免费 Apple ID 没有 Push Notifications 能力 [61]，只做本地更新时能不能省掉这一步，README 没有写。
- **小组件**：`home_widget` 0.10.0 的 README：「HomeWidget does not allow writing Widgets with Flutter itself. It still requires writing the Widgets with native code」；它负责传数据、刷新，并能把 Flutter widget 渲染成图片放进小组件 [35][33]。
- **分享扩展**：`receive_sharing_intent` 1.9.0（2026-06-24，kasem.dev）要在 Xcode 里建 Share Extension，扩展用插件提供的 `RSIShareViewController`，只通过 Swift Package Manager 分发 [36]；`share_handler` 0.0.25（2025-07-29）是另一个选择 [4]。
- **先例**：DSH Go 的 iOS 工程里有 Swift 写的 `ShareExtension`（约 10.7 KB）和 `CompanionWidget`（约 7 KB）[54]。

## 5. 开发和发布

### 5.1 免费 Apple ID 装到 iPhone、热重载

- Flutter 官方的 iOS 配置文档：真机测试只需要免费的个人 Apple Developer 账号；要在手机上打开开发者模式、信任开发者证书，然后 `flutter run -d <设备>` [37]。免费账号的 7 天过期、每台设备 3 个 App 的限制对所有技术栈都一样 [60][61]。
- 热重载只在 debug 模式可用 [38]。
- iOS 18.4 beta 堵住了 `get-task-allow` 允许 App 改写自己可执行内存的漏洞，iOS 26 进一步收紧，Flutter 的 debug 模式在真机上崩溃（#163984，2025-02 到 2025-08）。Dart 团队的回复说 release 和 profile 构建不受影响；修复改为经 LLDB 由调试器处理可执行页，并在无法 JIT 时退回解释执行（PR #170835）；讨论中还有用户报告约 10 秒的卡顿 [39]。`flutter_tools` 在 debug 构建时检查 Xcode scheme 是否设了 LLDB Init File，只对 iOS 26 以上的真机要求 [40]。
- #68215（P2，未关闭）：iOS 14 以上，debug 模式的 Flutter App 只能从 Flutter 工具、带 Flutter 插件的 IDE 或 Xcode 启动 [41]。所以带着 iPhone 出门日常使用时，要装 profile 或 release 包，热重载只在连着 Mac 开发时用（推论）。
- 结论：免费 Apple ID 阶段 Flutter 和 Expo 一样只能在 Mac 上本地签名、每 7 天重装 [60][61]；Flutter 额外多一项「新 iOS 上 debug 模式依赖 LLDB 集成」的维护面（推论）。

### 5.2 OTA：Shorebird

- **怎么工作**：Shorebird 的 release 就是 `flutter build` 加上它的更新器和改过的 Flutter 引擎；补丁替换 App 里的 Dart 代码。Android、Windows、macOS、Linux 上，补丁是一份新的 AOT 编译产物；iOS 上，改过的函数在 Shorebird 自己的解释器里运行，没改的函数继续用 App 里已签名的机器码，它的链接器通常能让 98% 以上的代码在 CPU 上直接运行 [43]。
- **能改什么**：只有 Dart 代码和纯 Dart 包；Swift、Kotlin、插件的原生实现、`Info.plist`、资源文件和 Flutter 版本都要重新上架 [42][43]。
- **限制**：只作用于 release 构建，debug 和 profile 里不生效；iOS 补丁不能装在模拟器上，要在真机上测 [42]。
- **价格**：Hobby 免费，每月 5,000 次补丁安装；Pro 每月 20 美元（50,000 次）；Business 每月 400 美元（100 万次）；所有档位都有签名补丁和回滚 [44]。
- **能不能自建**：「No. Shorebird has no plans to offer on-premises or self-hosted versions.」[42]
- **中国大陆**：FAQ 说 Shorebird 不按国家限制访问，但有些国家会屏蔽域名；设备要能访问 `https://api.shorebird.dev`（检查补丁）和 `https://cdn.shorebird.cloud`（下载补丁），访问不到时 App 照常运行，只是拿不到补丁；构建机需要更多域名，部分可以走内部镜像 [42]。这两个域名在中国大陆能不能稳定访问，没有找到一手来源。
- **Apple 的条款**：
  - 审核指南 2.5.2（2026-10-16 版）：「Apps should be self-contained in their bundles, and may not read or write data outside the designated container area, nor may they download, install, or execute code which introduces or changes features or functionality of the app, including other apps.」[45]
  - Apple Developer Program 许可协议 3.3.1(B)「Executable Code」：「Except as set forth in the next paragraph, an Application may not download or install executable code. Interpreted code may be downloaded to an Application but only so long as such code: (a) does not change the primary purpose of the Application by providing features or functionality that are inconsistent with the intended and advertised purpose of the Application (b) does not bypass signing, sandbox, or other security features of the OS; and (c) for Applications distributed on the App Store, does not create a store or storefront for other Applications.」[46]。现行协议的 3.3.2 是「Regulatory Compliance」，下发代码的条款在 3.3.1(B) [46]。
  - Shorebird 的 FAQ 也以 3.3.1(B) 作为 iOS 合规的依据，并说故意用它绕过商店规则会被终止账号 [42]。
- **对 Pigcode 的意义（推论）**：自用阶段每 7 天本来就要重装，OTA 没有用处；以后公开发布时，Expo 可以按公开的 expo-updates 协议在自己的服务器上自建更新服务 [60]，Flutter 只能用托管的 Shorebird，并承担它在大陆的可达性风险。

### 5.3 上架

上架的主要阻碍与技术栈无关：审核指南 4.2.7 对远程桌面客户端的限制、2.1 的演示账号要求、Google Play 新个人账号的 12 人 14 天封闭测试、Android 开发者验证的时间表，见 mobile-stack 第 7 节 [60]。

## 6. 自动化测试

| 工具 | 版本 | 在哪里跑 | 能做什么 | 限制 |
|---|---|---|---|---|
| widget 测试 + golden | 随 SDK | 测试进程，不需要设备 | `matchesGoldenFile` 把渲染结果和基线图比对，`flutter test --update-goldens` 更新基线 [47] | 自定义字体在不同平台、不同 Flutter 版本上渲染不同；默认字体 Ahem 只画方块 [47] |
| `integration_test` | 随 SDK | 模拟器、真机、桌面、浏览器 | `flutter test integration_test` 在设备上跑完整 App；Linux CI 要用 `xvfb-run`；Android 可上 Firebase Test Lab [48] | 只能在 Flutter 内部操作，碰不到系统弹窗 [49] |
| Patrol | 4.11.0（leancode.co） | Android、iOS、macOS、web | 原生自动化：授予运行时权限、打开并点击通知、处理 WebView 或 OAuth 登录页、切换 Wi-Fi 和深色模式；有 Patrol MCP 给 agent 用 [49] | 要装 `patrol_cli`，`flutter test` 跑不了 [49]；平台自动化目前只有 Android、iOS、Web [49] |
| Maestro | 2.12.1 [60] | iOS 模拟器、Android 模拟器和真机 [60] | 黑盒测试编译好的 APK 或 IPA，经语义树找控件，能处理推送和权限弹窗 [50] | 控件要有语义：用 `semanticLabel`、`Semantics` 或 `Semantics(identifier:)`（Flutter 3.19 起），Key 看不见；不支持 Flutter 桌面 [50] |

- **Mac 模拟器上无人值守**：`integration_test`、Patrol、Maestro 都能在 iOS 模拟器和 Android 模拟器上由命令行启动（推论，依据 [48][49][50]）。
- **CI**：widget 测试和 golden 在 Linux 上直接跑；Android 模拟器在 Linux runner 上开 KVM；iOS 模拟器要 macOS runner [48][60]。
- **视觉回归**：Flutter 自己画全部控件，同一份 golden 基线在 iOS、Android 上看到的是同一套像素（推论，依据 [3]）；但 golden 是测试进程里的渲染，不是手机上的截图，字体要在 `flutter_test_config.dart` 里统一加载，基线只在一个固定平台生成 [47]。`golden_toolkit` 已停止维护，`alchemist` 0.15.0（betterment.dev）仍在更新 [4]。
- **agent 驱动**：Patrol 有 MCP 让 agent 运行测试 [49]；leancode 还发布了 `marionette_flutter`（仓库名 `marionette_mcp`），ccpocket 依赖了它 [4][55]，它的具体能力本次没有核对。Expo 一侧有 agent-device、Argent 和 `@expo/agent-cli` [60]。
- **真机**：Maestro 不支持 iOS 真机 [60]；Patrol 的 `patrol doctor` 会检查 `ideviceinstaller`，可以装到连着的 iOS 设备上 [49]，免费 Apple ID 下是否可用，本次没有核对。

## 7. 覆盖所有端

### 7.1 Flutter 桌面端

- 官方文档把 Windows、macOS、Linux 列为可以编译原生桌面应用的目标，插件按平台联邦实现 [51]。Flutter 3.50 支持 Windows 10、11，macOS 12 到 27（正在放弃 Intel Mac，macOS 27 只支持 Apple 芯片），Debian 10 到 13，Ubuntu 20.04 到 24.04 LTS [2]。
- Impeller 自 Flutter 3.47 起在 macOS、Windows、Linux 上默认开启，以后会去掉关闭它的选项 [3]。
- 测试：`integration_test` 支持桌面 [48]；Maestro 不支持 Flutter 桌面 [50]。
- 先例：ccpocket 的仓库里有 iOS、Android、macOS、Windows、Linux 的发布工作流 [55]；Kelivo 自称「Support Mobile & Desktop」[56]。它们都是聊天客户端，不是像 Pigcode 这样的插件宿主（推论）。

### 7.2 Flutter 网页端

- Flutter 网页端把 Dart 编译成 JavaScript（dart2js）或 WebAssembly（dart2wasm），用 CanvasKit 和 Skwasm 两个渲染器在 WebGL、WebGPU 上绘制 [52]。
- `flutter build web --wasm` 同时产出两份；浏览器支持 WasmGC 等特性时用 Wasm 和 Skwasm，否则退回 dart2js 和 CanvasKit；Flutter 3.50 默认只对 Chromium 137 以上启用 Wasm，Safari 和 Firefox 要在 `wasmAllowList` 里手动打开；多线程渲染要求服务器发 COOP、COEP 头 [52]。
- 渲染引擎文件默认从 `www.gstatic.com` 的 CDN 加载，可以用 `--no-web-resources-cdn` 打进产物 [52]。`www.gstatic.com` 在中国大陆的可达性，没有找到一手来源。
- 官方文档说：文本为主、按文档流排版的静态内容更适合以文档为中心的 Web，Flutter 网页端更适合单页应用和已有 Flutter 手机应用的浏览器版 [52]。Maestro 测 Flutter 网页要先在 `main()` 里调 `SemanticsBinding.instance.ensureSemantics()`，否则找不到任何元素 [50]。
- 地图已定不做网页应用（PWA），这一项只回答「能不能」：能编译，但它不是 DOM 页面，替代不了现在的 React 界面（推论）。

### 7.3 用 Flutter 替换现在的 Electron 桌面端要放弃或重写什么

**界面代码（全部重写）**

| 部分 | TSX | TS | CSS | 合计 |
|---|---|---|---|---|
| `ui-chat` | 5,310 | 1,961 | 0 | 7,271 |
| `ui-composer` | 2,173 | 1,399 | 0 | 3,572 |
| `ui-primitives` | 1,655 | 5,547 | 13,357（52 个文件） | 20,559 |
| `ui-workbench` | 3,137 | 545 | 0 | 3,682 |
| `ui-shell` | 3,558 | 793 | 0 | 4,351 |
| `ui-settings` | 8,070 | 611 | 0 | 8,681 |
| `ui-plugin-manager` | 2,334 | 320 | 0 | 2,654 |
| `apps/desktop` renderer | 5,353 | 2,547 | 0 | 7,900 |
| **界面合计** | **31,590** | **13,723** | **13,357** | **58,670** |
| `apps/desktop` main + preload | 0 | 4,803 | 0 | 4,803 |

（本次在 `54e2740` 上用 `wc -l` 数的，不含测试和 `.d.ts` [24]。其中约 3,070 行是界面文案表，可以机械转换（推论）。这些包和桌面端源码的单元测试另有约 17,400 行，Playwright E2E 约 5,800 行 [24]。）

- main 和 preload 里有 20 个文件 import `electron`，覆盖窗口、托盘、原生菜单、`electron-updater` 自动更新、`powerSaveBlocker` 保持唤醒、自定义协议、CSP、文件夹选择、Host 进程的启动和监督 [24]。Flutter 桌面要逐项找插件或写原生代码替代（推论）。

**插件平台（推翻现有前提）**

- ADR 0001：内置功能和插件通过同一个扩展点注册表登记界面，五个扩展点是 Panel、Surface、设置页、Command、工具渲染器 [24]。
- ADR 0002：renderer 在 `index.html` 里用 import map 把 `react`、`react-dom`、`react-dom/client`、`react/jsx-runtime`、`@pigcode/ui-primitives`、`@pigcode/plugin-sdk` 指向宿主编译出的同一个文件，插件打包时把它们标为 external，拿到的是宿主的同一个实例 [24]。
- `pigcode-plugin://` 是 Electron 的特权协议：`boot.json` 是启动图，`plugins/<包名>/<文件>` 从 profile 的 `node_modules` 里读插件的 client bundle，路径不能越出插件目录 [24]。
- 在 Flutter 里（推论）：
  - 宿主界面是 Dart，没有 React 实例可共用；UI 插件只能每个放进一个 webview，各自带 React，hooks 和 context 跨不过去，ADR 0002 要推翻；
  - 工具渲染器要嵌在时间线里，每条工具调用一个 webview 的代价太高，实际上得换成声明式的插件界面描述，ADR 0001 的扩展点和插件 SDK 要重新设计，已有插件全部要改；
  - `pigcode-plugin://` 要改成各平台 webview 的自定义 scheme 处理，或者本地 HTTP 服务。
- 桌面 webview 包 [4][53]：

| 包 | 版本 | 最后发布 | 发布者 | 平台 |
|---|---|---|---|---|
| `webview_flutter` | 4.14.1 | 2026-07-07 | flutter.dev | Android、iOS、macOS（没有 Windows、Linux） |
| `flutter_inappwebview` | 6.1.5 | 2024-10-08 | inappwebview.dev | Android、iOS、macOS、Windows、web |
| `flutter_inappwebview_linux` | 0.1.0-beta.1 | 2026-02-04 | 无 | Linux |
| `desktop_webview_window` | 0.4.3 | 2026-11-14 | mixin.dev | Windows（WebView2）、Linux（WebKitGTK）、macOS（WKWebView），在独立的原生窗口里打开网页 |
| `webview_windows` | 0.4.0 | 2024-02-17 | jns.io | 只有 Windows |
| `webview_all` | 1.5.2 | 2026-11-19 | abandoft.com | 标称全平台，内部实现本次没有核对 |

- 右侧面板的内置浏览器是 Electron 的 `<webview>`（`webviewTag: true`），Agent 的 `browser_*` 工具经 main 进程操作它的 `webContents` [24]，这一块也要在各平台 webview 上重做（推论）。Kelivo 为了桌面 webview 在仓库里 vendor 了 `flutter_inappwebview` 的 Android、iOS、macOS 实现和 `webview_windows` [56]。

**Host（保留，但要换宿主进程）**

- Host 的 `entry.ts` 在没有 `process.parentPort` 时直接抛出「host entry must run inside an Electron utilityProcess」，页面连接是 main 转交的 MessagePort；插件下载在 Electron 里用 `net.fetch`（跟随系统代理与证书），否则退回全局 `fetch`；原生模块是 `better-sqlite3` 13.0.3 和 `node-pty` 1.1.0 [24]。Host 本身约 15,900 行 TS [24]。
- Flutter 桌面要（推论）：
  - 随应用打包一个 Node 运行时，由 Flutter 进程启动 Host 子进程；
  - 按这个 Node 的 ABI 重编 `better-sqlite3`、`node-pty`；
  - 写新的入口和传输层（stdio 或本地 socket）替代 MessagePort。地图记录的现状说 Host 的领域层只依赖 `HostTransport`，单测已在纯 Node 下用内存传输跑通完整的 RPC 服务，所以这一步可行；
  - 下载改回普通 `fetch`，系统代理和证书要自己处理。

**合计**：替换桌面端要重写约 63,500 行界面和外壳代码（58,670 + 4,803），重新设计插件的界面模型并改写已有插件，Host 换成独立 Node 进程 [24]。换来的是桌面端和手机端用同一种语言，而 Host 仍然是 TS，整个系统从一种语言变成两种（推论）。

### 7.4 只做手机端时，Flutter 比 Expo 多了什么、少了什么

**多了**

- 一套自绘渲染：iOS 上只有 Impeller，着色器预编译 [3]；同一份界面代码在两端画出同样的像素，golden 基线可以共用（推论，依据 [3][47]）。
- 性能：发布构建是 AOT 编译 [43]，没有 JS 桥。但三个先例都报过长会话卡顿 [55][56][57]，性能不会自动得到（推论）。
- 不需要模拟器的 widget 测试和 golden 测试 [47]。
- 原生工程直接提交、直接在 Xcode 里改，加扩展不用写 config plugin [33]。
- 先例：DSH Go（Android 已发布）[54]、ccpocket（编程 Agent 手机客户端，电脑端是 TS）[55]。
- 「顺带」能得到的：同一套手机端代码也能编成 macOS、Windows、Linux 和 iPad 上的客户端（ccpocket 就有这些平台的发布流程 [55]），但它们连的仍是电脑上的 Pigcode，不能替换桌面端。地图已定只做手机布局，这不是目标（推论）。

**少了**

- 复用 TS：`contracts`、`client-runtime` 的连接层和时间线逻辑约 4,500 行都要在 Dart 里重写，返回值和事件要手写模型 [23][24]；T3 Code 的 Expo 手机端直接复用同名包 [60][63]。
- 和桌面端同一种语言：Expo 手机端、桌面端、Host 都是 TS；Flutter 路线多一门 Dart 和一套 pub 工具链（推论）。
- Expo 的 DOM 组件兜底：个别难做的块（宽表格、长 diff）可以直接放现有 React DOM 组件 [60]；Flutter 只能嵌 webview，状态不共享，iOS 上 platform view 还有掉帧问题 [22]。
- 聊天专用的部件：keyboard-controller 的 `KeyboardChatScrollView`、Enriched Markdown 的原生文本流式渲染、LegendList 的贴底跟随 [60]；Flutter 对应的问题见 1.3、1.4 节。
- 一份共用的 Noise：Expo 的 Hermes 和 Host 的 Node 共用一份 TS 握手 [60]；Flutter 要单写 Dart 版（3.2 节）。
- 自建 OTA：expo-updates 的协议公开，可以自建并签名 [60]；Shorebird 只有托管版 [42]。

## 8. 和 Expo 的对比表

1 到 5 分，5 最好。维度沿用 mobile-stack 第 9 节；Expo 的分数照抄 mobile-stack，没有重新评估；Flutter 一列是本次根据上文来源做的判断，不是测量结果。

| 维度 | Expo 原生界面（#90） | Flutter（#90） | Flutter（本次） | 本次的依据 |
|---|---|---|---|---|
| 复用现有 TS | 3 | 1 | 1 | 3.1 节 |
| monorepo 工程 | 4 | 2 | 2 | pnpm 忽略 Flutter 目录，另一套工具链（3.3 节） |
| 键盘和输入框 | 5 | 3 | 3 | 跟手收起、中文拼音、iOS 26 键盘的未关 issue（1.3 节） |
| 长时间线流式渲染 | 4 | 4 | 3 | 核心列表的跳转和贴底问题，三个先例的卡顿 issue（1.4 节） |
| 原生能力和扩展 | 4 | 3 | 3 | 扩展都要 Swift，没有 `expo-widgets` 这类封装（4.2 节） |
| 加密库 | 4 | 3 | 2 | 原语齐，但没有能用的 Noise，要再写一份并做互通（3.2 节） |
| OTA | 5 | 2 | 2 | Shorebird 只有托管版（5.2 节） |
| 上架风险 | 4 | 4 | 4 | 与技术栈无关 |
| AFK 自动化测试 | 5 | 4 | 4 | Patrol、Maestro、integration_test（第 6 节） |
| 视觉回归 | 3 | 4 | 4 | golden 不需要模拟器，但字体要固定（第 6 节） |
| 一人加 agent 的维护成本 | 4 | 2 | 2 | 多一门语言，协议、时间线、Noise 各写两份 |
| **合计（满分 55）** | **45** | **32** | **30** | |

## 9. 先例

### 9.1 DSH Go

另一个调研（[调研：DSH Go 的手机端怎么做](https://github.com/pigcode/monorepo/issues/105)）在深入看它，这里只记 README 里和 Flutter 相关的事实（main 分支 `da79802`，2026-11-20）[54]：

- 描述是「DeepSeek Harness 装进口袋：手机本机运行，也能遥控你的电脑」，AGPL-3.0。
- README：「Android 版已发布；iOS 版仍在开发和真机测试，需在 Mac 上自行签名编译」；「当前下载页提供 Android APK；iOS 版还在开发和真机测试，没有公开安装包」。
- 工具链脚本默认安装 Flutter 3.47.7，App 要求 Dart `^3.13.5`；`app/` 是「Flutter 界面、Android Kotlin 实现与开发中的 iOS Swift/WidgetKit 实现」。
- GitHub 语言统计（字节数，全仓库）：Dart 41,733,783，JavaScript 9,226,156，Kotlin 5,095,239，Python 3,297,336，Swift 1,287,412 [54]。
- 按目录统计（git tree 的文件大小）：`app/lib` 的 Dart 约 16.2 MB（1,151 个文件）；`app/android` 的 Kotlin 约 5.0 MB，其中主代码约 3.07 MB、测试约 1.95 MB；主代码里最大的是 `phone`（手机操控，约 1.73 MB）、`runtime`（本机运行时，约 0.45 MB）、`pet`（约 0.30 MB），`notify` 约 54 KB、`share` 约 27 KB、`islands` 约 13 KB；`app/ios` 的 Swift 约 1.24 MB，其中 `Runner` 约 0.76 MB、`ShareExtension` 约 10.7 KB、`CompanionWidget` 约 7 KB [54]。
- 含义（推论）：Flutter 项目里的手机操控、本机运行时这类重原生功能和系统集成仍然用 Kotlin、Swift 写；Pigcode 的手机端用不到手机操控和本机运行时，原生代码会少得多，但扩展和通知仍要写。

### 9.2 ccpocket

K9i-0/ccpocket，提交 `b5dcfc9`（2026-11-21），MIT [55]：

- 描述：「Mobile client for Codex, Claude, and Antigravity — control coding agents from your phone via WebSocket bridge」。和 Pigcode 的形态最接近：电脑上跑一个 TS 写的 bridge（`packages/bridge`），手机端是 Flutter（`apps/mobile`）。
- 工程：根 `package.json` 的 npm workspaces 只有 `packages/*`，Flutter 工程不在里面。
- 手机端依赖：`flutter_markdown`（已停止维护的那个）、`markdown`、`highlight`、`syntax_highlight`、`scroll_to_index`、`webview_flutter`、`firebase_core` 加 `firebase_messaging`、`flutter_local_notifications`、`freezed` 加 `json_serializable`、`patrol_finders`、`marionette_flutter`、`material_ui`、`cupertino_ui`。
- 仓库里有 iOS、Android、macOS、Windows、Linux 的发布工作流。
- 公开 issue：#80「Long chat history causes severe UI jank on Android」（滚动卡顿、弹键盘掉帧，会话里有很多代码块、命令输出、diff 和长 Markdown，2026-07-14 关闭）；#194「Long chat sessions remain noticeably sluggish on the latest Android release」（2026-11-04 关闭）；#173「Streamed assistant response disappears on turn completion」（已关闭）。

### 9.3 Kelivo

Chevey339/kelivo，提交 `8340bd2`，AGPL-3.0，描述「A Flutter LLM Chat Client. Support Mobile & Desktop.」[56]：

- 依赖：`flutter_highlight`、`highlight`、`re_highlight`、`super_sliver_list`、`scrollable_positioned_list`、`webview_flutter`、`flutter_inappwebview`；仓库的 `dependencies/` 里 vendor 了 `flutter_inappwebview` 的 Android、iOS、macOS 实现和 `webview_windows`。
- 公开 issue：#1094「Android 卡顿专项：iOS 流畅而 Android 整体发黏」（作者怀疑 `adjustResize` 加 `viewInsets` 重建和长文本输入框，2026-10-09 关闭）；#571「长思考会遇到极为严重的性能问题」（未关闭）；#1273「[iOS] Reasoning block renders with broken line wrapping」（已关闭）。

### 9.4 Conduit

cogwheel0/conduit，提交 `64e7d39`，GPL-3.0，描述「Native iOS and Android client for Open WebUI, direct OpenAI-compatible, Ollama, and Hermes agents」[57]：

- 根 `pubspec.yaml` 是 pub workspace，成员有 `conduit_core`、`conduit_markdown`、`conduit_protocol`、`conduit_theme`、`apps/daemon`；Markdown 用自己基于 `markdown` 解析器写的 `conduit_markdown`；webview 用 `flutter_inappwebview` 6.2.0-beta.3。
- 公开 issue：#861「Text chat gets very laggy after a long message is received from the agent」（iPhone 13 Pro，未关闭）；#583「iPhone runs hot when using app」（未关闭）；#466「Performance optimization needed for iOS」（已关闭）。

### 9.5 其他

GitHub 按 Dart 语言搜索还能看到 sesori-ai/sesori_apps_monorepo、jacobaraujo7/remote_pi、verseles/codewalk 等编程 Agent 手机客户端，以及 baocode-dev/baocode、leynier/alera 这类用 Flutter 做的 Claude Code 桌面界面 [58]。这些只看了仓库描述，没有核对源码。

### 9.6 共同点（推论）

- 三个开源先例都有「长会话、长消息、代码块」场景的卡顿 issue [55][56][57]，和 Pigcode 时间线的内容一致。
- 三个里有两个自己写或 vendor 了关键部件：Conduit 写了自己的 Markdown，Kelivo vendor 了 webview 插件 [56][57]。
- 都没有复用电脑端的代码：ccpocket 的电脑端是 TS，手机端的模型用 `freezed` 和 `json_serializable` [55]。

鸿蒙不在地图范围内；Flutter 的 OpenHarmony 适配由 CPF-Flutter 组织维护，版本落后上游几个月 [59]。

## 对 Pigcode 的启示

### [手机端技术栈](https://github.com/pigcode/monorepo/issues/95)

- 「用 Flutter 一网打尽」对 Pigcode 不成立：电脑上的 Pigcode 是插件宿主加 Host 的外壳，换成 Flutter 要重写约 63,500 行界面和外壳代码，推翻 ADR 0001、0002 的插件界面模型，Host 还得改成自带 Node 运行时的独立进程（7.3 节）。所以手机端技术栈里实际要比的是「手机端单独用 Flutter」和「手机端用 Expo」，桌面端保持 Electron（推论）。
- 倾向（供讨论，不拍板）：仍以 Expo 为首选。Flutter 多出的是自绘渲染、两端一致和两个直接先例；少掉的是约 4,500 行 TS 的复用、一份共用的 Noise、可自建的 OTA 和 DOM 组件兜底。Flutter 已知的体验问题（键盘跟手收起、中文拼音、长列表跳转和贴底）恰好落在 Pigcode 最常用的场景上（1.3、1.4 节）。
- 如果选 Flutter，要一起定：
  - 工程放在 `frontend/apps/mobile`，不走 pnpm；Dart 包用 pub workspace 管理 [29][30]；
  - `contracts` 导出 JSON Schema 只用于参数，返回值和事件手写 `freezed` 模型；录一份真实会话事件当两边共用的 fixture；
  - Noise 用 `cryptography` 写 Dart 版，和 TS 版用固定密钥的握手记录做互通测试；
  - 列表、Markdown、高亮的选型（`super_sliver_list`、`gpt_markdown`、`re_highlight` 或 `syntax_highlight`），以及要不要接受 `super_sliver_list` 两年多没有发布；
  - APNs 令牌用 `push` 还是几行 Swift；
  - 公开发布时 OTA 是否接受托管的 Shorebird；
  - 开发机的 pub 和 SDK 镜像 [31]。
- 对迭代路线的影响：
  - 插件上手机：UI 插件是 React 组件，两条路线都不能和宿主共用 React；Expo 可以用 DOM 组件或 WebView 承载 [60]，Flutter 只能用 webview（推论）。
  - 系统集成：两条路线的扩展都用 Swift 写 [33][60]；Flutter 不需要 config plugin，Expo 有 `expo-widgets` 可以用 React 写小组件 [60]。
  - 公开发布：上架风险与技术栈无关 [60]；Flutter 的 OTA 只能托管在 Shorebird [42]。

### [技术验证：长会话时间线用 RN 原生实现和放进 DOM 组件的对比](https://github.com/pigcode/monorepo/issues/104)

- 本调研不要求改变比较对象。Flutter 的主要代价在复用和工程，不在渲染，多做一个 Flutter 版时间线测不出这部分代价（推论）。
- 如果手机端技术栈的讨论后 Flutter 仍是候选，就加第三个页面：Flutter 简版时间线（`SuperListView` 加 `gpt_markdown` 和一个高亮包），用同一份录制的会话事件 JSON 回放。
  - Dart 侧的事件模型要先手写，这本身就是一次「协议在 Dart 里要写多少」的实测；
  - 用 profile 包测，debug 包在 iOS 26 真机上依赖 LLDB，数据不可比 [39][40]；
  - 在手感检查里加两项：键盘随手指收起，中文拼音未确认时切换焦点 [6][7]。
- 不论加不加 Flutter：先例的卡顿都出在长消息、代码块、命令输出和 diff 上 [55][56][57]，回放用的会话要包含这些内容；录下来的事件 JSON 同时可以作为以后契约测试的 fixture（推论）。

### [手机端怎么测试和验收](https://github.com/pigcode/monorepo/issues/100)

- 选 Expo：mobile-stack 的三层方案不变 [60]。
- 选 Flutter：
  - 第一层：`flutter test` 的 widget 测试和 golden 截图在 Linux CI 上跑，不需要模拟器；字体在 `flutter_test_config.dart` 里统一加载，基线只在一个平台生成 [47]。
  - 第二层：界面流程用 Patrol（要处理系统权限弹窗、通知时）或 Maestro，在 iOS 模拟器（Mac 或 macOS runner）和 Android 模拟器（Linux 加 KVM）上跑 [49][50][60]。用 Maestro 时，「可交互控件都加 `Semantics(identifier:)`」要写进代码规范 [50]。
  - 第三层：开发者的 iPhone 上手工验收，装 profile 或 release 包（debug 包离开 Flutter 工具起不来 [41]）；扩展相关的流程只能在模拟器或真机 release 包里测 [33]。
- 两种技术栈都需要：
  - 契约测试：Host 录制的真实事件做成共享 JSON fixture，协议改动时桌面端和手机端各跑一遍；
  - Noise 互通测试：固定密钥的握手记录逐字节比对，再加一条手机端客户端连 Node 里的 Host 的端到端用例；选 Flutter 时多一份 Dart 实现要测（推论）。

## 待证实事项

- Flutter 在 iOS 上的默认字体（SF、苹方）、动态字体、深色模式和无障碍的官方说明，以及 iOS 上的滚动物理：本次没有读到相关文档。
- `api.shorebird.dev`、`cdn.shorebird.cloud`、`www.gstatic.com` 在中国大陆能不能稳定访问。
- quicktype 从 JSON Schema 生成 Dart 类型的效果；ccpocket 怎么让 Dart 模型和 TS bridge 保持一致。
- `live_activities` 在免费 Apple ID（没有 Push Notifications 能力）下只做本地更新能不能用。
- `noise_protocol_framework` 有没有审计或对照测试向量：本次只看了源码目录和依赖。
- Flutter 版时间线在 iPhone 上处理 Pigcode 这类长会话的实际表现：只有 issue 和先例，没有测量。
- ccpocket、Kelivo、Conduit 卡顿 issue 的根因和修法：只读了 issue 正文，没有看修复提交。
- `webview_all` 的各平台实现，`flutter_inappwebview_linux` 的完成度。
- `marionette_flutter` 的能力；Patrol 能否在免费 Apple ID 签名的真机上跑。
- `cupertino_ui` 支持 Liquid Glass 的时间表：官方没有给日期。
- Flutter 桌面的多窗口支持：Pigcode 桌面端有两个 `BrowserWindow`（主窗口和预览窗口）[24]，本次没有核对 Flutter 的多窗口现状。

## 参考来源

所有来源的访问日期都是 2026-11-21。

1. Flutter 发布清单（`current_release` 和各版本的 `release_date`、`dart_sdk_version`）: https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json
2. Flutter, Supported deployment platforms（As of Flutter 3.50）: https://docs.flutter.dev/reference/supported-platforms
3. Flutter, Impeller rendering engine: https://docs.flutter.dev/perf/impeller
4. pub.dev API（版本、发布时间、发布者、平台和 Flutter Favorite 标签、停止维护标记），按 `https://pub.dev/api/packages/<包名>` 及其 `/publisher`、`/score`、`/options` 读取：`super_sliver_list`、`scrollable_positioned_list`、`flutter_chat_ui`、`flutter_chat_core`、`cupertino_interactive_keyboard`、`flutter_markdown`、`flutter_markdown_plus`、`gpt_markdown`、`flutter_streaming_text_markdown`、`flutter_smooth_markdown`、`markdown_widget`、`markdown`、`re_highlight`、`syntax_highlight`、`flutter_highlight`、`highlight`、`re_editor`、`diff_match_patch`、`pretty_diff_text`、`diff_view`、`flutter_diff_viewer`、`xterm`、`cupertino_ui`、`material_ui`、`cryptography`、`cryptography_flutter`、`sodium`、`sodium_libs`、`pointycastle`、`elliptic`、`noise_protocol`、`noise_protocol_framework`、`json_serializable`、`freezed`、`melos`、`firebase_messaging`、`push`、`flutter_apns`、`flutter_apns_only`、`unifiedpush`、`flutter_local_notifications`、`live_activities`、`home_widget`、`receive_sharing_intent`、`share_handler`、`patrol`、`patrol_finders`、`marionette_flutter`、`alchemist`、`golden_toolkit`、`webview_flutter`、`webview_flutter_wkwebview`、`flutter_inappwebview`、`flutter_inappwebview_linux`、`desktop_webview_window`、`webview_windows`、`webview_all`
5. Dart, Verified publishers: https://dart.dev/tools/pub/verified-publishers
6. flutter/flutter#57609 Let iOS keyboard dismissal synchronize with scroll: https://github.com/flutter/flutter/issues/57609
7. flutter/flutter#171068 [iOS] Chinese Pinyin Input Method Leaves Invisible Characters When Focus Changes Between TextFields: https://github.com/flutter/flutter/issues/171068
8. flutter/flutter#179482 Semi-transparent keyboard on iOS 26 reveals widgets that do not draw under it: https://github.com/flutter/flutter/issues/179482
9. flutter/flutter#181474: https://github.com/flutter/flutter/issues/181474 ；#193765: https://github.com/flutter/flutter/issues/193765
10. flutter/flutter#12319 Provide method and/or config to programmatically scroll to ListView index: https://github.com/flutter/flutter/issues/12319
11. flutter/flutter#129768 Problems with scrolling to the end of the list using maxScrollExtent: https://github.com/flutter/flutter/issues/129768
12. flutter/flutter#52207 ListView: Poor performance with many variable-extent items + jumpTo: https://github.com/flutter/flutter/issues/52207
13. super_sliver_list README 与仓库元数据: https://github.com/superlistapp/super_sliver_list
14. gpt_markdown README: https://github.com/useval/gpt_markdown
15. flutter_markdown_plus README 与仓库元数据: https://github.com/foresightmobile/flutter_markdown_plus
16. re_highlight README: https://github.com/reqable/re-highlight
17. syntax_highlight README: https://github.com/serverpod/syntax_highlight
18. xterm.dart README 与仓库元数据: https://github.com/TerminalStudio/xterm.dart
19. flutter/flutter#170310 Support for iOS 26 "Liquid Glass" Design in Cupertino Widgets（正文的两次更新和评论）: https://github.com/flutter/flutter/issues/170310
20. flutter/flutter#101479 ☂️ Move the material and cupertino packages outside of Flutter: https://github.com/flutter/flutter/issues/101479
21. cupertino_ui README、CHANGELOG（flutter/packages）: https://github.com/flutter/packages/tree/main/packages/cupertino_ui ；pub.dev changelog（1.1.7）: https://pub.dev/packages/cupertino_ui/changelog
22. flutter/flutter#190815 Jank on iOS when a platform view is on screen, caused by the merged platform/UI thread: https://github.com/flutter/flutter/issues/190815
23. 本机实测：用 frontend 里的 zod 4.4.3 对 `commandSchemas`、`events.ts`、`domain.ts` 的 schema 调用 `z.toJSONSchema()`（`io` 分别为 `input`、`output`），脚本放在临时目录，未改动仓库。这不是公开来源。
24. 本地代码：pigcode/frontend `54e2740`，`packages/contracts`、`packages/client-runtime`、`packages/ui-*`、`packages/plugin-sdk`、`apps/desktop`（`src/main/protocol.ts`、`src/main/window-options.ts`、`src/main/csp.ts`、`src/renderer/index.html`、`src/renderer/src/shared/`）、`apps/host`（`src/entry.ts`、`src/services/plugin-download.ts`）、`pnpm-workspace.yaml`；聚合仓库的 `adr/0001`、`0002`、`0006`、`0011`、`0018`。这不是公开来源。
25. noise_protocol_framework 源码（`lib/protocols/`、`lib/keypair.dart`、`lib/protocols/nkpsk0/handshake_state.dart`、`lib/crypto/key_derivation.dart`）: https://github.com/levischechter/noise_protocol_framework
26. cryptography README（仓库首页与 `cryptography/README.md`）: https://github.com/dint-dev/cryptography
27. sodium README（API Status、Considered for the future、Version 4.0 Migration Guide）: https://github.com/Skycoder42/libsodium_dart_bindings/blob/main/packages/sodium/README.md
28. Trevor Perrin, The Noise Protocol Framework, Revision 34（2018-07-11）: https://noiseprotocol.org/noise.html
29. Dart, Pub workspaces (monorepo support): https://dart.dev/tools/pub/workspaces
30. 本机实测：pnpm 10.32.1，在临时目录建 `pnpm-workspace.yaml`（`apps/*`）、`apps/web/package.json` 和只有 `pubspec.yaml` 的 `apps/mobile`，`pnpm -r ls` 只列出根和 `apps/web`。这不是公开来源。
31. Flutter, Using Flutter in China: https://docs.flutter.dev/community/china
32. push README（Features、Comparisons）: https://github.com/ben-xD/push
33. Flutter, Adding iOS app extensions: https://docs.flutter.dev/platform-integration/ios/app-extensions
34. live_activities README（Getting started）: https://github.com/istornz/live_activities
35. home_widget README: https://github.com/ABausG/home_widget
36. receive_sharing_intent README: https://github.com/KasemJaffer/receive_sharing_intent
37. Flutter, Set up iOS development: https://docs.flutter.dev/platform-integration/ios/setup
38. Flutter, Flutter's build modes: https://docs.flutter.dev/testing/build-modes ；Hot reload: https://docs.flutter.dev/tools/hot-reload
39. flutter/flutter#163984 Debug mode and hot reload fail on iOS 26 due to JIT restriction: https://github.com/flutter/flutter/issues/163984
40. flutter_tools 源码 `packages/flutter_tools/lib/src/build_system/targets/ios.dart`（`DebugIosLLDBInit`，提交 5c6367c2）: https://github.com/flutter/flutter/blob/5c6367c2/packages/flutter_tools/lib/src/build_system/targets/ios.dart
41. flutter/flutter#68215 "In iOS 14+, debug mode Flutter apps can only be launched from Flutter tooling..." warning: https://github.com/flutter/flutter/issues/68215
42. Shorebird, Code Push FAQ: https://docs.shorebird.dev/code-push/faq/
43. Shorebird, System Architecture: https://docs.shorebird.dev/code-push/system-architecture/ ；Complete Code Push guide: https://docs.shorebird.dev/code-push/guides/code-push-guide/ ；Patch Performance: https://docs.shorebird.dev/code-push/performance/
44. Shorebird, Pricing: https://shorebird.dev/pricing
45. Apple, App Review Guidelines（Last Updated October 16, 2026），2.5.2: https://developer.apple.com/app-store/review/guidelines/
46. Apple, Apple Developer Program License Agreement，§3.3.1(B) Executable Code、§3.3.2 Regulatory Compliance: https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
47. Flutter API, matchesGoldenFile: https://api.flutter.dev/flutter/flutter_test/matchesGoldenFile.html
48. Flutter, Check app functionality with an integration test: https://docs.flutter.dev/testing/integration-tests
49. Patrol, Install Patrol: https://patrol.leancode.co/documentation ；Native automation overview: https://patrol.leancode.co/native/overview ；README: https://github.com/leancodepl/patrol/tree/master/packages/patrol
50. Maestro, Flutter: https://docs.maestro.dev/get-started/supported-platform/flutter
51. Flutter, Desktop support for Flutter: https://docs.flutter.dev/platform-integration/desktop
52. Flutter, Web support for Flutter: https://docs.flutter.dev/platform-integration/web ；Support for WebAssembly (Wasm): https://docs.flutter.dev/platform-integration/web/wasm ；Flutter web app initialization: https://docs.flutter.dev/platform-integration/web/initialization ；Build and release a web app: https://docs.flutter.dev/deployment/web
53. desktop_webview_window README: https://github.com/MixinNetwork/flutter-plugins/tree/main/packages/desktop_webview_window
54. DSH Go（main 分支 `da79802`，2026-11-20）：README https://github.com/ccch1mneyyy/dsh-Go ；语言统计 https://api.github.com/repos/ccch1mneyyy/dsh-Go/languages ；git tree（`/git/trees/main?recursive=1`）的文件大小
55. ccpocket（提交 `b5dcfc9`）：`package.json`、`apps/mobile/pubspec.yaml`、`.github/workflows/` https://github.com/K9i-0/ccpocket ；issue #80 https://github.com/K9i-0/ccpocket/issues/80 ，#173 https://github.com/K9i-0/ccpocket/issues/173 ，#194 https://github.com/K9i-0/ccpocket/issues/194
56. Kelivo（提交 `8340bd2`）：`pubspec.yaml`、`dependencies/` https://github.com/Chevey339/kelivo ；issue #571 https://github.com/Chevey339/kelivo/issues/571 ，#1094 https://github.com/Chevey339/kelivo/issues/1094 ，#1273 https://github.com/Chevey339/kelivo/issues/1273
57. Conduit（提交 `64e7d39`）：`pubspec.yaml`、`packages/conduit_markdown/pubspec.yaml` https://github.com/cogwheel0/conduit ；issue #466 https://github.com/cogwheel0/conduit/issues/466 ，#583 https://github.com/cogwheel0/conduit/issues/583 ，#861 https://github.com/cogwheel0/conduit/issues/861
58. GitHub 仓库搜索（`gh search repos`，`language:Dart`，关键词 claude code、codex、coding agent、LLM chat client），只读了仓库描述
59. CPF-Flutter（Flutter for OpenHarmony）: https://gitcode.com/CPF-Flutter
60. 调研：手机端技术栈的候选（#90），`research/mobile-stack.md`: https://github.com/pigcode/monorepo/blob/research/mobile-stack/research/mobile-stack.md
61. 调研：iPhone 和安卓自用时的安装与推送限制（#88），`research/mobile-install-push.md`: https://github.com/pigcode/monorepo/blob/research/mobile-install-push/research/mobile-install-push.md
62. 调研：手机在外网怎么连回电脑（#89），`research/mobile-connectivity.md`: https://github.com/pigcode/monorepo/blob/research/mobile-connectivity/research/mobile-connectivity.md
63. 调研：同类产品的手机端怎么做（#87），`research/mobile-prior-art.md`: https://github.com/pigcode/monorepo/blob/research/mobile-prior-art/research/mobile-prior-art.md
