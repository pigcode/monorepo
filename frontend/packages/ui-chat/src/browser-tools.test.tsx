/** 验证时间线里的浏览器操作：动作文案、摘要、截图缩略图与连续步骤的分组。 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ThreadEvent } from "@pigcode/contracts"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { afterEach, describe, expect, it } from "vitest"
import { MessageList } from "./message-list"
import { ToolCard } from "./tool-card"
import { baseToolName, browserAction, browserPreview, toolOutputParts } from "./tool-meta"
import { resetToolOpen } from "./tool-open"

afterEach(() => {
  cleanup()
  resetToolOpen()
})

const SHOT = JSON.stringify([
  { type: "image", data: "AAAA", mimeType: "image/jpeg" },
  { type: "text", text: "Screenshot of http://localhost:4173/welcome (1280×800)." },
])

describe("browser tool metadata", () => {
  it("strips MCP prefixes and names browser actions", () => {
    expect(baseToolName("mcp__pigcode__browser_click")).toBe("browser_click")
    expect(baseToolName("Bash")).toBe("Bash")
    expect(browserAction("mcp__pigcode__browser_wait_for")).toBe("wait_for")
    expect(browserAction("mcp__github__create_issue")).toBeNull()
  })

  it("summarises each action from its input or output", () => {
    const preview = (name: string, input: unknown, output?: string) =>
      browserPreview({ name: `mcp__pigcode__${name}`, input: JSON.stringify(input), output })
    expect(preview("browser_open", { url: "http://localhost:4173/" })).toBe("localhost:4173")
    expect(preview("browser_navigate", { action: "back" })).toBe("back")
    expect(preview("browser_click", { ref: "e3" })).toBe("e3")
    expect(preview("browser_click", { text: "登录", ref: "e3" })).toBe("登录")
    expect(preview("browser_type", { ref: "e1", text: "demo@pigcode.dev" })).toBe(
      '"demo@pigcode.dev" → e1',
    )
    expect(preview("browser_press", { key: "Enter" })).toBe("Enter")
    expect(preview("browser_screenshot", {}, SHOT)).toBe("localhost:4173/welcome")
    expect(preview("browser_snapshot", {}, "URL: http://localhost:4173/\nTitle: Demo")).toBe(
      "localhost:4173",
    )
  })

  it("reads text and images from MCP and Anthropic content blocks", () => {
    expect(toolOutputParts(SHOT)).toEqual({
      text: "Screenshot of http://localhost:4173/welcome (1280×800).",
      images: ["data:image/jpeg;base64,AAAA"],
    })
    expect(
      toolOutputParts(
        JSON.stringify([
          { type: "image", source: { type: "base64", media_type: "image/png", data: "BBBB" } },
        ]),
      ).images,
    ).toEqual(["data:image/png;base64,BBBB"])
    expect(toolOutputParts("plain text")).toEqual({ text: "plain text", images: [] })
  })
})

describe("browser tool rows", () => {
  it("show screenshots opened by default", () => {
    render(
      <LocaleProvider locale="zh-CN">
        <ToolCard
          tool={{
            id: "s1",
            name: "mcp__pigcode__browser_screenshot",
            status: "completed",
            input: "{}",
            output: SHOT,
          }}
        />
      </LocaleProvider>,
    )
    const row = screen.getByRole("button", { name: /截图/ })
    expect(row.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("img", { name: "截图" }).getAttribute("src")).toBe(
      "data:image/jpeg;base64,AAAA",
    )
  })

  it("fold consecutive finished steps into one browser group", async () => {
    const event = (seq: number, type: ThreadEvent["type"], payload: unknown): ThreadEvent => ({
      seq,
      threadId: "t1",
      runId: "run_1",
      type,
      payload,
      schemaVersion: 1,
      createdAt: new Date(Date.UTC(2026, 9, 21, 9, 0, seq)).toISOString(),
    })
    const step = (seq: number, id: string, tool: string, input: unknown, output = "ok") => [
      event(seq, "tool.started", { id, name: `mcp__pigcode__${tool}`, input }),
      event(seq + 1, "tool.completed", { id, name: `mcp__pigcode__${tool}`, output }),
    ]
    render(
      <LocaleProvider locale="zh-CN">
        <MessageList
          events={[
            event(1, "run.started", { text: "check login" }),
            ...step(2, "b1", "browser_open", { url: "http://localhost:4173/" }),
            ...step(4, "b2", "browser_type", { ref: "e1", text: "demo" }),
            ...step(6, "b3", "browser_click", { ref: "e3" }),
            event(8, "message.completed", { role: "assistant", text: "登录正常" }),
            event(9, "run.completed", {}),
          ]}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: /已工作/ }))
    const group = screen.getByRole("button", { name: /浏览器.*localhost:4173 · 3 步/ })
    await userEvent.click(group)
    expect(screen.getByRole("button", { name: /打开网页.*localhost:4173/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /输入.*"demo" → e1/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: /点击.*e3/ })).toBeTruthy()
  })
})
