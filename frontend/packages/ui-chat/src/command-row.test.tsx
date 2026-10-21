/** 验证终端命令行：运行中的实时输出、退出码、命令分组、命令文本解析与编辑行的改动行数。 */
// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ThreadEvent } from "@pigcode/contracts"
import { LocaleProvider } from "@pigcode/ui-primitives"
import { afterEach, describe, expect, it } from "vitest"
import { plainOutput } from "./command-row"
import { MessageList } from "./message-list"
import { ToolCard } from "./tool-card"
import { commandText, diffStats } from "./tool-meta"
import { resetToolOpen } from "./tool-open"

afterEach(() => {
  cleanup()
  resetToolOpen()
})

function e(seq: number, type: ThreadEvent["type"], payload: unknown, second = seq): ThreadEvent {
  return {
    seq,
    threadId: "t1",
    runId: "run_1",
    type,
    payload,
    schemaVersion: 1,
    createdAt: new Date(Date.UTC(2026, 9, 21, 8, 0, second)).toISOString(),
  }
}

function inLocale(node: React.ReactNode) {
  return render(<LocaleProvider locale="zh-CN">{node}</LocaleProvider>)
}

describe("command rows", () => {
  it("open while running to follow the streamed output, then fold when finished", () => {
    const running = [
      e(1, "run.started", { text: "test it" }),
      e(2, "tool.started", { id: "c1", name: "Bash", input: { command: "bash -lc 'pnpm test'" } }),
    ]
    const { rerender } = inLocale(
      <MessageList events={running} onApproval={() => {}} liveOutput={{ c1: "✓ a\n✓ b\n" }} />,
    )
    const row = screen.getByRole("button", { name: /正在执行/ })
    expect(row.textContent).toContain("pnpm test")
    expect(row.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByLabelText("输出").textContent).toBe("✓ a\n✓ b")

    rerender(
      <LocaleProvider locale="zh-CN">
        <MessageList
          events={[
            ...running,
            e(5, "tool.completed", {
              id: "c1",
              name: "Bash",
              output: "✓ a\n✓ b\n✓ c\n",
              exitCode: 0,
            }),
          ]}
          onApproval={() => {}}
        />
      </LocaleProvider>,
    )
    const done = screen.getByRole("button", { name: /终端/ })
    expect(done.getAttribute("aria-expanded")).toBe("false")
    expect(done.textContent).toContain("3 秒")
  })

  it("show the exit code of a failed command and say when there was no output", async () => {
    inLocale(
      <ToolCard
        tool={{
          id: "c2",
          name: "Bash",
          status: "failed",
          input: JSON.stringify({ command: "pnpm lint" }),
          output: "\u001b[31merror\u001b[39m  no-constant-binary-expression",
          exitCode: 1,
        }}
      />,
    )
    const row = screen.getByRole("button", { name: /终端/ })
    expect(within(row).getByText("退出码 1").getAttribute("title")).toBe(
      "error  no-constant-binary-expression",
    )
    await userEvent.click(row)
    expect(screen.getByLabelText("输出").textContent).toBe("error  no-constant-binary-expression")
    cleanup()

    inLocale(
      <ToolCard
        tool={{ id: "c3", name: "Bash", status: "completed", input: "true", output: "" }}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /终端/ }))
    expect(screen.getByText("没有输出。")).toBeTruthy()
  })

  it("group consecutive finished commands and count failures", async () => {
    inLocale(
      <MessageList
        events={[
          e(1, "run.started", { text: "check" }),
          e(2, "tool.started", { id: "a", name: "Bash", input: { command: "pnpm lint" } }),
          e(3, "tool.completed", {
            id: "a",
            name: "Bash",
            output: "bad",
            isError: true,
            exitCode: 2,
          }),
          e(4, "tool.started", { id: "b", name: "Bash", input: { command: "pnpm test" } }),
          e(5, "tool.completed", { id: "b", name: "Bash", output: "ok", exitCode: 0 }),
          e(6, "message.completed", { role: "assistant", text: "done" }),
          e(7, "run.completed", {}),
        ]}
        onApproval={() => {}}
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /已工作/ }))
    const group = screen.getByRole("button", { name: /终端.*2 个命令，1 个失败/ })
    await userEvent.click(group)
    expect(screen.getByText("pnpm lint")).toBeTruthy()
    expect(screen.getByText("退出码 2")).toBeTruthy()
    expect(screen.getByText("pnpm test")).toBeTruthy()
  })
})

describe("tool metadata", () => {
  it("unwraps shell wrappers and argv arrays to the command that ran", () => {
    expect(commandText(JSON.stringify({ command: "bash -lc 'pnpm test --run'" }))).toBe(
      "pnpm test --run",
    )
    expect(commandText(JSON.stringify({ command: ["/bin/zsh", "-lc", "ls -la"] }))).toBe("ls -la")
    expect(commandText("git status")).toBe("git status")
    expect(plainOutput("\u001b[32m✓\u001b[0m ok\r\n")).toBe("✓ ok\n")
  })

  it("counts the lines an edit adds and removes", () => {
    const edit = (input: unknown) => diffStats({ name: "Edit", input: JSON.stringify(input) })
    expect(edit({ old_string: "a", new_string: "b\nc" })).toEqual({ added: 2, removed: 1 })
    expect(edit({ edits: [{ old_string: "a\nb", new_string: "c" }] })).toEqual({
      added: 1,
      removed: 2,
    })
    expect(diffStats({ name: "Write", input: JSON.stringify({ content: "x\ny\n" }) })).toEqual({
      added: 2,
      removed: 0,
    })
    expect(
      diffStats({
        name: "ApplyPatch",
        input: JSON.stringify([{ path: "a.ts", diff: "--- a\n+++ b\n-old\n+new\n+more" }]),
      }),
    ).toEqual({ added: 2, removed: 1 })
    expect(diffStats({ name: "Read", input: "{}" })).toBeNull()
  })

  it("show the line counts on edit rows", () => {
    inLocale(
      <ToolCard
        tool={{
          id: "e1",
          name: "Edit",
          status: "completed",
          input: JSON.stringify({ file_path: "src/a.ts", old_string: "a", new_string: "b\nc" }),
          output: "updated",
        }}
      />,
    )
    expect(screen.getByLabelText("+2 −1").textContent).toBe("+2−1")
  })
})
