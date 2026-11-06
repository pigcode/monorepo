# 在 pigcode/pigcode 推 tag 发版，先出草稿再人工发布

推 `vX.Y.Z` 这样的 tag 到 pigcode/pigcode，release workflow 在三个平台上打包、跑冒烟测试，然后建一个 GitHub Release 草稿。人检查后手动点发布。tag 和 `apps/desktop/package.json` 的版本不一致时，workflow 直接失败。

代码都在 frontend，所以 tag 和 Release 都放在这里。聚合仓库不打 tag，发版后照常更新 submodule 指针。

版本号用 semver：内部包是 `0.x`，第一个公开版本是 `1.0.0`（ADR 0007），预发布写成 `1.0.0-beta.1`，对应的 Release 标记为 prerelease。内部测试包手动运行 workflow 产出，只留 Actions artifact，不建 Release。

## Considered Options

- 合并 release PR 触发：要多维护一套生成 PR 的工具，现在只有一个人发版。
- 只用手动运行 workflow：版本和提交的对应关系只留在运行记录里，不如 tag 好查。
- 打完包自动发布：安装包一发出去，用户就可能开始更新，撤回很难。草稿多一步人工，但出错的代价小得多。

## Consequences

- 仓库转公开（ADR 0008）之后，标准 runner 的 Actions 免费，发版不再受额度限制；私有仓库时期 macOS runner 按 10 倍计费的问题消失了。
- 发版前要先改 `apps/desktop/package.json`，再打 tag。
