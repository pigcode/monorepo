/** 验证 composer 提交、空内容禁用与停止按钮。 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { Composer } from "./composer"

afterEach(cleanup)

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

  it("clears the editor after submitting with Enter or the send button", async () => {
    const onSubmit = vi.fn()
    render(
      <LocaleProvider locale="zh-CN">
        <Composer onSubmit={onSubmit} onStop={() => {}} />
      </LocaleProvider>,
    )
    const editor = screen.getByRole("textbox")
    await userEvent.type(editor, "first")
    await userEvent.keyboard("{Enter}")
    expect(editor.textContent).toBe("")

    await userEvent.type(editor, "second")
    await userEvent.click(screen.getByRole("button", { name: "发送" }))
    expect(onSubmit.mock.calls).toEqual([["first"], ["second"]])
    expect(editor.textContent).toBe("")
    expect(screen.getByRole("button", { name: "发送" }).getAttribute("aria-disabled")).toBe("true")
  })

  it("does not submit empty content", async () => {
    const onSubmit = vi.fn()
    render(
      <LocaleProvider locale="zh-CN">
        <Composer onSubmit={onSubmit} onStop={() => {}} />
      </LocaleProvider>,
    )
    const editor = screen.getByRole("textbox")
    await userEvent.click(editor)
    await userEvent.keyboard("{Enter}")
    await userEvent.click(screen.getByRole("button", { name: "发送" }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "发送" }).getAttribute("aria-disabled")).toBe("true")
  })

  it("shows stop while running and calls onStop", async () => {
    const onStop = vi.fn()
    render(
      <LocaleProvider locale="zh-CN">
        <Composer onSubmit={() => {}} onStop={onStop} running />
      </LocaleProvider>,
    )
    const stop = screen.getByRole("button", { name: "中断" })
    await userEvent.click(stop)
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
