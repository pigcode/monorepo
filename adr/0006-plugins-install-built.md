# 插件按构建好的包装，应用不再带编译器

以前插件可以直接装 TypeScript 源码目录：Host 在安装时用 esbuild 把 `.ts/.tsx` 转成 `.mjs`。这带来两个问题：应用的安装包必须带 esbuild 和它的平台二进制（十几 MB，还容易被 electron-builder 漏掉平台包，打出来的应用装插件直接报 `@esbuild/darwin-arm64 could not be found`）；并且每个装了插件的用户都要付一次编译成本。决定：**插件按构建好的 JS 安装**，正式应用不带编译器。

## Considered Options

- 继续在安装时编译，只把 esbuild 的平台包塞进安装包：安装包更大，插件作者不用构建，但产品里长期带一个编译器。
- 插件必须是构建产物：作者多一步 `pnpm build`，应用可以去掉编译器；代价是打包后的应用不能直接装源码目录。

## Consequences

- `examples/*` 都有 `build` 脚本（`scripts/build-plugin.ts`），manifest 的 `pigcode.host` / `pigcode.client` 指向 `dist/`。E2E 在 globalSetup 里先构建样例。
- 开发版（从仓库运行、E2E）仍然可以装源码目录：esbuild 是 Host 的 devDependency，按需加载；打包后的应用里没有它，装源码插件会得到 `PLUGIN_TYPESCRIPT_NO_COMPILER` 的明确错误。
- `apps/desktop` 不再依赖 esbuild。需要编译插件的只是开发环境。
- 脚手架默认仍生成源码和 `build.ts`：作者要装进打包后的应用，先 `pnpm install && pnpm build`，再把入口指向 `dist/`。以后可以把脚手架改成默认就构建。
