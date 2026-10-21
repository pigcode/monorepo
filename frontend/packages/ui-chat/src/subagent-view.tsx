/**
 * 主 agent 派生的子代理在标签页里的完整视图：任务说明、按顺序的过程消息与工具调用、
 * 交回给主 agent 的结果。它属于主会话的这一轮，没有自己的输入框。
 */
import { useState } from "react"
import type { ThreadEvent } from "@pigcode/contracts"
import { Bot } from "lucide-react"
import { DotMatrix, useLocale } from "@pigcode/ui-primitives"
import { asRecord, asText, collectTools, toolFromEvent } from "./event-parsers"
import { MessageText } from "./message-item"
import type { SubagentCall } from "./subagent-card"
import { ToolCard, type ToolCall } from "./tool-card"

type Step =
  { kind: "message"; key: string; text: string } | { kind: "tool"; key: string; tool: ToolCall }

/** 子 agent 的过程：完成的消息与合并后的工具调用，按 seq 排列。 */
export function subagentSteps(events: readonly ThreadEvent[]): Step[] {
  const sorted = [...events].sort((left, right) => left.seq - right.seq)
  const tools = collectTools(sorted)
  const seen = new Set<string>()
  const steps: Step[] = []
  for (const event of sorted) {
    if (event.type === "message.completed") {
      const text = asText(asRecord(event.payload)?.text)
      if (text) steps.push({ kind: "message", key: `msg-${event.seq}`, text })
      continue
    }
    if (event.type !== "tool.started" && event.type !== "tool.completed") continue
    const tool = toolFromEvent(event, event.type === "tool.started" ? "running" : "completed")
    if (!tool || seen.has(tool.id)) continue
    seen.add(tool.id)
    steps.push({ kind: "tool", key: `tool-${tool.id}`, tool: tools.get(tool.id) ?? tool })
  }
  return steps
}

/** 主 agent 交给子 agent 的任务；超过四行时折叠，可以展开。 */
function SubagentTask({ text }: { text: string }) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const long = text.split("\n").length > 4 || text.length > 320
  return (
    <div className="subagent-view-task" data-clamped={long && !open ? true : undefined}>
      <div className="subagent-view-task-text">{text}</div>
      {long ? (
        <button type="button" className="subagent-view-more" onClick={() => setOpen(!open)}>
          {open ? t("chat.tool.collapse") : t("chat.tool.expand")}
        </button>
      ) : null}
    </div>
  )
}

const STATUS_KEYS = {
  running: "chat.status.running",
  completed: "chat.tool.completed",
  failed: "chat.tool.failed",
  interrupted: "tabs.status.interrupted",
} as const

/** 渲染派生子代理的过程与结果。 */
export function SubagentView({
  subagent,
  onViewTool,
}: {
  subagent: SubagentCall
  onViewTool?: ((tool: ToolCall) => void) | undefined
}) {
  const { t } = useLocale()
  const steps = subagentSteps(subagent.events)
  return (
    <div className="msgs subagent-view" data-status={subagent.status}>
      <header className="subagent-view-head">
        <span className="subagent-icon" aria-hidden="true">
          <Bot className="ic ic-sm" />
        </span>
        <div className="subagent-view-title">
          <div className="subagent-view-name">
            {subagent.description ?? subagent.name}
            <span className="subagent-view-model">
              {[subagent.description ? subagent.name : null, subagent.model]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          {subagent.prompt ? <SubagentTask text={subagent.prompt} /> : null}
        </div>
        <span className={`subagent-status ${subagent.status}`}>
          {subagent.status === "running" ? <DotMatrix /> : null}
          {t(STATUS_KEYS[subagent.status])}
        </span>
      </header>
      <div className="turn-work subagent-view-steps">
        {steps.length === 0 ? <div className="muted">{t("chat.subagent.empty")}</div> : null}
        {steps.map((step) =>
          step.kind === "message" ? (
            <div key={step.key} className="work-message md">
              <MessageText text={step.text} />
            </div>
          ) : (
            <ToolCard key={step.key} tool={step.tool} onView={onViewTool} />
          ),
        )}
      </div>
      {subagent.output ? (
        <section className="subagent-view-result">
          <div className="subagent-view-label">{t("chat.subagent.result")}</div>
          <div className="msg-ai md">
            <MessageText text={subagent.output} />
          </div>
        </section>
      ) : null}
    </div>
  )
}
