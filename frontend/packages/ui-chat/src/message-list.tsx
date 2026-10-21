/** 按事件顺序渲染消息、工具、审批、计划与文件变更。 */
import type { ReactNode } from "react"
import type { ThreadEvent } from "@pigcode/contracts"
import { AlertTriangle, CircleStop, Sparkles } from "lucide-react"
import { formatShortcut, useLocale } from "@pigcode/ui-primitives"
import { ApprovalCard, type ApprovalDecision } from "./approval-card"
import { DiffSummary, type FileChangeSummary } from "./diff-summary"
import {
  approvalFromEvent,
  asRecord,
  asText,
  collectResolved,
  collectSubagents,
  collectTools,
  diffFromEvent,
  isParentScoped,
  planFromEvent,
  toolFromEvent,
} from "./event-parsers"
import { AssistantMessage, MessageText, UserMessage } from "./message-item"
import { PlanCard } from "./plan-card"
import { SubagentCard } from "./subagent-card"
import { ToolCard, type ToolCall, type ToolStatus } from "./tool-card"
import { TurnActions } from "./turn-actions"

/** 消息列表需要的线程事件与交互回调。 */
export interface MessageListProps {
  events: ThreadEvent[]
  streamingText?: string
  /** 当前 provider 的展示名与头像首字母。 */
  assistantName?: string
  assistantInitial?: string
  onApproval: (requestId: string, decision: ApprovalDecision) => void
  onViewTool?: ((tool: ToolCall) => void) | undefined
  onViewDiff?: ((summary: FileChangeSummary) => void) | undefined
}

/** 判断线程是否还有未处理的审批请求。 */
export function hasPendingApproval(events: ThreadEvent[]): boolean {
  const resolved = collectResolved(events)
  for (const event of events) {
    if (event.type !== "approval.requested") continue
    const request = approvalFromEvent(event)
    if (request && !resolved.has(request.id)) return true
  }
  return false
}

/** 渲染整条消息时间线，最后追加流式文本。 */
export function MessageList({
  events,
  streamingText = "",
  assistantName = "Assistant",
  assistantInitial = "AI",
  onApproval,
  onViewTool,
  onViewDiff,
}: MessageListProps) {
  const { t } = useLocale()
  const tools = collectTools(events)
  const resolved = collectResolved(events)
  const subagents = collectSubagents(events)
  const sorted = [...events].sort((left, right) => left.seq - right.seq)
  const nodes: ReactNode[] = []
  const renderedTools = new Set<string>()
  const renderedSubagents = new Set<string>()
  // 一轮回复只在第一条助手消息上显示头像和名称；用户消息开启新的一轮。
  let headShown = false
  const turn = (): boolean => {
    const continued = headShown
    headShown = true
    return continued
  }
  // 当前这一轮助手回复的文本与最后一条的时间；run 结束时在下方放复制与时间。
  let replyTexts: string[] = []
  let replyAt: string | null = null

  for (const event of sorted) {
    const key = `${event.seq}-${event.type}`
    const payload = asRecord(event.payload)
    // 子 agent 的消息与工具已在卡片内部按 seq 渲染，跳过顶层重复展示。
    if (isParentScoped(event.type) && asText(payload?.parentToolUseId)) continue
    if (event.type === "subagent.started") {
      const id = asText(payload?.toolCallId) ?? asText(payload?.id)
      const subagent = id ? subagents.get(id) : undefined
      if (subagent && !renderedSubagents.has(subagent.id)) {
        renderedSubagents.add(subagent.id)
        nodes.push(<SubagentCard key={`subagent-${subagent.id}`} subagent={subagent} />)
      }
      continue
    }
    if (event.type === "subagent.completed") continue
    if (event.type === "run.started") {
      const text = asText(payload?.text)
      if (text) {
        nodes.push(<UserMessage key={key} text={text} />)
        headShown = false
      }
      replyTexts = []
      replyAt = null
      continue
    }
    if (event.type === "message.completed") {
      const text = asText(payload?.text)
      if (!text) continue
      if (asText(payload?.role) === "user") {
        nodes.push(<UserMessage key={key} text={text} />)
        headShown = false
        replyTexts = []
        replyAt = null
        continue
      }
      replyTexts.push(text)
      replyAt = event.createdAt
      nodes.push(
        <AssistantMessage
          key={key}
          name={assistantName}
          initial={assistantInitial}
          continued={turn()}
        >
          <MessageText text={text} />
        </AssistantMessage>,
      )
      continue
    }
    if (event.type === "tool.started" || event.type === "tool.completed") {
      const status: ToolStatus =
        event.type === "tool.started"
          ? "running"
          : payload?.error !== undefined || payload?.status === "failed"
            ? "failed"
            : "completed"
      const next = toolFromEvent(event, status)
      if (!next || renderedTools.has(next.id)) continue
      renderedTools.add(next.id)
      nodes.push(
        <ToolCard key={`tool-${next.id}`} tool={tools.get(next.id) ?? next} onView={onViewTool} />,
      )
      continue
    }
    if (event.type === "approval.requested") {
      const request = approvalFromEvent(event)
      if (!request) continue
      nodes.push(
        <ApprovalCard
          key={`approval-${request.id}`}
          request={request}
          resolved={resolved.get(request.id)}
          onApproval={onApproval}
        />,
      )
      continue
    }
    if (event.type === "plan.updated") {
      const plan = planFromEvent(event)
      if (plan) nodes.push(<PlanCard key={key} plan={plan} />)
      continue
    }
    if (event.type === "file.changed") {
      const summary = diffFromEvent(event)
      if (summary) nodes.push(<DiffSummary key={key} summary={summary} onView={onViewDiff} />)
      continue
    }
    if (event.type === "run.interrupted") {
      nodes.push(
        <div key={key} className="event-line run-interrupted">
          <CircleStop className="ic ic-sm" aria-hidden="true" />
          {t("chat.interrupted")}
        </div>,
      )
    }
    if (event.type === "run.failed") {
      nodes.push(
        <AssistantMessage
          key={key}
          name={assistantName}
          initial={assistantInitial}
          continued={turn()}
        >
          <div className="event-line t-bad">
            <AlertTriangle className="ic ic-sm" aria-hidden="true" />
            {asText(payload?.message) ?? t("chat.error")}
          </div>
        </AssistantMessage>,
      )
    }
    if (
      (event.type === "run.completed" ||
        event.type === "run.failed" ||
        event.type === "run.interrupted") &&
      replyTexts.length > 0
    ) {
      nodes.push(
        <TurnActions key={`actions-${event.seq}`} text={replyTexts.join("\n\n")} at={replyAt} />,
      )
      replyTexts = []
      replyAt = null
    }
  }

  if (streamingText) {
    nodes.push(
      <AssistantMessage
        key="streaming"
        name={assistantName}
        initial={assistantInitial}
        continued={turn()}
      >
        <MessageText text={streamingText} />
        <span className="stream-cursor" aria-label={t("chat.streaming")} />
      </AssistantMessage>,
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="msgs">
        <div className="chat-empty">
          <span className="empty-mark" aria-hidden="true">
            <Sparkles className="ic" />
          </span>
          <h2>{t("chat.empty.title")}</h2>
          <p>{t("chat.empty.hint")}</p>
          <div className="empty-hints">
            <span>
              <kbd>{formatShortcut("Mod+k")}</kbd>
              {t("chat.empty.command")}
            </span>
            <span>
              <kbd>{formatShortcut("Mod+n")}</kbd>
              {t("chat.empty.newThread")}
            </span>
          </div>
        </div>
      </div>
    )
  }
  return <div className="msgs">{nodes}</div>
}
