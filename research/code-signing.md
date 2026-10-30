# Pigcode 安装包代码签名调研（pigcode/pigcode#9）

调研日期 2026-10-30，下文所有来源的访问日期都是 2026-10-30。价格是各官网标价，不含税。方括号里的数字对应第 6 节的来源编号。标注“未经一手来源证实”的内容没有找到官方页面支持。

## 1. 结论

- **macOS 两种账号都对中国大陆开放。** Apple 中文帮助页分别给出了“中国大陆地区的个人或独资企业/一人公司”和“就职于中国大陆地区公司……的员工”两条 Apple Developer App 注册流程，App 内年费 ¥688（其他地区 99 USD）[2][3]。Apple 文档在 Developer ID 证书和公证上没有区分个人和组织账号，Developer ID 证书只要求账号持有人角色 [11][12]。两种账号的区别在于证书上的名称（个人法定姓名或法人实体名称），以及组织账号要提供 D-U-N-S 编号、公开网站、域名邮箱和签约授权 [1][2]。
- **macOS 自动更新绑定的是 Team ID，与具体证书无关。** Squirrel.Mac 要求新版本满足当前运行版本的 designated requirement（DR）[19]。Developer ID 默认 DR 固定 bundle identifier 和 Team ID（证书 subject.OU），不固定某一张证书，所以续期证书不影响更新 [14]。个人账号可以申请迁移为组织账号 [6]。Apple Developer Support 在开发者论坛回复迁移后“your Team ID will remain the same”[7]，但 Apple 文档没有写这一点。迁移前应在工单里拿到书面确认。迁移期间会员权益会被暂停，论坛上有一位开发者报告等了 6 周以上，期间不能签新版本 [9]。这只是个例，但说明迁移有风险。
- **Windows 自动更新绑定的是发布者名称。** electron-builder 26 默认把签名证书的 CN 写进 app-update.yml 的 `publisherName`，electron-updater 6.x 下载更新后用它核对安装包的 Authenticode 签名 [22][25][26]。如果以后从个人证书换成公司证书，CN 会变，已安装的旧版本就会拒绝新签名的更新。唯一的办法是先用旧证书发一个过渡版本，把新旧两个名称都写进 `publisherName` [22]。换签名身份还会让 SmartScreen 信誉从零开始积累 [32]。这两个平台的情况都说明，发布主体最好在第一次公开发布前定下来。
- **Windows 上最便宜、最适合 CI 的 Artifact Signing（原 Trusted Signing）不对中国大陆开放。** 它的 Basic 档 9.99 USD/月，私钥由 Microsoft 托管，并有官方 GitHub Action [37][40]。公共信任证书只发给美国、加拿大、欧盟、英国、澳大利亚、新西兰、日本、韩国、新加坡、瑞士、挪威、以色列的组织，以及美国、加拿大的个人 [33]。中国大陆的个人和公司都不能用，中国香港也不在名单上。注册地在名单内的海外公司可以用。
- **中国大陆主体在 Windows 上只能买 CA 签发的证书。** 公司可选 OV 证书，例如 GlobalSign 中国 ¥3,488/年（只签发给合法注册的组织）或 SSL.com OV 129 USD/年（1 年期）[42][49]。个人只能选签发个人（IV）证书的 CA，例如 SSL.com IV 129 USD/年、Certum Standard Code Signing €209（云签名版）[44][51]。这些 CA 是否受理中国大陆个人，官方页面没有写，未经一手来源证实。
- **私钥不能再放进 GitHub Secrets。** 2023-06-01 起，CA/B Forum 要求代码签名私钥在 FIPS 140-2 Level 2 / CC EAL 4+ 的硬件模块、云 HSM 或签名服务中生成和使用 [30]，所以不能再导出 .pfx 放进 secrets。GitHub 托管 runner 上可用的方案有三种：Artifact Signing、CA 的云签名服务（如 SSL.com eSigner，有官方 GitHub Action [47]）、自己的云 HSM（如 Azure Key Vault Premium）加 CA 的密钥证明 [42]。随证书寄出的 USB 令牌只能接在自托管 runner 上。
- **EV 证书已经不能跳过 SmartScreen。** Microsoft 文档写明 EV 的这一行为在 2024 年取消了 [31]。现在 EV、OV 和 Artifact Signing 一样，要靠下载量积累信誉，通常需要几周和数百次正常安装 [32]。只有通过 Microsoft Store 分发的 MSIX 能免掉 SmartScreen 警告 [31][32]。只为 SmartScreen 多付 EV 的钱没有意义。
- **证书有效期在变短。** 2026-03-01 起签发的代码签名证书最长 460 天 [30]，GlobalSign 只卖 1 年期 [49]。Apple 帮助页说由 G2 中间证书签发的 Developer ID 证书有效期一年、需每年续期 [13]，但本机上 2026 年 8 月签发的 G2 Developer ID 证书有效期是 5 年 [60]。两者矛盾，以创建证书时 Apple 后台显示的为准。旧的 Developer ID CA 在 2027-02-01 到期，新证书要选 G2 [13]。
- **Linux 不需要商业证书，签名大多没人校验。** AppImage 可以用 GPG 把签名嵌进文件，但 AppImage 本身不会自动校验，用户要另外运行 `validate` 工具 [56]。dpkg 默认配置关闭了 .deb 内嵌签名校验，apt 只校验仓库 Release 文件的签名 [58][59]。electron-updater 在 Linux 上只核对 `latest-linux.yml` 里的 sha512 [25]。

### 未经一手来源证实的事项

- Apple 个人和组织账号的审核时长。Apple 没有公布任何时长 [1][2][3]。
- 个人账号迁移为组织账号后，已有 Developer ID 证书是否继续有效、新证书上的名称何时变成公司名称 [8]。迁移期间账号权益会被暂停多久 [9]。
- SSL.com、Certum 是否受理中国大陆个人的 IV 证书申请，以及 GlobalSign 中国 OV 的审核时长。
- Artifact Signing 对组织是否有“3 年以上可验证纳税记录”的要求。Microsoft 自己的文档前后不一致（见 3.2）。
- 中国大陆开发者能否开 Microsoft Store 开发者账号。Partner Center 页面没有列出国家 [41]。
- G2 Developer ID 证书的实际有效期（见上文矛盾）。
- 有多少 Linux 用户会校验发布的校验和或 GPG 签名。没有找到任何数据。

## 2. macOS

### 2.1 账号类型与对发布者的要求

- **个人账号**：需要开启双重认证的 Apple 账户，并达到所在地区法定成年年龄，姓名必须是法定姓名。个体户和一人公司也必须以个人身份注册，卖家名称显示为个人法定姓名 [1]。
- **组织账号**：必须是能与 Apple 签约的法人实体。Apple 不接受 DBA、商号或分公司。还需要以下条件 [1][4]：
  - 法人实体的 D-U-N-S 编号；
  - 注册人有签约授权（所有者/创始人、高管，或获得授权的员工）；
  - 使用组织域名的工作邮箱；
  - 公开可访问的组织网站；
  - Apple 可能要求提供经过公证的营业文件。
- **中国大陆**：Apple 中文帮助页分别给出了中国大陆个人（含独资企业/一人公司）和中国大陆公司员工通过 Apple Developer App 注册的流程 [2]：
  - 需要输入身份证号并拍自拍，中国大陆的身份验证由中国金融认证中心（CFCA）提供；
  - 姓名和地址要用英文字母填写；
  - 身份验证完成后会绑定到这个 Apple 账户，不能再用其他 Apple 账户验证同一身份 [2]；
  - Apple 规定中国大陆的账号持有人必须完成身份验证 [5]。
- **费用**：99 USD/年，个人和组织相同 [1][3]。中国大陆在 App 内显示“以每年 ¥688 续订” [2]。D-U-N-S 编号在大多数司法管辖区免费 [4]。
- **办理时间**：Apple 没有公布个人或组织注册的审核时长 [1][2][3]。个人在注册时就能直接付款；组织要等 Apple 验证完、发邮件后才能付款 [1]。D-U-N-S 编号最多 5 个工作日下发，加急不能缩短；下发后最多 2 个工作日同步到 Apple [4]。

### 2.2 Developer ID 证书和公证

- 发布到 Mac App Store 以外的应用，需要用 Developer ID Application 证书签名，再提交公证 [10][11]。Apple 文档没有区分个人和组织账号在 Developer ID 或公证上的差别。
- 只有账号持有人（Account Holder）能创建 Developer ID 证书。云托管的 Developer ID 证书也可以交给具有相应角色的管理员使用 [11][12]。个人账号的注册人就是账号持有人。每个团队最多 5 张 Developer ID Application 证书和 5 张 Developer ID Installer 证书 [11]。
- 公证用 `notarytool` 提交，扫描“通常不到一小时” [15]。
- **用户看到的名称**：证书主题的格式是 `Developer ID Application: <名称> (<Team ID>)`，O 字段是名称，OU 字段是 Team ID。本机已安装应用的实测例子 [60]：
  - 个人：`Mitchell Hashimoto (24VZTF6M5V)`，以及中国开发者的拼音姓名 `yicai yang (2BHGL3L4A8)`；
  - 公司：`Shanghai Qianhui Technology Co., Ltd. (87242QY66T)`、`Hangzhou DeepSeek Artificial Intelligence Co., Ltd (NAN929V4UM)`。
  
  Apple 的 Gatekeeper 支持页没有说明首次打开的对话框里是否显示开发者名称 [64]。
- **有效期**：
  - 旧的 Developer ID 中间证书在 2027-02-01 到期，之后旧中间证书签发的证书不能再用于签名。新证书要选 G2 [13]。
  - Apple 写“Certificates issued from G2 are valid for one year and must be renewed annually” [13]。但本机上 2025-09 到 2026-08 签发的 G2 证书有效期都是 5 年，例如 Claude.app 的证书是 2026-05-29 到 2031-05-30 [60]。实际年限以创建证书时 Apple 后台显示的为准。
- **到期和会员失效**：证书在构建时有效，过期后用户仍能下载和运行，但签新版本需要新证书。会员到期后用户仍可运行已签名的应用，但续不了证书 [11]。证书被吊销后，用户无法安装或启动用它签过的应用 [11]。

### 2.3 electron-updater 对新旧版本签名的要求

- Electron 文档写明 macOS 上的自动更新要求应用已签名，这是 Squirrel.Mac 的要求 [18]。electron-updater 的 `MacUpdater` 在内部调用 Electron 原生的 Squirrel.Mac [25]。
- Squirrel.Mac 有两道检查 [19]：
  - 启动时用 `SecCodeCopySelf` 和 `SecCodeCopyDesignatedRequirement` 取得当前运行版本的 designated requirement（DR）。下载更新后，用 `SecStaticCodeCheckValidityWithErrors` 检查新包，标志包括 `kSecCSCheckNestedCode | kSecCSStrictValidate | kSecCSCheckAllArchitectures`。
  - 安装进程 ShipIt 在替换前再检查一次，要求新包满足目标路径上已安装应用的 DR（`SQRLInstaller.m` 中的 `prepareAndValidateUpdateBundleURLForRequest`）。
- Developer ID 签名的默认 DR 包含以下条件 [14]：`anchor apple generic`、bundle identifier、Developer ID CA 的 OID、Developer ID Application 的 OID，以及 `certificate leaf[subject.OU] = <Team ID>`。

  因此新旧版本必须有相同的 bundle identifier 和相同的 Team ID。换一张同团队的新证书（续期、换 G2）不影响更新。换成另一个 Team ID 签名，已安装的版本会拒绝更新，用户只能手动重装。这一条结论是根据 [14] 和 [19] 推出的，没有找到直接写明它的文档。
- **个人账号改为组织账号**：
  - 可以通过 Apple 的请求表单申请，申请人必须是组织的创始人或联合创始人，并提供 D-U-N-S 编号，Apple 可能要求营业文件 [6]。
  - Team ID：Apple Developer Support 在开发者论坛上回复“yes your Team ID will remain the same” [7]，但 Apple 文档没有写这一点。
  - 已有 Developer ID 证书在迁移后是否继续有效、证书上的名称何时变成公司名称：没有官方答复 [8]，未经一手来源证实。按 2.3 的 DR 规则，只要 Team ID 不变，旧证书签的版本和新证书签的版本应该能互相更新。这是推论。
  - 迁移期间账号页显示“membership benefits are temporarily disabled”，证书页面不可用。有开发者报告卡了 6 周以上，期间无法签名新版本 [9]。
  - 如果另外注册一个新的组织账号，而不是迁移原账号，Team ID 会变。按上面的 DR 规则，已安装用户会收不到更新。

### 2.4 CI 中签名和公证需要的凭据

- **签名证书**：
  - 把 Developer ID Application 证书连同私钥导出为 `.p12`，base64 后放进 `CSC_LINK`，密码放进 `CSC_KEY_PASSWORD`。electron-builder 在 CI 上会把证书导入临时钥匙串 [20][65]。
  - GitHub 官方文档给出了在托管 macOS runner 上从 secrets 导入 `.p12` 到临时钥匙串的步骤，并说明托管 runner 用完即销毁 [23]。
  - Apple 文档没有要求 Developer ID 私钥放在硬件里，第 3.1 节的 CA/B Forum 硬件要求针对的是 Windows 用的公共信任代码签名证书。
  - 只有发布 `.pkg` 时才需要 Developer ID Installer 证书。electron-builder 默认的 macOS 目标是 dmg 和 zip，zip 是 Squirrel.Mac 更新所必需的 [27]。
- **公证凭据**（electron-builder 26.18.0 源码 `MacTargetHelper.ts` 支持三组环境变量 [21]）：
  - App Store Connect API key：`APPLE_API_KEY`、`APPLE_API_KEY_ID`、`APPLE_API_ISSUER`。electron-builder 文档推荐 CI 使用这一组，理由是 API key 不会过期，也不需要双重认证 [20]。
  - Apple ID：`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`（App 专用密码）、`APPLE_TEAM_ID`。因为账户强制双重认证，`notarytool` 要用 App 专用密码，不能用 Apple ID 密码 [16]。
  - 钥匙串配置：`APPLE_KEYCHAIN_PROFILE`（可选 `APPLE_KEYCHAIN`），主要用于本地开发 [20]。
- **`APPLE_API_KEY` 的格式**：在 26.18.0 中，这个值会原样传给 `@electron/notarize`，后者要求它是 `.p8` 文件的绝对路径 [21][24]。所以 CI 需要先把 secret 写成文件。electron-builder 的公证文档写的是“base64-encoded-p8-content” [20]，这是 master 分支（v27）的行为：master 源码同时接受路径和 base64 [21]。
- **API key 的类型和角色**：
  - Apple 文档写明个人（Individual）API key 不能用于 `notaryTool`，所以要用团队（Team）key [17]。
  - 生成团队 key 需要 App Store Connect 的 Admin 账户 [17]。申请开通 App Store Connect API 只能由账号持有人操作 [12]。
  - 角色：electron-builder 文档写 Developer 角色 [20]，`@electron/notarize` README 写 App Manager [24]。两者不一致，建立 key 时可先用 Developer，失败再调高。
- **成本**：私有仓库使用 GitHub 托管 runner 时，macOS runner 每分钟 0.062 USD，Linux 2 核 0.006 USD，Windows 2 核 0.010 USD。GitHub Free 组织每月含 12 USD 用量 [62]。

## 3. Windows

### 3.1 私钥硬件要求对 CI 的影响

- CA/B Forum 代码签名基线要求（CSBR v3.11.0）第 6.2.7.4.1 节规定：2023-06-01 起，订户的代码签名私钥必须在至少符合 FIPS 140-2 Level 2 或 Common Criteria EAL 4+ 的硬件加密模块中生成和保护 [30]。允许的形式有三种：
  - 订户自己的硬件模块（USB 令牌、HSM）；
  - 云端密钥保护方案，要求密钥的生成、存储和使用都在云 HSM 边界内，并记录所有访问；
  - 符合第 6.2.7.3 节的签名服务。
- CA 必须核实密钥确实在合格硬件中，方法包括：CA 直接寄出预生成密钥的硬件、密钥证明（key attestation）、审计报告等（第 6.2.7.4.2 节）[30]。
- 同一文件规定：2026-03-01 起签发的代码签名证书有效期不得超过 460 天 [30]。
- **对 GitHub 托管 runner 的影响**：新签发的公共信任代码签名证书不能再导出成 `.pfx` 放进 secrets。
  - electron-builder v27 文档仍写着“OV certificates export to a `.pfx`, so they work in CI” [22]。这句话与 CSBR 冲突，不适用于 2023-06-01 以后签发的证书。
  - 托管 runner 每次都是新虚拟机，插不了 USB 令牌。可用的路线只剩三条：
    - Microsoft Artifact Signing（3.2）；
    - CA 的云签名服务（3.3，例如 SSL.com eSigner）；
    - 自备云 HSM。例如在 Azure Key Vault Premium 中生成密钥，再请 CA 做密钥证明后签发证书。SSL.com 对 Azure Key Vault、Google Cloud HSM 的证明费是 75 USD，AWS CloudHSM 是 1,275 USD [42]。Azure 零售价 API 列出的 Key Vault Premium HSM 保护 RSA 2048 密钥单价是 1.0 USD，操作每 1 万次 0.03 USD [63]。这条路线签名时要调用第三方工具，例如 AzureSignTool（Microsoft 称其为社区工具 [61]），需要通过 electron-builder 的自定义 `sign` 钩子接入 [22]。

### 3.2 Microsoft Artifact Signing（原 Trusted Signing）

- **适用主体**（以 Artifact Signing 快速入门页为准，该页 2026-10-08 更新）：公共信任证书只发给以下主体 [33]：
  - 美国、加拿大、欧盟、英国、澳大利亚、新西兰、日本、韩国、新加坡、瑞士、挪威、以色列的组织；
  - 美国或加拿大的个人开发者。
  
  中国大陆的个人和公司都不在范围内。中国香港也不在名单上。私有信任（Private Trust）证书没有地域限制，但它不受 Windows 默认信任，不适合公开发布 [33]。
- **Microsoft 自己的文档在资格条件上不一致**：
  - 《Code signing options》页（2026-08-29）只列美国、加拿大、欧盟、英国的组织 [31]。
  - MSIX 签名页（2026-04-14）还写着组织要有“three or more years”的可验证纳税记录 [61]。
  - 一位 Microsoft 员工在 Microsoft Q&A 上答复“no minimum org age restrictions”，并指向快速入门页 [34]。
  
  是否有 3 年要求，未经一手来源证实。
- **费用**（Azure 零售价 API，2026-10-30）[37][38]：
  - Basic 9.99 USD/月，每月 5,000 次签名，每种证书配置文件 1 个；
  - Premium 99.99 USD/月，每月 100,000 次签名；
  - 超出配额后每次 0.005 USD。
  
  必须是付费 Azure 订阅，免费或试用订阅不能用。费用不按天折算 [35]。
- **办理时间**：组织身份验证需要 1–20 个工作日，需要补材料时会更久 [33]。个人身份验证通过 AU10TIX 和 Microsoft Authenticator 的 Verified ID 完成 [33]。
- **证书**：
  - 证书每天续期，有效期 72 小时，所以必须加 RFC 3161 时间戳 [36]。
  - 私钥在 Microsoft 管理的 FIPS 140-3 Level 3 HSM 中，不能导出 [35][36]。
  - CN 必须是验证过的法定名称，不能自定义 [35]。
  - 不签发 EV 证书 [35]。
  - Microsoft 还说明，Artifact Signing 的 CA 计划从 CCADB 中移除，但仍在 Windows 平台信任列表里，Windows 继续信任 [36]。
- **CI**：
  - 官方 GitHub Action `azure/artifact-signing-action` 只能在 Windows runner 上运行（`windows-2025`、`windows-2022`，不支持 Arm），推荐用 OIDC 联合凭据认证 [39][40]。
  - electron-builder 26 的 `win.azureSignOptions` 通过 `Invoke-TrustedSigning` PowerShell 模块签名，读取 `AZURE_TENANT_ID`、`AZURE_CLIENT_ID`、`AZURE_CLIENT_SECRET` [22]。
  - 可以在 GitHub 托管的 Windows runner 上签名。

### 3.3 CA 签发的 OV、IV、EV 证书

- **GlobalSign 中国**（globalsign.cn）[49][50]：
  - 只签发给合法注册的组织，不签发给个人；
  - 只有 1 年期（366 天）；
  - 标准代码签名（OV）¥3,488/年，EV ¥5,880/年；
  - USB 令牌包含在价格中，也可选 HSM，HSM 方案可与 Azure Key Vault 集成；
  - 页面没有写办理时间。
- **SSL.com**：
  - OV 证书：129 USD/年（1 年期），2 年期 116.10 USD/年，3 年期 109.65 USD/年。只发给组织 [42]。
  - IV 证书（个人）：129 USD/年，证书上显示个人姓名，“No business entity required” [44]。
  - EV 证书：349 USD/年（1 年期）[43]。个体户 EV（Sole Proprietor EV）：359 USD/年 [45]。
  - 密钥存放：YubiKey 令牌每个 379 USD，或订阅 eSigner 云签名，或自备云 HSM [42][44]。
  - 标准验证 3–5 天，加急 2 个工作日另收 599 USD [42][44]。
  - eSigner 订阅另收费（IV/OV）[46]：
    - Tier 1：20 USD/月，含 20 次签名，超出每次 1 USD；
    - Tier 2：85 USD/月，含 100 次签名；
    - EV 的 Tier 1：100 USD/月，含 10 次签名；
    - 年付打 75 折，前 30 天免费。
  - 个人身份验证接受亚太地区的护照、身份证、驾照，并做活体检测。页面没有列出被排除的国家 [48]。是否受理中国大陆个人，未经一手来源证实。
- **Certum**（波兰）[51][52]：
  - Standard Code Signing：云签名（SimplySign）€209，卡加读卡器套件 €169。
  - EV：云签名 €379，套件 €359。
  - 自 2026-02-27 起单张证书最长 459 天，买 2–3 年期的产品要在服务期内免费重新签发 [51]。
  - Standard 证书可以发给个人，材料是身份证件加本人名下的水电费账单。EV 只发给组织 [52]。
  - 文件页没有列国家限制 [52]。是否受理中国大陆个人或公司，未经一手来源证实。
  - SimplySign 签名需要 SimplySign Desktop 和手机 App 生成的访问码 [53]。Certum 没有发布 CI 自动化的官方文档。网上有第三方 GitHub Action，不是一手来源，能否在托管 runner 上稳定使用，未经一手来源证实。
- **EV 和 OV 的区别**：
  - Microsoft 写明 EV 首次下载即获信誉的行为“was removed in 2024”。现在 EV 和 OV 的 SmartScreen 表现相同，EV 只在企业采购或驱动签名等场景有意义 [31][32]。
  - CSBR 对 EV 和非 EV 证书的私钥硬件要求自 2023-06-01 起相同 [30]。

### 3.4 开源项目的免费方案

- **SignPath Foundation**：
  - 所有组件都必须使用 OSI 批准的许可证，不能有商业双许可 [54]；
  - 证书签发给“SignPath Foundation”，发布者显示为 SignPath Foundation [54]；
  - 开源项目的构建必须全部在 GitHub 托管 runner 上执行 [55]。
  
  Pigcode 仓库是私有的，不符合条件。
- **Certum Open Source Code Signing**：
  - 云签名 €49，套件 €69 [51][53]；
  - 只发给个人，证书 CN 带“Open Source Developer”前缀 [52]；
  - 项目必须公开可查；用于商业分发的软件会被吊销证书 [52]。
  
  Pigcode 不符合条件。

### 3.5 Microsoft Store

- 通过 Microsoft Store 发布 MSIX 包时，Microsoft 在认证后重新签名，开发者不需要自己的证书，用户也不会看到 SmartScreen 警告 [31][32]。
- 开发者账号分个人和公司两种，新流程不收注册费 [41]：
  - 个人账号用政府证件加自拍验证，适用于与本人业务无关的发布；
  - 公司账号用 D-U-N-S 编号或营业文件验证，人工审核通常 2–5 个工作日；
  - 不支持把个人账号改成公司账号 [41]。
- 中国大陆开发者能否开户，页面没有写，未经一手来源证实。
- electron-builder 的自动更新在 Windows 上只支持 NSIS 目标 [27]。Store 渠道的更新由 Store 负责，不能用 electron-updater。所以 Store 只能作为额外的分发渠道，不能替代官网 NSIS 安装包的签名。

### 3.6 SmartScreen 的表现

- SmartScreen 同时看发布者信誉和文件哈希信誉。用 OV 或 EV 证书签名的新文件，首次下载会提示“unrecognized”，但会显示经过验证的发布者名称 [32]。
- 信誉随下载量自动积累，没有固定阈值。Microsoft 的描述是“several weeks and hundreds of clean installs from a wide audience”，而且没有人工提交加速的渠道 [32]。
- 用同一签名身份签发后续版本，新版本可以继承信誉。更换签名证书会影响发布者信誉信号 [32]。Artifact Signing 的信誉跟验证过的发布者身份绑定，与具体证书无关 [61]。OV 证书最长 460 天就要换新密钥，换新后的信誉能否延续，Microsoft 没有写明，未经一手来源证实。
- Windows 11 的智能应用控制（Smart App Control）可能取代 SmartScreen，它会阻止没有正面信誉的未签名文件 [32]。

### 3.7 electron-updater 在 Windows 上的签名校验

- electron-builder 26.18.0 在没有设置 `verifyUpdateCodeSignature: false` 时，会把签名证书的发布者名称写进 `app-update.yml` 的 `publisherName` [26]，默认值是证书 CN [22]。
- electron-updater 6.8.11 下载更新后，用 PowerShell `Get-AuthenticodeSignature` 检查安装包。签名必须有效，签名者 subject 还要和 `publisherName` 匹配。只写 CN 时只比 CN，写完整 DN 时比较 DN 中的每个字段 [25]。`publisherName` 为空时不做校验 [25]。
- **证书续期**：CN 不变（同一法定名称），更新照常校验通过。Artifact Signing 每天换证书，CN 也是同一个验证过的名称 [35][36]。
- **从个人改为公司**：CN 从个人姓名变成公司名称。已安装版本的 `app-update.yml` 里只有旧名称，会拒绝新签名的安装包。electron-builder 文档建议用数组列出新旧两个名称，供轮换证书时使用 [22]。这要求先用旧证书发一个写好两个名称的版本，用户都升级到这个版本后再换证书。
- **名称里有逗号的情况**：中国公司的英文名常以“Co., Ltd.”结尾。我用 6.8.11 的 `rfc2253Parser.ts` 在本地测试过 [25]：
  - 不带 `=` 的字符串（electron-builder 26 默认写入的就是只有 CN 的形式）不解析，直接与 subject 的 CN 比较；
  - 写成完整 DN 时，含逗号的值必须加引号，否则会在逗号处截断。
  
  Windows 返回的 subject 会不会给含逗号的值加引号，本次没有在 Windows 上验证。如果用这类公司名称签名，需要在 Windows 上实测一次更新。
- electron-builder v27 和 electron-updater 7 目前还是预发布版（npm `next` 标签是 27.0.0-alpha.14 和 7.0.0-alpha.13 [29]）。v27 要求 `publisherName` 用完整 DN 格式，缺少 `publisherName` 时直接拒绝更新 [22][25]。

## 4. Linux

- **没有对应的商业证书。** Linux 发行版没有 Gatekeeper 或 SmartScreen 那样的系统机制，也没有面向 AppImage 或 deb 的公共信任代码签名证书。常见做法是 GPG 签名加发布校验和，不需要找 CA，也不涉及发布主体资格。
- **AppImage**：
  - `appimagetool --sign` 调用 gpg 或 gpg2，把签名嵌进 AppImage 文件 [56]。
  - 用 `--appimage-signature` 只能显示签名，不会校验 [56]。校验要用 AppImageUpdate 项目里的 `validate` 工具，AppImageUpdate 自己也内置了校验 [56][57]。
  - AppImage 运行时不会自动校验签名。文档只说 appimaged 守护进程“may”在将来把无有效签名的应用放进沙箱 [56]。
- **deb**：
  - apt 的安全机制是校验仓库 `Release` 文件的 OpenPGP 签名，再沿 `Release` → `Packages` → `.deb` 逐级核对哈希 [58]。
  - 单个 .deb 内嵌的签名（debsig-verify）“not widely used” [58]。Debian 的 dpkg 默认配置是 `no-debsig`，注释说明发行版不使用内嵌签名，开启校验会拒绝所有包 [59]。
  - 所以用户从官网直接下载 .deb、用 `dpkg -i` 或 `apt install ./x.deb` 安装时，不会校验任何签名。只有自建 apt 仓库并签名 `Release`，用户的 apt 才会校验，前提是用户导入了仓库公钥 [58]。
- **electron-builder 和 electron-updater**：
  - electron-builder 文档没有提供 AppImage 或 deb 的 GPG 签名选项 [28]。
  - electron-updater 6.8.11 的 `AppImageUpdater` 和 `DebUpdater` 不检查签名，只用 `latest-linux.yml` 里的 sha512 核对下载的文件 [25]。这个 yml 和安装包放在同一个发布位置，sha512 只能发现文件损坏，挡不住发布位置被篡改。
  - electron-builder v27 文档新增了 `updateManifest` 选项，用 Ed25519 签名 `latest*.yml`，公钥嵌进 `app-update.yml`，electron-updater 下载前校验 [28]。v27 目前还是预发布版 [29]。
- **CI**：GPG 私钥可以存进 GitHub Secrets。CA/B Forum 的硬件要求只针对公共信任代码签名证书 [30]，不涉及 GPG 密钥。
- **用户是否真的校验**：没有找到任何关于 Linux 桌面用户校验 GPG 签名或校验和比例的数据，未经一手来源证实。上面的机制说明默认路径都不校验，除非用户主动运行 `validate`、`sha256sum` 或 `gpg --verify`，或者通过已签名的 apt 仓库安装。

## 5. 对比表

“托管 runner”列指 GitHub 托管 runner。macOS 和 Linux 的方案都可以在托管 runner 上签名，主要差别在 Windows。

| 平台 | 方案 | 适用主体 | 费用 | 办理时间 | 能否在 GitHub 托管 runner 上签名 | 用户看到的名称 |
|---|---|---|---|---|---|---|
| macOS | Apple Developer Program 个人账号 | 个人（含个体户、一人公司），中国大陆可通过 Apple Developer App 注册 [1][2] | 99 USD/年；中国大陆 App 内 ¥688/年 [1][2] | Apple 未公布 | 能。`.p12` 和 API key 放 secrets，导入临时钥匙串 [20][23] | 证书 `Developer ID Application: <拼音姓名> (<Team ID>)` [60] |
| macOS | Apple Developer Program 组织账号 | 法人实体，需 D-U-N-S、网站、域名邮箱、签约授权；中国大陆公司和海外公司都可以 [1][2][4] | 99 USD/年；D-U-N-S 免费 [1][4] | D-U-N-S 最多 5 个工作日，同步到 Apple 最多 2 个工作日；Apple 审核时长未公布 [4] | 能，同上 | `Developer ID Application: <公司英文法定名称> (<Team ID>)` [60] |
| Windows | Microsoft Artifact Signing | 12 个国家和地区的组织；美国、加拿大的个人。不含中国大陆个人和公司 [33] | Basic 9.99 USD/月（5,000 次签名），Premium 99.99 USD/月 [38] | 组织身份验证 1–20 个工作日 [33] | 能。只能用 Windows runner，有官方 Action [40] | 验证过的法定名称（个人或组织），不能自定义 [33][35] |
| Windows | CA 的 OV 证书 | 组织 [42][49] | GlobalSign 中国 ¥3,488/年 [49]；SSL.com 129 USD/年（另需密钥存放方案）[42]；Certum Standard €169–209 [51] | SSL.com 标准 3–5 天 [42]；GlobalSign 未公布 | 取决于密钥存放方式。USB 令牌不能；云签名服务或云 HSM 能 [30][42] | 公司法定名称 |
| Windows | CA 的 IV 证书（个人） | 个人。中国大陆个人是否受理，未经一手来源证实 [44][48][52] | SSL.com 129 USD/年 [44]；Certum Standard €209（云）/€169（套件）[51] | SSL.com 标准 3–5 天 [44]；Certum 未公布 | SSL.com 配 eSigner 能 [47]；Certum SimplySign 未经一手来源证实 [53] | 个人姓名 |
| Windows | CA 的 EV 证书 | 组织；SSL.com 另有个体户 EV [45] | GlobalSign 中国 ¥5,880/年 [49]；SSL.com 349 USD/年 [43]；Certum €359–379 [51] | SSL.com 标准 3–5 天 [43] | 同 OV | 公司法定名称。SmartScreen 表现与 OV 相同 [31] |
| Windows | CA 云签名服务（SSL.com eSigner） | 持有 SSL.com OV、IV 或 EV 证书者 [46] | IV/OV 20 USD/月起（20 次签名），EV 100 USD/月起（10 次签名），年付打 75 折 [46] | 随证书 | 能。有官方 GitHub Action，示例用 ubuntu runner [47] | 同所用证书 |
| Windows | 自备云 HSM 加 CA 证书 | 同所买证书 | 证书价，加 SSL.com 证明费 75 USD（Azure、GCP）[42]，加 Key Vault Premium HSM 密钥 1 USD/月起 [63] | 随证书 | 能。需要自定义 `sign` 钩子 [22] | 同所用证书 |
| Windows | SignPath Foundation | 公开开源项目（OSI 许可证，无商业双许可）[54] | 免费 | 未调查 | 能，而且必须用托管 runner [55] | SignPath Foundation [54]。Pigcode 不符合条件 |
| Windows | Certum Open Source Code Signing | 开源项目的个人开发者，不能用于商业分发 [52] | €49（云）/€69（套件）[51] | 未公布 | 未经一手来源证实 | `Open Source Developer, <姓名>` [52]。Pigcode 不符合条件 |
| Windows | Microsoft Store（MSIX） | 个人或公司 Store 账号；中国大陆能否开户，未经一手来源证实 [41] | 免费 [41] | 公司账号人工审核 2–5 个工作日 [41] | 不需要自己签名，由 Store 重新签名 [31] | Store 账号的发布者名称（显示方式未核实）。不能用 electron-updater 更新 [27] |
| Linux | AppImage 内嵌 GPG 签名 | 任何人 | 免费 | 即时 | 能。GPG 私钥放 secrets | GPG 密钥的 UID，只有用户运行 `validate` 时才看到 [56] |
| Linux | 自建 apt 仓库并签名 `Release` | 任何人 | 免费（仓库托管另计） | 即时 | 能 | 无名称展示，apt 用仓库公钥校验 [58] |
| Linux | 发布 SHA256 校验和（可加 GPG 签名） | 任何人 | 免费 | 即时 | 能 | 无。只有用户手动比对时才起作用 |

## 6. 来源

所有来源的访问日期都是 2026-10-30。

1. Apple, Enrollment support: https://developer.apple.com/support/enrollment/
2. Apple（简体中文）, 使用 Apple Developer App 注册、验证和续订: https://developer.apple.com/cn/help/account/membership/enrolling-in-the-app/ ；另见 https://developer.apple.com/cn/support/enrollment/
3. Apple, Apple Developer Program enrollment: https://developer.apple.com/programs/enroll/
4. Apple, D-U-N-S Number: https://developer.apple.com/help/account/membership/D-U-N-S/ ；中文版 https://developer.apple.com/cn/help/account/membership/D-U-N-S/
5. Apple, Identity verification: https://developer.apple.com/help/account/membership/identity-verification/
6. Apple, Updating your account information: https://developer.apple.com/help/account/membership/updating-your-account-information/
7. Apple Developer Forums，Apple Developer Support 关于迁移后 Team ID 的回复: https://developer.apple.com/forums/thread/853310
8. Apple Developer Forums，迁移后 Team ID 与 Developer ID 证书的提问（无 Apple 员工回复）: https://developer.apple.com/forums/thread/852873
9. Apple Developer Forums，迁移卡住 6 周以上的报告: https://developer.apple.com/forums/thread/852115
10. Apple, Signing Mac Software with Developer ID: https://developer.apple.com/developer-id/
11. Apple, Developer ID certificates: https://developer.apple.com/help/account/certificates/create-developer-id-certificates/
12. Apple, App Store Connect role permissions: https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions/
13. Apple, Replacing Developer ID certificates issued from the previous Sub-CA: https://developer.apple.com/help/account/certificates/replace-developer-id-certificates/
14. Apple, TN3127: Inside Code Signing: Requirements: https://developer.apple.com/documentation/technotes/tn3127-inside-code-signing-requirements
15. Apple, Notarizing macOS software before distribution: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
16. Apple, Customizing the notarization workflow: https://developer.apple.com/documentation/security/customizing-the-notarization-workflow
17. Apple, Creating API Keys for App Store Connect API: https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api
18. Electron, autoUpdater: https://www.electronjs.org/docs/latest/api/auto-updater
19. Squirrel.Mac 源码（master）: https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLCodeSignature.m ，https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLUpdater.m ，https://github.com/Squirrel/Squirrel.Mac/blob/master/Squirrel/SQRLInstaller.m
20. electron-builder v26, macOS Notarization: https://www.electron.build/v26/docs/features/code-signing/notarization
21. electron-builder 源码 `MacTargetHelper.ts`，26.18.0 标签: https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/packages/app-builder-lib/src/mac/MacTargetHelper.ts ；master: https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/src/targets/mac/MacTargetHelper.ts
22. electron-builder, Windows 代码签名文档，v27（未发布）: https://www.electron.build/docs/features/code-signing/code-signing-win ；v26: https://www.electron.build/v26/docs/features/code-signing/code-signing-win
23. GitHub Docs, Signing Xcode applications: https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications
24. @electron/notarize README: https://github.com/electron/notarize/blob/main/README.md
25. electron-updater 源码，6.8.11 标签: https://github.com/electron-userland/electron-builder/tree/electron-updater%406.8.11/packages/electron-updater/src （`windowsExecutableCodeSignatureVerifier.ts`、`NsisUpdater.ts`、`MacUpdater.ts`、`AppImageUpdater.ts`、`DebUpdater.ts`、`DownloadedUpdateHelper.ts`），以及 `packages/builder-util-runtime/src/rfc2253Parser.ts`；master（v7）: https://github.com/electron-userland/electron-builder/tree/master/packages/electron-updater/src
26. electron-builder 源码，26.18.0 标签: https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/packages/app-builder-lib/src/publish/PublishManager.ts ，https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/packages/app-builder-lib/src/winPackager.ts
27. electron-builder v26, Auto Update: https://www.electron.build/v26/docs/features/auto-update
28. electron-builder, Linux: https://www.electron.build/docs/linux
29. npm registry: https://registry.npmjs.org/electron-builder ，https://registry.npmjs.org/electron-updater （latest 26.18.0 / 6.8.11，next 27.0.0-alpha.14 / 7.0.0-alpha.13）
30. CA/Browser Forum, Baseline Requirements for the Issuance and Management of Publicly-Trusted Code Signing Certificates v3.11.0（§6.2.7.4、§6.3.2）: https://cabforum.org/working-groups/code-signing/requirements/
31. Microsoft Learn, Code signing options for Windows app developers（ms.date 2026-08-29）: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
32. Microsoft Learn, SmartScreen reputation for Windows app developers（ms.date 2026-05-04）: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
33. Microsoft Learn, Quickstart: Set up Artifact Signing（2026-10-08 更新）: https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
34. Microsoft Q&A，Microsoft 员工关于组织成立年限的答复: https://learn.microsoft.com/en-us/answers/questions/5977141/azure-artifact-signing-trusted-signing-is-a-us-llc
35. Microsoft Learn, Artifact Signing FAQ: https://learn.microsoft.com/en-us/azure/artifact-signing/faq
36. Microsoft Learn, Artifact Signing certificate management: https://learn.microsoft.com/en-us/azure/artifact-signing/concept-certificate-management
37. Azure, Artifact Signing pricing: https://azure.microsoft.com/en-us/pricing/details/artifact-signing/
38. Azure Retail Prices API（服务名 Trusted Signing）: https://prices.azure.com/api/retail/prices?$filter=contains(serviceName,'Signing')
39. Microsoft Learn, Set up signing integrations to use Artifact Signing: https://learn.microsoft.com/en-us/azure/artifact-signing/how-to-signing-integrations
40. Azure/artifact-signing-action README: https://github.com/Azure/artifact-signing-action
41. Microsoft Learn, Open a Microsoft Store developer account（ms.date 2026-10-29）: https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account
42. SSL.com, OV Code Signing 购买页: https://www.ssl.com/certificates/code-signing/buy/
43. SSL.com, EV Code Signing 购买页: https://www.ssl.com/certificates/ev-code-signing/buy/
44. SSL.com, IV Code Signing: https://www.ssl.com/products/software-integrity/code-signing/iv/
45. SSL.com, Sole Proprietor EV Code Signing: https://www.ssl.com/certificates/iv-ev-code-signing/buy/
46. SSL.com, eSigner Pricing for Code Signing: https://www.ssl.com/guide/esigner-pricing-for-code-signing/
47. SSL.com, Cloud Code Signing Integration with GitHub Actions: https://www.ssl.com/how-to/cloud-code-signing-integration-with-github-actions/ ；Action: https://github.com/SSLcom/esigner-codesign
48. SSL.com, Identity Validation for SSL.com Certificates: https://www.ssl.com/guide/identity-validation-for-ssl-com-certificates-a-complete-guide/
49. GlobalSign 中国, 代码签名证书商店页: https://www.globalsign.cn/shop/code-signing
50. GlobalSign 中国, 代码签名证书: https://www.globalsign.cn/code-signing-certificate ；GlobalSign 国际站: https://shop.globalsign.com/en/code-signing
51. Certum, Code Signing 商店页: https://shop.certum.eu/code-signing.html
52. Certum, Code Signing required documents: https://support.certum.eu/en/code-signing-required-documents/
53. Certum, Open Source Code Signing in the Cloud: https://shop.certum.eu/open-source-code-signing-on-simplysign.html ；套件版: https://shop.certum.eu/open-source-code-signing.html
54. SignPath Foundation, Terms: https://signpath.org/terms
55. SignPath Docs, Trusted Build Systems: GitHub: https://docs.signpath.io/trusted-build-systems/github
56. AppImage docs, Signing AppImages: https://docs.appimage.org/packaging-guide/optional/signatures.html
57. AppImageUpdate README: https://github.com/AppImageCommunity/AppImageUpdate
58. Debian Wiki, SecureApt: https://wiki.debian.org/SecureApt
59. Debian dpkg 默认配置: https://salsa.debian.org/dpkg-team/dpkg/-/raw/main/debian/dpkg.cfg ；dpkg(1): https://manpages.debian.org/trixie/dpkg/dpkg.1.en.html
60. 本机实测：在调研用的 Mac 上对 `/Applications` 下的应用运行 `codesign -d --extract-certificates`，再用 `openssl x509` 读取叶证书主题、有效期和签发中间证书的 OU。这不是公开来源。
61. Microsoft Learn, Sign an MSIX package（ms.date 2026-04-14）: https://learn.microsoft.com/en-us/windows/msix/package/signing-package-overview
62. GitHub Docs, GitHub Actions billing: https://docs.github.com/en/billing/concepts/product-billing/github-actions
63. Azure Retail Prices API（Key Vault，eastus）: https://prices.azure.com/api/retail/prices?$filter=serviceName%20eq%20'Key%20Vault'%20and%20armRegionName%20eq%20'eastus'
64. Apple Support, Safely open apps on your Mac: https://support.apple.com/en-us/102445
65. electron-builder, Code Signing for macOS: https://www.electron.build/docs/features/code-signing/code-signing-mac
