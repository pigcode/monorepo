/** 验证工具步骤：动词与对象、命令卡片、耗时格式与展开，以及 MessageList 合并开始/结束时间。 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ThreadEvent } from "@pigcode/contracts"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { afterEach, describe, expect, it } from "vitest"
import { MessageList } from "./message-list"
import { ToolCard, formatDuration, toolDuration, toolKind, toolTarget } from "./tool-card"

afterEach(cleanup)

describe("formatDuration", () => {
  it("picks a unit that reads at a glance", () => {
    expect(formatDuration(320)).toBe("320 ms")
    expect(formatDuration(1500)).toBe("1.5 s")
    expect(formatDuration(42_000)).toBe("42 s")
    expect(formatDuration(65_000)).toBe("1m 05s")
    expect(formatDuration(-1)).toBe("")
  })

  it("needs both ends to compute a duration", () => {
    expect(toolDuration({ startedAt: "2026-10-20T00:00:00.000Z" })).toBe("")
    expect(
      toolDuration({
        startedAt: "2026-10-20T00:00:00.000Z",
        completedAt: "2026-10-20T00:00:02.000Z",
      }),
    ).toBe("2.0 s")
    expect(toolDuration({ startedAt: "nope", completedAt: "2026-10-20T00:00:02.000Z" })).toBe("")
  })
})

describe("toolKind / toolTarget", () => {
  it("classifies Claude Code and Codex tool names", () => {
    expect(toolKind("Read")).toBe("read")
    expect(toolKind("MultiEdit")).toBe("edit")
    expect(toolKind("apply_patch")).toBe("edit")
    expect(toolKind("Bash")).toBe("command")
    expect(toolKind("shell")).toBe("command")
    expect(toolKind("Grep")).toBe("search")
    expect(toolKind("Glob")).toBe("find")
    expect(toolKind("Task")).toBe("subagent")
    expect(toolKind("mystery")).toBe("other")
  })

  it("pulls the most telling field out of JSON input and falls back to the first line", () => {
    expect(toolTarget('{"file_path":"src/a.ts","limit":20}')).toBe("src/a.ts")
    expect(toolTarget('{"command":"pnpm test\\n--watch"}')).toBe("pnpm test")
    expect(toolTarget('{"command":["git","status"]}')).toBe("git status")
    expect(toolTarget("ls -la\n/tmp")).toBe("ls -la")
    expect(toolTarget(undefined)).toBe("")
  })
})

describe("ToolCard", () => {
  it("renders a verb plus target and expands on click", async () => {
    render(
      <LocaleProvider locale="zh-CN">
        <ToolCard
          tool={{
            id: "t1",
            name: "Read",
            status: "completed",
            input: '{"file_path":"src/auth/session.ts"}',
            output: "export const a = 1",
            startedAt: "2026-10-20T00:00:00.000Z",
            completedAt: "2026-10-20T00:00:00.400Z",
          }}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText("读取")).toBeTruthy()
    expect(screen.getByText("src/auth/session.ts")).toBeTruthy()
    expect(screen.getByText("400 ms")).toBeTruthy()
    expect(screen.queryByText("export const a = 1")).toBeNull()

    const head = screen.getByRole("button", { expanded: false })
    await userEvent.click(head)
    expect(head.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("export const a = 1")).toBeTruthy()
  })

  it("renders shell tools as a command card with the command line and output", async () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <ToolCard
          tool={{
            id: "t2",
            name: "Bash",
            status: "failed",
            input: "pnpm test -- auth",
            output: "FAIL session.test.ts",
          }}
        />
      </LocaleProvider>,
    )
    expect(container.querySelector(".tool-card.tool-command[data-status='failed']")).not.toBeNull()
    expect(screen.getByText("pnpm test -- auth")).toBeTruthy()
    expect(screen.getByText("失败")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { expanded: false }))
    expect(screen.getByText("FAIL session.test.ts")).toBeTruthy()
    // 命令卡片不重复显示“输入”标签，命令行本身就是输入。
    expect(screen.queryByText("输入")).toBeNull()
  })

  it("renders no target, duration or chevron when there is nothing to show", () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <ToolCard
          tool={{ id: "t1", name: "Think", status: "running", input: undefined, output: undefined }}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText("Think")).toBeTruthy()
    expect(container.querySelector(".tool-summary")).toBeNull()
    expect(container.querySelector(".tool-duration")).toBeNull()
    expect(container.querySelector(".tool-chev")).toBeNull()
    expect(container.querySelector('.tool-card[data-status="running"] .tool-icon')).not.toBeNull()
  })
})

/** 构造一条线程事件。 */
function event(
  seq: number,
  type: ThreadEvent["type"],
  payload: unknown,
  createdAt: string,
): ThreadEvent {
  return { seq, threadId: "t1", runId: "run_1", type, payload, schemaVersion: 1, createdAt }
}

describe("MessageList tool timing", () => {
  it("merges started/completed timestamps into one row with a duration", () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <MessageList
          events={[
            event(
              1,
              "tool.started",
              { toolCallId: "call_1", name: "Read", input: "a.ts" },
              "2026-10-20T00:00:00.000Z",
            ),
            event(
              2,
              "tool.completed",
              { toolCallId: "call_1", name: "Read", output: "body", isError: false },
              "2026-10-20T00:00:01.500Z",
            ),
          ]}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
    expect(container.querySelectorAll(".tool-card")).toHaveLength(1)
    expect(screen.getByText("1.5 s")).toBeTruthy()
    expect(container.querySelector('.tool-card[data-status="completed"]')).not.toBeNull()
  })

  it("shows a generating line while the run is open without streaming text", () => {
    const { container, rerender } = render(
      <LocaleProvider locale="zh-CN">
        <MessageList
          running
          events={[event(1, "run.started", { text: "hi" }, "2026-10-20T00:00:00.000Z")]}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
    expect(container.querySelector(".run-status")?.textContent).toBe("正在生成…")

    rerender(
      <LocaleProvider locale="zh-CN">
        <MessageList
          running
          streamingText="partial"
          events={[event(1, "run.started", { text: "hi" }, "2026-10-20T00:00:00.000Z")]}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
    expect(container.querySelector(".run-status")).toBeNull()
    expect(container.querySelector(".stream-cursor")).not.toBeNull()
  })
})
