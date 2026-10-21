import { describe, expect, it } from "vitest"
import type { ProviderEvent } from "@pigcode/contracts"
import type { ProviderRuntime } from "./driver"
import { FAKE_MODELS, FAKE_SCRIPT_TEXT, FAKE_SUBAGENT_TEXT, FakeProviderDriver } from "./fake"

describe("fake provider", () => {
  it("streams a deterministic response", async () => {
    const driver = new FakeProviderDriver()
    const session = await driver.createSession({ threadId: "th_1", cwd: "/tmp" })
    const events: string[] = []
    const runtime: ProviderRuntime = {
      signal: new AbortController().signal,
      emit: (event: ProviderEvent) => events.push(event.type),
      requestApproval: async () => "deny",
    }
    await driver.send(session, { text: "hello" }, runtime)
    expect(events).toEqual([
      "run.started",
      "message.delta",
      "message.delta",
      "message.delta",
      "message.delta",
      "message.completed",
      "run.completed",
    ])
  })

  it("offers one model with reasoning efforts and one without", async () => {
    const driver = new FakeProviderDriver()
    expect(driver.capabilities.modelCatalog).toBe(true)
    await expect(driver.listModels()).resolves.toBe(FAKE_MODELS)
    expect(FAKE_MODELS.map((model) => model.efforts?.length ?? 0)).toEqual([4, 0])
  })

  it("plays a scripted turn with a plan, tool calls and a summary", async () => {
    const driver = new FakeProviderDriver({ stepMs: 0 })
    const session = await driver.createSession({ threadId: "th_1", cwd: "/tmp" })
    const events: ProviderEvent[] = []
    await driver.send(
      session,
      { text: FAKE_SCRIPT_TEXT },
      {
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
        requestApproval: async () => "deny",
      },
    )
    const tools = events.flatMap((event) => (event.type === "tool.started" ? [event.name] : []))
    expect(tools).toEqual(["Read", "Read", "Grep", "Edit", "Bash", "Edit", "Bash"])
    const commands = events.flatMap((event) =>
      event.type === "tool.completed" && event.name === "Bash" ? [event] : [],
    )
    // 第一次 lint 失败（退出码 1），修好后再跑一次；两条命令的输出都按片段流出。
    expect(commands.map((event) => [event.isError, event.exitCode])).toEqual([
      [true, 1],
      [false, 0],
    ])
    const deltas = events.filter((event) => event.type === "tool.outputDelta")
    expect(deltas.map((event) => event.toolCallId)).toEqual([
      ...Array(3).fill("fake-lint-1"),
      ...Array(5).fill("fake-bash-1"),
    ])
    expect(events.filter((event) => event.type === "plan.updated")).toHaveLength(3)
    expect(events.filter((event) => event.type === "message.completed")).toHaveLength(3)
    expect(events.at(-1)).toEqual({ type: "run.completed" })
  })

  it("spawns two sub-agents whose work is tagged with their task", async () => {
    const driver = new FakeProviderDriver({ stepMs: 0 })
    const session = await driver.createSession({ threadId: "th_1", cwd: "/tmp" })
    const events: ProviderEvent[] = []
    await driver.send(
      session,
      { text: FAKE_SUBAGENT_TEXT },
      {
        signal: new AbortController().signal,
        emit: (event) => events.push(event),
        requestApproval: async () => "deny",
      },
    )
    const started = events.flatMap((event) =>
      event.type === "subagent.started" ? [event.toolCallId] : [],
    )
    expect(started).toEqual(["fake-task-explore", "fake-task-review"])
    const completed = events.flatMap((event) =>
      event.type === "subagent.completed" ? [event.toolCallId] : [],
    )
    expect(completed).toEqual(["fake-task-explore", "fake-task-review"])
    const childTools = events.flatMap((event) =>
      event.type === "tool.started" ? [event.parentToolUseId] : [],
    )
    expect(new Set(childTools)).toEqual(new Set(["fake-task-explore", "fake-task-review"]))
    expect(events.at(-1)).toEqual({ type: "run.completed" })
  })
})
