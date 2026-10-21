/** 验证浏览器 surface：地址补全、loopback 限制、前进后退与独立窗口打开。 */
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { BrowserView, normalizeBrowserUrl } from "./browser-view"

const previewOpen = vi.fn<(url: string) => Promise<{ id: string }>>()

beforeEach(() => {
  previewOpen.mockReset()
  previewOpen.mockResolvedValue({ id: "preview-1" })
  Object.defineProperty(window, "pigcodeNative", {
    configurable: true,
    value: {
      platform: "darwin",
      setThemeSource: vi.fn(),
      windowControl: vi.fn(),
      isMaximized: vi.fn().mockResolvedValue(false),
      previewOpen,
      previewClose: vi.fn(),
    },
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "pigcodeNative")
})

function address(): HTMLInputElement {
  return screen.getByRole("textbox", { name: /输入本地地址/ }) as HTMLInputElement
}

function frame(): HTMLIFrameElement | null {
  return document.querySelector("iframe.browser-frame")
}

async function visit(value: string): Promise<void> {
  // userEvent.type 会把 [ 解析成键盘描述符，直接改值更稳妥。
  fireEvent.change(address(), { target: { value } })
  fireEvent.submit(address().closest("form") as HTMLFormElement)
}

describe("normalizeBrowserUrl", () => {
  it("completes ports and bare hosts to loopback urls", () => {
    expect(normalizeBrowserUrl("3000")).toBe("http://localhost:3000/")
    expect(normalizeBrowserUrl("localhost:5173/app")).toBe("http://localhost:5173/app")
    expect(normalizeBrowserUrl(" https://[::1]:8443 ")).toBe("https://[::1]:8443/")
    expect(normalizeBrowserUrl("127.0.0.1:8080")).toBe("http://127.0.0.1:8080/")
  })

  it("rejects remote hosts, other protocols and empty input", () => {
    expect(normalizeBrowserUrl("example.com")).toBeNull()
    expect(normalizeBrowserUrl("https://example.com")).toBeNull()
    expect(normalizeBrowserUrl("file:///etc/passwd")).toBeNull()
    expect(normalizeBrowserUrl("   ")).toBeNull()
  })
})

describe("BrowserView", () => {
  it("shows the empty state until a url is entered", () => {
    render(<BrowserView />)

    expect(screen.getByText("还没有预览")).toBeTruthy()
    expect(frame()).toBeNull()
    expect((screen.getByRole("button", { name: "后退" }) as HTMLButtonElement).disabled).toBe(true)
    expect(
      (screen.getByRole("button", { name: "在新窗口打开" }) as HTMLButtonElement).disabled,
    ).toBe(true)
  })

  it("loads a loopback page in a sandboxed frame and reports navigation", async () => {
    const onNavigate = vi.fn()
    render(<BrowserView onNavigate={onNavigate} />)

    await visit("3000")

    expect(frame()?.getAttribute("src")).toBe("http://localhost:3000/")
    expect(frame()?.getAttribute("sandbox")).not.toContain("allow-popups")
    expect(address().value).toBe("http://localhost:3000/")
    expect(onNavigate).toHaveBeenCalledWith("http://localhost:3000/")
  })

  it("refuses remote urls without leaving the current page", async () => {
    render(<BrowserView initialUrl="localhost:3000" />)

    await visit("https://example.com")

    expect(screen.getByRole("alert").textContent).toMatch(/仅支持本地/)
    expect(frame()?.getAttribute("src")).toBe("http://localhost:3000/")
  })

  it("walks back and forward through address bar history", async () => {
    render(<BrowserView initialUrl="localhost:3000" />)
    await visit("localhost:5173")

    await userEvent.click(screen.getByRole("button", { name: "后退" }))
    expect(frame()?.getAttribute("src")).toBe("http://localhost:3000/")
    expect(address().value).toBe("http://localhost:3000/")

    await userEvent.click(screen.getByRole("button", { name: "前进" }))
    expect(frame()?.getAttribute("src")).toBe("http://localhost:5173/")
    expect((screen.getByRole("button", { name: "前进" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("reloads by remounting the frame", async () => {
    render(<BrowserView initialUrl="localhost:3000" />)
    const before = frame()

    await userEvent.click(screen.getByRole("button", { name: "重新加载" }))

    expect(frame()).not.toBe(before)
    expect(frame()?.getAttribute("src")).toBe("http://localhost:3000/")
  })

  it("opens the current page in a native window", async () => {
    render(<BrowserView initialUrl="localhost:3000" />)

    await userEvent.click(screen.getByRole("button", { name: "在新窗口打开" }))

    expect(previewOpen).toHaveBeenCalledWith("http://localhost:3000/")
  })

  it("shows a friendly error when the bridge is unavailable", async () => {
    Reflect.deleteProperty(window, "pigcodeNative")
    render(<BrowserView initialUrl="localhost:3000" />)

    await userEvent.click(screen.getByRole("button", { name: "在新窗口打开" }))

    expect((await screen.findByRole("alert")).textContent).toMatch(/不支持预览窗口/)
  })
})
