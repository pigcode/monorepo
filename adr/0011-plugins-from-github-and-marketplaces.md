# 插件从 GitHub 和插件市场安装，agent 创建的插件走本地市场

参照 ZCode 的插件市场：插件市场是一个列出插件的目录文件（`.pigcode-plugin/marketplace.json` 或 `marketplace.json`），来源可以是 GitHub 仓库、git 仓库、https 上的目录文件、本地文件夹或文件。GitHub 仓库由 Host 直接下载 tar.gz 归档并在进程里解开，不依赖系统里的 git 和 pnpm；私有仓库、SSH 地址和其他 git 服务才交给系统 git 浅克隆。安装界面也可以直接填 `owner/repo`（可带分支、子目录）装单个插件。装好的插件在 `plugins.yml` 里记下来源，「更新」按来源重新安装，保留配置和启停状态。「创建插件」不让 agent 直接安装，而是开一个新会话，输入框里预填开头并附上 Pigcode 插件创建指南；agent 把纯 JavaScript 的插件和市场目录文件写进项目的 `plugins/`，用户在插件页把这个文件夹添加为插件市场再安装。

## Considered Options

- 继续只靠 `pnpm add`（它也认 `owner/repo`）：打包后的应用不带 pnpm，用户机器上没有 pnpm 时 GitHub 安装用不了；git 依赖还要系统 git。
- 兼容 Claude Code 的插件市场：ZCode 的插件就是 Claude Code 插件（技能、命令、hooks、MCP），Pigcode 的插件是带 Host / 界面入口的 npm 包，格式不同，装不进来。识别到 `.claude-plugin/marketplace.json` 时只说明原因。
- 让 agent 通过 MCP 工具直接安装它写的插件：少一步操作，但插件以 Host 权限运行，由模型自己装上不安全；ZCode 也收敛成「交付源码和本地市场，由用户在界面里添加和安装」。

## Consequences

- 下载走 Electron 的 `net.fetch`（utility 进程里可用，跟随系统代理与证书），测试里退回全局 fetch；归档最大 50 MB、解开最大 200 MB，链接文件跳过，路径不能跳出目标目录。环境变量 `GITHUB_TOKEN` / `GH_TOKEN` 有值时带上令牌。
- 远程市场添加和刷新时缓存进 profile 的 `marketplaces/<id>/`，刷新失败保留上一次的内容；本地文件夹每次直接读，改了插件刷新一下就能看到。删除市场不卸载从它装的插件，这些插件不能再从市场更新。
- 添加市场前必须勾选风险确认，勾选只属于这一次打开。
- 创建指南让 agent 写纯 JavaScript（ES module）、不构建、不带依赖，和 ADR 0006「插件按构建好的包装」一致：这样写出来的插件打包后的应用也能直接装。
- 没有官方插件市场；插件页在没有市场时说明市场是什么，并给出添加市场、从 GitHub 安装和创建插件三个入口。
