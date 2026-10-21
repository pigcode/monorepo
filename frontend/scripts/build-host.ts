/** 把 Host utilityProcess 入口、核心服务与 stdio MCP 桥打成可加载的 ESM bundle。 */
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { build, type BuildOptions } from "esbuild"

/** 仓库根目录。 */
const root = fileURLToPath(new URL("..", import.meta.url))
/** Host 构建产物目录。 */
const outDir = join(root, "apps/desktop/out/host")

/** 共用 esbuild 选项；CJS 依赖需要 require 才能加载 Node 内置模块。 */
const shared: BuildOptions = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // node-pty 含原生二进制，交给打包阶段处理，不能打进 bundle。
  external: ["better-sqlite3", "node-pty"],
  sourcemap: true,
  outExtension: { ".js": ".mjs" },
  banner: {
    js: 'import { createRequire as __pigcodeCreateRequire } from "node:module"; const require = __pigcodeCreateRequire(import.meta.url);',
  },
}

/** 核心服务作为独立条目，供 profile 以相对 URL 加载。 */
const coreEntries: Record<string, string> = {
  storage: join(root, "apps/host/src/services/storage.ts"),
  projects: join(root, "apps/host/src/services/projects.ts"),
  threads: join(root, "apps/host/src/services/threads.ts"),
  sessions: join(root, "apps/host/src/services/sessions.ts"),
  "mcp-bridge": join(root, "apps/host/src/services/mcp-bridge.ts"),
  browser: join(root, "apps/host/src/services/browser.ts"),
  providers: join(root, "apps/host/src/providers/registry.ts"),
  workspace: join(root, "apps/host/src/services/workspace.ts"),
  git: join(root, "apps/host/src/services/git.ts"),
  github: join(root, "apps/host/src/services/github.ts"),
  worktrees: join(root, "apps/host/src/services/worktrees.ts"),
  checkpoints: join(root, "apps/host/src/services/checkpoints.ts"),
  terminal: join(root, "apps/host/src/services/terminal.ts"),
  schedules: join(root, "apps/host/src/services/schedules.ts"),
}

await build({
  entryPoints: [join(root, "apps/host/src/entry.ts")],
  outfile: join(outDir, "index.mjs"),
  ...shared,
})
await build({ entryPoints: coreEntries, outdir: join(outDir, "core"), ...shared })

// stdio 桥由 Codex/Claude 以系统 node 子进程启动，不能依赖 Node 的类型剥离；单独编成 .mjs。
await build({
  entryPoints: [join(root, "apps/host/src/mcp/stdio-bridge.ts")],
  outfile: join(outDir, "mcp/stdio-bridge.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
})

/** 与 core bundle 对应的默认 profile；相对 entry 由 loader 按 baseUrl 解析。 */
const profileDir = join(outDir, "profile")
await mkdir(profileDir, { recursive: true })
await writeFile(
  join(profileDir, "desktop.yml"),
  [
    "plugins:",
    "  - id: core.storage",
    "    name: ../core/storage.mjs",
    "    config:",
    '      path: ":memory:"',
    ...Object.keys(coreEntries)
      .filter((name) => name !== "storage")
      .flatMap((name) => [`  - id: core.${name}`, `    name: ../core/${name}.mjs`]),
    "",
  ].join("\n"),
  "utf8",
)
