/** 验证消息正文：围栏代码块、行内代码与助手消息的时间。 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AssistantMessage, MessageText, splitMessage } from "./message-item"

afterEach(cleanup)

describe("splitMessage", () => {
  it("splits fenced code out of surrounding text", () => {
    expect(splitMessage("Before\n\n```ts\nconst a = 1\n```\n\nAfter")).toEqual([
      { kind: "text", text: "Before" },
      { kind: "code", code: "const a = 1", lang: "ts" },
      { kind: "text", text: "After" },
    ])
  })

  it("keeps an unterminated fence as code so streaming output stays monospace", () => {
    expect(splitMessage("Look:\n```\nrm -rf build")).toEqual([
      { kind: "text", text: "Look:" },
      { kind: "code", code: "rm -rf build", lang: "" },
    ])
  })

  it("returns plain text untouched", () => {
    expect(splitMessage("just words")).toEqual([{ kind: "text", text: "just words" }])
  })
})

describe("MessageText", () => {
  it("renders code blocks with a language label and inline code", () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <MessageText text={"Run `pnpm test` first.\n\n```bash\npnpm test\n```"} />
      </LocaleProvider>,
    )
    expect(container.querySelector("p code")?.textContent).toBe("pnpm test")
    expect(container.querySelector(".msg-code-lang")?.textContent).toBe("bash")
    expect(container.querySelector(".msg-code pre code")?.textContent).toBe("pnpm test")
  })

  it("copies the block to the clipboard and confirms", async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })
    render(
      <LocaleProvider locale="zh-CN">
        <MessageText text={"```\nhello\n```"} />
      </LocaleProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "复制" }))
    expect(writeText).toHaveBeenCalledWith("hello")
    expect(await screen.findByText("已复制")).toBeTruthy()
  })
})

describe("AssistantMessage", () => {
  it("shows the time next to the name when provided", () => {
    const { container, rerender } = render(
      <AssistantMessage name="Claude" initial="CL" time="09:41">
        <p>hi</p>
      </AssistantMessage>,
    )
    expect(container.querySelector(".msg-ai-time")?.textContent).toBe("09:41")

    rerender(
      <AssistantMessage name="Claude" initial="CL">
        <p>hi</p>
      </AssistantMessage>,
    )
    expect(container.querySelector(".msg-ai-time")).toBeNull()
  })
})
