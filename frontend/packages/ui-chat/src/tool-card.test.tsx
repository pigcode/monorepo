/** 验证工具行：耗时格式、摘要与展开，以及 MessageList 合并开始/结束时间。 */
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ThreadEvent } from "@pigcode/contracts"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { afterEach, describe, expect, it } from "vitest"
import { MessageList } from "./message-list"
import { ToolCard, formatDuration, toolDuration } from "./tool-card"

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

describe("ToolCard", () => {
  it("shows the first input line as a summary and expands on click", async () => {
    render(
      <LocaleProvider locale="zh-CN">
        <ToolCard
          tool={{
            id: "t1",
            name: "Bash",
            status: "completed",
            input: "ls -la\n/tmp",
            output: "total 0",
            startedAt: "2026-10-20T00:00:00.000Z",
            completedAt: "2026-10-20T00:00:00.400Z",
          }}
        />
      </LocaleProvider>,
    )
    expect(screen.getByText("ls -la")).toBeTruthy()
    expect(screen.getByText("400 ms")).toBeTruthy()
    expect(screen.queryByText("total 0")).toBeNull()

    const head = screen.getByRole("button", { expanded: false })
    await userEvent.click(head)
    expect(head.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("total 0")).toBeTruthy()
  })

  it("renders no summary, duration or chevron when there is nothing to show", () => {
    const { container } = render(
      <LocaleProvider locale="zh-CN">
        <ToolCard
          tool={{ id: "t1", name: "Think", status: "running", input: undefined, output: undefined }}
        />
      </LocaleProvider>,
    )
    expect(container.querySelector(".tool-summary")).toBeNull()
    expect(container.querySelector(".tool-duration")).toBeNull()
    expect(container.querySelector(".tool-chev")).toBeNull()
    expect(container.querySelector('.tool-icon[data-status="running"]')).not.toBeNull()
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
})
