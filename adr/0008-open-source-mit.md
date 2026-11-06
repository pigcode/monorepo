# 源码公开，用 MIT 许可证

pigcode/pigcode（代码）、pigcode/monorepo（聚合仓库与 issue）、pigcode/docs 三个仓库都公开，都用 MIT 许可证。不另建只放安装包的发布仓库。版权方写 `Pigcode contributors`，这样不用在许可证里写个人姓名，以后有别人贡献代码也不用改。

仓库现在还是私有的。这里定的是方向，什么时候转公开单独决定，因为转了之后，已有的提交历史就算撤回也可能已被别人保存。

## Considered Options

- GPL-3.0 或 AGPL-3.0：能要求别人公开改动，但会挡住想用公司代码写插件的人，也不符合 Cordis 和 dsh 这些上游的做法。
- Apache-2.0：多一条专利授权，但条款更长；个人项目用不上这部分。
- 源码私有，另建公开仓库放安装包：仍然要付私有仓库的 CI 费用，还要多维护一个仓库。

## Consequences

- MIT 只管我们自己写的代码，**不等于安装包里的所有东西都是 MIT**。`packages/agent-claude` 依赖的 `@anthropic-ai/claude-agent-sdk` 不是开源软件（`© Anthropic PBC. All rights reserved`，受 Anthropic 的条款约束），而且构建时被打进了 `out/host/plugins/agent-claude/index.mjs`，所以安装包会带上它。源码仓库只写了依赖版本，不受影响。发布安装包之前要确认 Anthropic 的条款是否允许这样分发；不允许就要改成不打包，由用户自己安装。
- 安装包里还没有放 LICENSE 和第三方声明，架构文档 §15 要求保留 Cordis 和 dsh 的 MIT 声明。怎么收集和放在哪里，记在 #7 里。
- 转公开之前要检查三个仓库的完整历史，包括 pigcode/pigcode 的 `archive/*` 分支。转公开之后，这些分支和提交都能被任何人读到。- 转公开之后，标准 runner 上的 Actions 不再收费，GitHub Release 也可以作为下载源和更新源。大陆访问是否稳定仍然要在 #14 里决定。
