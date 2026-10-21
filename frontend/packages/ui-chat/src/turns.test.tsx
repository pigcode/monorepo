/** 验证按轮整理时间线：用户消息、工作与最终回答、查阅分组、审批、切换分隔线与折叠头。 */
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ThreadEvent } from "@pigcode/contracts"
import { afterEach, describe, expect, it, vi } from "vitest"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { MessageList } from "./message-list"
import { formatDuration } from "./turn-view"
import { buildTimeline, type Turn } from "./turns"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function event(
  seq: number,
  type: ThreadEvent["type"],
  payload: unknown = {},
  runId: string | null = "run_1",
  at = 0,
): ThreadEvent {
  return {
    seq,
    threadId: "t1",
    runId,
    type,
    payload,
    schemaVersion: 1,
    createdAt: new Date(Date.UTC(2026, 9, 21, 8, 0, at)).toISOString(),
  }
}

/** 一轮完整的脚本：说明、两个读文件、一个搜索、一个命令、回答。 */
function scriptedRun(runId = "run_1", base = 0): ThreadEvent[] {
  const e = (seq: number, type: ThreadEvent["type"], payload: unknown, at: number) =>
    event(seq + base, type, payload, runId, at)
  return [
    e(1, "message.completed", { role: "user", text: "fix the answer" }, 0),
    e(2, "run.started", { providerId: "claude" }, 0),
    e(3, "message.completed", { role: "assistant", text: "Looking around." }, 1),
    e(4, "tool.started", { id: "r1", name: "Read", input: { file_path: "README.md" } }, 2),
    e(5, "tool.completed", { id: "r1", name: "Read", output: "# Demo" }, 3),
    e(6, "tool.started", { id: "r2", name: "Read", input: { file_path: "src/index.ts" } }, 4),
    e(7, "tool.completed", { id: "r2", name: "Read", output: "export" }, 5),
    e(8, "tool.started", { id: "g1", name: "Grep", input: { pattern: "answer" } }, 6),
    e(9, "tool.completed", { id: "g1", name: "Grep", output: "src/index.ts:1" }, 7),
    e(10, "tool.started", { id: "b1", name: "Bash", input: { command: "pnpm test" } }, 8),
    e(11, "tool.completed", { id: "b1", name: "Bash", output: "ok" }, 9),
    e(12, "message.completed", { role: "assistant", text: "Fixed it." }, 10),
    e(13, "run.completed", {}, 12),
  ]
}

function onlyTurns(events: ThreadEvent[], streaming = false): Turn[] {
  return buildTimeline(events, streaming).flatMap((entry) =>
    entry.kind === "turn" ? [entry.turn] : [],
  )
}

describe("buildTimeline", () => {
  it("splits a finished run into user text, folded work and the final answer", () => {
    const [turn] = onlyTurns(scriptedRun())
    expect(turn).toMatchObject({
      runId: "run_1",
      userText: "fix the answer",
      agentId: "claude",
      status: "completed",
      answer: "Fixed it.",
      replyText: "Looking around.\n\nFixed it.",
    })
    expect(turn?.work.map((item) => item.kind)).toEqual(["message", "explore", "tool"])
    const explore = turn?.work[1]
    expect(explore?.kind === "explore" ? explore.tools.map((tool) => tool.name) : []).toEqual([
      "Read",
      "Read",
      "Grep",
    ])
  })

  it("keeps every message as work while the run is still going", () => {
    const events = scriptedRun().slice(0, 9)
    const [turn] = onlyTurns(events)
    expect(turn?.status).toBe("running")
    expect(turn?.answer).toBeNull()
    expect(turn?.work[0]).toMatchObject({ kind: "message", text: "Looking around." })
  })

  it("shows approvals outside the folded work, marks the turn as waiting and remembers decisions", () => {
    const events = [
      event(1, "run.started", { text: "deploy" }),
      event(2, "approval.requested", { id: "req_1", title: "Run deploy", command: "./deploy.sh" }),
    ]
    expect(onlyTurns(events)[0]?.status).toBe("waiting")
    const resolved = [...events, event(3, "approval.resolved", { id: "req_1", decision: "deny" })]
    const [turn] = onlyTurns(resolved)
    expect(turn?.status).toBe("running")
    expect(turn?.approvals).toEqual([
      { request: expect.objectContaining({ id: "req_1", title: "Run deploy" }), resolved: "deny" },
    ])
  })

  it("adds a divider when the thread switches agents and a running turn for orphan streaming", () => {
    const entries = buildTimeline(
      [
        ...scriptedRun(),
        event(20, "thread.updated", { providerId: "codex", handoff: "summary" }, null),
      ],
      true,
    )
    expect(entries.map((entry) => entry.kind)).toEqual(["turn", "switch", "turn"])
    expect(entries[1]).toMatchObject({ agentId: "codex", handoff: true })
    expect(entries[2]?.kind === "turn" ? entries[2].turn.status : null).toBe("running")
  })

  it("keeps a turn's signature until one of its own events changes", () => {
    const first = scriptedRun("run_1")
    const second = scriptedRun("run_2", 100).slice(0, 5)
    const before = onlyTurns([...first, ...second])
    const after = onlyTurns([...first, ...scriptedRun("run_2", 100).slice(0, 7)])
    expect(after[0]?.signature).toBe(before[0]?.signature)
    expect(after[1]?.signature).not.toBe(before[1]?.signature)
  })
})

describe("formatDuration", () => {
  it("writes compact durations in both languages", () => {
    expect(formatDuration(400, "zh-CN")).toBe("1 秒")
    expect(formatDuration(12_000, "zh-CN")).toBe("12 秒")
    expect(formatDuration(185_000, "zh-CN")).toBe("3 分 5 秒")
    expect(formatDuration(3_720_000, "en-US")).toBe("1h 2m")
  })
})

describe("turn rendering", () => {
  function renderList(events: ThreadEvent[], streamingText = "") {
    return render(
      <LocaleProvider locale="zh-CN">
        <MessageList
          events={events}
          streamingText={streamingText}
          agentName={(id) => (id === "claude" ? "Claude Code" : id)}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
  }

  it("folds a finished turn's work under 'worked for' and expands it on click", async () => {
    renderList(scriptedRun())
    expect(screen.getByText("fix the answer").className).toBe("msg-user")
    expect(screen.getByText("Fixed it.")).toBeTruthy()
    expect(screen.queryByText("Looking around.")).toBeNull()
    const header = screen.getByRole("button", { name: "已工作 12 秒" })
    expect(screen.getByText("Claude Code")).toBeTruthy()

    await userEvent.click(header)
    expect(header.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("Looking around.")).toBeTruthy()
    const explore = screen.getByRole("button", { name: /查阅/ })
    expect(explore.textContent).toContain("2 个文件 · 1 次搜索")
    const run = screen.getByRole("button", { name: /终端/ })
    expect(run.textContent).toContain("pnpm test")
    expect(run.textContent).toContain("1 秒")

    await userEvent.click(run)
    expect(within(run.parentElement!).getByText("pnpm test", { selector: "pre" })).toBeTruthy()
    expect(within(run.parentElement!).getByText("ok")).toBeTruthy()
  })

  it("shows a live 'working for' header with the work expanded while running", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(Date.UTC(2026, 9, 21, 8, 0, 9)))
    const { container } = renderList(scriptedRun().slice(0, 10), "partial answer")
    const header = screen.getByRole("button", { name: /工作中 9 秒/ })
    expect(header.querySelector(".dot-matrix")).not.toBeNull()
    expect(screen.getByText("Looking around.")).toBeTruthy()
    expect(screen.getByText("partial answer")).toBeTruthy()
    // 运行中的命令显示「正在执行」的扫光文字。
    expect(
      container.querySelector(".tool-row[data-status='running'] .tool-shimmer")?.textContent,
    ).toBe("正在执行")
  })
})
