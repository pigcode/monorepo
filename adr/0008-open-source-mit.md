# 源码公开，用 MIT 许可证

pigcode/pigcode（代码）、pigcode/monorepo（聚合仓库与 issue）、pigcode/docs 三个仓库都公开，都用 MIT 许可证。不另建只放安装包的发布仓库。版权方写 `Pigcode contributors`，这样不用在许可证里写个人姓名，以后有别人贡献代码也不用改。

三个仓库已于 2026-11-06 转为公开，之前对完整历史（含 `archive/*` 分支）做过一遍密钥扫描，没有命中。

## Considered Options

- GPL-3.0 或 AGPL-3.0：能要求别人公开改动，但会挡住想用公司代码写插件的人，也不符合 Cordis 和 dsh 这些上游的做法。
- Apache-2.0：多一条专利授权，但条款更长；个人项目用不上这部分。
- 源码私有，另建公开仓库放安装包：仍然要付私有仓库的 CI 费用，还要多维护一个仓库。

## Consequences

- MIT 只管我们自己写的代码，**不等于安装包里的所有东西都是 MIT**。`packages/agent-claude` 依赖的 `@anthropic-ai/claude-agent-sdk` 不是开源软件（`© Anthropic PBC. All rights reserved`，受 Anthropic 的条款约束），而且构建时被打进了 `out/host/plugins/agent-claude/index.mjs`，所以安装包会带上它。源码仓库只写了依赖版本，不受影响。发布安装包之前要确认 Anthropic 的条款是否允许这样分发；不允许就要改成不打包，由用户自己安装。
- 安装包里的 LICENSE 和第三方声明由 `scripts/notices.ts` 生成（`pnpm notices`，打包脚本会自动跑），输出 `apps/desktop/build/THIRD_PARTY_NOTICES.txt`，作为 extraResources 进安装包。Cordis、dsh 和 Anthropic SDK 的声明都在里面。
- 转公开之后，标准 runner 上的 Actions 不再收费，GitHub Release 同时是下载源和更新源。
