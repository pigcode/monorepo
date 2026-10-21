/** 按轮渲染时间线：每轮一个用户气泡与一段助手工作；切换 agent 时插一条分隔线。 */
import { useCallback, useMemo, useRef } from "react"
import type { ThreadEvent } from "@pigcode/contracts"
import { ArrowLeftRight, Sparkles } from "lucide-react"
import { formatShortcut, useLocale } from "@pigcode/ui-primitives"
import type { ApprovalDecision } from "./approval-card"
import type { FileChangeSummary } from "./diff-summary"
import type { ToolCall } from "./tool-card"
import { TurnView } from "./turn-view"
import { buildTimeline } from "./turns"

export { hasPendingApproval } from "./turns"

/** 消息列表需要的线程事件与交互回调。 */
export interface MessageListProps {
  events: ThreadEvent[]
  streamingText?: string
  /** 把 agent id 换成展示名；每轮的工作头和切换分隔线使用。 */
  agentName?: (agentId: string) => string
  onApproval: (requestId: string, decision: ApprovalDecision) => void
  onViewTool?: ((tool: ToolCall) => void) | undefined
  onViewDiff?: ((summary: FileChangeSummary) => void) | undefined
}

/** 保持引用不变、调用时总是转给最新回调的包装，避免未变化的轮因回调变化而重渲染。 */
function useStable<A extends unknown[], R>(
  callback: ((...args: A) => R) | undefined,
): ((...args: A) => R) | undefined {
  const ref = useRef(callback)
  ref.current = callback
  const stable = useCallback((...args: A) => ref.current!(...args), [])
  return callback ? stable : undefined
}

/** 渲染整条时间线，流式文本放在正在运行的那一轮里。 */
export function MessageList({
  events,
  streamingText = "",
  agentName,
  onApproval,
  onViewTool,
  onViewDiff,
}: MessageListProps) {
  const { t } = useLocale()
  const streaming = streamingText.length > 0
  const timeline = useMemo(() => buildTimeline(events, streaming), [events, streaming])
  const approve = useStable(onApproval)!
  const viewTool = useStable(onViewTool)
  const viewDiff = useStable(onViewDiff)
  const nameOf = (agentId: string | null) => (agentId ? (agentName?.(agentId) ?? agentId) : null)
  const streamingKey = useMemo(() => {
    if (!streaming) return null
    const turns = timeline.flatMap((entry) => (entry.kind === "turn" ? [entry.turn] : []))
    return (
      [...turns]
        .reverse()
        .find((turn) => !["completed", "failed", "interrupted"].includes(turn.status))?.key ?? null
    )
  }, [timeline, streaming])

  if (timeline.length === 0) {
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
  return (
    <div className="msgs">
      {timeline.map((entry) =>
        entry.kind === "switch" ? (
          <div key={entry.key} className="turn-switch" role="separator">
            <ArrowLeftRight className="ic ic-sm" aria-hidden="true" />
            <span>
              {t("chat.switch.to").replace("{agent}", nameOf(entry.agentId) ?? entry.agentId)}
              {entry.handoff ? ` · ${t("chat.switch.handoff")}` : ""}
            </span>
          </div>
        ) : (
          <TurnView
            key={entry.turn.key}
            turn={entry.turn}
            streamingText={entry.turn.key === streamingKey ? streamingText : ""}
            agentLabel={nameOf(entry.turn.agentId)}
            onApproval={approve}
            onViewTool={viewTool}
            onViewDiff={viewDiff}
          />
        ),
      )}
    </div>
  )
}
