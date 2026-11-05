# 产品版本只有一个来源：apps/desktop/package.json

版本号以前散在四处：`apps/desktop/package.json` 是 `0.0.0`，设置页文案、`HOST_VERSION`、MCP 的 serverInfo 和 Codex 的 clientInfo 各写死一个 `0.1.0`。现在只维护 `apps/desktop/package.json` 的 `version`，构建时注入其余地方：`scripts/build-host.ts` 和 `electron.vite.config.ts` 把 `__PIGCODE_VERSION__` 替换成这个值，`vitest.config.ts` 用同一个值，所以测试里看到的版本和打包出来的一致。设置页的版本经主进程 `app.getVersion()` 和 preload 送到界面。

## Considered Options

- 每个包各自维护版本：`@pigcode/ui-chat` 之类的内部包版本没有对外含义，多维护一份就多一处会走样。
- 发版时用脚本批量改：仍然要记得跑；构建时注入不会忘。
- 让 Host 读环境变量里的版本：多一处传递，且单元测试和渲染进程拿不到。

## Consequences

- `HOST_VERSION` 是构建产物里的常量；`engines.pigcode` 的范围按它校验。没有注入时（直接跑源码的零星脚本）回退到 `0.0.0-dev`，这个值不会出现在发布产物里。
- 第一次公开发布前把 `apps/desktop/package.json` 改成 `1.0.0`；内部包可以一直是 `0.0.0`。
- 内部测试包和正式版共用同一套版本号，区分靠渠道（未签名、构建来源），不靠版本后缀。
- 发版的触发方式（打 tag、手动 workflow、release PR）还没定，属于 #16 剩下的一半。
