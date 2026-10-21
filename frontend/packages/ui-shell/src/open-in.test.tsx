/** 验证线程头的「IDE ↗」菜单：本机编辑器、文件管理器与复制路径。 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { OpenInMenu } from "./open-in"
import { ToastProvider } from "./toast"

/** 用替身代替 preload 暴露的原生桥。 */
function mockNative(value: Partial<NonNullable<Window["pigcodeNative"]>>): void {
  Object.defineProperty(window, "pigcodeNative", { configurable: true, value })
}

function renderMenu(path: string) {
  render(
    <LocaleProvider locale="zh-CN">
      <ToastProvider>
        <OpenInMenu path={path} />
      </ToastProvider>
    </LocaleProvider>,
  )
}

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "pigcodeNative")
  Reflect.deleteProperty(navigator, "clipboard")
})

describe("OpenInMenu", () => {
  it("opens the project in an installed editor or in Finder", async () => {
    const listEditors = vi.fn().mockResolvedValue([
      { id: "cursor", name: "Cursor" },
      { id: "vscode", name: "VS Code" },
    ])
    const openInEditor = vi.fn().mockResolvedValue(undefined)
    const openFolder = vi.fn().mockResolvedValue(undefined)
    mockNative({ platform: "darwin", listEditors, openInEditor, openFolder })
    renderMenu("/Users/me/app")

    await userEvent.click(screen.getByRole("button", { name: "IDE" }))
    expect(await screen.findByRole("menuitem", { name: "在 VS Code 中打开" })).toBeTruthy()
    await userEvent.click(screen.getByRole("menuitem", { name: "在 Cursor 中打开" }))
    expect(openInEditor).toHaveBeenCalledExactlyOnceWith("cursor", "/Users/me/app")

    await userEvent.click(screen.getByRole("button", { name: "IDE" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "在访达中打开" }))
    expect(openFolder).toHaveBeenCalledExactlyOnceWith("/Users/me/app")
    // 挂载时取一次，每次打开菜单再刷新。
    expect(listEditors).toHaveBeenCalledTimes(3)
  })

  it("says when no editor is installed and still copies the path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    mockNative({ platform: "win32", listEditors: vi.fn().mockResolvedValue([]) })
    renderMenu("C:\\work\\app")

    await userEvent.click(screen.getByRole("button", { name: "IDE" }))
    expect(await screen.findByText("没有找到可用的编辑器")).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "在资源管理器中打开" })).toBeTruthy()
    await userEvent.click(screen.getByRole("menuitem", { name: "复制路径" }))

    expect(writeText).toHaveBeenCalledExactlyOnceWith("C:\\work\\app")
    expect(await screen.findByText("已复制路径")).toBeTruthy()
  })

  it("reports a folder that can't be opened", async () => {
    mockNative({
      platform: "linux",
      listEditors: vi.fn().mockResolvedValue([{ id: "vscode", name: "VS Code" }]),
      openInEditor: vi.fn().mockRejectedValue(new Error("FOLDER_NOT_FOUND")),
    })
    renderMenu("/home/me/gone")

    await userEvent.click(screen.getByRole("button", { name: "IDE" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "在 VS Code 中打开" }))
    expect(await screen.findByText("无法打开文件夹 /home/me/gone")).toBeTruthy()
  })
})
