# Pigcode M0-B UI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 M0-A 的纯 TypeScript 调试渲染器替换成 pigclaude 迁移而来的 React 19 + shadcn Base UI 桌面 UI，接通 Host RPC、client store/slots、插件管理 UI 与第三方 UI 插件加载，并建立视觉回归与 Electron E2E。

**Architecture:** Renderer 用 React 19 挂载 `@pigcode/ui-shell`，通过 `@pigcode/client-runtime` 的 connection/store/slots 消费 Host 的 MessagePort RPC；组件原语统一用 `@base-ui/react@1.9.0`（shadcn Base UI 版本），不再使用 Radix。核心视图与第三方 UI 插件都通过 slot registry 注册；插件 client bundle 通过 `pigcode-plugin://` 加载。

**Tech Stack:** React 19.2.3、React DOM 19.2.3、`@base-ui/react@1.9.0`、Tailwind 4、TipTap 3.32、electron-vite 5、Vitest 4、Playwright 1.64.1。

## Global Constraints

- Node `>=22`，`pnpm@10.28.2`；所有包 ESM，包名 `@pigcode/*`。
- TypeScript `strict: true`；禁止 `any`、`@ts-ignore`、`@ts-expect-error`。
- 每个 `.ts`/`.tsx` 文件最多 500 行；源文件开头中文注释；导出符号有中文注释。
- **组件原语只用 `@base-ui/react@1.9.0`**；最终代码不允许出现 `@radix-ui/*` 或 `radix-ui` 依赖。
- React 19 是共享 external；UI 插件不得自带 React、React DOM 或第二份 Base UI。
- 不使用 pigclaude 的登录、会员、OAuth、设备授权、Claude 账号池、代理、用量页。
- 生产渲染路径不得读取 fixture；fixture 只允许出现在测试或视觉基线。
- 所有新用户可见文案进入 locale 目录；v1.0 支持 `zh-CN` 与 `en-US`。
- Electron 保持 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`；preload 继续输出 CJS。
- 仍使用 M0-A 的 MessagePort RPC；不引入 localhost HTTP/WebSocket、token、CORS。
- 视觉回归使用 Playwright `toHaveScreenshot`；shell 迁移先做“无视觉变化”，接真实数据后再更新基线。
- 每个任务先写失败测试，再实现；提交使用 Conventional Commits。

---

## File Structure

```text
frontend/
  apps/desktop/
    electron.vite.config.ts                 # 加 react/tailwind 插件
    src/main/window-options.ts              # pigclaude 窗口材质与标题栏
    src/main/index.ts                       # 窗口/主题/IPC
    src/preload/index.ts                    # MessagePort + 最小原生 bridge
    src/renderer/index.html                 # 只保留 root 节点
    src/renderer/src/main.tsx               # React 入口
    src/renderer/src/app.tsx                # 应用外壳与视图切换
    src/renderer/src/global.d.ts            # window.pigcodeNative 类型
    src/renderer/src/core-plugins.ts        # 内置 UI 插件注册
    visual/                                 # Playwright 视觉回归
    e2e/                                    # Electron E2E
  packages/
    ui-primitives/
      src/styles/{tokens,globals,glass}.css
      src/theme/*.ts
      src/components/*.tsx
      src/locale/*.ts
    ui-shell/
      src/{shell,window-controls,traffic-lights,workspace-sidebar,settings-sidebar,add-project-dialog,icon,toast}.tsx
      src/plugin.ts
    ui-chat/
      src/{chat-view,message-list,message-item,tool-card,approval-card,plan-card,diff-summary,environment-drawer}.tsx
      src/plugin.ts
    ui-composer/
      src/{composer,composer-options,smart-punctuation}.tsx
      src/plugin.ts
    ui-settings/
      src/{settings-view,settings-nav,appearance-page,general-page,provider-page}.tsx
      src/plugin.ts
    ui-plugin-manager/
      src/{plugin-manager-view,plugin-list,install-form}.tsx
      src/plugin.ts
    client-runtime/
      src/{connection,store,commands,slots,renderer,locale,modules}.ts(x)
  examples/
    ui-debug-panel/                         # 已有示例，改成注册 React slot
```

---

### Task 1: React 19 + Base UI + Tailwind Toolchain

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/apps/desktop/package.json`
- Modify: `frontend/apps/desktop/electron.vite.config.ts`
- Create: `frontend/packages/ui-primitives/package.json`
- Create: `frontend/packages/ui-primitives/tsconfig.json`
- Create: `frontend/packages/ui-primitives/src/index.ts`
- Test: `frontend/packages/ui-primitives/src/smoke.test.tsx`

**Interfaces:**
- Consumes: M0-A 的 monorepo 与 Electron 构建。
- Produces: React 19、`@base-ui/react`、Tailwind 4、Testing Library 可用；`@pigcode/ui-primitives` 可被其他包导入。

- [ ] **Step 1: 写失败的 React 测试**

`frontend/packages/ui-primitives/src/smoke.test.tsx`：

```tsx
/** 验证 React 19 与 Testing Library 在 UI 包中可用。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

describe("ui-primitives", () => {
  it("renders a React element", () => {
    render(<button type="button">hello</button>)
    expect(screen.getByRole("button", { name: "hello" })).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/smoke.test.tsx`
Expected: FAIL，缺少 `@testing-library/react` 或 jsdom。

- [ ] **Step 3: 安装依赖并配置构建**

根 `frontend/package.json` 的 `devDependencies` 增加：

```json
{
  "@testing-library/dom": "10.4.1",
  "@testing-library/react": "16.3.0",
  "@testing-library/user-event": "14.6.1",
  "@vitejs/plugin-react": "5.1.0",
  "@tailwindcss/vite": "4.1.14",
  "jsdom": "26.1.0",
  "tailwindcss": "4.1.14"
}
```

`frontend/apps/desktop/package.json` 的 `dependencies` 增加（`@pigcode/ui-shell`、`@pigcode/ui-chat`、`@pigcode/ui-composer`、`@pigcode/ui-settings`、`@pigcode/ui-plugin-manager` 在各自任务创建后再加入，Task 12 统一补全）：

```json
{
  "@base-ui/react": "1.9.0",
  "@pigcode/ui-primitives": "workspace:*",
  "@tiptap/extension-placeholder": "3.32.0",
  "@tiptap/extension-typography": "3.32.0",
  "@tiptap/react": "3.32.0",
  "@tiptap/starter-kit": "3.32.0",
  "react": "19.2.3",
  "react-dom": "19.2.3"
}
```

`frontend/apps/desktop/electron.vite.config.ts`：

```ts
/** Electron 构建配置：renderer 使用 React 与 Tailwind。 */
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "electron-vite"

export default defineConfig({
  main: { build: { outDir: "out/main" } },
  preload: {
    build: {
      outDir: "out/preload",
      rollupOptions: { output: { format: "cjs", entryFileNames: "index.cjs" } },
    },
  },
  renderer: {
    root: "src/renderer",
    plugins: [react(), tailwindcss()],
    build: { outDir: "out/renderer" },
  },
})
```

`frontend/packages/ui-primitives/package.json`：

```json
{
  "name": "@pigcode/ui-primitives",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles/*": "./src/styles/*",
    "./*": "./src/*.tsx"
  },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@base-ui/react": "1.9.0",
    "@pigcode/contracts": "workspace:*",
    "class-variance-authority": "0.7.1",
    "clsx": "2.1.1",
    "lucide-react": "1.0.1",
    "tailwind-merge": "3.4.0"
  },
  "peerDependencies": { "react": "^19", "react-dom": "^19" },
  "devDependencies": {
    "@types/react": "19.2.2",
    "@types/react-dom": "19.2.2",
    "typescript": "5.9.3",
    "vitest": "4.0.16"
  }
}
```

`frontend/packages/ui-primitives/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "noEmit": true, "jsx": "react-jsx", "types": ["node"] },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

`frontend/packages/ui-primitives/src/index.ts`：

```ts
/** Pigcode 设计系统原语的公开入口。 */
export {}
```

- [ ] **Step 4: 安装并运行测试**

Run: `cd frontend && pnpm install && pnpm vitest run packages/ui-primitives/src/smoke.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add package.json pnpm-lock.yaml apps/desktop packages/ui-primitives
git commit -m "chore(ui): add react 19, base ui, and tailwind toolchain"
```

---

### Task 2: Tokens, Global CSS, Theme, and Locale

**Files:**
- Create: `frontend/packages/ui-primitives/src/styles/tokens.css`
- Create: `frontend/packages/ui-primitives/src/styles/globals.css`
- Create: `frontend/packages/ui-primitives/src/styles/glass.css`
- Create: `frontend/packages/ui-primitives/src/theme/theme-model.ts`
- Create: `frontend/packages/ui-primitives/src/theme/theme-presets.ts`
- Create: `frontend/packages/ui-primitives/src/theme/appearance-settings.ts`
- Create: `frontend/packages/ui-primitives/src/theme/appearance-tokens.ts`
- Create: `frontend/packages/ui-primitives/src/theme/apply-appearance.ts`
- Create: `frontend/packages/ui-primitives/src/theme/appearance-storage.ts`
- Create: `frontend/packages/ui-primitives/src/theme/use-appearance.ts`
- Create: `frontend/packages/ui-primitives/src/locale/messages.zh-CN.ts`
- Create: `frontend/packages/ui-primitives/src/locale/messages.en-US.ts`
- Create: `frontend/packages/ui-primitives/src/locale/locale.tsx`
- Test: `frontend/packages/ui-primitives/src/theme/theme-model.test.ts`
- Test: `frontend/packages/ui-primitives/src/locale/locale.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 UI 包。
- Produces: `resolveTheme()`、`deriveAppearance()`、`applyAppearance()`、`useAppearance()`、`LocaleProvider`、`useLocale()`。

- [ ] **Step 1: 写失败测试**

`frontend/packages/ui-primitives/src/theme/theme-model.test.ts`：

```ts
/** 验证主题解析与系统深色跟随。 */
import { describe, expect, it } from "vitest"
import { resolveTheme } from "./theme-model"

describe("resolveTheme", () => {
  it("follows the system preference", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
  })

  it("keeps an explicit preference", () => {
    expect(resolveTheme("light", true)).toBe("light")
  })
})
```

`frontend/packages/ui-primitives/src/locale/locale.test.tsx`：

```tsx
/** 验证 locale provider 在中文与英文之间切换。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocaleProvider, useLocale } from "./locale"

function Probe() {
  const { t } = useLocale()
  return <span>{t("nav.newThread")}</span>
}

describe("locale", () => {
  it("renders Chinese messages", () => {
    render(
      <LocaleProvider locale="zh-CN">
        <Probe />
      </LocaleProvider>,
    )
    expect(screen.getByText("新会话")).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/theme/theme-model.test.ts packages/ui-primitives/src/locale/locale.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 迁移样式与主题**

从 pigclaude 复制并改包名：

```bash
PIGCLAUDE=/Users/liuqin/Documents/workspace/typescript/pigclaude/frontend/apps/desktop/src/renderer/src
cp "$PIGCLAUDE/styles/tokens.css" frontend/packages/ui-primitives/src/styles/tokens.css
cp "$PIGCLAUDE/styles/glass.css" frontend/packages/ui-primitives/src/styles/glass.css
cp "$PIGCLAUDE/styles/app.css" frontend/packages/ui-primitives/src/styles/globals.css
cp "$PIGCLAUDE/models/theme-model.ts" frontend/packages/ui-primitives/src/theme/theme-model.ts
cp "$PIGCLAUDE/models/theme-presets.ts" frontend/packages/ui-primitives/src/theme/theme-presets.ts
cp "$PIGCLAUDE/models/appearance-settings.ts" frontend/packages/ui-primitives/src/theme/appearance-settings.ts
cp "$PIGCLAUDE/models/appearance-tokens.ts" frontend/packages/ui-primitives/src/theme/appearance-tokens.ts
cp "$PIGCLAUDE/models/appearance-glass.ts" frontend/packages/ui-primitives/src/theme/appearance-glass.ts
cp "$PIGCLAUDE/lib/apply-appearance.ts" frontend/packages/ui-primitives/src/theme/apply-appearance.ts
cp "$PIGCLAUDE/lib/appearance-storage.ts" frontend/packages/ui-primitives/src/theme/appearance-storage.ts
cp "$PIGCLAUDE/hooks/use-appearance.ts" frontend/packages/ui-primitives/src/theme/use-appearance.ts
```

适配规则：

- `window.pigclaude` → `window.pigcodeNative`；平台字段改为 `window.pigcodeNative?.platform`。
- `use-appearance.ts` 里的 `parseDevView`/`renderDockIcon` 删除；开发期 `?theme=` 参数保留。
- 所有 import 改为相对路径；移除对 `@pigclaude/*` 的引用。
- `globals.css` 的 `@import "./tokens.css";` 与 `@import "./glass.css";` 放在文件顶部。
- `tokens.css` 保持原样，不改色值。

`locale.tsx`：

```tsx
/** 提供最小本地化能力；M0-B 只覆盖 shell/chat/settings 的可见文案。 */import { createContext, useContext, useMemo, type ReactNode } from "react"
import { enUS } from "./messages.en-US"
import { zhCN } from "./messages.zh-CN"

export type Locale = "zh-CN" | "en-US"
export type MessageKey = keyof typeof zhCN

const dictionaries: Record<Locale, Record<MessageKey, string>> = {
  "zh-CN": zhCN,
  "en-US": enUS,
}

interface LocaleValue {
  locale: Locale
  t: (key: MessageKey) => string
}

const LocaleContext = createContext<LocaleValue | null>(null)

/** 提供 locale 与 t()。 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo(
    () => ({ locale, t: (key: MessageKey) => dictionaries[locale][key] }),
    [locale],
  )
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

/** 读取当前 locale；未挂 provider 时抛错。 */
export function useLocale(): LocaleValue {
  const value = useContext(LocaleContext)
  if (!value) throw new Error("useLocale must be used inside LocaleProvider")
  return value
}
```

`messages.zh-CN.ts` 与 `messages.en-US.ts` 至少包含：

```ts
export const zhCN = {
  "nav.newThread": "新会话",
  "nav.search": "搜索",
  "nav.projects": "项目",
  "settings.title": "设置",
  "settings.general": "通用",
  "settings.appearance": "外观",
  "settings.providers": "服务提供方",
  "settings.plugins": "插件",
  "composer.placeholder": "让 Claude 做点什么，@ 引用文件，/ 使用命令",
  "chat.send": "发送",
  "chat.interrupt": "中断",
  "chat.approval.allowOnce": "允许一次",
  "chat.approval.allowSession": "本会话内允许",
  "chat.approval.deny": "拒绝",
  "plugins.install": "安装本地插件",
  "plugins.enable": "启用",
  "plugins.disable": "停用",
  "plugins.empty": "还没有安装插件",
  "status.reconnected": "已重新连接",
} as const
```

`messages.en-US.ts` 用同样的 key，并用 `satisfies Record<keyof typeof zhCN, string>` 校验。

`frontend/packages/ui-primitives/src/index.ts` 追加：

```ts
/** 导出主题与本地化能力。 */
export * from "./theme/theme-model"
export * from "./theme/appearance-settings"
export * from "./theme/appearance-tokens"
export * from "./theme/apply-appearance"
export * from "./theme/appearance-storage"
export * from "./theme/use-appearance"
export * from "./locale/locale"
```

`frontend/packages/ui-primitives/src/global.d.ts`：

```ts
/** preload 暴露的最小原生桥；渲染进程不直接访问 Node。 */
interface Window {
  pigcodeNative?: {
    platform: string
    setThemeSource(source: "light" | "dark" | "system"): Promise<void>
    windowControl(action: "minimize" | "maximize" | "close"): Promise<void>
    isMaximized(): Promise<boolean>
  }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/theme/theme-model.test.ts packages/ui-primitives/src/locale/locale.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-primitives
git commit -m "feat(ui): migrate pigclaude tokens, theme, and locale"
```

---

### Task 3: Core Primitives on Base UI

**Files:**
- Create: `frontend/packages/ui-primitives/src/components/button.tsx`
- Create: `frontend/packages/ui-primitives/src/components/input.tsx`
- Create: `frontend/packages/ui-primitives/src/components/textarea.tsx`
- Create: `frontend/packages/ui-primitives/src/components/field.tsx`
- Create: `frontend/packages/ui-primitives/src/components/badge.tsx`
- Create: `frontend/packages/ui-primitives/src/components/separator.tsx`
- Create: `frontend/packages/ui-primitives/src/components/spinner.tsx`
- Create: `frontend/packages/ui-primitives/src/components/skeleton.tsx`
- Create: `frontend/packages/ui-primitives/src/components/tabs.tsx`
- Create: `frontend/packages/ui-primitives/src/components/switch.tsx`
- Create: `frontend/packages/ui-primitives/src/components/checkbox.tsx`
- Create: `frontend/packages/ui-primitives/src/components/radio-group.tsx`
- Create: `frontend/packages/ui-primitives/src/components/slider.tsx`
- Create: `frontend/packages/ui-primitives/src/components/toggle-group.tsx`
- Create: `frontend/packages/ui-primitives/src/components/collapsible.tsx`
- Create: `frontend/packages/ui-primitives/src/components/cn.ts`
- Modify: `frontend/packages/ui-primitives/src/index.ts`
- Test: `frontend/packages/ui-primitives/src/components/button.test.tsx`
- Test: `frontend/packages/ui-primitives/src/components/switch.test.tsx`

**Interfaces:**
- Consumes: Task 2 的 tokens 与 Tailwind。
- Produces: `Button`、`Input`、`Textarea`、`Field`、`Badge`、`Separator`、`Spinner`、`Skeleton`、`Tabs`、`Switch`、`Checkbox`、`RadioGroup`、`Slider`、`ToggleGroup`、`Collapsible`。

- [ ] **Step 1: 写失败测试**

`frontend/packages/ui-primitives/src/components/button.test.tsx`：

```tsx
/** 验证 Button 的变体、render 替换与点击。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "./button"

describe("Button", () => {
  it("renders a button with a variant class", () => {
    render(<Button variant="primary">发送</Button>)
    expect(screen.getByRole("button", { name: "发送" }).className).toContain("btn-primary")
  })

  it("supports render replacement", () => {
    render(<Button render={<a href="/settings" />}>设置</Button>)
    expect(screen.getByRole("link", { name: "设置" })).toBeTruthy()
  })

  it("calls onClick", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>点我</Button>)
    await userEvent.click(screen.getByRole("button", { name: "点我" }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

`frontend/packages/ui-primitives/src/components/switch.test.tsx`：

```tsx
/** 验证 Base UI Switch 的受控切换。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { Switch } from "./switch"

function Controlled() {
  const [checked, setChecked] = useState(false)
  return <Switch checked={checked} onCheckedChange={setChecked} aria-label="深色模式" />
}

describe("Switch", () => {
  it("toggles", async () => {
    render(<Controlled />)
    const control = screen.getByRole("switch", { name: "深色模式" })
    await userEvent.click(control)
    expect(control.getAttribute("aria-checked")).toBe("true")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/components/button.test.tsx packages/ui-primitives/src/components/switch.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现核心原语**

`cn.ts`：

```ts
/** 合并 Tailwind 类名。 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

`button.tsx`：

```tsx
/** 基于 Base UI useRender 的按钮；样式沿用 pigclaude 的 btn 语义。 */
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps, ReactElement } from "react"
import { cn } from "./cn"

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-primary",
      secondary: "btn-secondary",
      ghost: "btn-ghost",
      danger: "btn-danger",
      solidDanger: "btn-solid-danger",
      plain: "",
    },
    size: {
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
      block: "btn-block btn-lg",
      icon: "btn-icon",
    },
  },
  defaultVariants: { variant: "secondary", size: "md" },
})

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** 替换默认的 button 元素，等价于 Radix asChild。 */
    render?: ReactElement
  }

/** 渲染按钮；render 存在时合并类名与事件。 */
export function Button({ className, variant, size, render, ...props }: ButtonProps) {
  return useRender({
    render,
    defaultTagName: "button",
    props: {
      ...props,
      className: cn(buttonVariants({ variant, size }), className),
    },
  })
}
```

`input.tsx`：

```tsx
/** 基于 Base UI Input 的文本输入。 */
import { Input as BaseInput } from "@base-ui/react/input"
import type { ComponentProps } from "react"
import { cn } from "./cn"

export function Input({ className, ...props }: ComponentProps<typeof BaseInput>) {
  return <BaseInput className={cn("field", className)} {...props} />
}
```

`switch.tsx`：

```tsx
/** 基于 Base UI Switch 的开关。 */
import { Switch as BaseSwitch } from "@base-ui/react/switch"
import type { ComponentProps } from "react"
import { cn } from "./cn"

export function Switch({ className, ...props }: ComponentProps<typeof BaseSwitch.Root>) {
  return (
    <BaseSwitch.Root className={cn("switch", className)} {...props}>
      <BaseSwitch.Thumb className="switch-thumb" />
    </BaseSwitch.Root>
  )
}
```

其余组件映射：

- `tabs.tsx`：`Tabs.Root/List/Tab/Panel`。
- `checkbox.tsx`：`Checkbox.Root/Indicator`。
- `radio-group.tsx`：`RadioGroup.Root` + `Radio.Root/Indicator`（从 `@base-ui/react/radio` 导入 `Radio`）。
- `slider.tsx`：`Slider.Root/Control/Track/Indicator/Thumb/Value`。
- `toggle-group.tsx`：`ToggleGroup` + `Toggle`。
- `collapsible.tsx`：`Collapsible.Root/Trigger/Panel`。
- `field.tsx`：`Field.Root/Label/Description/Error/Control`。
- `separator.tsx`：`Separator`。
- `badge.tsx`、`spinner.tsx`、`skeleton.tsx`：纯样式组件，沿用 pigclaude 类名。

`index.ts` 导出全部组件与 `cn`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/components/button.test.tsx packages/ui-primitives/src/components/switch.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-primitives
git commit -m "feat(ui): add base ui core primitives"
```

---

### Task 4: Overlay Primitives on Base UI

**Files:**
- Create: `frontend/packages/ui-primitives/src/components/dialog.tsx`
- Create: `frontend/packages/ui-primitives/src/components/sheet.tsx`
- Create: `frontend/packages/ui-primitives/src/components/menu.tsx`
- Create: `frontend/packages/ui-primitives/src/components/select.tsx`
- Create: `frontend/packages/ui-primitives/src/components/tooltip.tsx`
- Create: `frontend/packages/ui-primitives/src/components/popover.tsx`
- Create: `frontend/packages/ui-primitives/src/components/scroll-area.tsx`
- Modify: `frontend/packages/ui-primitives/src/index.ts`
- Test: `frontend/packages/ui-primitives/src/components/dialog.test.tsx`
- Test: `frontend/packages/ui-primitives/src/components/select.test.tsx`

**Interfaces:**
- Consumes: Task 3 的 Button/Input/cn。
- Produces: `Dialog`、`Sheet`、`Menu`、`Select`、`Tooltip`、`Popover`、`ScrollArea`。

- [ ] **Step 1: 写失败测试**

`dialog.test.tsx`：

```tsx
/** 验证 Base UI Dialog 的打开与关闭。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Dialog } from "./dialog"
import { Button } from "./button"

describe("Dialog", () => {
  it("opens and closes", async () => {
    render(
      <Dialog.Root>
        <Dialog.Trigger render={<Button>打开</Button>} />
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>标题</Dialog.Title>
            <Dialog.Close render={<Button>关闭</Button>} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>,
    )
    await userEvent.click(screen.getByRole("button", { name: "打开" }))
    expect(screen.getByText("标题")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: "关闭" }))
    expect(screen.queryByText("标题")).toBeNull()
  })
})
```

`select.test.tsx`：

```tsx
/** 验证 Base UI Select 选择选项。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { Select } from "./select"

function Controlled() {
  const [value, setValue] = useState("claude")
  return (
    <Select.Root value={value} onValueChange={(next) => setValue(String(next))}>
      <Select.Trigger aria-label="Provider">{value}</Select.Trigger>
      <Select.Portal>
        <Select.Positioner>
          <Select.Popup>
            <Select.Item value="claude">Claude Code</Select.Item>
            <Select.Item value="codex">Codex</Select.Item>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  )
}

describe("Select", () => {
  it("selects an option", async () => {
    render(<Controlled />)
    await userEvent.click(screen.getByRole("combobox", { name: "Provider" }))
    await userEvent.click(screen.getByText("Codex"))
    expect(screen.getByRole("combobox", { name: "Provider" }).textContent).toContain("codex")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/components/dialog.test.tsx packages/ui-primitives/src/components/select.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 overlay 组件**

`dialog.tsx`：

```tsx
/** 基于 Base UI Dialog 的模态对话框。 */
import { Dialog as BaseDialog } from "@base-ui/react/dialog"
import type { ComponentProps } from "react"
import { cn } from "./cn"

export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Portal: BaseDialog.Portal,
  Backdrop: ({ className, ...props }: ComponentProps<typeof BaseDialog.Backdrop>) => (
    <BaseDialog.Backdrop className={cn("scrim", className)} {...props} />
  ),
  Popup: ({ className, ...props }: ComponentProps<typeof BaseDialog.Popup>) => (
    <BaseDialog.Popup className={cn("dialog", className)} {...props} />
  ),
  Title: BaseDialog.Title,
  Description: BaseDialog.Description,
  Close: BaseDialog.Close,
}
```

`sheet.tsx`：复用 `BaseDialog`，给 `Popup` 加 `side` 变体类（`sheet-left` / `sheet-right`）。

`menu.tsx`：导出 `Menu.Root/Trigger/Portal/Positioner/Popup/Item/Separator/Group/Label`，直接用 Base UI `Menu`。

`select.tsx`：导出 `Select.Root/Trigger/Value/Icon/Portal/Positioner/Popup/List/Item/ItemText/Separator`。

`tooltip.tsx`：导出 `Tooltip.Provider/Root/Trigger/Portal/Positioner/Popup`。

`popover.tsx`：导出 `Popover.Root/Trigger/Portal/Positioner/Popup/Title/Description/Close`。

`scroll-area.tsx`：导出 `ScrollArea.Root/Viewport/Scrollbar/Thumb/Corner`。

Toast 不在 primitives 里实现：M0-B 直接复用 pigclaude 的 `components/toast.tsx`，作为 `ui-shell` 的视觉组件，避免多放一处重复实现。

`index.ts` 导出全部。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-primitives/src/components/dialog.test.tsx packages/ui-primitives/src/components/select.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-primitives
git commit -m "feat(ui): add base ui overlay primitives"
```

---

### Task 5: Shell, Window Chrome, and Native Bridge

**Files:**
- Create: `frontend/packages/ui-shell/package.json`
- Create: `frontend/packages/ui-shell/tsconfig.json`
- Create: `frontend/packages/ui-shell/src/{shell,window-controls,traffic-lights,workspace-sidebar,settings-sidebar,add-project-dialog,icon,toast}.tsx`
- Create: `frontend/packages/ui-shell/src/index.ts`
- Create: `frontend/apps/desktop/src/main/window-options.ts`
- Modify: `frontend/apps/desktop/src/main/index.ts`
- Modify: `frontend/apps/desktop/src/preload/index.ts`
- Create: `frontend/apps/desktop/src/renderer/src/global.d.ts`
- Test: `frontend/packages/ui-shell/src/workspace-sidebar.test.tsx`
- Test: `frontend/apps/desktop/src/main/window-options.test.ts`

**Interfaces:**
- Consumes: Task 3/4 的 primitives。
- Produces: `Shell`、`WorkspaceSidebar`、`SettingsSidebar`、`WindowControls`、`TrafficLights`；`window.pigcodeNative` 的类型与实现。

- [ ] **Step 1: 写失败测试**

`workspace-sidebar.test.tsx`：

```tsx
/** 验证侧栏渲染项目与会话。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { WorkspaceSidebar } from "./workspace-sidebar"

describe("WorkspaceSidebar", () => {
  it("renders projects and threads", () => {
    render(
      <LocaleProvider locale="zh-CN">
        <WorkspaceSidebar
        projects={[{ id: "p1", rootPath: "/tmp/demo", name: "demo", createdAt: "2026-10-20T00:00:00.000Z" }]}
        threads={[
          {
            id: "t1",
            projectId: "p1",
            title: "First thread",
            defaultProviderId: "fake",
            lastProviderId: null,
            lastModelId: null,
            permissionMode: "workspace-write",
            createdAt: "2026-10-20T00:00:00.000Z",
            updatedAt: "2026-10-20T00:00:00.000Z",
            archivedAt: null,
            lastRunId: null,
          },
        ]}
        activeThreadId="t1"
        expandedProjects={{ p1: true }}
        onAddProject={() => {}}
        onToggleProject={() => {}}
        onOpenThread={() => {}}
        onNewThread={() => {}}
        onOpenSettings={() => {}}
      />
      </LocaleProvider>,
    )
    expect(screen.getByText("demo")).toBeTruthy()
    expect(screen.getByText("First thread")).toBeTruthy()
  })
})
```

`window-options.test.ts`：

```ts
/** 验证三平台窗口选项保持 sandbox 与标题栏设置。 */
import { describe, expect, it } from "vitest"
import { createMainWindowOptions } from "./window-options"

describe("createMainWindowOptions", () => {
  it("keeps sandbox on macOS", () => {
    const options = createMainWindowOptions({ platform: "darwin", preloadPath: "/tmp/preload.cjs", isPackaged: true })
    expect(options.webPreferences?.sandbox).toBe(true)
    expect(options.titleBarStyle).toBe("hiddenInset")
  })

  it("uses mica on Windows", () => {
    const options = createMainWindowOptions({ platform: "win32", preloadPath: "/tmp/preload.cjs", isPackaged: true })
    expect(options.backgroundMaterial).toBe("mica")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-shell/src/workspace-sidebar.test.tsx apps/desktop/src/main/window-options.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 迁移 shell 与原生桥**

UI 包统一结构（`ui-shell` 示例；其余 UI 包同样处理）：

```json
{
  "name": "@pigcode/ui-shell",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./client": "./src/plugin.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": {
    "@pigcode/contracts": "workspace:*",
    "@pigcode/plugin-sdk": "workspace:*",
    "@pigcode/ui-primitives": "workspace:*"
  },
  "peerDependencies": { "react": "^19", "react-dom": "^19" },
  "devDependencies": {
    "@types/react": "19.2.2",
    "@types/react-dom": "19.2.2",
    "typescript": "5.9.3",
    "vitest": "4.0.16"
  }
}
```

`ui-chat`/`ui-composer`/`ui-settings`/`ui-plugin-manager` 的 package.json 按同一形状创建；需要 `@pigcode/client-runtime` 的包在 dependencies 里加上 workspace 依赖。

从 pigclaude 复制并适配：

```bash
PIGCLAUDE=/Users/liuqin/Documents/workspace/typescript/pigclaude/frontend/apps/desktop/src/renderer/src
cp "$PIGCLAUDE/components/shell.tsx" frontend/packages/ui-shell/src/shell.tsx
cp "$PIGCLAUDE/components/traffic-lights.tsx" frontend/packages/ui-shell/src/traffic-lights.tsx
cp "$PIGCLAUDE/components/workspace-sidebar.tsx" frontend/packages/ui-shell/src/workspace-sidebar.tsx
cp "$PIGCLAUDE/components/settings-sidebar.tsx" frontend/packages/ui-shell/src/settings-sidebar.tsx
cp "$PIGCLAUDE/components/add-project-dialog.tsx" frontend/packages/ui-shell/src/add-project-dialog.tsx
cp "$PIGCLAUDE/components/icon.tsx" frontend/packages/ui-shell/src/icon.tsx
cp "$PIGCLAUDE/components/toast.tsx" frontend/packages/ui-shell/src/toast.tsx
```

适配规则：

- 删除 `side-notice`、Claude 账号菜单、会员/代理入口。
- `WorkspaceSidebar` 的 props 改为 M0-B 的 `projects/threads/activeThreadId/expandedProjects`；项目/线程数据由 store 传入。
- `TrafficLights` 读取 `window.pigcodeNative?.platform`。
- 所有可见文案走 `useLocale()`；至少替换导航、设置、项目/会话相关文案。
- Radix 组件替换为 Task 3/4 的 Base UI 组件；`DropdownMenu` → `Menu`。
- `AddProjectDialog` 的目录选择先用文本输入，M0-B 不接原生目录选择。

`window-options.ts`：

```ts
/** 按平台生成主窗口选项；保持 sandbox 与 pigclaude 的窗口质感。 */
import type { BrowserWindowConstructorOptions } from "electron"

export type ThemeSource = "light" | "dark" | "system"

export function createMainWindowOptions({
  platform,
  preloadPath,
  isPackaged,
}: {
  platform: NodeJS.Platform
  preloadPath: string
  isPackaged: boolean
}): BrowserWindowConstructorOptions {
  const options: BrowserWindowConstructorOptions = {
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#F4F4F5",
    autoHideMenuBar: true,
    title: "Pigcode",
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !isPackaged,
    },
  }
  if (platform === "darwin") {
    return {
      ...options,
      vibrancy: "sidebar",
      visualEffectState: "active",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 12 },
    }
  }
  if (platform === "win32") {
    return {
      ...options,
      backgroundMaterial: "mica",
      titleBarStyle: "hidden",
      titleBarOverlay: { height: 40, color: "#00000000", symbolColor: "#52525B" },
    }
  }
  return options
}
```

`preload/index.ts` 增加最小原生桥，同时保留 M0-A 的 MessagePort 转交：

```ts
/** preload：MessagePort 转交 + 最小窗口/主题桥；不暴露 Node。 */
import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("pigcodeNative", {
  platform: process.platform,
  setThemeSource: (source: "light" | "dark" | "system") => ipcRenderer.invoke("pigcode:set-theme", source),
  windowControl: (action: "minimize" | "maximize" | "close") => ipcRenderer.invoke("pigcode:window", action),
  isMaximized: () => ipcRenderer.invoke("pigcode:is-maximized"),
})

ipcRenderer.on("pigcode:port", (event) => {
  const [port] = event.ports
  if (port) window.postMessage({ type: "pigcode:port" }, "*", [port])
})
```

`main/index.ts` 使用 `createMainWindowOptions`，并注册 `ipcMain.handle` 处理主题与窗口控制。`global.d.ts` 声明 `window.pigcodeNative`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-shell/src/workspace-sidebar.test.tsx apps/desktop/src/main/window-options.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-shell apps/desktop
git commit -m "feat(ui): migrate shell and window chrome"
```

---

### Task 6: Client Runtime Connection, Store, Commands, and Locale

**Files:**
- Create: `frontend/packages/client-runtime/src/connection.ts`
- Create: `frontend/packages/client-runtime/src/store.ts`
- Create: `frontend/packages/client-runtime/src/commands.ts`
- Create: `frontend/packages/client-runtime/src/locale.ts`
- Modify: `frontend/packages/client-runtime/src/index.ts`
- Test: `frontend/packages/client-runtime/src/connection.test.ts`
- Test: `frontend/packages/client-runtime/src/store.test.ts`

**Interfaces:**
- Consumes: M0-A 的 `RpcClient`、`HostTransport`、contracts。
- Produces: `Connection`、`AppStore`、`useAppStore()`、`createCommands()`、`LocaleController`。

- [ ] **Step 1: 写失败测试**

`connection.test.ts`：

```ts
/** 验证连接从 snapshot/cursor 恢复线程事件。 */
import { describe, expect, it } from "vitest"
import { MemoryTransport } from "../../../apps/host/src/rpc/memory-transport"
import { Connection } from "./connection"

describe("Connection", () => {
  it("resubscribes from the last cursor", async () => {
    const transport = new MemoryTransport()
    const events: number[] = []
    const connection = new Connection({
      onEvent: (event) => events.push(event.seq),
      onDelta: () => {},
      onStatus: () => {},
    })
    await connection.attach(transport.client)
    const pending = connection.openThread("th_1")
    const request = (await transport.host.next()) as { id: string; method: string; params: { cursor: number } }
    expect(request.method).toBe("thread.subscribe")
    transport.host.send({
      jsonrpc: "2.0",
      id: request.id,
      result: { snapshot: {}, cursor: 2, events: [{ seq: 2 }] },
    })
    await pending
    expect(events).toEqual([2])
  })
})
```

`store.test.ts`：

```ts
/** 验证 store 追加事件、累加 delta 与去重。 */
import { describe, expect, it } from "vitest"
import { AppStore } from "./store"

describe("AppStore", () => {
  it("appends events and deduplicates by seq", () => {
    const store = new AppStore()
    store.addEvent({ seq: 1, threadId: "th_1", runId: null, type: "thread.created", payload: {}, schemaVersion: 1, createdAt: "2026-10-20T00:00:00.000Z" })
    store.addEvent({ seq: 1, threadId: "th_1", runId: null, type: "thread.created", payload: {}, schemaVersion: 1, createdAt: "2026-10-20T00:00:00.000Z" })
    expect(store.getSnapshot().events).toHaveLength(1)
  })

  it("accumulates streaming text", () => {
    const store = new AppStore()
    store.appendDelta("run_1", "hello")
    store.appendDelta("run_1", " world")
    expect(store.getSnapshot().streamingText).toBe("hello world")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/client-runtime/src/connection.test.ts packages/client-runtime/src/store.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 client runtime**

`connection.ts`：

```ts
/** 管理 MessagePort 连接、线程订阅、cursor 与 RPC 命令。 */
import type { ProviderEvent, ThreadEvent } from "@pigcode/contracts"
import { RpcClient } from "./rpc-client"
import type { HostTransport } from "./transport"

export type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline"

export interface ConnectionHandlers {
  onEvent(event: ThreadEvent): void
  onDelta(event: { threadId: string; event: ProviderEvent }): void
  onStatus(status: ConnectionStatus): void
}

export class Connection {
  private client: RpcClient | undefined
  private threadId: string | undefined
  private cursor = 0

  constructor(private readonly handlers: ConnectionHandlers) {}

  /** 绑定新的传输层；已有线程时从 cursor 重订阅。 */
  async attach(transport: HostTransport): Promise<void> {
    this.handlers.onStatus(this.client ? "reconnecting" : "connecting")
    this.client = new RpcClient(transport)
    this.client.onNotification((message) => this.handleNotification(message))
    if (this.threadId) await this.subscribe(this.threadId, this.cursor)
    this.handlers.onStatus("connected")
  }

  /** 打开线程并订阅 snapshot + cursor。 */
  async openThread(threadId: string): Promise<void> {
    this.threadId = threadId
    this.cursor = 0
    await this.subscribe(threadId, 0)
  }

  /** 发送用户消息。 */
  async startRun(text: string): Promise<void> {
    if (!this.client || !this.threadId) throw new Error("thread not open")
    await this.client.call("run.start", { threadId: this.threadId, text })
  }

  /** 透传一次 RPC 调用，供项目/线程/插件命令使用。 */
  async call(method: string, params: unknown): Promise<unknown> {
    if (!this.client) throw new Error("host not connected")
    return this.client.call(method, params)
  }

  private async subscribe(threadId: string, cursor: number): Promise<void> {
    if (!this.client) throw new Error("host not connected")
    const result = (await this.client.call("thread.subscribe", { threadId, cursor })) as {
      events: ThreadEvent[]
    }
    for (const event of result.events) this.handlers.onEvent(event)
    this.cursor = Math.max(this.cursor, ...result.events.map((event) => event.seq))
  }

  private handleNotification(message: unknown): void {
    const value = message as {
      method?: string
      params?: { seq?: number; threadId?: string; event?: ProviderEvent }
    }
    if (value.method === "thread.event" && value.params) {
      const event = value.params as unknown as ThreadEvent
      this.cursor = Math.max(this.cursor, event.seq)
      this.handlers.onEvent(event)
      return
    }
    if (value.method === "thread.delta" && value.params?.threadId && value.params.event) {
      this.handlers.onDelta({ threadId: value.params.threadId, event: value.params.event })
    }
  }
}
```

`store.ts`：

```ts
/** Renderer 的应用状态；组件通过 useSyncExternalStore 订阅。 */
import { useSyncExternalStore } from "react"
import type { Project, Thread, ThreadEvent } from "@pigcode/contracts"
import type { ConnectionStatus } from "./connection"

export interface AppState {
  status: ConnectionStatus
  projects: Project[]
  threads: Thread[]
  activeProjectId: string | null
  activeThreadId: string | null
  events: ThreadEvent[]
  streamingText: string
  error: string | null
}

const initialState: AppState = {
  status: "connecting",
  projects: [],
  threads: [],
  activeProjectId: null,
  activeThreadId: null,
  events: [],
  streamingText: "",
  error: null,
}

export class AppStore {
  private state: AppState = initialState
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): AppState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  update(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch }
    this.emit()
  }

  addEvent(event: ThreadEvent): void {
    if (this.state.events.some((item) => item.seq === event.seq)) return
    this.state = { ...this.state, events: [...this.state.events, event] }
    if (event.type === "message.completed") this.state.streamingText = ""
    this.emit()
  }

  appendDelta(_runId: string, text: string): void {
    this.state = { ...this.state, streamingText: this.state.streamingText + text }
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

/** 在 React 组件中读取 store。 */
export function useAppStore(store: AppStore): AppState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
}
```

`commands.ts`：

```ts
/** 类型化的 RPC 命令封装，避免 UI 直接拼方法名。 */
import type { Project, Thread } from "@pigcode/contracts"
import type { RpcClient } from "./rpc-client"

export function createCommands(client: RpcClient) {
  return {
    listProjects: () => client.call("project.list", {}) as Promise<Project[]>,
    addProject: (rootPath: string) => client.call("project.add", { rootPath }) as Promise<Project>,
    listThreads: (projectId?: string) => client.call("thread.list", { projectId }) as Promise<Thread[]>,
    createThread: (projectId: string, title: string, providerId: string) =>
      client.call("thread.create", { projectId, title, providerId }) as Promise<Thread>,
  }
}
```

`locale.ts`：提供 `LocaleController`（`getLocale`/`setLocale`/`subscribe`），默认 `zh-CN`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/client-runtime/src/connection.test.ts packages/client-runtime/src/store.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/client-runtime
git commit -m "feat(client): add connection, store, commands, and locale"
```

---

### Task 7: Slots, Renderer, and Client Plugin Modules

**Files:**
- Create: `frontend/packages/client-runtime/src/slots.ts`
- Create: `frontend/packages/client-runtime/src/renderer.tsx`
- Create: `frontend/packages/client-runtime/src/modules.ts`
- Modify: `frontend/packages/client-runtime/src/index.ts`
- Test: `frontend/packages/client-runtime/src/slots.test.tsx`
- Test: `frontend/packages/client-runtime/src/modules.test.ts`

**Interfaces:**
- Consumes: Task 6 的 connection/store；`@pigcode/plugin-sdk` 的 `ClientPluginContext`。
- Produces: `SlotRegistry`、`SlotHost`、`AppRenderer`、`loadClientPlugins()`。

- [ ] **Step 1: 写失败测试**

`slots.test.tsx`：

```tsx
/** 验证 slot 注册、排序与卸载。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createSlotRegistry, SlotHost } from "./slots"

describe("slots", () => {
  it("renders and removes a registered slot", () => {
    const registry = createSlotRegistry()
    const dispose = registry.register("sidebar.section", {
      id: "demo",
      order: 10,
      render: () => <div>Demo panel</div>,
    })
    render(<SlotHost registry={registry} name="sidebar.section" />)
    expect(screen.getByText("Demo panel")).toBeTruthy()
    dispose()
  })
})
```

`modules.test.ts`：

```ts
/** 验证 boot graph 加载、apply 与卸载。 */
import { describe, expect, it, vi } from "vitest"
import { loadClientPlugins } from "./modules"

describe("loadClientPlugins", () => {
  it("applies and disposes a client plugin", async () => {
    const dispose = vi.fn()
    const applied = vi.fn(() => dispose)
    const load = vi.fn(async () => ({ apply: applied }))
    const result = await loadClientPlugins({
      boot: { entries: [{ id: "demo", url: "pigcode-plugin://demo/client.js", revision: "1", inject: [] }] },
      load,
      context: () => ({ registerPanel: () => () => {} }),
    })
    expect(applied).toHaveBeenCalledOnce()
    result.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/client-runtime/src/slots.test.tsx packages/client-runtime/src/modules.test.ts`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 slots/renderer/modules**

`slots.ts`：

```tsx
/** 类型化 slot 注册表与 React 宿主；注册返回 disposer。 */
import { Fragment, useSyncExternalStore, type ReactNode } from "react"

export type SlotName =
  | "sidebar.section"
  | "chat.view"
  | "settings.section"
  | "panel.right"
  | "status.bar"

export interface SlotEntry<P = unknown> {
  id: string
  order?: number
  render: (props: P) => ReactNode
}

export interface SlotRegistry {
  register<P>(name: SlotName, entry: SlotEntry<P>): () => void
  get(name: SlotName): SlotEntry[]
  subscribe(name: SlotName, listener: () => void): () => void
}

/** 创建 slot registry；每个 slot 内按 order 升序。 */
export function createSlotRegistry(): SlotRegistry {
  const slots = new Map<SlotName, SlotEntry[]>()
  const listeners = new Map<SlotName, Set<() => void>>()
  return {
    register(name, entry) {
      const current = slots.get(name) ?? []
      slots.set(name, [...current.filter((item) => item.id !== entry.id), entry].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
      for (const listener of listeners.get(name) ?? []) listener()
      return () => {
        slots.set(name, (slots.get(name) ?? []).filter((item) => item.id !== entry.id))
        for (const listener of listeners.get(name) ?? []) listener()
      }
    },
    get(name) {
      return slots.get(name) ?? []
    },
    subscribe(name, listener) {
      const set = listeners.get(name) ?? new Set()
      set.add(listener)
      listeners.set(name, set)
      return () => set.delete(listener)
    },
  }
}

/** 渲染一个 slot 的全部条目。 */
export function SlotHost<P>({ registry, name, props }: { registry: SlotRegistry; name: SlotName; props?: P }) {
  useSyncExternalStore(
    (listener) => registry.subscribe(name, listener),
    () => registry.get(name),
    () => registry.get(name),
  )
  return <>{registry.get(name).map((entry) => <Fragment key={entry.id}>{entry.render(props as P)}</Fragment>)}</>
}
```

`renderer.tsx`：导出 `AppRenderer`，挂载 `LocaleProvider`、`Tooltip.Provider`、`ToastProvider` 和 `Shell`；具体 App 由 `apps/desktop` 组合。

`modules.ts`：

```ts
/** 读取 boot graph、动态加载 client bundle、应用并返回 disposer。 */
import type { ClientPluginContext } from "@pigcode/plugin-sdk"

export interface BootEntry {
  id: string
  url: string
  revision: string
  inject: string[]
}

export interface BootGraph {
  entries: BootEntry[]
}

export interface ClientModule {
  apply?: (ctx: ClientPluginContext) => void | (() => void)
}

export interface LoadClientPluginsOptions {
  boot: BootGraph
  load: (url: string) => Promise<ClientModule>
  context: () => ClientPluginContext
}

/** 按 boot graph 顺序应用插件；返回统一卸载函数。 */
export async function loadClientPlugins(options: LoadClientPluginsOptions): Promise<{ dispose(): void }> {
  const disposers: Array<() => void> = []
  for (const entry of options.boot.entries) {
    const module = await options.load(entry.url)
    const result = module.apply?.(options.context())
    if (typeof result === "function") disposers.push(result)
  }
  return {
    dispose() {
      for (const dispose of disposers.reverse()) dispose()
    },
  }
}
```

`frontend/packages/plugin-sdk/src/client.ts` 扩展为结构化 facade（不 import client-runtime，避免循环依赖）：

```ts
/** 浏览器侧插件可见的最小能力；核心给更多能力时通过可选字段扩展。 */
export interface ClientPanel {
  id: string
  title: string
  render(container: HTMLElement): void
}

export interface ClientSlotEntry {
  id: string
  order?: number
  render: () => unknown
}

export interface ClientSlotApi {
  register(name: string, entry: ClientSlotEntry): () => void
}

export interface ClientPluginContext {
  slots: ClientSlotApi
  host: { call(method: string, params: unknown): Promise<unknown> }
  /** 兼容 M0-A 的 DOM 面板式示例插件。 */
  registerPanel(panel: ClientPanel): () => void
}

export type ClientPlugin = (ctx: ClientPluginContext) => void | (() => void)

export function defineClientPlugin(plugin: ClientPlugin): ClientPlugin {
  return plugin
}
```

`ui-shell` 提供一个 `PluginPanelHost`（放在 `ui-shell/src/plugin-panel.tsx`），把 DOM 面板挂到 React 树里：

```tsx
/** 把 registerPanel 的 DOM 渲染函数挂到 React 生命周期。 */
import { useEffect, useRef } from "react"
import type { ClientPanel } from "@pigcode/plugin-sdk"

export function PluginPanelHost({ panel }: { panel: ClientPanel }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    panel.render(ref.current)
  }, [panel])
  return <div ref={ref} data-plugin-panel={panel.id} />
}
```

Task 12 的 client context 同时提供 `slots` 与 `registerPanel`：

```ts
context: () => ({
  slots: registry,
  host: { call: (method, params) => connection.call(method, params) },
  registerPanel(panel) {
    return registry.register("sidebar.section", {
      id: panel.id,
      render: () => <PluginPanelHost panel={panel} />,
    })
  },
})
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/client-runtime/src/slots.test.tsx packages/client-runtime/src/modules.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/client-runtime
git commit -m "feat(client): add slots, renderer, and client module loader"
```

---

### Task 8: Migrate Chat View and Wire the Fake Provider

**Files:**
- Create: `frontend/packages/ui-chat/package.json`
- Create: `frontend/packages/ui-chat/tsconfig.json`
- Create: `frontend/packages/ui-chat/src/chat-view.tsx`
- Create: `frontend/packages/ui-chat/src/message-list.tsx`
- Create: `frontend/packages/ui-chat/src/message-item.tsx`
- Create: `frontend/packages/ui-chat/src/tool-card.tsx`
- Create: `frontend/packages/ui-chat/src/approval-card.tsx`
- Create: `frontend/packages/ui-chat/src/plan-card.tsx`
- Create: `frontend/packages/ui-chat/src/diff-summary.tsx`
- Create: `frontend/packages/ui-chat/src/environment-drawer.tsx`
- Create: `frontend/packages/ui-chat/src/index.ts`
- Create: `frontend/packages/ui-chat/src/plugin.ts`
- Test: `frontend/packages/ui-chat/src/chat-view.test.tsx`

**Interfaces:**
- Consumes: Task 3/4 的 primitives、Task 6 的 store。
- Produces: `ChatView`；接收 `thread`、`events`、`streamingText`、`onSubmit`、`onInterrupt`、`onApproval`。

- [ ] **Step 1: 写失败测试**

```tsx
/** 验证聊天页渲染用户消息、流式文本和工具卡片。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { ChatView } from "./chat-view"

describe("ChatView", () => {
  it("renders persisted and streaming content", () => {
    const thread = {
      id: "t1",
      projectId: "p1",
      title: "First thread",
      defaultProviderId: "fake",
      lastProviderId: null,
      lastModelId: null,
      permissionMode: "workspace-write" as const,
      createdAt: "2026-10-20T00:00:00.000Z",
      updatedAt: "2026-10-20T00:00:00.000Z",
      archivedAt: null,
      lastRunId: null,
    }
    render(
      <LocaleProvider locale="zh-CN">
        <ChatView
          thread={thread}
          events={[
            { seq: 1, threadId: "t1", runId: null, type: "message.completed", payload: { text: "Done" }, schemaVersion: 1, createdAt: "2026-10-20T00:00:00.000Z" },
          ]}
          streamingText="Streaming"
          onStart={() => {}}
          onInterrupt={() => {}}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText("Done")).toBeTruthy()
    expect(screen.getByText("Streaming")).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-chat/src/chat-view.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 迁移聊天视图**

从 pigclaude 复制 `screens/chat-screen.tsx` 的结构与类名，拆分：

- `chat-view.tsx`：顶部标题、状态、环境按钮；消息列表；composer 占位。
- `message-list.tsx`：按事件顺序渲染；用户消息、助手消息、工具、审批、计划、diff。
- `message-item.tsx`：复制 pigclaude 的 `msg-user` / `msg-ai` 结构。
- `tool-card.tsx`：复制工具调用/文件变更卡片；`查看` 按钮回调。
- `approval-card.tsx`：复制审批卡片；按钮文案来自 locale；`allow-once`/`allow-for-session`/`deny`。
- `plan-card.tsx`、`diff-summary.tsx`、`environment-drawer.tsx`：复制并去掉账号/代理字段，改为 provider/cwd/permission。
- `plugin.ts`：导出 `apply(ctx: ClientPluginContext)`，注册 `chat.view` slot。

删除 fixture、硬编码标题、Claude 账号/代理。所有事件从 props 读取。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-chat/src/chat-view.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-chat
git commit -m "feat(ui): migrate chat view and tool cards"
```

---

### Task 9: Migrate Composer

**Files:**
- Create: `frontend/packages/ui-composer/package.json`
- Create: `frontend/packages/ui-composer/tsconfig.json`
- Create: `frontend/packages/ui-composer/src/composer.tsx`
- Create: `frontend/packages/ui-composer/src/composer-options.ts`
- Create: `frontend/packages/ui-composer/src/smart-punctuation.ts`
- Create: `frontend/packages/ui-composer/src/index.ts`
- Create: `frontend/packages/ui-composer/src/plugin.ts`
- Test: `frontend/packages/ui-composer/src/composer.test.tsx`

**Interfaces:**
- Consumes: Task 3/4 的 primitives；TipTap。
- Produces: `Composer`；`onSubmit(text)`、`onStop()`、`disabled`。

- [ ] **Step 1: 写失败测试**

```tsx
/** 验证 composer 提交、空内容禁用与停止按钮。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { Composer } from "./composer"

describe("Composer", () => {
  it("submits non-empty text", async () => {
    const onSubmit = vi.fn()
    render(
      <LocaleProvider locale="zh-CN">
        <Composer onSubmit={onSubmit} onStop={() => {}} />
      </LocaleProvider>,
    )
    const editor = screen.getByRole("textbox")
    await userEvent.type(editor, "hello")
    await userEvent.keyboard("{Enter}")
    expect(onSubmit).toHaveBeenCalledWith("hello")
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-composer/src/composer.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 迁移 composer**

从 pigclaude 复制：

```bash
PIGCLAUDE=/Users/liuqin/Documents/workspace/typescript/pigclaude/frontend/apps/desktop/src/renderer/src
cp "$PIGCLAUDE/components/composer.tsx" frontend/packages/ui-composer/src/composer.tsx
cp "$PIGCLAUDE/components/composer-options.ts" frontend/packages/ui-composer/src/composer-options.ts
cp "$PIGCLAUDE/components/smart-punctuation.ts" frontend/packages/ui-composer/src/smart-punctuation.ts
```

适配：

- 删除账号选择器与 `accounts` 常量；模型、权限、思考深度改为 props。
- `onSubmit` 接收纯文本；空内容不提交。
- 运行中显示停止按钮，调用 `onStop`。
- 菜单用 Task 4 的 `Menu`/`Select`，不再用 Radix DropdownMenu。
- 占位文案用 locale 的 `composer.placeholder`。
- TipTap 依赖已在 Task 1 安装。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-composer/src/composer.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-composer
git commit -m "feat(ui): migrate composer"
```

---

### Task 10: Settings and Plugin Manager UI

**Files:**
- Create: `frontend/packages/ui-settings/package.json`
- Create: `frontend/packages/ui-settings/tsconfig.json`
- Create: `frontend/packages/ui-settings/src/{settings-view,settings-nav,appearance-page,general-page,provider-page}.tsx`
- Create: `frontend/packages/ui-settings/src/index.ts`
- Create: `frontend/packages/ui-settings/src/plugin.ts`
- Create: `frontend/packages/ui-plugin-manager/package.json`
- Create: `frontend/packages/ui-plugin-manager/tsconfig.json`
- Create: `frontend/packages/ui-plugin-manager/src/{plugin-manager-view,plugin-list,install-form}.tsx`
- Create: `frontend/packages/ui-plugin-manager/src/index.ts`
- Create: `frontend/packages/ui-plugin-manager/src/plugin.ts`
- Test: `frontend/packages/ui-settings/src/settings-view.test.tsx`
- Test: `frontend/packages/ui-plugin-manager/src/plugin-manager-view.test.tsx`

**Interfaces:**
- Consumes: Task 3/4 的 primitives、Task 6 的 commands、Task 2 的 locale/theme。
- Produces: `SettingsView`、`PluginManagerView`；设置分区与插件管理 slot。

- [ ] **Step 1: 写失败测试**

```tsx
/** 验证设置页切换与插件列表渲染。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { SettingsView } from "./settings-view"

describe("SettingsView", () => {
  it("renders the settings navigation", () => {
    render(
      <LocaleProvider locale="zh-CN">
        <SettingsView section="general" onSection={() => {}} onClose={() => {}} />
      </LocaleProvider>,
    )
    expect(screen.getByText("通用")).toBeTruthy()
    expect(screen.getByText("外观")).toBeTruthy()
  })
})
```

```tsx
/** 验证插件列表与安装表单。 */
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { PluginManagerView } from "./plugin-manager-view"

describe("PluginManagerView", () => {
  it("renders installed plugins", () => {
    render(
      <LocaleProvider locale="zh-CN">
        <PluginManagerView
          plugins={[{ id: "ui.demo", name: "demo", version: "0.0.0", kind: "ui", enabled: true, error: null }]}
          onInstall={async () => {}}
          onEnable={async () => {}}
          onDisable={async () => {}}
          onRefresh={async () => {}}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText("demo")).toBeTruthy()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run packages/ui-settings/src/settings-view.test.tsx packages/ui-plugin-manager/src/plugin-manager-view.test.tsx`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 迁移设置页与插件管理页**

从 pigclaude 复制设置页结构：

```bash
PIGCLAUDE=/Users/liuqin/Documents/workspace/typescript/pigclaude/frontend/apps/desktop/src/renderer/src
cp "$PIGCLAUDE/models/settings-nav.ts" frontend/packages/ui-settings/src/settings-nav.ts
cp "$PIGCLAUDE/screens/settings/settings-sections.tsx" frontend/packages/ui-settings/src/settings-view.tsx
```

删除账号、代理、用量、环境、Claude 账号池页面；保留通用、外观、About。新增：

- `provider-page.tsx`：显示 fake provider 的 capabilities 和状态。
- `plugin-manager-view.tsx`：插件列表（名称、版本、类型、启用状态、错误）、本地目录安装输入、启用/停用按钮、刷新。
- `install-form.tsx`：输入本地插件目录，调用 `onInstall(path)`。
- `plugin.ts`：注册 `settings.section`（插件管理）和 `sidebar.footer.action`（插件入口）。

所有文案走 locale；主题页复用 Task 2 的 `useAppearance`。

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run packages/ui-settings/src/settings-view.test.tsx packages/ui-plugin-manager/src/plugin-manager-view.test.tsx`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/ui-settings packages/ui-plugin-manager
git commit -m "feat(ui): migrate settings and add plugin manager"
```

---

### Task 11: Host Plugin Commands and Plugin Summary

**Files:**
- Modify: `frontend/packages/contracts/src/commands.ts`
- Modify: `frontend/apps/host/src/services/plugins.ts`
- Modify: `frontend/apps/host/src/services/plugin-manager.ts`
- Modify: `frontend/apps/host/src/rpc/server.ts`
- Modify: `frontend/apps/host/src/entry.ts`
- Test: `frontend/apps/host/src/services/plugin-manager.test.ts`
- Test: `frontend/apps/host/src/rpc/plugins.test.ts`

**Interfaces:**
- Consumes: M0-A plugin manager、Task 6 的 commands 类型。
- Produces: `plugin.list`、`plugin.installLocal`、`plugin.enable`、`plugin.disable`、`plugin.bootGraph`；`PluginSummary`。

- [ ] **Step 1: 写失败测试**

`plugin-manager.test.ts` 增加：

```ts
it("lists installed plugins with enabled state", async () => {
  const { root, source } = await fixture()
  await installLocalPlugin(root, source)
  const plugins = await listPlugins(root)
  expect(plugins).toHaveLength(1)
  expect(plugins[0]?.enabled).toBe(true)
})
```

`rpc/plugins.test.ts`：

```ts
/** 验证通过 RPC 读取插件列表。 */
import { Context } from "cordis"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { apply as pluginsPlugin } from "../services/plugins"
import { MemoryTransport } from "./memory-transport"
import { RpcServer } from "./server"

describe("plugin rpc", () => {
  it("lists plugins", async () => {
    const profileDir = await mkdtemp(join(tmpdir(), "pigcode-rpc-plugins-"))
    const ctx = new Context()
    await ctx.plugin(pluginsPlugin, { profileDir })
    const transport = new MemoryTransport()
    new RpcServer(ctx, transport.host).start()
    transport.client.send({ jsonrpc: "2.0", id: "1", method: "plugin.list", params: {} })
    const response = (await transport.client.next()) as { result: unknown[] }
    expect(response.result).toEqual([])
    await ctx.fiber.dispose()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-manager.test.ts apps/host/src/rpc/plugins.test.ts`
Expected: FAIL，`listPlugins`/`plugin.list` 不存在。

- [ ] **Step 3: 实现插件命令**

`commands.ts` 增加：

```ts
"plugin.list": z.object({}),
"plugin.installLocal": z.object({ sourceDir: z.string().min(1) }),
"plugin.enable": z.object({ id: z.string().min(1) }),
"plugin.disable": z.object({ id: z.string().min(1) }),
"plugin.bootGraph": z.object({}),
```

`plugin-manager.ts` 增加 `listPlugins(profileDir)`，返回：

```ts
export interface PluginSummary {
  id: string
  name: string
  version: string
  kind: "provider" | "capability" | "ui" | "bundle"
  enabled: boolean
  error: string | null
}
```

`plugins.ts` 改为 `apply(ctx, config: { profileDir })`，服务方法不再接收 `profileDir`；每次 install/enable/disable 后调用 `writeBootGraph(config.profileDir)`。

`entry.ts` 在 `createHostApp` 之后注册：

```ts
ctx.plugin(pluginsPlugin, { profileDir })
```

`rpc/server.ts` 增加：

```ts
case "plugin.list":
  return this.ctx.plugins.list()
case "plugin.installLocal":
  return this.ctx.plugins.installLocal((parsed as { sourceDir: string }).sourceDir)
case "plugin.enable":
  return this.ctx.plugins.enable((parsed as { id: string }).id)
case "plugin.disable":
  return this.ctx.plugins.disable((parsed as { id: string }).id)
case "plugin.bootGraph":
  return this.ctx.plugins.bootGraph()
```

- [ ] **Step 4: 运行测试**

Run: `cd frontend && pnpm vitest run apps/host/src/services/plugin-manager.test.ts apps/host/src/rpc/plugins.test.ts`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add packages/contracts apps/host
git commit -m "feat(host): expose plugin management over rpc"
```

---

### Task 12: React Renderer, Core UI Plugins, E2E, and Visual Regression

**Files:**
- Modify: `frontend/apps/desktop/package.json`
- Modify: `frontend/apps/desktop/src/renderer/index.html`
- Create: `frontend/apps/desktop/src/renderer/src/main.tsx`
- Create: `frontend/apps/desktop/src/renderer/src/app.tsx`
- Create: `frontend/apps/desktop/src/renderer/src/core-plugins.tsx`
- Delete: `frontend/apps/desktop/src/renderer/src/main.ts`
- Create: `frontend/apps/desktop/visual/visual.spec.ts`
- Modify: `frontend/apps/desktop/playwright.config.ts`
- Create: `frontend/apps/desktop/e2e/m0-b.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Test: `frontend/apps/desktop/e2e/m0-b.spec.ts`

**Interfaces:**
- Consumes: Task 5-11 的所有 UI 包与 client runtime。
- Produces: 可运行的 Pigcode 桌面 UI；第三方 UI 插件可见/可移除；视觉基线。

- [ ] **Step 1: 写失败 E2E**

`e2e/m0-b.spec.ts`：

```ts
/** M0-B 验收：项目/会话、fake 流、插件面板、重连。 */
import { _electron as electron, expect, test } from "@playwright/test"

test("chat, plugin panel, and reconnect", async () => {
  const app = await electron.launch({ args: ["."] })
  const page = await app.firstWindow()
  await page.getByRole("button", { name: "添加项目" }).click()
  await page.getByLabel("项目路径").fill("/tmp/pigcode-m0b")
  await page.getByRole("button", { name: "添加" }).click()
  await page.getByRole("button", { name: "新会话" }).click()
  await page.getByRole("textbox").fill("hello")
  await page.keyboard.press("Enter")
  await expect(page.getByText("Hello from fake provider")).toBeVisible()

  await page.getByRole("button", { name: "插件" }).click()
  const samplePlugin = new URL("../../../examples/ui-debug-panel", import.meta.url).pathname
  await page.getByLabel("插件目录").fill(samplePlugin)
  await page.getByRole("button", { name: "安装本地插件" }).click()
  await expect(page.getByText("Debug Panel")).toBeVisible()

  await page.getByRole("button", { name: "停用" }).click()
  await expect(page.getByText("Debug Panel")).toBeHidden()

  await app.evaluate(({ app }) => app.emit("pigcode:test-kill-host"))
  await expect(page.getByText("已重新连接")).toBeVisible()
  await app.close()
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test e2e/m0-b.spec.ts`
Expected: FAIL，React renderer 尚未接线。

- [ ] **Step 3: 组装 React 应用**

先把 `@pigcode/ui-shell`、`@pigcode/ui-chat`、`@pigcode/ui-composer`、`@pigcode/ui-settings`、`@pigcode/ui-plugin-manager` 加入 `apps/desktop/package.json` 的 dependencies，并运行 `pnpm --dir frontend install`。

`main.tsx`：

```tsx
/** Renderer 入口：等待 MessagePort，建立连接，挂载 React 应用。 */
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppStore, Connection, createSlotRegistry } from "@pigcode/client-runtime"
import { App } from "./app"
import { registerCorePlugins } from "./core-plugins"

const store = new AppStore()
const connection = new Connection({
  onEvent: (event) => store.addEvent(event),
  onDelta: (_threadId, event) => {
    if (event.type === "message.delta") store.appendDelta("stream", event.text)
  },
  onStatus: (status) => store.update({ status }),
})

window.addEventListener("message", async (event) => {
  if (event.data?.type !== "pigcode:port") return
  const port = event.ports[0]
  if (!port) return
  port.start()
  await connection.attach({
    send: (message) => port.postMessage(message),
    onMessage: (listener) => {
      const handler = (messageEvent: MessageEvent) => listener(messageEvent.data)
      port.addEventListener("message", handler)
      return () => port.removeEventListener("message", handler)
    },
    close: () => port.close(),
  })
})

const registry = createSlotRegistry()
registerCorePlugins(registry, { connection, store })
createRoot(document.querySelector("#root")!).render(
  <StrictMode>
    <App store={store} slots={registry} connection={connection} />
  </StrictMode>,
)
```

`app.tsx`：

```tsx
/** 应用外壳：侧栏 + 主视图 + 设置/插件视图。 */
import { useEffect, useState } from "react"
import type { Project, Thread } from "@pigcode/contracts"
import { useAppStore, type AppStore, type Connection, type SlotRegistry } from "@pigcode/client-runtime"
import { Shell } from "@pigcode/ui-shell"

/** App 依赖。 */
interface AppProps {
  store: AppStore
  slots: SlotRegistry
  connection: Connection
}

export function App({ store, slots, connection }: AppProps) {
  const state = useAppStore(store)
  const [view, setView] = useState<"chat" | "settings" | "plugins">("chat")

  useEffect(() => {
    void (async () => {
      const projects = (await connection.call("project.list", {})) as Project[]
      const threads = (await connection.call("thread.list", {})) as Thread[]
      store.update({ projects, threads })
    })()
  }, [connection, store])

  return (
    <Shell
      state={state}
      view={view}
      slots={slots}
      onView={setView}
      onNewThread={async () => {
        const project = state.projects[0]
        if (!project) return
        const thread = (await connection.call("thread.create", {
          projectId: project.id,
          title: "New thread",
          providerId: "fake",
        })) as Thread
        store.update({ activeThreadId: thread.id })
        await connection.openThread(thread.id)
      }}
      onOpenThread={(id) => {
        store.update({ activeThreadId: id })
        void connection.openThread(id)
      }}
      onSend={(text) => void connection.startRun(text)}
    />
  )
}
```

`core-plugins.tsx` 注册核心视图：

```tsx
/** 内置 UI 插件：shell/chat/settings/plugin-manager 通过同一 slot registry 注册。 */
import type { AppStore, Connection, SlotRegistry } from "@pigcode/client-runtime"

interface CoreDeps {
  connection: Connection
  store: AppStore
}

export function registerCorePlugins(registry: SlotRegistry, deps: CoreDeps): void {
  registry.register("chat.view", { id: "chat", order: 0, render: () => <ChatViewContainer deps={deps} /> })
  registry.register("settings.section", { id: "settings", order: 0, render: () => <SettingsContainer deps={deps} /> })
  registry.register("settings.section", { id: "plugins", order: 10, render: () => <PluginManagerContainer deps={deps} /> })
}
```

`index.html` 只保留 `<div id="root"></div>` 与 module script。

`app.tsx` 里定义三个容器组件，把 store/connection 传给对应视图：

```tsx
function ChatViewContainer({ deps }: { deps: CoreDeps }) {
  const state = useAppStore(deps.store)
  const thread = state.threads.find((item) => item.id === state.activeThreadId)
  return (
    <ChatView
      thread={thread}
      events={state.events}
      streamingText={state.streamingText}
      onStart={(text) => void deps.connection.startRun(text)}
      onInterrupt={() => void deps.connection.call("run.interrupt", { threadId: state.activeThreadId, runId: "" })}
      onApproval={() => {}}
    />
  )
}
```

`SettingsContainer` 与 `PluginManagerContainer` 同理：前者把 `settings.section` 渲染委托给 `SettingsView`，后者通过 `plugin.list`/`plugin.installLocal`/`plugin.enable`/`plugin.disable` 调用 Host。

视觉回归 `visual/visual.spec.ts`：

```ts
/** 对 shell、聊天、设置、插件页做浅/深色截图。 */
import { _electron as electron, expect, test } from "@playwright/test"

for (const theme of ["light", "dark"] as const) {
  test(`shell ${theme}`, async () => {
    const app = await electron.launch({ args: ["."] })
    const page = await app.firstWindow()
    await page.emulateMedia({ colorScheme: theme })
    await page.waitForSelector(".app")
    await expect(page).toHaveScreenshot(`shell-${theme}.png`, { maxDiffPixels: 0 })
    await app.close()
  })
}
```

第三方 UI 插件加载：

```ts
const boot = await fetch("pigcode-plugin://boot.json").then((response) => response.json())
const plugins = await loadClientPlugins({
  boot,
  load: (url) => import(/* @vite-ignore */ url),
  context: () => ({
    slots: registry,
    commands: createCommands(rpcClient),
    connection,
    theme,
    locale,
    host: { call: (method, params) => connection.call(method, params) },
  }),
})
```

- [ ] **Step 4: 运行 E2E 与视觉回归**

Run: `cd frontend/apps/desktop && PIGCODE_E2E=1 pnpm exec playwright test`
Expected: `m0-b.spec.ts` PASS。

Run: `cd frontend/apps/desktop && pnpm exec playwright test visual/visual.spec.ts --update-snapshots`
Expected: 生成 `visual/__screenshots__/` 基线。

再跑一次不加 `--update-snapshots`，确认视觉回归通过。

- [ ] **Step 5: 提交**

```bash
cd frontend
git add apps/desktop packages examples .github
git commit -m "feat(desktop): replace debug renderer with pigclaude-based react ui"
```

---

## Self-Review

**Spec coverage（M0-B 范围）：**

| Spec 要求 | 对应任务 |
|---|---|
| pigclaude 外壳与组件迁移 | Task 2/5/8/9/10 |
| shadcn Base UI 组件层，无 Radix | Task 1/3/4；验收：`grep -R "@radix-ui" frontend` 为空 |
| client store/connection/slots | Task 6/7 |
| 聊天、工具、审批、composer | Task 8/9 |
| 设置、外观、插件管理 | Task 10 |
| 插件安装/启停 RPC | Task 11 |
| 第三方 UI 插件加载 | Task 7/12 |
| 视觉回归 | Task 12 |
| Electron E2E（聊天、插件、重连） | Task 12 |
| 中英双语 | Task 2/5/8/9/10 |

**Placeholder scan:** 无 TBD/TODO；每个任务包含文件路径、测试命令与关键代码。pigclaude 组件的复制步骤给出了明确源路径与适配规则。

**Type consistency:** `Connection`、`AppStore`、`SlotRegistry`、`ClientPluginContext`、`PluginSummary` 在前后任务中名称一致；`commands.ts` 的 `plugin.*` 方法与 Task 11 的 RPC 分支一致；`ChatView`/`Composer` 的 props 与 Task 12 的容器一致。

**Known follow-ups（不属于 M0-B）：**

- 原生目录选择器（M0-B 用文本输入）。
- provider 真实配置页（M0-B 只展示 fake provider）。
- 插件市场。
- 图片附件、语音、PR、预览、定时任务（M1/M5）。
