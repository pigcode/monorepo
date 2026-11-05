# 以个人名义发布，v1.0 先用未签名的安装包

发布主体用个人，不申请公司主体。v1.0 的安装包不做代码签名：不注册 Apple Developer Program，不买 Windows 证书，macOS 不公证。

## Considered Options

- 先做签名再发布：Apple 组织账号要邓白氏编码，证书和云签名都要几周，而且 macOS 和 Windows 的自动更新都绑定签名身份，主体以后再换会影响已安装的用户。先不定签名，把主体和产品标识留到真正公开分发之前。
- 现在就定团队 ID 和证书：没有 Apple 账号就无从谈起，反而挡住内部包和冒烟测试。

## Consequences

- macOS 用户第一次打开要右键→打开（Gatekeeper）；Windows 会弹 SmartScreen，要「更多信息→仍要运行」。
- **macOS 上的自动更新用不了**：electron-updater 依赖签名来校验新版本，未签名的应用接不了。内部包只能覆盖安装。Windows 和 Linux 不受这条影响。
- 下载源、更新源、发版流程这些决定仍然要做，只是不再受签名主体牵制。
- 第一次公开发布之前要重新确认主体和标识：以后换 Team ID 或证书，已安装的用户可能收不到更新。
