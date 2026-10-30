# 安装包和 electron-updater 更新源托管调研（pigcode/pigcode#13）

调研日期：2026-10-30。所有价格均为官方刊例价（按量付费），不含资源包、活动价和代金券。来源编号见文末“来源”。

## 1. 结论

- **私有仓库的 GitHub Releases 不能作为面向普通用户的更新源。** electron-updater 访问私有仓库需要在用户机器上设置 `GH_TOKEN`，官方文档写明这种方式“only for very special cases — not intended and not suitable for all users”[1]。2026-10-30 匿名请求 `github.com/pigcode/pigcode/releases.atom` 返回 404（见来源 [55]）。如果要用 GitHub，必须是公开仓库，或者另建一个只放安装包的公开仓库。
- **要用中国大陆的 CDN 节点或大陆地域的 bucket 自定义域名，必须先有 ICP 备案的域名。** 阿里云 OSS、阿里云 CDN、腾讯云 CDN、腾讯云 EdgeOne 的文档都写明了这一点 [13][18][24][28]。各家的默认域名都不适合正式分发：七牛测试域名 30 天回收且禁止下载 exe/dmg [31]；阿里云 2025-03-20 之后新开通的用户不能通过默认域名访问大陆 bucket 的数据 [14]；腾讯云 2024-01-01 之后新建的桶，默认域名强制下载、禁止 apk/ipa [19]。
- **ICP 备案的主体必须是中国大陆的个人或单位，并且需要一台符合条件的大陆云资源。** 以腾讯云为例，需要包年包月购买至少 3 个月的云服务器或轻量服务器，COS 和 CDN 不在可用于备案的资源列表里 [34]。时长为接入商初审 1–2 个工作日，加管局审核不超过 20 个工作日 [32]，网站开通后 30 日内还要做公安联网备案 [37]。个人备案每单只能备案 1 个网站，且网站内容要与主体性质一致 [35][36]。
- **不备案时只能用境外节点**（Cloudflare R2、AWS CloudFront、阿里云/腾讯云的“境外加速”、香港 bucket）。大陆用户访问这些节点的速度和稳定性没有一手测量数据。Cloudflare 的文档和一篇 AWS 员工在 AWS Builder Center 发的文章都说，跨境访问存在延迟和可靠性问题 [42][53]。AWS 的大陆 CloudFront（宁夏）2026-09-30 起不再接收新客户，2027-05-31 停止服务 [54]；Cloudflare 的 China Network 只对 Enterprise 客户开放，并且同样要求 ICP [42]。
- **流量费用在这个量级都不高。** 按 150 MB/次、每月 1,000 和 10,000 次全量下载，流量约为 146 GB 和 1,465 GB。大陆 CDN 约 33–42 元和 330–431 元每月；Cloudflare R2 出网免费，约 0 美元；CloudFront 按量付费约 0 美元和 38–53 美元，或固定价 Pro 套餐 15 美元/月；GitHub 公开仓库免费。备案所需的服务器费用未计入（见第 6 节）。
- **electron-updater 一次只用一个更新源，但应用可以在运行时换源。** 打包时只有 `publish` 列表里的第一个 provider 写进 `app-update.yml` [2]。运行时可以调用 `autoUpdater.setFeedURL(...)`，或者直接用参数构造 `NsisUpdater`/`MacUpdater`/`AppImageUpdater` [1][4]。按地区选源、失败后回退到第二个源，都要在应用代码里自己写，库里没有内置的多源回退 [4]。
- **同一套更新文件可以原样上传到多个镜像。** `latest*.yml` 里的文件地址是相对文件名，electron-updater 按当前 feed 的地址解析 [4][6]。所以“大陆 CDN + 海外 R2”两个镜像都用 `generic` provider 时，只需把相同的文件传到两个目录。
- **Linux 的 AppImage、deb、rpm、pacman 都支持自动更新** [1]。deb/rpm 靠安装包里的 `resources/package-type` 文件识别，安装时用 pkexec/sudo 提权，不支持差分下载 [4][6]。AppImage 和 Windows NSIS 支持差分下载。macOS 必须签名，并且必须同时产出 zip；从 DMG 安装后的第一次更新是全量下载 [1][4]。

## 2. electron-updater

### 2.1 版本

npm 上 `electron-updater` 的 `latest` 标签是 6.8.11（2026-10-20 发布），`electron-builder` 是 26.18.0；`next` 标签是 7.0.0-alpha / 27.0.0-alpha [4]。官网文档 v26 对应当前稳定版，v27 标注为未发布 [1]。下文的源码结论基于 6.8.11 的 npm 包，个别地方对照了 master 分支。

### 2.2 支持的 provider

- 文档列出的内置 provider：GitHub Releases、Amazon S3、DigitalOcean Spaces、Keygen、generic HTTP(S) 服务器 [1]。`publish` 文档还列出 Bitbucket、GitLab、Snap Store，以及自定义 provider [2]。
- 6.8.11 的 `providerFactory.js` 实际处理的值是 `github`、`bitbucket`、`gitlab`、`keygen`、`s3`、`spaces`、`generic`、`custom` [4]。master 分支多了 `r2`，和 `s3`/`spaces` 一样转成 generic provider，稳定版还没有 [5]。
- `s3` 和 `spaces` 在客户端都转成 `GenericProvider`，只是按 bucket 配置拼出 URL，并且关闭多段 Range 请求 [4]。客户端下载不需要 S3 凭证，bucket 需要公开读。
- `custom` provider 要求传入 `updateProvider` 构造函数（一个继承 `Provider` 的类）[4][7]。
- 用 generic provider 时，“you have to upload the built application and metadata files yourself” [2]，electron-builder 不负责上传。

### 2.3 每个平台需要上传的文件

文件由 electron-builder 生成。需要上传到更新源的文件如下（依据文档 [1] 和 app-builder-lib 26.18.0 源码 [6]）：

| 平台 | 更新元数据 | 更新用的安装包 | 差分用文件 | 说明 |
|---|---|---|---|---|
| macOS arm64 + x64 | `latest-mac.yml`（两个架构合并在一个文件里） | 每个架构一个 `.zip` | 每个 zip 一个 `.zip.blockmap` | “`zip` target for macOS is required for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created” [1]；DMG 只用于首次安装，dmg-builder 也会生成 `.dmg.blockmap`，更新流程不用它 [6]。应用必须签名才能自动更新 [1]。 |
| Windows x64 | `latest.yml` | NSIS `.exe` | `.exe.blockmap` | 不支持 Squirrel.Windows [1]。 |
| Linux x64 | `latest-linux.yml`（AppImage 和 deb 的条目在同一个文件里） | `.AppImage`、`.deb` | AppImage 的 blockmap 嵌在文件内部，无单独文件；deb 无差分 | arm64 会用 `latest-linux-arm64.yml` [4][6]。 |

补充细节：

- macOS 客户端按文件名里是否含 `arm64` 来挑选架构 [4]，所以 arm64 的 zip 文件名必须带 `arm64`。
- `latest*.yml` 中每个文件的 `url` 是文件名本身（`path.basename`），客户端用当前 feed 地址拼出完整 URL [4][6]。
- 差分下载时，客户端把新文件 URL 中的新版本号替换成当前版本号，去拿旧版本的 `.blockmap` [4]。服务器上要保留上一版本（最好是最近几个版本）的 blockmap，否则差分失败后回退为全量下载 [4]。
- generic provider 请求 `latest*.yml` 时会附加 `noCache=<时间戳>` 查询参数（请求头里有 Authorization 时除外）[4]。如果 CDN 配置为忽略查询参数缓存，要给 `.yml` 设置很短的缓存时间，或者每次发布后刷新 CDN。

### 2.4 差分下载在各平台的实际效果

- Windows NSIS：安装程序会把自己复制到更新缓存目录（`APP_INSTALLER_STORE_FILE`），所以从第一次更新起就能差分 [6]。
- macOS：差分需要缓存目录里有上一次更新留下的 `update.zip`；首次安装后找不到时，日志是“Unable to locate previous update.zip for differential download (is this first install?), falling back to full download” [4]。
- AppImage：用当前运行的 AppImage 文件（`APPIMAGE` 环境变量）做旧文件，可以差分 [4]。
- deb、rpm、pacman：直接全量下载安装包，没有差分 [4]。

### 2.5 私有 GitHub 仓库能否做更新源

- 文档：“You can use a private repository for updates with electron-updater by setting the `GH_TOKEN` environment variable (on user machine) and `private` option.” 同时说明“Private GitHub provider only for very special cases — not intended and not suitable for all users.” GitHub API 限额为每用户每小时 5000 次，一次检查最多用 3 次请求 [1]。
- 源码：`private: true` 时从环境变量 `GH_TOKEN`/`GITHUB_TOKEN` 取 token，也可以在配置里直接写 `token`；有 token 就走 `api.github.com`，请求头带 `authorization: token ...` [4]。
- 推论（非文档原话）：要让所有用户都能更新，就得把一个能读这个私有仓库的 token 随应用分发出去，等于把仓库读权限交给所有用户。加上 5000 次/小时/用户的 API 限额是按 token 所属用户计算的 [10]，用户多时同一个 token 会很快用完额度。
- 公开仓库的 GitHub provider 不走 API：它读取 `github.com/<owner>/<repo>/releases.atom` 和 `github.com/<owner>/<repo>/releases/latest`，代码注释写着“do not use API for GitHub to avoid limit” [4]。

### 2.6 多个更新源、运行时换源

- 打包配置：`publish` 可以是数组，“Order is important — first item will be used as a default auto-update server.”；“Auto update relies only on the first provider in the list (you can specify several publishers).” [2]。也就是说 electron-builder 可以同时上传到多个地方，但写进应用的只有第一个。
- 运行时换源：`AppUpdater.setFeedURL(options)` 是公开方法，源码注释是“If you want to override configuration in the `app-update.yml`”；传字符串时当作 generic URL，传对象时按 provider 创建客户端 [4]。文档的正常流程写的是“Do not call `setFeedURL`”，因为 `app-update.yml` 会自动生成；同一页给出了直接 `new NsisUpdater({ provider: 'generic', url: ... })` 的写法，用于需要更多控制的场景 [1]。
- 回退：库里没有“主源失败就换备源”的逻辑。generic provider 只在 `ECONNREFUSED` 时对同一地址重试 3 次 [4]。下载阶段使用的是检查更新时选定的 provider [4]，所以换源后要重新调用 `checkForUpdates()`。
- 可行做法：应用启动时按自己的规则（例如系统时区/语言，或者先探测大陆域名是否可达）调用 `setFeedURL({ provider: 'generic', url })`；`checkForUpdates()` 或 `downloadUpdate()` 报错时，换成另一个 URL 再检查一次。这部分是应用代码，需要自己测试。
- 另一条路是写 `custom` provider，在 provider 内部实现多地址回退 [4][7]。

### 2.7 Linux 各格式的自动更新

- 文档列出的可自动更新目标：“Linux: AppImage, DEB, Pacman and RPM.” [1]。API 页面写的是“Linux (AppImage, rpm, deb)” [3]。
- 客户端识别方式：Linux 默认用 `AppImageUpdater`；如果 `resources/package-type` 文件存在且内容是 `deb`、`rpm`、`pacman`，换成对应的 Updater [4]。这个文件由 electron-builder 在构建 deb/rpm/pacman 且配置了 publish 时写入 [6]。
- deb 安装：优先 `dpkg -i`，失败后 `apt-get install -f -y`；用 apt 时带 `--allow-unauthenticated` [4]。
- rpm 安装：依次尝试 zypper、dnf、yum、rpm，带 `--nogpgcheck` 或 `--allow-unsigned-rpm` [4]。
- 提权：依次查找 gksudo、kdesudo、pkexec、beesu，都没有时用 sudo [4]。也就是说 deb/rpm 更新时用户会看到系统密码框。

## 3. GitHub Releases

### 3.1 限制

- 单个文件“must be under 2 GiB”；每个 release 最多 1000 个文件；“There is no limit on the total size of a release, nor bandwidth usage.” [8]
- 带宽没有固定上限，但《可接受使用政策》第 9 节写明：带宽用量“significantly excessive in relation to other users of similar features”时，GitHub 可以“suspend your Account, throttle your file hosting, or otherwise limit your activity” [11]。门槛没有公开。
- 公开仓库的下载地址 `github.com/<owner>/<repo>/releases/download/<tag>/<file>` 会 302 跳转到 `release-assets.githubusercontent.com`（2026-10-30 实测）[55]。所以客户端要能同时访问 `github.com` 和 `release-assets.githubusercontent.com`。

### 3.2 私有仓库

- GitHub 文档写的是“Anyone with read access to a repository can view and compare releases” [8]。私有仓库的 release 文件要通过 REST API `GET /repos/{owner}/{repo}/releases/assets/{asset_id}` 加 `Accept: application/octet-stream` 下载，并带上认证 [9]。
- 2026-10-30 匿名请求 `https://github.com/pigcode/pigcode/releases.atom` 和 `/releases/latest` 都返回 404 [55]。公开 GitHub provider 正是读这两个地址 [4]，所以仓库保持私有时，公开 provider 不能用。
- 私有 provider 的问题见 2.5 节：token 要随应用分发，API 限额 5000 次/小时，按 token 所属用户计算 [1][10]。
- GitHub Free 组织可以有无限个私有仓库，但功能有限（“limited feature set”）[12]。本次没有查到 Free 组织私有仓库的 release 功能是否另有限制。

### 3.3 源码保持私有时的做法

electron-builder 的 GitHub provider 配置里 `owner` 和 `repo` 是独立字段 [7]，可以指向另一个仓库。所以源码仓库保持私有、另建一个只放安装包的公开仓库（例如 `pigcode/releases`），在技术上可行。CI 需要一个对该仓库有写权限的 token 来上传。这是对配置项的推论，本次没有实际搭建验证。

### 3.4 中国大陆访问

没有找到 GitHub 或任何官方机构发布的大陆访问质量数据。

经验判断，无一手来源：大陆用户访问 `github.com` 和 `*.githubusercontent.com` 的速度和成功率随运营商、地区和时段变化很大，下载 150 MB 文件经常很慢或中断，不能当作大陆用户唯一的下载渠道。

## 4. 中国大陆对象存储和 CDN

### 4.1 ICP 备案是硬门槛

各家文档的原话：

- 阿里云 OSS：“若Bucket位于中国内地，绑定的域名必须完成ICP备案。”“若Bucket位于非中国内地节点（如中国香港、新加坡等），绑定的自定义域名无需ICP备案。” [13]
- 阿里云 CDN：“如果加速区域选择的是仅中国内地或者全球，则加速域名必须已完成备案。” [18]
- 腾讯云 CDN：“加速区域选择为中国境内或全球时，需要先完成 ICP 备案” [24]；“如果加速区域为境外，域名可以不需要备案” [25]。
- 腾讯云 EdgeOne：“未 ICP 备案域名，加速区域不可选全球可用区或中国大陆可用区，仅可选择全球可用区（不含中国大陆）。” [28]
- 腾讯云 COS 自定义源站域名：“请确保输入的域名已 备案”，并且“如果只是做过 App 备案无法接入” [21]。这一页没有区分大陆和境外地域。
- 七牛：本次没有找到七牛官方说明自定义域名备案要求的页面。七牛测试域名的规则见 4.2 节。

腾讯云 CDN 选“全球”加速时，“一般情况下中国境内节点服务境内用户，境外节点服务境外用户” [27]。也就是说，一个已备案域名开全球加速，就能同时覆盖大陆和海外用户。

### 4.2 默认域名的限制

- 阿里云 OSS：自 2025-03-20 起新开通 OSS 的用户，通过默认公网 Endpoint 访问中国内地地域 Bucket 的数据类 API 会被拒绝，返回 `PublicEndpointForbidden`，“如需继续通过公网调用此类API，必须使用自定义域名” [14]。即使是老用户，默认域名访问也会被强制加上 `Content-Disposition: attachment` [13]。
- 腾讯云 COS：2024-01-01 之后创建的存储桶，默认域名（含静态网站域名和全球加速域名）下所有文件都不能预览而是直接下载；`.apk`、`.ipa` 返回 403 `DownloadForbidden` [19]。通知里没有提到 exe 和 dmg [19]，也就是说按现行文字，exe/dmg 仍能从默认域名下载。但这和阿里云一样不适合长期依赖，这一点是推论。
- 七牛：测试域名“生命周期为30个自然日”，到期自动回收；每天回源流量限 10 GB；“自2020年2月14日起所有测试域名将禁止下载应用程序(apk、ipa、exe、dmg等)”；不在 SLA 范围内 [31]。

结论：在大陆三家服务商上正式分发安装包，都需要一个已备案的自定义域名。

### 4.3 ICP 备案的要求和时长

以下以腾讯云文档为主。阿里云的备案流程页面只是目录，正文没有读到 [56]，所以没有逐条核对阿里云的要求。

**域名**（需同时满足）[38]：

- 在注册有效期内；
- 后缀是工信部批复的后缀；
- 实名认证完成后约三天才会同步到工信部，建议等三天再提交；
- 实名信息要和备案主体一致（个人比对姓名和证件，单位比对单位名称或法定代表人）；
- “境外注册商所注册的域名不能直接备案”，要先转到国内注册商。

**云资源**（腾讯云）[34]：

- 云服务器或轻量应用服务器：中国境内地域，包年包月，购买 3 个月及以上，备案时剩余有效期不少于 1 个月，绑定境内公网 IP（不能用 EIP），带宽不为 0。香港和境外服务器不能用于备案。
- 也可以购买云函数资源包（5000 万次调用和 40 万 GBs），每个账号只能买 1 个，可以备案 2 个网站。
- COS 不在列表里。CDN 和 EdgeOne 也不在列表里，但“域名在工信部已有 ICP 备案号，且在腾讯云仅使用 CDN/EO、WAF、高防 IP 等产品，ICP 备案信息不强制要求接入腾讯云” [34]。用 COS 作为 CDN 源站时，目前也不强制在腾讯云接入备案 [26]。

**主体**：

- 个人：账号实名要和备案主体一致；每单最多 1 个网站，每个网站 1 个域名 [35]。建议选证件所在省份；选其他省份时，部分管局要求居住证明 [35][36]。
- 单位：省份和单位证件一致；每单最多 10 个网站 [35]。需要营业执照等单位证件和法定代表人信息 [33]。
- 各省管局有附加要求。以贵州为例：网站开通后内容要“与主体性质保持一致”，首页底部挂备案号并链接到工信部网站；个人不能办论坛博客类网站 [36]。
- 备案制度只适用于非经营性互联网信息服务；“经营性 ICP 许可证需要您自行到归属管局部门进行办理” [33]。Pigcode 如果在网站上直接收费，是否需要经营许可证，本次没有调研。

**时长** [32]：

1. 腾讯云初审：1–2 个工作日；
2. 工信部短信核验：收到短信后 24 小时内完成；
3. 管局审核：“不超过20个工作日”。

加上域名实名同步的约 3 天 [38]，从准备好材料到拿到备案号，大约是 1 到 5 周（这是按上面数字推算的，不是官方给出的总时长）。拿到备案号、网站开通后 30 日内，还要做公安联网备案 [37]。

**经验判断，无一手来源**：个人主体备案一个用于分发软件产品的网站，部分管局会以“内容与个人性质不符”为由驳回，各省尺度不同。如果发布主体会是公司，用公司主体备案更稳妥。

**APP 备案**：腾讯云的 APP 备案 FAQ 依据的是《工业和信息化部关于开展移动互联网应用程序备案工作的通知》，举例都是安卓、iOS 等平台，没有提到 Windows/macOS 桌面软件 [39]。桌面 Electron 应用是否需要做 APP 备案，本次没有找到明确的一手说明，需要另行确认。

### 4.4 价格

只列本次从官方页面读到的数字。价格都是人民币，按量付费。

**阿里云**

- CDN 中国内地下行流量，按月阶梯累进：0–10 TB 0.24 元/GB；10–50 TB 0.23；50–100 TB 0.21；100 TB–1 PB 0.18；1 PB 以上 0.15 [17]。
- CDN 境外：北美、欧洲 0–50 TB 0.46 元/GB；亚太 1 区 0.58；亚太 2 区 0.78；亚太 3 区 0.69 [17]。页面没有说明各区包含哪些国家和地区。
- 上面两项页面都注明“for reference only”，以官网价格页为准 [17]。阿里云价格页是动态加载的，本次没有读到。
- OSS 外网流出 0.50 元/GB、CDN 回源流出 0.15 元/GB，这两个数字来自阿里云计费示例，示例注明单价来自 2024-11-20 的官网价格 [16]。OSS 计费说明页本身不列单价 [15]。
- 静态 HTTPS 请求费：价格在单独的子页面里，本次没有读到。

**腾讯云**

- CDN 中国境内下行流量，月度阶梯累进：0–2 TB 0.21 元/GB；2–10 TB 0.20；10–50 TB 0.18；50–100 TB 0.15；100 TB 以上 0.11（页面更新于 2026-02-10）[22]。
- HTTPS 请求：每账号每月 300 万次免费，超出部分 0.05 元/万次 [23]。
- COS 外网下行流量：计费说明里的示例用的是 0.5 元/GB（广州），页面注明示例价格“仅用于说明计算方式” [20]。正式价格页是动态加载的，本次没有读到。
- COS 的 CDN 回源流量单价本次没有读到。

**七牛**

- Kodo 标准存储 0.115–0.148 元/GB/月（按地域）；外网流出 0.26–0.29 元/GB；CDN 回源 0.15 元/GB [29]。
- Kodo 每月免费额度：10 GB 标准存储、10 GB CDN 回源流量、100 万次 GET；外网流出没有免费额度；需要实名认证 [29]。
- CDN 中国大陆 HTTPS 流量：0–100 TB 0.28 元/GB；100 TB–1 PB 0.23；1 PB 以上 0.18。HTTP 流量：前 10 GB 免费（只限静态 HTTP），10 GB–100 TB 0.24 元/GB [30]。页面没有单独的 HTTPS 请求费 [30]。

## 5. 海外对象存储和 CDN

### 5.1 Cloudflare R2

- 价格（美元）：标准存储 0.015/GB-月；A 类操作 4.50/百万次；B 类操作（读）0.36/百万次；“There are no charges for egress bandwidth for any storage class.” 每月免费额度为 10 GB-月存储、100 万次 A 类、1000 万次 B 类，只适用于标准存储 [40]。R2 首页同样写着“without egress fees” [52]。
- 公开访问方式有两种 [41]：
  - `r2.dev` 子域名：“rate-limited and should only be used for development purposes”，不能用缓存、WAF 等功能，不能用于正式分发。
  - 自定义域名：“The domain being used must have been added as a zone in the same account as the R2 bucket.” 域名不在 Cloudflare 上时要用 partial（CNAME）接入 [41]，而 partial 接入“only available to customers on a Business or Enterprise plan” [44]。所以 Free/Pro 计划下，实际做法是把域名的 NS 改到 Cloudflare。
- 大文件条款：非 Enterprise 客户要通过 Cloudflare 的付费服务（如 Developer Platform、Images、Stream）才能用 CDN 分发视频和其他大文件，否则 Cloudflare 可以限制访问 [45]。这一页没有点名 R2；Cloudflare 2023-05-16 的博客说明，内容放在 Stream、Images 或 R2 上时可以通过 CDN 分发视频和大文件 [46]。
- 中国大陆访问：
  - Cloudflare China Network 用京东云在大陆的机房，只对 Enterprise 计划客户单独订阅开放，并且每个根域名都要有有效的 ICP 备案或许可证 [42]。京东云会审核所有域名的内容 [43]。
  - 没有开 China Network 时，Cloudflare 文档没有直接说明大陆访客由哪里服务。FAQ 里提到 ICP 被吊销时，流量会被改到“nearest data centers outside of China” [43]，可以推断普通域名的大陆访客也由境外节点服务。
  - Cloudflare 文档：“Traffic routed through servers outside the country faces significant latency and reliability issues.” [42]
  - 经验判断，无一手来源：没开 China Network 的 Cloudflare 域名，大陆访问速度和稳定性随运营商和时段波动，部分地区和时段下载 150 MB 文件会很慢。
- 和 electron-updater 的配合：稳定版 6.8.11 没有 `r2` provider，master 分支已加入 [4][5]。现在的做法是客户端用 `generic` 指向自定义域名，上传用 S3 兼容工具自己完成。electron-builder 的 `s3` publisher 有 `endpoint` 选项 [7]，但能否直接用它上传到 R2，本次没有验证。
- R2 的 S3 API 文档只写了 GetObject 支持 Range，没有说明是否支持一次请求多个 Range [57]。electron-updater 的 generic provider 默认使用多段 Range 请求，服务器不支持时差分下载失败，回退到全量下载 [4]。可以在 generic 配置里设 `useMultipleRangeRequest: false` [7]。

### 5.2 AWS S3 + CloudFront

- S3（美国东部，弗吉尼亚北部，美元）：标准存储前 50 TB 0.023/GB-月；出网到互联网前 10 TB 0.090/GB，免费额度之后计费 [48]。每月前 100 GB 出网免费，按所有 AWS 服务和地域汇总（中国区和 GovCloud 除外）；从 S3 传到 CloudFront 不收费 [47]。
- CloudFront 按量付费（美元）：每月前 1 TB 出网和前 1000 万次 HTTP/HTTPS 请求免费。超出后美国、墨西哥、加拿大、欧洲为 0.085/GB；“Hong Kong, Indonesia, Philippines, Singapore, South Korea, Taiwan, Thailand, Malaysia, and Vietnam” 为 0.120/GB；美国 HTTPS 请求 0.0100/万次 [49]。
- CloudFront 固定价套餐（美元/月，按分配计费）：Free 0、Pro 15、Business 200。数据传输额度分别是 100 GB、50 TB、50 TB，请求额度分别是 100 万、1000 万、1.25 亿 [50][51]。“you will not incur overage charges”；超过额度时，第一次峰值在 3 倍额度以内当月不受影响；长期明显超出又不升级时，“your traffic delivery might be adjusted”，例如改由更少或更远的节点服务 [51]。
- 中国大陆访问：
  - 没有 ICP 备案时，可以用 CloudFront Global “from nearby PoPs outside of China (e.g. Honk Kong)”（原文拼写）。动态内容和缓存未命中要穿过防火长城，另外“there is a risk of GFW banning your global domain name” [53]。
  - 大陆境内的 CloudFront 属于单独的 AWS 中国区：要求根域名有 ICP 备案，备案主体必须位于中国大陆，域名要在国内注册商注册 [53]。AWS 已宣布 2027-05-31 停止中国（宁夏）区的 CloudFront，2026-09-30 之后不再接收新客户 [54]。按今天（2026-10-30）的状态，新项目已经用不上。
  - AWS 文章提到可以用 Zenlayer 的 IPLC 专线改善大陆到 CloudFront Global 的连接 [53]，本次没有调研价格。
- 和 electron-updater 的配合：`s3` 是内置 provider，electron-builder 可以直接上传 [1][2]。但客户端用 `s3` 时，下载地址是 S3 bucket 的地址，不经过 CloudFront [4]。要让客户端走 CloudFront，可以把 `publish` 写成两项：第一项 `generic`（CloudFront 地址），供客户端使用；第二项 `s3`，用来上传。依据是第一项决定自动更新服务器 [2]，以及 generic 不负责上传 [2]。这个组合是按文档推出来的，本次没有实测。

### 5.3 阿里云、腾讯云的境外节点（不备案）

- 阿里云 OSS 香港、新加坡等地域绑定自定义域名不需要 ICP 备案；文档提醒“中国大陆用户访问境外节点时跨境网络延迟可能增大” [13]。
- 阿里云 CDN 加速区域选“全球（不包含中国内地）”时，文档没有要求备案 [18]。价格见 4.4 节的境外价格 [17]。
- 腾讯云 CDN 加速区域为境外时“域名可以不需要备案” [25]；EdgeOne 未备案域名只能选“全球可用区（不含中国大陆）” [28]。腾讯云 CDN 境外价格本次没有读到。
- 这些方案和 Cloudflare、CloudFront 一样，大陆用户由境外节点服务，只是服务商和账单在国内。没有一手资料说明它们对大陆用户比 Cloudflare 或 CloudFront 更快。

## 6. 费用估算

### 6.1 假设

- 每个安装包或更新包 150 MB，按 1 GB = 1024 MB 换算。
- 每月下载次数包含首次安装和更新，按 1,000 次和 10,000 次两档。
- 情景 A：全部是全量下载。月流量 146.5 GB 和 1,464.8 GB。
- 情景 B：30% 是首次安装（全量），70% 是更新。更新中一半能差分，差分下载量按全量的 20% 算；另一半是全量（macOS 首次更新、deb、差分失败）。平均每次 108 MB，月流量 105.5 GB 和 1,054.7 GB。20% 是假设值。electron-builder 源码注释里 2018 年的测试显示，小改动只需下载 2%–7% [6]；升级 Electron 版本时变化会大得多。
- “组合”方案按大陆 80%、海外 20% 分配流量。
- 大陆 CDN 回源流量按下行流量的 10% 计，单价 0.15 元/GB（阿里云 [16]、七牛 [29] 的价格；腾讯云回源单价没有读到，按同价假设）。
- 存储：保留 3 个版本，每版约 7 个文件（2 个 mac zip、2 个 dmg、exe、AppImage、deb），共约 3 GB。各家的存储费都在 1 元或 0.1 美元以下，或者在免费额度内，下表忽略。
- 请求费：按 10,000 个活跃客户端每天检查 4 次估算，约 120 万次/月，在腾讯云 300 万次 HTTPS 免费额度 [23]、R2 每月 1000 万次 B 类免费额度 [40]、CloudFront 每月 1000 万次免费请求 [49] 之内，下表忽略。阿里云的 HTTPS 请求价没有读到；七牛没有单列请求费 [30]。
- 不含：域名注册费、ICP 备案用的服务器费用（腾讯云要求包年包月至少 3 个月 [34]，价格没有调研）、代码签名证书、人工。
- 不做汇率换算，人民币和美元分开写。

### 6.2 每月费用

| 方案 | 单价依据 | 1,000 次 A | 1,000 次 B | 10,000 次 A | 10,000 次 B |
|---|---|---|---|---|---|
| GitHub Releases（公开仓库） | 不限带宽 [8] | 0 | 0 | 0 | 0 |
| 腾讯云 CDN 中国境内 | 0.21 元/GB [22] + 回源 | 33.0 元 | 23.7 元 | 329.6 元 | 237.3 元 |
| 阿里云 CDN 中国内地 | 0.24 元/GB [17] + 回源 | 37.4 元 | 26.9 元 | 373.5 元 | 268.9 元 |
| 七牛 CDN 中国大陆（HTTPS） | 0.28 元/GB [30] + 回源，扣 10 GB 免费回源 | 41.7 元 | 29.6 元 | 430.6 元 | 309.6 元 |
| 大陆对象存储直连，不走 CDN | 0.50 元/GB（阿里云示例价 [16]） | 73.2 元 | 52.7 元 | 732.4 元 | 527.3 元 |
| 阿里云 CDN 全球（不含中国内地），全部按境外价 | 0.46–0.58 元/GB [17] + 回源 | 69.6–87.2 元 | 50.1–62.8 元 | 695.8–871.6 元 | 501.0–627.5 元 |
| Cloudflare R2 + 自定义域名 | 出网免费 [40] | 0 美元 | 0 美元 | 0 美元 | 0 美元 |
| AWS S3 直连，不走 CloudFront | 前 100 GB 免费，之后 0.090 美元/GB [47][48] | 4.2 美元 | 0.5 美元 | 122.8 美元 | 85.9 美元 |
| AWS S3 + CloudFront 按量 | 前 1 TB 免费，之后 0.085–0.120 美元/GB [49] | 0 美元 | 0 美元 | 37.5–52.9 美元 | 2.6–3.7 美元 |
| AWS CloudFront 固定价 Pro | 15 美元/月，50 TB 额度 [50][51] | 15 美元 | 15 美元 | 15 美元 | 15 美元 |
| 组合：大陆 80% 走腾讯云 CDN，海外 20% 走 R2 | 同上 | 26.4 元 | 19.0 元 | 263.7 元 | 189.8 元 |
| 组合：大陆 80% 走阿里云 CDN，海外 20% 走 R2 | 同上 | 29.9 元 | 21.5 元 | 298.8 元 | 215.2 元 |

说明：

- 阿里云“全球（不含中国内地）”一行假设大陆用户被调度到亚太 1 区等境外节点，并按境外价计费。哪个区服务大陆用户、按哪个区计费，页面没有写 [17]，所以给的是北美/欧洲价到亚太 1 区价的区间。
- CloudFront 固定价 Free 套餐的额度是 100 GB [50][51]，比两档情景的流量都小（1,000 次情景 B 也有 105.5 GB）。超出额度不收费，但长期超出时服务可能被降级 [51]。
- 大陆三家都有预付费流量包，实际价格可能比上表低。本表只用按量刊例价。

## 7. 方案对比

费用列取情景 A（全量下载），格式为“每月 1,000 次 / 10,000 次”。

| 方案 | 中国大陆可用性 | 海外可用性 | 需要的主体和备案 | 费用估算 | 和 electron-updater 的配合方式 |
|---|---|---|---|---|---|
| GitHub Releases，公开仓库（源码仓库或单独的发布仓库） | 经验判断，无一手来源：慢且不稳定，不能当作唯一渠道 | 好（经验判断，无一手来源） | 不需要主体，不需要备案；仓库必须公开 | 0 / 0 | 内置 `github` provider，electron-builder 可以直接上传；客户端读 `releases.atom`，不走 API，不受 API 限额影响 [4] |
| GitHub Releases，私有仓库 | 不可用：匿名请求 404 [55] | 不可用 | 不适用 | 0 / 0 | 只能 `private: true` 加分发 token，官方说明不适合所有用户 [1] |
| 大陆对象存储 + 大陆 CDN（阿里云、腾讯云、七牛），已备案域名 | 好：大陆节点服务大陆用户 [27]；实际速度为经验判断，无一手来源 | 腾讯云选“全球”时由境外节点服务境外用户 [27]，境外部分按境外价另计 | 大陆个人或单位做 ICP 备案，需要一台符合条件的大陆云服务器 [34]；约 1–5 周 [32][38]；开通后 30 日内做公安联网备案 [37] | 33–42 元 / 330–431 元，另加备案服务器费用 | `generic` provider；electron-builder 没有这几家的 publisher，上传要自己做（用 `s3` publisher 配 `endpoint` 是否可行，未验证） |
| 国内厂商的境外地域或境外加速（阿里云 OSS 香港 + CDN 全球不含中国内地、腾讯云 CDN 境外、EdgeOne 不含中国大陆） | 大陆用户走境外节点，“跨境网络延迟可能增大” [13]；实际质量为经验判断，无一手来源 | 好 | 不需要 ICP 备案 [13][18][25][28] | 阿里云约 70–87 元 / 696–872 元 | `generic` provider，上传自己做 |
| Cloudflare R2 + 自定义域名 | 走境外节点；Cloudflare 自己说跨境访问有明显的延迟和可靠性问题 [42]；实际质量为经验判断，无一手来源 | 好 | 不需要主体和备案；域名要作为 zone 加到同一个 Cloudflare 账号，Free/Pro 计划要把 NS 改到 Cloudflare [41][44]。China Network 要 Enterprise 计划加 ICP [42] | 约 0 美元 / 0 美元 | `generic` provider（6.8.11 没有 `r2` provider [4][5]）；上传用 S3 兼容工具；多段 Range 是否支持未知，可设 `useMultipleRangeRequest: false` [7] |
| AWS S3 + CloudFront Global | 由香港等境外节点服务 [53]，有域名被封的风险 [53]；实际质量为经验判断，无一手来源。大陆境内 CloudFront 已不接收新客户 [54] | 好 | 不需要 ICP 备案；需要 AWS 账号 | 按量 0 / 38–53 美元；或固定价 Pro 15 美元/月 | `s3` 是内置 provider，可直接上传；客户端要走 CloudFront 时，用 `publish: [generic(CloudFront 地址), s3]`，这是按文档推出的组合，未实测 [2] |
| 组合：大陆 CDN（已备案）+ 海外 R2，应用运行时选源 | 好（同大陆 CDN 方案） | 好（同 R2 方案） | 同大陆 CDN 方案 | 腾讯云 + R2 约 26 元 / 264 元 | 两个 `generic` 地址，同一套文件上传到两处 [4][6]；按地区选源和失败回退要在应用里用 `setFeedURL` 自己写 [4] |

## 8. 没能核实的事项

- 中国大陆访问 GitHub、Cloudflare（未开 China Network）、CloudFront 香港节点和各家境外节点的速度与成功率：没有一手数据，文中相关说法都标了“经验判断，无一手来源”。
- 阿里云 OSS 和 CDN 的现行官方价格页是动态加载的，没有读到。文中用的是帮助中心标注为“仅供参考”的 CDN 价格 [17]，以及计费示例里 2024-11-20 的 OSS 价格 [16]。
- 腾讯云 COS 的外网下行和 CDN 回源单价、腾讯云 CDN 境外价格、阿里云静态 HTTPS 请求单价：没有读到。
- 七牛自定义域名的备案要求：没有找到七牛官方页面。
- 阿里云 ICP 备案的服务器要求和材料清单：读到的页面只是目录 [56]，正文没有核对。
- 桌面 Electron 应用是否需要做 APP 备案：没有找到明确的一手说明 [39]。
- 个人主体备案一个分发软件的网站会不会被驳回：只有经验判断。
- GitHub Free 组织的私有仓库在 release 功能上有没有额外限制；私有仓库下载 release 文件需要的 fine-grained token 权限名称：文档页面上没有读到。
- R2 是否支持一个请求里的多段 Range（electron-updater 差分下载默认会用）：R2 文档没有说明 [57]。
- electron-builder 的 `s3` publisher 配 `endpoint` 能否上传到 R2、OSS、COS：没有测试。
- Cloudflare 服务条款页面没有点名 R2 可以分发大文件 [45]，这一点依据的是 Cloudflare 博客 [46]。

## 来源

所有来源的访问日期都是 2026-10-30。

1. electron-builder v26 文档，Auto Update：https://www.electron.build/v26/docs/features/auto-update
2. electron-builder v26 文档，Publish：https://www.electron.build/v26/docs/publish
3. electron-builder v26 文档，electron-updater API：https://www.electron.build/v26/docs/api/electron-updater/
4. electron-updater 6.8.11 npm 包源码（`out/` 目录），以及 npm 版本标签：https://registry.npmjs.org/electron-updater/-/electron-updater-6.8.11.tgz ，https://registry.npmjs.org/electron-updater
5. electron-builder master 分支 `providerFactory.ts`：https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providerFactory.ts
6. app-builder-lib 26.18.0 和 dmg-builder 26.18.0 npm 包源码与 NSIS 模板：https://registry.npmjs.org/app-builder-lib/-/app-builder-lib-26.18.0.tgz ，https://registry.npmjs.org/dmg-builder/-/dmg-builder-26.18.0.tgz
7. builder-util-runtime 9.7.0 `publishOptions.d.ts`（electron-updater 6.8.11 的依赖）：https://registry.npmjs.org/builder-util-runtime/-/builder-util-runtime-9.7.0.tgz
8. GitHub Docs，About releases：https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases
9. GitHub Docs，REST API release assets：https://docs.github.com/en/rest/releases/assets
10. GitHub Docs，Rate limits for the REST API：https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
11. GitHub Acceptable Use Policies：https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies
12. GitHub Docs，GitHub's plans：https://docs.github.com/en/get-started/learning-about-github/githubs-plans
13. 阿里云 OSS，绑定自定义域名：https://help.aliyun.com/zh/oss/user-guide/map-custom-domain-names-5
14. 阿里云 OSS，通过自定义域名访问（含 2025-03-20 默认域名限制）：https://www.alibabacloud.com/help/zh/oss/user-guide/access-buckets-via-custom-domain-names
15. 阿里云 OSS，流量费用：https://help.aliyun.com/zh/oss/product-overview/traffic-fees
16. 阿里云 OSS，计费示例（单价来自 2024-11-20 官网价格）：https://help.aliyun.com/zh/oss/billing-examples
17. 阿里云 CDN，Billing of basic services：https://help.aliyun.com/en/cdn/product-overview/billing-rules-of-basic-services
18. 阿里云 CDN，BatchAddCdnDomain API：https://help.aliyun.com/zh/cdn/developer-reference/api-cdn-2018-05-10-batchaddcdndomain
19. 腾讯云 COS，存储桶域名使用安全管理通知：https://cloud.tencent.com/document/product/436/96243
20. 腾讯云 COS，流量费用：https://cloud.tencent.com/document/product/436/53863
21. 腾讯云 COS，开启自定义源站域名：https://cloud.tencent.com/document/product/436/36638
22. 腾讯云 CDN，基础服务计费：https://cloud.tencent.com/document/product/228/75562 （同表另见 https://cloud.tencent.com/document/product/228/2949 ）
23. 腾讯云 CDN，增值服务计费：https://cloud.tencent.com/document/product/228/75563
24. 腾讯云 CDN，使用限制：https://cloud.tencent.com/document/product/228/37848
25. 腾讯云 CDN，域名接入问题：https://cloud.tencent.com/document/faq/228/11202
26. 腾讯云 CDN，合规相关问题：https://cloud.tencent.com/document/faq/228/74200
27. 腾讯云 CDN，基本信息（修改加速区域）：https://cloud.tencent.com/document/product/228/41342
28. 腾讯云 EdgeOne，域名 ICP 备案相关问题：https://cloud.tencent.com/document/product/1552/110835
29. 七牛云，对象存储 Kodo 价格：https://www.qiniu.com/prices/kodo
30. 七牛云，CDN 价格：https://www.qiniu.com/prices/qcdn
31. 七牛云，测试域名访问限制规则：https://developer.qiniu.com/fusion/kb/1319/test-domain-access-restriction-rules
32. 腾讯云 ICP 备案，备案流程：https://cloud.tencent.com/document/product/243/18909
33. 腾讯云 ICP 备案，首次备案：https://cloud.tencent.com/document/product/243/18958
34. 腾讯云 ICP 备案，备案云资源：https://cloud.tencent.com/document/product/243/18908
35. 腾讯云 ICP 备案，备案限制：https://cloud.tencent.com/document/product/243/18911
36. 腾讯云 ICP 备案，贵州管局备案要求：https://cloud.tencent.com/document/product/243/51724
37. 腾讯云 ICP 备案，公安联网备案流程指引：https://cloud.tencent.com/document/product/243/19142
38. 腾讯云 ICP 备案，备案域名：https://cloud.tencent.com/document/product/243/18905
39. 腾讯云 ICP 备案，APP 备案常见问题：https://cloud.tencent.com/document/faq/243/97691
40. Cloudflare R2，Pricing：https://developers.cloudflare.com/r2/pricing/
41. Cloudflare R2，Public buckets：https://developers.cloudflare.com/r2/buckets/public-buckets/
42. Cloudflare China Network，Overview：https://developers.cloudflare.com/china-network/
43. Cloudflare China Network，FAQ：https://developers.cloudflare.com/china-network/faq/
44. Cloudflare DNS，Set up a partial zone：https://developers.cloudflare.com/dns/zone-setups/partial-setup/setup/
45. Cloudflare，Service-Specific Terms（Application Services，页面更新于 2026-09-28）：https://www.cloudflare.com/service-specific-terms-application-services/
46. Cloudflare Blog，Goodbye, section 2.8（2023-05-16）：https://blog.cloudflare.com/updated-tos/
47. Amazon S3 Pricing：https://aws.amazon.com/s3/pricing/
48. AWS Price List API，us-east-1 的 AmazonS3（发布于 2026-10-15）和 AWSDataTransfer（发布于 2026-09-16）：https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-east-1/index.json ，https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AWSDataTransfer/current/us-east-1/index.json
49. Amazon CloudFront，Pay-as-you-go pricing：https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
50. Amazon CloudFront，Pricing（固定价套餐）：https://aws.amazon.com/cloudfront/pricing/
51. Amazon CloudFront Developer Guide，Flat-rate pricing plans：https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html
52. Cloudflare R2 文档首页：https://developers.cloudflare.com/r2/
53. AWS Builder Center，Application Performance - Content delivery in China（Achraf Souk，2025-04-29）：https://builder.aws.com/content/2wDojlSRlsfH6V658kgqaymFjTp/application-performance-content-delivery-in-china
54. Amazon Web Services China，CloudFront FAQs（停止服务公告）：https://www.amazonaws.cn/en/cloudfront/faqs/
55. 本次调研的实测（2026-10-30，curl）：匿名请求 `https://github.com/pigcode/pigcode/releases.atom` 和 `https://github.com/pigcode/pigcode/releases/latest` 都返回 404；请求公开仓库的 `https://github.com/electron/electron/releases/download/v38.0.0/SHASUMS256.txt` 返回 302，跳转到 `release-assets.githubusercontent.com`。
56. 阿里云 ICP 备案，ICP备案流程（目录页）：https://help.aliyun.com/zh/icp-filing/basic-icp-service/user-guide/
57. Cloudflare R2，S3 API compatibility：https://developers.cloudflare.com/r2/api/s3/api/
