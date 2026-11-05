# v1.0 的下载和更新只用 GitHub Release

安装包和更新文件都放在 pigcode/frontend 的 GitHub Release 上，不做 ICP 备案，不用大陆 CDN，应用里也不写换源逻辑。这放宽了之前「下载源和更新源要在中国大陆稳定可用」的要求：大陆用户可能下载慢或下载失败。

## Considered Options

- 现在就做备案和大陆 CDN：备案主体要在大陆，要有一台大陆服务器，流程约 1–5 周，CDN 流量每月约 33–431 元（按 1,000–10,000 次下载估算），另加服务器费用。v1.0 还没有用户数据能说明值不值。
- 用 Cloudflare R2 或 CloudFront 这类境外节点做镜像：同样不需要备案，但大陆访问没有一手数据，多一处要维护，也不一定比 GitHub 好。

## Consequences

- 没有费用。下载页是 `https://github.com/pigcode/frontend/releases/latest`，不需要域名。
- 仓库要先转公开（ADR 0008）才能发布，私有仓库的 Release 匿名访问不到。
- 大陆用户的实际下载情况没有测过，发布后要看反馈。如果确实下载不了，再做镜像：`latest*.yml` 里的文件地址是相对路径，同一套文件可以原样上传到别处，发布流程不用重做，只要在应用里加上换源。
