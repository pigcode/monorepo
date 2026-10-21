/** 验证外壳：工作区卡片、右栏的收起与最大化、底部抽屉与快捷键。 */
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { Shell } from "./shell"

// vitest 未开启 globals，Testing Library 不会自动清理，多测试用例需要手动卸载。
afterEach(cleanup)

function renderShell(props: Partial<ComponentProps<typeof Shell>> = {}) {
  return render(
    <LocaleProvider locale="zh-CN">
      <Shell
        view="chat"
        projects={[]}
        threads={[]}
        activeThreadId={null}
        onView={() => {}}
        onAddProject={() => {}}
        onNewThread={() => {}}
        onOpenThread={() => {}}
        rightPanel={<div>right</div>}
        {...props}
      >
        <div>chat</div>
      </Shell>
    </LocaleProvider>,
  )
}

describe("Shell", () => {
  it("places chat and the right panel in one workspace card", () => {
    const { container } = renderShell()

    const workspace = container.querySelector(".workspace")
    expect(workspace?.querySelector("main.panel")?.textContent).toContain("chat")
    expect(workspace?.querySelector(".right-panel-slot")?.textContent).toContain("right")
    expect(screen.getByRole("separator")).toBeTruthy()
    expect(container.querySelector(".app")?.classList.contains("has-right")).toBe(true)
  })

  it("keeps the right panel mounted but hidden when closed", () => {
    const { container } = renderShell({ rightOpen: false })

    const slot = container.querySelector(".right-panel-slot")
    expect(slot?.hasAttribute("hidden")).toBe(true)
    expect(slot?.textContent).toContain("right")
    expect(screen.queryByRole("separator")).toBeNull()
    expect(container.querySelector(".app")?.classList.contains("has-right")).toBe(false)
  })

  it("maximizes the right panel without a resizer", () => {
    const { container } = renderShell({ rightMaximized: true })

    expect(container.querySelector(".app")?.classList.contains("is-right-max")).toBe(true)
    expect(screen.queryByRole("separator")).toBeNull()
  })

  it("renders the bottom panel under the chat and toggles it with Ctrl+`", () => {
    const onToggleTerminal = vi.fn()
    const { container } = renderShell({
      bottomPanel: <div>drawer</div>,
      onToggleTerminal,
    })

    expect(container.querySelector("main.panel")?.textContent).toBe("chatdrawer")
    fireEvent.keyDown(window, { key: "`", code: "Backquote", ctrlKey: true })
    expect(onToggleTerminal).toHaveBeenCalledTimes(1)
  })

  it("toggles the right panel with ⌘J", () => {
    const onToggleRight = vi.fn()
    renderShell({ onToggleRight })

    fireEvent.keyDown(window, { key: "j", metaKey: true })
    expect(onToggleRight).toHaveBeenCalledTimes(1)
  })
})
