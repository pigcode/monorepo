# 以个人名义发布，v1.0 先用未签名的安装包

发布主体用个人，不申请公司主体。v1.0 的安装包不做代码签名：不注册 Apple Developer Program，不买 Windows 证书，macOS 不公证。

## Considered Options

- 先做签名再发布：Apple 组织账号要邓白氏编码，证书和云签名都要几周，而且 macOS 和 Windows 的自动更新都绑定签名身份，主体以后再换会影响已安装的用户。先不定签名，把主体和产品标识留到真正公开分发之前。
- 现在就定团队 ID 和证书：没有 Apple 账号就无从谈起，反而挡住内部包和冒烟测试。

## Consequences

- macOS 用户第一次打开要右键→打开（Gatekeeper）；Windows 会弹 SmartScreen，要「更多信息→仍要运行」。
- **macOS 走不了 electron-updater**：它依赖签名来校验新版本，未签名的应用接不了。改用应用内下载完整的 DMG 再交给系统打开，用户把 Pigcode 拖进「应用程序」完成替换（见下面的「更新」）。Windows 和 Linux 不受这条影响。
- 下载源、更新源、发版流程这些决定仍然要做，只是不再受签名主体牵制。
- 第一次公开发布之前要重新确认主体和标识：以后换 Team ID 或证书，已安装的用户可能收不到更新。
- 打包先用 `com.pigcode.desktop` 作 appId、`Pigcode` 作 productName；这两个值会进入 bundle id、AppUserModelID 和 userData 目录，公开分发前要确认。

## 标识（2026-11-06 确认）

- `appId`：`com.pigcode.desktop`，`productName`：`Pigcode`，都沿用上面的临时值。
- 发布者显示名称：`pigcode`（`apps/desktop/package.json` 的 `author.name`，Windows 安装程序的发布者、Linux deb 的 maintainer 都用它）。
- 应用图标：小猪简笔，源文件 `apps/desktop/build/icon.svg`，三个平台格式由 `scripts/build-icons.ts` 生成。
- **许可证的版权方仍是 `Pigcode contributors`，与发布者显示名不同**：前者是法律声明，用中性写法，将来有别人贡献代码不用改（ADR 0008）；后者是产品对外显示的名字。
- 没有产品域名，下载页用 GitHub Release（ADR 0010）。
- `app.setName("Pigcode")`：Electron 默认拿 package.json 的 `name`（`@pigcode/desktop`）当应用名，userData 会落在带 scope 的目录里。统一成 `Pigcode` 后数据在 `~/Library/Application Support/Pigcode`，和 `productName` 一致。改目录等于换用户数据的位置，以后不要再动。

## 更新（2026-11-06）

未签名不影响「能更新」，只影响「能不能自动装」：

- Windows、AppImage：electron-updater 后台下载，退出时装。
- macOS：应用按 `process.arch` 从 Release 附件里挑 DMG，下载到 `userData/update-downloads/`，问过用户后交给系统打开。用户把 Pigcode 拖进「应用程序」替换旧版本；数据在上面那个目录里，不受影响。
- deb 等：只打开下载页。

下载或打开失败都退回下载页。判断逻辑在 `apps/desktop/src/main/update-mode.ts`，整条链路由 `apps/desktop/e2e/packaged-update.spec.ts` 在打包产物上验证。

