# 手机端技术栈候选调研（pigcode/monorepo#90）

调研日期 2026-11-21，下文所有来源的访问日期都是 2026-11-21。方括号里的数字对应「参考来源」的编号。标注「未经一手来源证实」的内容没有找到官方页面支持；标注「推论」的是根据所引来源推出、来源本身没有直接写明的结论。本地代码的事实来自 pigcode/frontend `54e2740`（只读）[65]。

## 问题

手机端做成安装的 App（不做网页应用），iOS 和 Android 都要，只做手机布局。比较 Expo / React Native、Capacitor（把现有 React DOM 界面装进原生壳）、原生 Swift 加 Kotlin，以及 Flutter、Kotlin / Compose Multiplatform 等其他方案：

- **复用**：能复用多少现有代码，包括 `contracts`、`client-runtime` 的连接层，`ui-chat` 的时间线、审批卡和提问卡；Expo 的 DOM 组件（`'use dom'`）能不能承载这些组件，代价是什么。
- **工程**：在 frontend 的 pnpm monorepo 里怎么放，能不能直接用工作区里导出 TS 源码的私有包。
- **原生体验**：键盘和输入框、长时间线流式渲染的性能、手势、深色模式。
- **原生能力**：推送、后台运行、实时活动、小组件、分享扩展、手表。
- **加密**：端到端加密需要的密码学库。
- **开发和发布**：免费 Apple ID 阶段怎么构建、怎么装到 iPhone 上；OTA 更新；以后上架 App Store 和 Google Play 的阻碍。
- **自动化测试**：AFK agent 能不能在开发者的 Mac 或 CI 上自己跑通 UI 测试，视觉回归怎么做。

## 结论

- **倾向 Expo（SDK 58 / React Native 0.88）加原生渲染的会话界面，DOM 组件只用于个别难以原生化的块。** 它是唯一同时满足三条的候选：协议和连接层的 TS 代码原样可用；键盘、长列表、流式 Markdown 都有为聊天设计、2026 年仍在更新的库 [13][15][18]；AFK agent 能在模拟器上无人值守地驱动和截图验证 [35]–[39]。代价是 `ui-chat`、`ui-composer` 的界面要用 React Native 组件重写。最接近的先例 T3 Code 走的就是这条路：它的手机端 `@t3tools/mobile` 用 Expo 58 和 React Native 0.88，直接依赖工作区里同名的 `contracts`、`client-runtime` 包，列表用 LegendList，Markdown 用 Enriched Markdown，键盘用 keyboard-controller [66]。最终在[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)里决定，决定前用真实长会话做一次技术验证（见第 10 节）。
- **能直接复用的是协议、连接层和时间线逻辑，界面不能。** `contracts` 只依赖 zod 4.4.3；`client-runtime` 对 `plugin-sdk`、`ui-primitives` 只有 `import type`，运行时只依赖 react 和 contracts，`observers.ts` 只在不传参数时才读 `document` [65]。`ui-chat` 里有约 1,860 行纯 TS 的时间线逻辑，但 `turns.ts` 在运行时引用了 `workflow-card.tsx`，`tool-meta.ts` 引用了 `lucide-react`，要先拆进一个不含 DOM 的包 [65]。其余界面（`ui-chat` 约 5,300 行 TSX、`ui-composer` 约 2,200 行 TSX、`ui-primitives` 的 52 个 CSS 文件约 13,400 行）在 React Native 里用不了，Expo 的 Metro 只在 web 上支持 CSS [10]。zod 在 Hermes 上修过两次兼容问题，并提供 `jitless` 模式完全避开 `new Function` [11]。
- **DOM 组件装得下现有的 React DOM 组件，但不适合承载流式时间线。** DOM 组件是一个独立的 WebView 网页包，React、TypeScript、CSS 都可用，release 构建从 `file://` 加载并且是安全上下文 [6]，所以 Base UI、纯 CSS、Shiki 和 TipTap 都能放进去（推论）。代价：props 只能是可序列化的 JSON，经异步桥传递，每次变化都重渲染整棵 React 树；函数只能是顶层异步 prop；不能传 children，也不能在里面放原生视图；实例之间、与原生 JS 之间不共享状态；只跑标准 JavaScript，解析和启动比 Hermes 字节码慢 [6]。流式输出要么整树重渲染，要么用 Expo 自己说「可能不稳定、将来可能淘汰」的 ref 调用 [6]。Expo 建议主体用原生视图，DOM 用于富文本、Markdown 和辅助页面 [6]。T3 Code 也没有把网页聊天组件放进 DOM 组件，而是把代码高亮、diff 和终端写成了本地原生模块 [66]。
- **Capacitor 复用最多、工程最省，但键盘、长列表和 OTA 都要自己补。** 当前主版本是 Capacitor 8（2025-12-08 发布，最新 8.6.2；9.0.0-rc.0 已于 2026-11-12 发布）[14][21]。现有 React DOM 界面、TipTap、Shiki、Base UI 和 CSS 都能直接用。但键盘插件只有 iOS 上的四种 resize 模式和显隐事件 [22]；`ui-chat` 的时间线没有虚拟化 [65]；Ionic 已停售 Appflow，2027-12-31 全部下线，OTA 只能换第三方或自建 [24]；审核指南 4.2 要求应用「超出重新包装的网站」[45]。
- **原生 Swift + Kotlin、Flutter、Compose Multiplatform 都不能复用任何 TS 代码。** 89 个方法的参数要按 zod schema 重写或生成（zod 4 能用 `z.toJSONSchema()` 导出 JSON Schema，但有些类型无法表示 [71]），返回值本来就没有 schema，只能手写 [65]。原生体验和扩展集成最好（Enriched Markdown 也有 SwiftUI 和 Compose 版 [15]），但一个人要维护两套界面。Happy 2.0「作为原生 iPhone 和 iPad 应用从头重写」，仓库主语言是 Swift [62]：原生是可行的终点，但不适合第一版。Lynx 没有 `document` 和 `window`，React DOM 生态都不能用 [57]。
- **React Native 的聊天体验有现成部件。** 键盘用 react-native-keyboard-controller 1.21 起的 `KeyboardChatScrollView`：四种抬升策略（`whenAtEnd` 对应 ChatGPT 的行为，`persistent` 对应 Claude 的行为）、下滑收起、多行输入框增高时扩展滚动范围，支持 FlashList 和 LegendList [18]。长列表用 LegendList 3.7（纯 TS，`alignItemsAtEnd` 和 `maintainScrollAtEnd` 做不倒置的聊天列表）或 FlashList 2（只支持新架构，有 `startRenderingFromBottom`）[12][13]。Markdown 用 Enriched Markdown 1.2：原生文本渲染、GFM 表格、tree-sitter 代码高亮，内置流式（只把追加的尾部当新内容，未闭合的表格和代码块先扣住）[15]。也可以沿用 Shiki，但 Hermes 的文档没有列出 Shiki JS 引擎首选的 RegExp `v` 标志 [16][70]，所以要换 react-native-shiki-engine：它用 JSI 提供原生 Oniguruma，输出 token，和 `highlight.ts` 现有的 token 结构一致 [17][65]。diff 继续用纯 JS 的 `diff` 包，只重写渲染。
- **原生能力的上限由系统和账号决定，各栈只差在接入方式。** 免费账号没有推送能力，但有 App Groups、Background modes、Keychain sharing [27]。iOS 后台任务由系统调度，Android 最短 15 分钟 [61]，所有栈都不能在后台保持连接。Expo 有 `expo-widgets` 做小组件和实时活动（iOS 自 SDK 56 起稳定，SDK 58 加了 Android 小组件），实时活动的远程更新走 APNs [2][3][59]。Notification Service Extension、分享扩展和手表应用在所有栈里都是原生 target：Capacitor 和原生项目直接在 Xcode 里加；Expo 用 config plugin 加，Expo 对这种项目的扩展支持标为实验性 [60]。
- **加密：各栈都有 X25519、ChaCha20-Poly1305 和 HKDF；推送在原生扩展里解密，所以套件要选 CryptoKit 也有的。** Hermes 上可以用纯 JS 的 noble（经 Cure53 等审计，只需补 `getRandomValues`）[52]，或原生加速的 react-native-quick-crypto 1.1（X25519、Ed25519、HKDF、XChaCha20-Poly1305，`subtle` 里有 ChaCha20-Poly1305）[50]、react-native-libsodium（libsodium-wrappers 的子集）[51]。WebView 里 WebCrypto 的 X25519 和 Ed25519 自 iOS 17 起可用，Android WebView 分别从 133、137 起；WebCrypto 没有 ChaCha20-Poly1305 [26]。CryptoKit 有 Curve25519、ChaChaPoly、AES-GCM、HKDF、HPKE，没有 BLAKE2 [53]。现成的 JS Noise 库都不适合直接搬到 Hermes：`noise-handshake` 依赖 `sodium-universal`，ChainSafe 的实现绑在 libp2p 的接口上 [14]；react-native-libsodium 的 README 里没有原始 X25519（`crypto_scalarmult`）和 IETF 版 ChaCha20-Poly1305 [51]。Noise 规范只要求一组 DH、对称加密和哈希函数 [67]，所以更稳的做法是用 noble 写一份 TS 的 Noise 握手，Host（Node）和手机端（Hermes）共用（推论）。iOS 的 Notification Service Extension 是独立的原生进程，不跑应用的 JS（推论），所以套件选 `25519_ChaChaPoly_SHA256`，能让 TS 与 Swift 的 CryptoKit 共用同一组原语（推论）。原生栈可以用 Rust 的 `snow` [69]。
- **免费 Apple ID 阶段只能在 Mac 上本地签名安装，每 7 天重装一次。** 个人团队最多 10 个 App ID、3 台设备、每台 3 个应用，描述文件 7 天过期 [28]。Expo 用 `npx expo run:ios --device`，Capacitor 用 `npx cap run ios`，都在本机用 Xcode 构建 [64]；Expo Build（原 EAS Build）打 iOS 真机包要付费会员，模拟器包不需要 [29][30]。Expo Go 不能用：键盘、Markdown、加密这些库都含原生代码，keyboard-controller 的文档写明它不在 Expo Go 里 [19]。OTA：expo-updates 的协议是公开规范，可以在自己的服务器上实现并启用代码签名 [33]；托管的 Expo Update 免费档 1,000 MAU，但代码签名只在 Production（199 美元/月）及以上 [31][32]。OTA 不能延长 7 天的描述文件期限（推论）。
- **上架的主要风险不在技术栈，而在审核如何认定「远程客户端」和演示环境。** 审核指南 4.2.7 要求「镜像特定软件」的远程桌面客户端只能在局域网内连用户自己的电脑 [45]。手机端用原生界面调用电脑上的服务、不传屏幕画面，与镜像不同，但审核可能这样归类。App Store 上已有同类先例：Happy（2025-07-21 上架，扫码与桌面端配对，经中继端到端加密）和 Vicoa [62][63]。2.1 要求提供演示账号或经批准的演示模式 [45]，审核时需要一台可连的演示电脑。JS 层 OTA 的依据是许可协议 3.3.1(B)：可以下载解释执行的代码，但不能改变应用的主要用途 [46]。Google Play 的新个人账号要先跑 12 人、连续 14 天的封闭测试 [47]；Android 开发者验证 2026-09-30 先在 4 个国家生效，2027 年扩展到全球 [48]。
- **AFK agent 能在 Mac 上无人值守地跑 UI 测试；CI 上 Android 用 Linux + KVM，iOS 要 macOS runner。** Xcode 27 用 Device Hub 取代了 Simulator.app，`xcrun simctl` 仍然可以启动和控制模拟器 [2][44]。Maestro 2.12（iOS 只支持模拟器，Android 支持模拟器和真机）有 `assertScreenshot` 截图比对 [38][39][41]。agent-device（Callstack）和 Argent（Software Mansion）让 agent 读无障碍树、点击、截图、看日志；agent-device 还能把操作录成脚本在 CI 回放，或执行 Maestro YAML [36][37]。GitHub 托管的 2 vCPU Linux runner 支持 KVM 加速 Android 模拟器 [43]。Detox 官方只测到 RN 0.84，而 SDK 58 是 0.88 [42]，不宜做主力。iOS 上 Maestro 只能用文字或 `aria-label` 定位 WebView 里的元素 [40]，这对 DOM 组件和 Capacitor 不利。
- **对[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)：** 选 Expo 时要一起定下：放在 `frontend/apps/mobile`；React 版本对齐（桌面端固定 19.2.3，SDK 58 要 19.3.0 [4][65]）；把时间线逻辑拆成不含 DOM 的包；列表、Markdown、键盘三件套；原生扩展用 Swift 写。决定前做一次技术验证：用真实长会话测 React Native 时间线（Enriched Markdown + LegendList）的流式输出和滚动，同时把现有 `ChatView` 放进一个 DOM 组件对照测一次。
- **对[手机端怎么测试和验收](https://github.com/pigcode/monorepo/issues/100)：** 分三层。纯逻辑继续用 vitest；界面流程用 Maestro 在 iOS 模拟器（Mac）和 Android 模拟器（Linux + KVM）上跑，截图比对要固定机型和系统版本；真机验收在开发者的 iPhone 上手工做，因为 Maestro 不支持 iOS 真机，免费账号的包 7 天过期 [28][39]。agent 做探索性验证时用 agent-device 或 Argent，拿截图和日志当证据 [36][37]。

### 未经一手来源证实的事项

- DOM 组件的实际开销（启动、内存、流式更新）。Expo 没有公布数据 [6]。
- `@expo/dom-webview` 的 README 说它能让 DOM 组件使用 Expo 模块 [7]，DOM 组件指南却写原生模块的这项优化「尚未实现」[6]。两处说法不一致。
- Shiki 的 JS 引擎退回 `u` 标志后，能否在 Hermes 上处理 `highlight.ts` 用到的全部语言。Hermes 文档只列出 ES6、后行断言、命名捕获组和 Unicode 属性转义 [70]，Shiki 只说退回后「少数语法不支持」[16]。
- `noise-handshake` 所依赖的 `sodium-universal` 能否在 Hermes 上运行。
- Expo 托管服务（Expo Build、Expo Update）在中国大陆网络下的可达性。
- Apple 怎样把 4.2.7 和 4.2.3(i) 适用到「连自己电脑的客户端」。先例只说明这类应用能上架，不说明审核依据。
- Happy 从 React Native 改成原生的原因。
- Expo 有没有官方的手表应用支持。本次只确认了 iOS 扩展的通用机制 [60]。
- Flutter 和 Compose Multiplatform 的键盘和长列表表现，以及 Compose Multiplatform 的跨平台加密库。本次只核对了版本、稳定状态和 Flutter 的加密包。

## 1. 现有代码能复用什么

| 包 | 运行时依赖 | 规模 | React Native | DOM 组件 / Capacitor | 原生 / Flutter / KMP |
|---|---|---|---|---|---|
| `contracts` | zod 4.4.3 | 约 1,800 行 TS，89 个方法 | 直接用 | 直接用 | 不能用，要重写或生成 |
| `client-runtime` 连接层 | react、contracts | 约 1,300 行 | 直接用，传输层另写 | 直接用 | 不能用 |
| `ui-chat` 的时间线逻辑 | contracts、`diff`；另有两处运行时依赖见下 | 约 1,860 行 TS | 拆包后可用 | 直接用 | 不能用 |
| `ui-chat`、`ui-composer` 界面 | React DOM、Base UI、TipTap、lucide-react、`ui-primitives` 的 CSS | TSX 约 7,500 行；CSS 52 个文件约 13,400 行 | 重写 | 直接用，布局重做 | 重写 |
| `ui-workbench` | @xterm/xterm 6、`diff` 9 | TSX 约 3,100 行 | 重写（第一版只读 diff，不需要终端） | 直接用 | 重写 |

（行数是本次在 `54e2740` 上用 `wc -l` 数的，不含测试 [65]。）

- **`client-runtime`**：
  - package.json 声明了 `plugin-sdk` 和 `ui-primitives`，但源码里对它们只有 `import type`，打包时会被去掉 [65]。
  - 没有动态 `import()`，没有 `window`、`navigator`；`store.ts` 在没有 `requestAnimationFrame` 时退回 16 ms 定时器；`observers.ts` 的两个函数把 `document.documentElement` 当默认参数，只在不传参时求值 [65]。React Native 里不调用这两个函数即可。
  - 传输层接口是 `HostTransport { send, onMessage, close }` [65]，手机端实现一个走 WebSocket、带端到端加密的传输就能接上 `RpcClient`（推论；连接方式见 #89、#96）。
- **时间线逻辑**：`turns.ts`（406 行）、`event-parsers.ts`（311）、`markdown-blocks.ts`（237）、`file-changes.ts`（236）、`tool-fields.ts`（231）、`tool-meta.ts`（185）、`summary-groups.ts`（136）、`tool-identity.ts`（118）[65]。其中 `turns.ts` 从 `workflow-card.tsx` 引入 `collectWorkflows`，`tool-meta.ts` 引入 `lucide-react` 的图标 [65]。要在 React Native 里用，得先把这些函数移进一个只依赖 contracts 和 `diff` 的包。
- **Markdown**：`markdown-blocks.ts` 是纯 TS 的块级解析（CommonMark 和 GFM 的常用子集，未闭合的代码围栏把剩余内容当代码，适配流式），`markdown.tsx` 只产出 React DOM 元素 [65]。
- **代码高亮**：`ui-primitives/src/highlight.ts` 用 Shiki core 加 JS 正则引擎（不用 WASM），按语言懒加载，输出带 `--shiki-light`、`--shiki-dark` 样式变量的 token [65]。
- **时间线滚动**：`chat-view.tsx` 用 DOM 的 `scrollTop` 跟随到底，`ui-chat` 里没有列表虚拟化 [65]。
- **测试**：vitest；Playwright E2E 和视觉基线都跑在 ubuntu-24.04 上，基线由 `visual-baselines.yml` 生成并提交 [65]。

## 2. Expo / React Native

### 2.1 版本与架构

- Expo SDK 58 于 2026-10-15 发布，对应 React Native 0.88、React 19.3.0，面向 iOS 27 构建；最低 iOS 16.4、Android 7，要求 Xcode 26.4 以上 [1][2][4]。Expo 每年发布 3 个 SDK [4]。
- SDK 55 起完全运行在新架构上，不能关闭 [5]。SDK 56 起默认 Hermes V1；SDK 56 有一个 Hermes V1 内存回归，SDK 57 修复 [3]。
- SDK 58 新增给 agent 和 CI 用的东西：`npx expo command:ps` 和 `command:events`（实验性，机器可读的进程和事件）；`@expo/agent-cli`，其中 `smoke` 是「启动 + 截图 + 停止」；`EXPO_NO_DEV_MENU=1` 让启动链接跳过开发菜单，Expo CLI 在非交互模式下默认这样做 [2]。
- Expo 的托管服务改名：EAS Build 改叫 Expo Build，EAS Update 改叫 Expo Update，CLI 仍叫 `eas` [31]。

### 2.2 在 pnpm monorepo 里怎么放

- 放在 `frontend/apps/mobile`，现有工作区通配 `apps/*` 已经覆盖 [65]。
- SDK 52 起 Metro 自动识别 monorepo；SDK 54 起支持 pnpm 的隔离安装，遇到不兼容的库可以在 `pnpm-workspace.yaml` 里设 `nodeLinker: hoisted` [8]。SDK 55 起 monorepo 里自动启用 `autolinkingModuleResolution`，让 Metro 解析到的原生模块与 autolinking 链接的一致 [8]。
- Metro 0.82（RN 0.79）起默认支持 `exports` [9]，`"exports": { ".": "./src/index.ts" }` 能被解析，源码由 Metro 编译（推论；Expo 的 monorepo 指南示例就是直接引用工作区包 [8]）。限制：命中 `exports` 的路径不再展开 `.ios.tsx`、`.native.tsx` 这类平台后缀 [9]，平台差异要用 `Platform.select()` 或单独的入口。
- **React 版本**：同一个 App 里有两份 React 会在运行时报错 [8]。桌面端固定 react 19.2.3，SDK 58 要求 19.3.0 [4][65]。工作区包对 react 是 peer 依赖，Metro 按真实路径解析时可能找到桌面那一份（推论）。要么全仓库对齐到 SDK 要求的版本，要么在 Metro 里把 `react` 固定解析到手机 App 的那一份。
- Node：SDK 58 要求 22.13 以上 [2]，仓库要求 22.18 以上 [65]，兼容。
- 原生目录：Expo 推荐由 prebuild 生成 `ios/`、`android/`（Continuous Native Generation）[2]；要加 Swift 扩展时写 config plugin [60]。

### 2.3 DOM 组件（`'use dom'`）

- **机制**：文件顶部写 `'use dom'` 后，这个模块在原生端被替换成一个代理，背后是一个加载单页网页包的 WebView；只做客户端渲染，没有 SSR [6]。SDK 56 起默认用 `@expo/dom-webview`，不再需要 `react-native-webview`，也可以用 `dom={{ useExpoDOMWebView: false }}` 换回去 [3][6]。
- **能用什么**：React、TypeScript、CSS 和 Metro 的其他功能都可用；有 Fast Refresh，日志转发到终端，开发时可以用 Safari 检查；release 构建用 `file://` 加载，默认是安全上下文 [6]。Expo 的富文本指南也把 WebView 里的编辑器列为可选方案，并点名 TipTap 的 WebView 封装 TenTap [20]。所以 Base UI、`ui-primitives` 的 CSS、Shiki 的 JS 引擎和 TipTap 都能放进去（推论）。
- **数据怎么进出** [6]：
  - props 只能是可序列化的值（数字、字符串、布尔、null、数组、对象），经异步桥传递，作为根组件的 props，每次变化都重渲染整棵 React 树；
  - 函数只能作为顶层 prop，总是异步，参数和返回值必须可序列化；
  - 原生调用 DOM 里的方法用 `useDOMImperativeHandle`，Expo 说这种回调方式「可能不稳定，将来新版 React 可能淘汰」，推荐用 native action 回传数据。
- **限制** [6]：不能传 children；不能在 DOM 组件里放原生视图；多个实例不共享数据；全局状态不能跨 JS 引擎访问；只跑标准 JavaScript，解析和启动比 Hermes 字节码慢；`public` 目录的资源不支持 Expo Update。
- **对 Pigcode 意味着什么**（推论）：
  - 整个会话页放进一个 DOM 组件时，`client-runtime` 的 `AppStore` 在原生一侧，每个流式增量都要序列化并整树重渲染；改成在 WebView 里另开一条连接，则加密密钥要经 native action 从 Keychain 取出，状态在两个 JS 引擎里各有一份。
  - 输入框是原生的、时间线在 WebView 里，原生的 `KeyboardChatScrollView` 管不到 WebView 内部的滚动；输入框也放进 WebView，就回到了网页里处理移动端键盘的老问题。
  - 适合放进 DOM 组件的是独立、少更新的块，例如一张很宽的表格、一段长 diff 的全屏查看。

### 2.4 长时间线、Markdown、代码高亮、diff

- **列表**：
  - FlashList 2.3.3（2026-10-01）只支持新架构；`maintainVisibleContentPosition` 默认开启，`startRenderingFromBottom` 让首屏从底部开始，`autoscrollToBottomThreshold` 控制靠近底部时自动跟随，`onStartReached` 用来加载更早的内容 [12][14]。
  - LegendList 3.7.3（2026-11-17）纯 TS、无原生依赖；`alignItemsAtEnd`、`maintainScrollAtEnd`（可以只在追加数据时跟随）、`maintainVisibleContentPosition`，聊天不需要倒置列表；同一个包也有 React DOM 版（`@legendapp/list/react`）[13][14]。桌面端以后给时间线加虚拟化时，两端可以用同一套列表语义（推论）。
- **Markdown**：
  - Enriched Markdown（Software Mansion）1.2.0（2026-11-12）：用 md4c 解析，用 iOS 的 TextKit、Android 的 TextView 绘制，原生文本的选择、无障碍和字号缩放都照常工作；支持 GFM 表格、任务列表、LaTeX；代码块用 tree-sitter 高亮；需要新架构 [14][15]。
  - 流式：打开 `streaming` 后按长度把追加的尾部当新内容，未写完的表格、代码块、公式先扣住或修补；也可以传一个 `stream` 对象逐块 append，不触发 React 重渲染；它假设只追加，整段替换（重试、重新生成）时动画会错位 [15]。Pigcode 的流式增量是追加文本，符合这个假设（推论）。
  - 它还有独立的 SwiftUI 和 Jetpack Compose SDK [15]，Expo 的富文本指南首推的也是它 [20]。
- **代码高亮**：
  - Shiki 的 JS 引擎优先用 RegExp `v` 标志（ES2024），环境不支持时退回 `u` 标志，少数语法会不支持 [16]。WKWebView 自 iOS 17、Android WebView 自 112 起支持 `v` 标志 [26]，所以 DOM 组件和 Capacitor 里照常用。Hermes 的文档只列出 ES6 全部语法、ES9 后行断言、命名捕获组和 Unicode 属性转义（2024 年加入，默认开启），没有 `v` 标志 [70]。
  - react-native-shiki-engine 用 JSI 和 C++ TurboModule 提供原生 Oniguruma，需要新架构，用 `codeToTokensBase` 同步取 token [17]。`highlight.ts` 本来就输出 token [65]，渲染改成嵌套的 `<Text>` 即可（推论）。
  - 也可以直接用 Enriched Markdown 内置的 tree-sitter 高亮 [15]。
- **diff**：`file-changes.ts` 用 `diff` 包的 `structuredPatch` 算行级差异 [65]，这是纯 JS（推论：能在 Hermes 上跑）；渲染部分重写。

### 2.5 键盘和输入框

- Expo 文档建议复杂的键盘交互用 react-native-keyboard-controller；它依赖 Reanimated，不在 Expo Go 里 [19]。Android 上 Expo 应用是 edge-to-edge，窗口不再随键盘缩小 [19]。
- 1.21（2026-03-16）新增 `KeyboardChatScrollView` [18]：
  - `keyboardLiftBehavior` 四种：`always`（Telegram、WhatsApp）、`whenAtEnd`（ChatGPT）、`persistent`（Claude）、`never`（Perplexity）；
  - `KeyboardGestureArea` 配合 `keyboardDismissMode="interactive"` 实现下滑收起键盘；
  - `extraContentPadding` 处理多行输入框增高；
  - `freeze` 在切到表情面板或底部弹层时冻结布局；
  - 可以与 FlashList、LegendList 一起用。
- 输入框：现在的 TipTap 输入框支持 `@` 引用会话、`/` 命令、`$` Skill [65]。React Native 里可以用 `TextInput` 加触发词检测和候选列表，或者用 Enriched Markdown 的富文本输入（支持 mention）[15]。TipTap 本身只能放在 WebView 里（TenTap 或 DOM 组件）[20]。
- 手势和导航：Expo Router 的 `Stack` 和 `NativeTabs` 用系统自己的导航栏和标签栏，SDK 58 起标为稳定 [2]。
- 深色模式：各候选都由系统外观接口提供，本次没有逐一核对文档。

### 2.6 原生能力

- 推送：`expo-notifications`。SDK 58 起 iOS 上能与别的推送库共存，支持用 `threadIdentifier` 分组 [2]。推送通道和自用阶段的限制见 #88、#98。
- 后台：`expo-background-task` 底层是 WorkManager 和 BGTaskScheduler；Android 最短间隔 15 分钟，iOS 由系统决定、短间隔常被忽略，模拟器上不可用 [61]。不能靠它保持连接。
- 小组件和实时活动：`expo-widgets` 用 Expo UI（iOS 上是 SwiftUI，Android 上是 Compose）写界面；iOS 自 SDK 56 起稳定，SDK 58 加了 Android 小组件 [2][3]；需要 App Group（免费账号可以用 [27]）；实时活动要远程更新时打开 `enablePushNotifications`，走 APNs [59]，而免费账号没有推送能力 [27]。
- 扩展：由 prebuild 生成原生目录的项目用 config plugin 加 Xcode target，Expo Build 对这类项目的扩展支持标为实验性 [60]。Notification Service Extension、分享扩展都要用 Swift 写。
- Siri 和快捷指令：SDK 58 的 `expo-app-intents`（alpha）[2]。

### 2.7 构建、安装和 OTA

- 本地构建：`npx expo run:ios` 加 `--device` 可以选连接着的真机 [64]，在本机用 Xcode 签名。
- Expo Build：免费档每月 15 次 Android 和 15 次 iOS 构建，低优先级队列，单次 45 分钟超时 [31]；iOS 真机的内部分发走 ad hoc，需要付费会员 [30]；iOS 模拟器包和 Android APK 不需要商店会员 [29]。
- OTA：
  - Expo Update 免费档 1,000 MAU [31]；端到端代码签名只在 Production 和 Enterprise 档 [32]。
  - expo-updates 的协议有公开规范，写明面向「想自己管理更新服务器的组织」；客户端可以要求服务器签名清单，并用打包进 App 的证书验签 [33]。Expo 的示例服务器只是演示，不保证能用于生产 [34]。
  - 所以自用阶段可以在开发者的云服务器上自建更新服务（推论；服务器的可达性见 #89）。

### 2.8 先例

- **T3 Code**：GitHub 上 `pingdotgg/t3code` 的 `apps/mobile/package.json`（main 分支）[66]：
  - 包名 `@t3tools/mobile`，依赖 `expo` 58.0.23、`react-native` 0.88.1；
  - 直接依赖工作区包 `@t3tools/contracts`、`@t3tools/client-runtime`、`@t3tools/shared`（`workspace:*`）；
  - 列表 `@legendapp/list`，Markdown 是定制构建的 `react-native-enriched-markdown` 1.2.0，键盘 `react-native-keyboard-controller` 1.23.0，另外还依赖 `react-native-webview` 14.0.1；
  - 代码高亮、review diff、源码文本、终端是 `modules/` 下的四个本地原生模块。
  
  它没有把网页聊天组件放进 DOM 组件，而是把难做的部分做成原生模块。
- **Happy**：App Store 的更新说明写着 Happy 2.0「作为原生 iPhone 和 iPad 应用从头重写」，`slopus/happy` 仓库的主语言是 Swift [62]。改写的原因没有公开，未经一手来源证实。

## 3. Capacitor

- **版本**：v8 为当前主版本，2025-12-08 发布，最低 iOS 15、Android 7（API 24），要求 Node 22、Xcode 26 [21]。npm 上最新 8.6.2（2026-11-12），同日发布 9.0.0-rc.0 [14]。v7 的扩展支持到 2026-12-08 结束 [21]。
- **复用**：现有 React DOM 界面、TipTap、Shiki、Base UI 和 CSS 都能直接运行，外壳和布局要按手机重做（推论）。工程上是一个 Vite 网页应用加 `ios/`、`android/` 两个原生工程，`npx cap run ios` 构建 [64]；工作区 TS 源码包的用法与桌面端相同（推论）。
- **安全上下文**：`server.hostname` 默认 `localhost`，文档建议保持，以便使用需要安全上下文的 Web API；iOS 默认 `capacitor://` 方案，Android 默认 `https` [23]。
- **键盘**：`@capacitor/keyboard` 提供 iOS 上的 `native`、`body`、`ionic`、`none` 四种 resize 模式、隐藏 iOS 的 accessory bar，以及 `keyboardWillShow` 等事件；Android 上 `keyboardWillShow` 和 `keyboardDidShow` 几乎同时触发 [22]。没有聊天场景的交互式收起、输入框增高这类部件，要在网页里自己做（推论）。
- **长列表**：`ui-chat` 没有虚拟化 [65]，长会话要加；LegendList 的 React DOM 版可以用 [13]。
- **原生能力**：官方推送插件 `@capacitor/push-notifications` 8.1.3 [14]。原生工程由开发者自己维护，扩展直接在 Xcode 里加 target（推论）。
- **OTA**：Ionic 2025-02-11 起停售 Appflow 等商业产品，Appflow 全部服务 2027-12-31 下线 [24]。Ionic 帮助中心列出的替代品是 Capawesome Cloud、Capgo、HotCodePush [24]；Capawesome 的插件支持 Capacitor 8 [25]。
- **审核**：4.2 要求应用的功能、内容和界面「超出重新包装的网站」[45]。界面打包在 App 里、有原生推送和扩展的应用不属于网页壳（推论），但风险比原生界面高。

## 4. 原生 SwiftUI + Jetpack Compose

- **复用**：不能复用 TS。89 个方法的参数要重写或从 zod schema 生成，返回值没有 schema [65]，只能手写模型。zod 4 的 `z.toJSONSchema()` 能把 schema 转成 JSON Schema 再交给代码生成器，但 `bigint`、`symbol` 等类型没有对应，转换会报错或要另行处理 [71]。
- **体验和能力**：最好。ActivityKit、WidgetKit、分享扩展、watchOS 都是一等公民。Markdown 可以用 Enriched Markdown 的 SwiftUI 和 Compose SDK [15]。
- **加密**：CryptoKit 和 Tink，见第 6 节。
- **测试**：Compose 可以用 Paparazzi 在 JVM 上渲染截图，不需要设备或模拟器 [58]；Roborazzi 基于 Robolectric 在 JVM 上截图 [58]。iOS 的界面测试要在 macOS 上用模拟器。
- **成本**：一个人维护两套界面和两套模型。Happy 2.0「作为原生 iPhone 和 iPad 应用从头重写」，GitHub 仓库主语言是 Swift [62]，说明有团队最终走到这一步。

## 5. 其他方案

- **Flutter**：稳定版 3.50.1（2026-11-20），Dart 3.14.0 [55]。不能复用 TS。flutter.dev 发布的 `flutter_markdown` 已标为停止维护，由 `flutter_markdown_plus` 接替 [55]。加密可以用 `cryptography` 2.9.0（AES、ChaCha20、Ed25519 等）或 `sodium_libs` 4.0.1（libsodium 二进制）[72]。`matchesGoldenFile` 在 widget 测试里把渲染结果和基线图比对 [68]。
- **Compose Multiplatform**：iOS 版自 1.8.0（2025-05-06）起稳定 [56]；最新 1.12.2（2026-10-15），支持 iOS 14 以上 [41][56]。用 Kotlin 写一套界面，可以嵌入 SwiftUI 和 UIKit 视图 [56]。不能复用 TS。
- **Lynx**：最新 4.2.0（2026-10-27）[41]。ReactLynx 基于 Preact，API 与 React 相同，但用 `view`、`text` 这类自己的元素，没有 `document` 和 `window`，依赖它们的库都不能用 [57]。现有 React DOM 组件、Base UI、TipTap 都用不了，又没有 React Native 的生态，不值得考虑。
- **Tauri 2**：也是 WebView 方案（CLI 最新 2.12.6）[41]，和 Capacitor 同类，但原生一侧是 Rust。对这个 TS 仓库没有额外好处（推论）。

## 6. 加密

| 栈 | X25519、Ed25519 | AEAD | 哈希、KDF | 随机数 |
|---|---|---|---|---|
| Expo（Hermes） | noble-curves [52]；react-native-quick-crypto [50]；react-native-libsodium（子集）[51] | noble-ciphers：ChaCha20-Poly1305、XChaCha20-Poly1305、AES-GCM [52]；quick-crypto [50]；expo-crypto 只有 AES-GCM [49] | noble-hashes；quick-crypto 的 HKDF [50]；expo-crypto 的摘要 [49] | expo-crypto 或 react-native-get-random-values [49][52] |
| DOM 组件、Capacitor（WebView） | WebCrypto：iOS 17 起；Android WebView X25519 从 133、Ed25519 从 137 起 [26]；noble | WebCrypto 有 AES-GCM，没有 ChaCha20-Poly1305 [26]；ChaCha 用 noble | WebCrypto 的 HKDF、SHA-256 | `crypto.getRandomValues` |
| 原生 iOS | CryptoKit `Curve25519` [53] | `ChaChaPoly`、`AES.GCM` [53] | SHA-2、HKDF、HPKE [53] | 系统 |
| 原生 Android | Tink 有 Ed25519 签名和 HPKE，列表里没有单独的 X25519 密钥协商 [54] | Tink（Java）：AES-GCM、ChaCha20-Poly1305、XChaCha20-Poly1305 [54] | HKDF-SHA2 [54] | 系统 |

- react-native-quick-crypto 1.1.10（2026-11-17）用 Nitro Modules，要求新架构和 RN 0.75 以上 [14][50]。它的实现清单里有 `x25519` 的 `diffieHellman` 和密钥对、`ed25519`、HKDF、`xchacha20-poly1305`，`subtle` 里有 AES-GCM 和 ChaCha20-Poly1305 [50]。
- react-native-libsodium 1.7.0（2026-02-09）与 libsodium-wrappers 的 API 一致，但只实现了一部分，支持 Expo 的 config plugin 和开发构建 [14][51]。
- noble 系列（2.4.0，2026-08-27）是纯 JS，curves 经过 Cure53（2024-09）、Trail of Bits（2023-01）等审计；React Native 上要补一个 `getRandomValues` [14][52]。
- **推送解密**：iOS 的 Notification Service Extension 是独立的扩展进程，不运行应用的 JS（推论），解密推送要用 Swift 和 CryptoKit。所以端到端加密的原语最好都在 CryptoKit 里：X25519、ChaCha20-Poly1305 或 AES-GCM、SHA-256 和 HKDF [53]。CryptoKit 里没有 BLAKE2 [53]，Noise 的 BLAKE 套件不合适（推论）。

### 6.1 Noise 实现

连接方式的调研倾向在所有路线上共用一个 Noise 握手（IK，配对后可用 KK），所以这里只看各栈能用哪份实现。

- Noise 规范（Revision 34）只要求三组函数：DH、对称加密、哈希；内置的选项是 25519 和 448，ChaChaPoly 和 AESGCM，SHA256、SHA512、BLAKE2s 和 BLAKE2b [67]。
- 现成的 JS 实现 [14]：
  - `noise-handshake` 4.2.1（2026-11-09），依赖 `sodium-universal`。它在 Hermes 上能否运行，未经一手来源证实。
  - `@chainsafe/libp2p-noise` 17.0.0（2025-09-25），密码学用 noble，但依赖 libp2p 的接口和 peer-id 等包，不是独立的 Noise 库。
  - `noise-protocol` 3.0.2 停在 2023-01-12，依赖 `sodium-universal` 和 BLAKE2b。
- react-native-libsodium 的 README 列出的函数有 `crypto_aead_xchacha20poly1305_ietf_*`、`crypto_box_*`、`crypto_sign_*`、`crypto_kdf_hkdf_sha256_*`、`crypto_generichash` 等，没有原始 X25519 的 `crypto_scalarmult` 和 IETF 版 ChaCha20-Poly1305 [51]，不够实现标准 Noise（推论）。
- 推荐（推论）：用 noble 的 `x25519`、`chacha20poly1305`、`sha256`/`hkdf` 写一份 TS 的 Noise 握手和传输状态，Host（跑在 Electron 的 utilityProcess 里）和手机端（Hermes）共用同一份代码和同一套测试向量；性能不够时把底层原语换成 react-native-quick-crypto [50]。
- 原生栈：Rust 的 `snow` 0.10.0 是纯 Rust 的 Noise 实现 [69]，可以通过 FFI 给 Swift 和 Kotlin 用（推论）；Swift 一侧也可以直接用 CryptoKit 的原语实现。

## 7. 开发、安装和上架

- **免费 Apple ID**（所有栈相同）：个人团队最多注册 10 个 App ID、3 台设备，都是 7 天过期；每台设备最多装 3 个应用；描述文件 7 天过期，过期后要重新构建安装 [28]。免费账号可用 App Groups、Background modes、Data protection、Keychain sharing 等，不能用 Push notifications、Associated domains、Time Sensitive Notifications、Network extensions [27]。
- **各栈怎么装到 iPhone**：Expo `npx expo run:ios --device`，Capacitor `npx cap run ios`，都调用本机 Xcode [64]；原生、Flutter、Compose Multiplatform 也都经 Xcode 签名（推论）。Expo Build 的 iOS 真机包要付费会员 [30]。
- **OTA**：

| 栈 | 方式 | 自建 | 备注 |
|---|---|---|---|
| Expo | expo-updates | 按公开协议在自己的服务器上实现，支持签名 [33] | 托管版免费 1,000 MAU，签名要 Production 档 [31][32] |
| Capacitor | 第三方插件 | Capawesome、Capgo、HotCodePush [24] | Appflow 2027-12-31 下线 [24] |
| 原生、Compose Multiplatform | 无 JS 层 OTA | — | 每次改动都要过审核（推论） |

- **App Store**：
  - 2.5.2：应用不能下载、安装或执行会引入或改变功能的代码 [45]。许可协议 3.3.1(B)：解释执行的代码可以下载，但不能改变应用的主要用途、不能绕过签名和沙箱、不能在 App Store 应用里做应用商店 [46]。JS 层 OTA 以此为依据。
  - 4.7 允许应用提供不在二进制里的 HTML5/JS 小程序、插件等，开发者为其负责 [45]。以后如果手机端要运行电脑上插件提供的界面，属于这一条（推论）。
  - 4.2.7（远程桌面客户端）：镜像特定软件或服务的远程桌面应用，只能连用户自己的个人电脑或游戏机，而且两端要在同一个局域网 [45]。
  - 4.2.3(i)：应用应该能独立工作，不要求先安装另一个应用 [45]。
  - 2.1：提交时要提供演示账号并保持后端在线；无法提供时，经 Apple 事先批准可以内置演示模式 [45]。
  - 先例：Happy 在 App Store 的介绍写明扫 Happy Desktop 的二维码配对，Agent 和代码留在用户自己的电脑上，与电脑之间端到端加密，2025-07-21 上架 [62][63]；Vicoa 2025-09-16 上架 [63]。
- **Google Play**：2023-11-13 之后创建的个人开发者账号，要先跑至少 12 名测试者、连续 14 天的封闭测试，才能申请正式发布 [47]。一次性注册费 25 美元 [29]。Android 开发者验证 2026-09-30 先在巴西、印度尼西亚、新加坡、泰国生效，2027 年扩展到全球；面向学生和爱好者的受限分发账号可以分发到最多 20 台设备 [48]。

## 8. 自动化测试和视觉回归

- **开发者的 Mac 上**：
  - iOS 模拟器：Xcode 27 用 Device Hub 取代了 Simulator.app [2]，`simctl` 的说明改为「控制 Device Hub 里的模拟设备」，仍然从命令行启动模拟器 [44]。Expo 文档的 CI 示例就是用 `xcrun simctl boot`、`bootstatus`、`install` [35]。
  - Maestro CLI 2.12.1（2026-11-02）[41]：iOS 只支持模拟器，Android 支持模拟器和真机 [39]；2.2.0 起有 `assertScreenshot`，默认 95% 相似度阈值，可以用 `cropOn` 只比某个元素，失败时生成差异图 [38]。
  - agent-device（Callstack，MIT）：读无障碍快照、点击、输入、截图、录屏、看日志和网络请求，把一次操作录成 `.ad` 脚本在 CI 回放，也能执行 Maestro YAML；支持真机，但要做配对和签名设置 [37]。
  - Argent（Software Mansion）：通过 MCP 让 agent 控制、调试、分析模拟器上的应用，只支持模拟器 [36]。
  - Expo 文档里的 e2e 框架基于 agent-device，测试可以混用精确步骤和自然语言步骤，后者第一次调用模型、之后回放缓存 [35]。
- **CI 上**：
  - Android：GitHub 托管的 2 vCPU Linux runner 自 2024-04-02 起支持 KVM 硬件加速 [43]，可以无头跑 Android 模拟器和 Maestro。
  - iOS：要 macOS runner。Expo Workflows 也提供 macOS 和 Linux 机器，Maestro 任务只在付费档 [31]。
- **Detox**：最新 20.51.3（2026-05-30）[41]，官方兼容 RN 0.77 到 0.84 [42]，跟不上 SDK 58 的 0.88。
- **WebView 里的元素**：Maestro 2.9.0 改进了 Android WebView 里 React 等单页应用的读取 [40]；iOS 上 WKWebView 不把 HTML 的 `id` 映射成无障碍标识，只能用文字或 `aria-label` 定位，相关 issue 仍开着 [40]。
- **视觉回归**：
  - React Native：用 Maestro 的 `assertScreenshot`，基线要固定模拟器机型和系统版本（推论）。
  - DOM 组件、Capacitor：网页部分可以继续用现有的 Playwright 视觉基线流程（ubuntu-24.04）[65]；它渲染的是 Linux 上的浏览器，不等于 iPhone 上的 WKWebView（推论）。
  - 原生 Android：Paparazzi、Roborazzi 在 JVM 上截图，不需要模拟器 [58]。
- **真机**：Maestro 不支持 iOS 真机 [39]；免费账号的包 7 天过期 [28]。开发者 iPhone 上的验收以手工为主，或者花功夫给 agent-device 配真机 [37]。

## 9. 对比表

1 到 5 分，5 最好。分数是本次根据上文来源做的判断，不是测量结果。Flutter 和 Compose Multiplatform 的体验类分数没有核对文档，只作参考。

| 维度 | Expo 原生界面 | Expo + DOM 组件承载时间线 | Capacitor 8 | SwiftUI + Compose | Flutter | Compose Multiplatform |
|---|---|---|---|---|---|---|
| 复用现有 TS | 3 | 4 | 5 | 1 | 1 | 1 |
| monorepo 工程 | 4 | 3 | 5 | 2 | 2 | 2 |
| 键盘和输入框 | 5 | 2 | 2 | 5 | 3 | 3 |
| 长时间线流式渲染 | 4 | 2 | 3 | 5 | 4 | 4 |
| 原生能力和扩展 | 4 | 4 | 3 | 5 | 3 | 3 |
| 加密库 | 4 | 4 | 4 | 5 | 3 | 3 |
| OTA | 5 | 4 | 3 | 1 | 2 | 1 |
| 上架风险 | 4 | 4 | 3 | 4 | 4 | 4 |
| AFK 自动化测试 | 5 | 3 | 4 | 4 | 4 | 3 |
| 视觉回归 | 3 | 4 | 5 | 4 | 4 | 3 |
| 一人加 agent 的维护成本 | 4 | 3 | 4 | 1 | 2 | 2 |
| **合计（满分 55）** | **45** | **37** | **41** | **37** | **32** | **29** |

## 10. 对决策票的含义

- **[手机端技术栈](https://github.com/pigcode/monorepo/issues/95)**：
  - 首选 Expo 原生界面，备选 Capacitor。DOM 组件不做主体，只给个别块兜底。
  - 选 Expo 要同时定：`frontend/apps/mobile` 的位置；React 版本对齐；把 `ui-chat` 的时间线逻辑拆成不含 DOM 的包；Enriched Markdown、LegendList 或 FlashList、keyboard-controller 三件套；推送解密、分享、小组件这些扩展用 Swift 写、用 config plugin 接入。
  - 地图里的「技术验证」应该回答：真实长会话（几千个事件、流式输出）在 React Native 时间线上的滚动和更新是否流畅；同一个 `ChatView` 放进 DOM 组件或 Capacitor 的 WebView 时，首屏、内存和流式更新的开销是多少。
  - 加密套件和推送解密要在[配对、设备身份与加密](https://github.com/pigcode/monorepo/issues/97)里与 CryptoKit 对齐。
- **[手机端怎么测试和验收](https://github.com/pigcode/monorepo/issues/100)**：
  - 第一层：纯逻辑（拆出来的时间线、协议、加密）用 vitest，在 Linux 上跑。
  - 第二层：界面流程用 Maestro。Android 模拟器在 Linux CI 上开 KVM 跑；iOS 模拟器在开发者的 Mac 或 macOS runner 上跑；截图比对固定机型、系统版本和字体。
  - 第三层：真机。开发者的 iPhone 上手工验收，每 7 天重装时顺带回归。
  - agent 做探索性验证时用 agent-device 或 Argent，产出截图和日志；能稳定复现的步骤再固化成 Maestro 流程。
  - 不选 Detox。

## 参考来源

所有来源的访问日期都是 2026-11-21。

1. Expo, Changelog: https://expo.dev/changelog
2. Expo, Expo SDK 58（2026-10-15）: https://expo.dev/changelog/sdk-58
3. Expo, Expo SDK 56: https://expo.dev/changelog/sdk-56
4. Expo, Expo SDK reference（SDK 与 React Native、React、Node、iOS、Android 版本对应表）: https://docs.expo.dev/versions/latest/
5. Expo, React Native's New Architecture: https://docs.expo.dev/guides/new-architecture/
6. Expo, Using React DOM in Expo native apps（DOM 组件）: https://docs.expo.dev/guides/dom-components/
7. Expo 源码, `@expo/dom-webview` README: https://github.com/expo/expo/blob/main/packages/%40expo/dom-webview/README.md
8. Expo, Work with monorepos: https://docs.expo.dev/guides/monorepos/
9. Metro, Package Exports Support: https://metrobundler.dev/docs/package-exports/
10. Expo, metro.config.js（CSS 一节）: https://docs.expo.dev/versions/latest/config/metro/
11. zod：PR #4368（`jitless`）https://github.com/colinhacks/zod/pull/4368 ；PR #4466（Hermes 问题，3.25.24 修复）https://github.com/colinhacks/zod/pull/4466 ；issue #4690（3.25.64 修复）https://github.com/colinhacks/zod/issues/4690 ；PR #5864（4.4 合入）https://github.com/colinhacks/zod/pull/5864
12. Shopify, FlashList 文档: https://shopify.github.io/flash-list/docs/ ，Usage: https://shopify.github.io/flash-list/docs/usage
13. Legend List README: https://github.com/LegendApp/legend-list
14. npm registry（版本和发布时间）: https://registry.npmjs.org/ 下的 `@shopify/flash-list`、`@legendapp/list`、`react-native-enriched-markdown`、`react-native-quick-crypto`、`react-native-libsodium`、`@noble/curves`、`@noble/ciphers`、`@noble/hashes`、`react-native-get-random-values`、`@capacitor/core`、`@capacitor/keyboard`、`@capacitor/push-notifications`、`@capgo/capacitor-updater`、`@expo/dom-webview`、`noise-handshake`、`@chainsafe/libp2p-noise`、`noise-protocol`（后三个看的是最新版的 `dependencies`）
15. Software Mansion, Enriched Markdown README: https://github.com/software-mansion/react-native-enriched-markdown ；Markdown streaming: https://docs.swmansion.com/enriched-markdown/rich-text-formatting/markdown-streaming/ ；EnrichedMarkdownText API: https://docs.swmansion.com/enriched-markdown/react-native/api-reference/enriched-markdown-text/
16. Shiki, RegExp Engines: https://shiki.style/guide/regex-engines
17. react-native-shiki-engine README: https://github.com/skiniks/react-native-shiki-engine
18. react-native-keyboard-controller：Building a chat app https://kirillzyusko.github.io/react-native-keyboard-controller/docs/guides/building-chat-app ；KeyboardChatScrollView https://kirillzyusko.github.io/react-native-keyboard-controller/docs/api/components/keyboard-chat-scroll-view ；Version 1.21（2026-03-16）https://kirillzyusko.github.io/react-native-keyboard-controller/blog/chat-scroll-view
19. Expo, Keyboard handling: https://docs.expo.dev/guides/keyboard-handling/
20. Expo, Edit rich text: https://docs.expo.dev/guides/editing-richtext/
21. Capacitor, Support Policy: https://capacitorjs.com/docs/main/reference/support-policy
22. Capacitor, Keyboard Capacitor Plugin API: https://capacitorjs.com/docs/apis/keyboard
23. Capacitor, Configuration（`server.hostname`、`iosScheme`、`androidScheme`）: https://capacitorjs.com/docs/config
24. Ionic, Important Announcement: The Future of Ionic's Commercial Products（2025-02-11）: https://ionic.io/blog/important-announcement-the-future-of-ionics-commercial-products ；Ionic Help Center, Native Builds and Live Updates（2026-11-12）: https://ionic.zendesk.com/hc/en-us/articles/29907381079831-Native-Builds-and-Live-Updates
25. Capawesome, Capacitor Live Update Plugin: https://capawesome.io/docs/sdks/capacitor/live-update/
26. MDN browser-compat-data 8.1.10（2026-11-19），`api.SubtleCrypto` 下的 `x25519`、`ed25519` 条目和 `javascript.builtins.RegExp.unicodeSets`: https://github.com/mdn/browser-compat-data ；MDN, SubtleCrypto.deriveBits(): https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveBits
27. Apple, Supported capabilities (iOS): https://developer.apple.com/help/account/reference/supported-capabilities-ios
28. Apple, Developer account overview: https://developer.apple.com/help/account/basics/about-your-developer-account/
29. Expo, Create your first build: https://docs.expo.dev/build/setup/
30. Expo, Internal distribution: https://docs.expo.dev/build/internal-distribution/
31. Expo, Expo Services pricing: https://expo.dev/pricing
32. Expo, End-to-end code signing with Expo Update: https://docs.expo.dev/eas-update/code-signing/
33. Expo, Expo Updates v1（协议规范）: https://docs.expo.dev/technical-specs/expo-updates-1/
34. expo/custom-expo-updates-server README: https://github.com/expo/custom-expo-updates-server
35. Expo, Using e2e: https://docs.expo.dev/guides/using-e2e/
36. Expo, Argent and Expo: https://docs.expo.dev/agents/argent/
37. Expo, agent-device and Expo: https://docs.expo.dev/agents/agent-device/
38. Maestro, assertScreenshot: https://docs.maestro.dev/reference/commands-available/assertscreenshot ；Introducing Visual Testing in Maestro（2026-03-02）: https://maestro.dev/blog/visual-testing
39. Maestro, Supported platforms: https://docs.maestro.dev/get-started/supported-platform
40. Maestro CLI 2.9.0（2026-08-31）: https://maestro.dev/blog/maestro-cli-2-9-0 ；Maestro issue #2293（iOS WebView 里的 id）: https://github.com/mobile-dev-inc/Maestro/issues/2293
41. GitHub Releases API（latest release）: mobile-dev-inc/Maestro、wix/Detox、software-mansion/argent、pointfreeco/swift-snapshot-testing、cashapp/paparazzi、takahirom/roborazzi、JetBrains/compose-multiplatform、lynx-family/lynx、tauri-apps/tauri，形如 https://api.github.com/repos/mobile-dev-inc/Maestro/releases/latest
42. Detox README（Supported React Native Versions）: https://github.com/wix/Detox/blob/master/README.md
43. GitHub Changelog, Hardware accelerated Android virtualization now available（2024-04-02）: https://github.blog/changelog/2024-04-02-github-actions-hardware-accelerated-android-virtualization-now-available/ ；GitHub-hosted runners reference: https://docs.github.com/en/actions/reference/runners/github-hosted-runners
44. Apple, Xcode command-line tool reference: https://developer.apple.com/documentation/xcode/xcode-command-line-tool-reference ；Interacting with devices using the command line: https://developer.apple.com/documentation/xcode/interacting-with-devices-using-the-command-line ；Xcode 27 Release Notes: https://developer.apple.com/documentation/xcode-release-notes/xcode-27-release-notes
45. Apple, App Store Review Guidelines（2.1、2.5.2、4.2、4.2.3、4.2.7、4.7）: https://developer.apple.com/app-store/review/guidelines/
46. Apple, Apple Developer Program License Agreement（§3.3.1(B) Executable Code）: https://developer.apple.com/support/terms/apple-developer-program-license-agreement/
47. Google, App testing requirements for new personal developer accounts: https://support.google.com/googleplay/android-developer/answer/14151465
48. Android Developers, Android developer verification: https://developer.android.com/developer-verification
49. Expo, Crypto（expo-crypto）: https://docs.expo.dev/versions/latest/sdk/crypto/
50. react-native-quick-crypto README: https://github.com/margelo/react-native-quick-crypto ；Implementation coverage: https://github.com/margelo/react-native-quick-crypto/blob/main/.docs/implementation-coverage.md
51. react-native-libsodium README: https://github.com/serenity-kit/react-native-libsodium
52. noble-curves README: https://github.com/paulmillr/noble-curves ；noble-ciphers README: https://github.com/paulmillr/noble-ciphers
53. Apple, Apple CryptoKit: https://developer.apple.com/documentation/cryptokit
54. Google, Tink: Key types supported by language: https://developers.google.com/tink/supported-key-types
55. Flutter 发布清单: https://storage.googleapis.com/flutter_infra_release/releases/releases_macos.json ；pub.dev, flutter_markdown: https://pub.dev/packages/flutter_markdown
56. JetBrains, Compose Multiplatform 1.8.0 Released（2025-05）: https://blog.jetbrains.com/kotlin/2025/05/compose-multiplatform-1-8-0-released-compose-multiplatform-for-ios-is-stable-and-production-ready/ ；Compatibility and versions: https://kotlinlang.org/docs/multiplatform/compose-compatibility-and-versioning.html
57. Lynx, What is ReactLynx?: https://lynxjs.org/react/introduction.html
58. Paparazzi README: https://github.com/cashapp/paparazzi ；Roborazzi README: https://github.com/takahirom/roborazzi
59. Expo, Widgets（expo-widgets）: https://docs.expo.dev/versions/latest/sdk/widgets/
60. Expo, iOS App Extensions: https://docs.expo.dev/build-reference/app-extensions/
61. Expo, BackgroundTask: https://docs.expo.dev/versions/latest/sdk/background-task/
62. App Store, Happy: Codex & Claude Code App: https://apps.apple.com/us/app/happy-codex-claude-code-app/id6748571505 ；Happy, Claude Code Mobile App: https://happy.engineering/mobile-app/ ；GitHub API, slopus/happy: https://api.github.com/repos/slopus/happy
63. iTunes Search API（`term=claude code`）: https://itunes.apple.com/search?term=claude+code&entity=software&country=us
64. Expo, Local app development: https://docs.expo.dev/guides/local-app-development/ ；Capacitor, iOS: https://capacitorjs.com/docs/ios
65. 本地代码：pigcode/frontend `54e2740`，`packages/contracts`、`packages/client-runtime`、`packages/ui-chat`、`packages/ui-composer`、`packages/ui-primitives`、`packages/ui-workbench` 的 package.json 和源码，`.github/workflows/`。这不是公开来源。
66. T3 Code, `apps/mobile/package.json`（main 分支）: https://github.com/pingdotgg/t3code/blob/main/apps/mobile/package.json ；`packages/` 目录: https://github.com/pingdotgg/t3code/tree/main/packages
67. Trevor Perrin, The Noise Protocol Framework, Revision 34（2018-07-11）: https://noiseprotocol.org/noise.html
68. Flutter API, matchesGoldenFile: https://api.flutter.dev/flutter/flutter_test/matchesGoldenFile.html
69. crates.io, snow: https://crates.io/crates/snow
70. Hermes, doc/RegExp.md（Supported Syntax）: https://github.com/facebook/hermes/blob/main/doc/RegExp.md ；PR #1295（Unicode 属性转义）: https://github.com/facebook/hermes/pull/1295
71. zod, JSON Schema: https://zod.dev/json-schema
72. pub.dev, cryptography: https://pub.dev/packages/cryptography ；sodium_libs: https://pub.dev/packages/sodium_libs
