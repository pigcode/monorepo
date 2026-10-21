/**
 * 一轮对话：右侧的用户气泡；助手一侧先是「工作中 / 已工作 N 秒」的折叠头，
 * 下面是工具、过程消息、计划与子 agent，再下面是待处理的审批、最终回答、文件改动与操作栏。
 * 运行中工作区展开，结束后自动折叠，只留下最终回答。
 */
import { memo, useEffect, useState } from "react"
import { AlertTriangle, Check, ChevronRight, CircleStop, Copy } from "lucide-react"
import { DotMatrix, copyText, useLocale } from "@pigcode/ui-primitives"
import { ApprovalCard, type ApprovalDecision } from "./approval-card"
import { DiffSummary, type FileChangeSummary } from "./diff-summary"
import { MessageText } from "./message-item"
import { PlanCard } from "./plan-card"
import { SubagentCard } from "./subagent-card"
import { ExploreGroup, ToolCard, type ToolCall } from "./tool-card"
import { TurnActions } from "./turn-actions"
import { isEnded, type Turn, type WorkItem } from "./turns"

/** 把时长写成「12 秒 / 3 分 5 秒 / 1 时 2 分」，英文为「12s / 3m 5s / 1h 2m」。 */
export function formatDuration(ms: number, locale: string): string {
  const total = Math.max(1, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const zh = locale.startsWith("zh")
  const unit = (value: number, zhUnit: string, enUnit: string) =>
    zh ? `${value} ${zhUnit}` : `${value}${enUnit}`
  if (hours > 0)
    return [unit(hours, "时", "h"), minutes > 0 ? unit(minutes, "分", "m") : null]
      .filter(Boolean)
      .join(" ")
  if (minutes > 0)
    return [unit(minutes, "分", "m"), seconds > 0 ? unit(seconds, "秒", "s") : null]
      .filter(Boolean)
      .join(" ")
  return unit(seconds, "秒", "s")
}

/** 运行中每秒刷新一次当前时间；结束后停止计时。 */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/** 两个时间点之间的毫秒数；缺任何一个时为 null。 */
function elapsed(from: string | null, to: string | number | null): number | null {
  if (!from || to === null) return null
  const start = Date.parse(from)
  const end = typeof to === "number" ? to : Date.parse(to)
  return Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : null
}

/** 工作区的折叠头。 */
function WorkHeader({
  turn,
  open,
  canToggle,
  agentLabel,
  onToggle,
}: {
  turn: Turn
  open: boolean
  canToggle: boolean
  agentLabel: string | null
  onToggle: () => void
}) {
  const { t, locale } = useLocale()
  const live = !isEnded(turn)
  const now = useNow(live && turn.status !== "queued")
  const ms = elapsed(turn.startedAt, live ? now : turn.endedAt)
  const duration = ms === null ? null : formatDuration(ms, locale)
  const label =
    turn.status === "queued"
      ? t("tabs.status.queued")
      : turn.status === "waiting"
        ? t("chat.status.waitingApproval")
        : live
          ? t("chat.work.working").replace("{duration}", duration ?? "")
          : turn.status === "interrupted"
            ? t("chat.work.stopped")
            : duration
              ? t("chat.work.worked").replace("{duration}", duration)
              : t("chat.work.done")
  return (
    <div className="work-head" data-status={turn.status}>
      <button
        type="button"
        className="work-toggle"
        aria-expanded={canToggle ? open : undefined}
        disabled={!canToggle}
        onClick={onToggle}
      >
        {live && turn.status !== "queued" ? <DotMatrix /> : null}
        <span className="work-label">{label}</span>
        {canToggle ? <ChevronRight className="ic ic-sm work-chev" aria-hidden="true" /> : null}
      </button>
      {agentLabel ? <span className="work-agent">{agentLabel}</span> : null}
    </div>
  )
}

/** 用户气泡下方悬停出现的复制按钮。 */
function UserActions({ text }: { text: string }) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return undefined
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])
  const label = copied ? t("chat.copied") : t("chat.copyMessage")
  return (
    <div className="turn-user-actions">
      <button
        type="button"
        className="turn-action"
        aria-label={label}
        title={label}
        onClick={() => void copyText(text).then(() => setCopied(true))}
      >
        {copied ? (
          <Check className="ic ic-sm" aria-hidden="true" />
        ) : (
          <Copy className="ic ic-sm" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}

/** 工作区里的一项。 */
function WorkItemView({
  item,
  onViewTool,
}: {
  item: WorkItem
  onViewTool: ((tool: ToolCall) => void) | undefined
}) {
  switch (item.kind) {
    case "message":
      return (
        <div className="work-message md">
          <MessageText text={item.text} />
        </div>
      )
    case "tool":
      return <ToolCard tool={item.tool} onView={onViewTool} />
    case "explore":
      return <ExploreGroup tools={item.tools} onView={onViewTool} />
    case "plan":
      return <PlanCard plan={item.plan} />
    case "subagent":
      return <SubagentCard subagent={item.subagent} />
  }
}

/** 一轮对话的属性；回调由消息列表做成稳定引用，未变化的轮不会重渲染。 */
export interface TurnViewProps {
  turn: Turn
  streamingText: string
  agentLabel: string | null
  onApproval: (requestId: string, decision: ApprovalDecision) => void
  onViewTool: ((tool: ToolCall) => void) | undefined
  onViewDiff: ((summary: FileChangeSummary) => void) | undefined
}

function TurnViewImpl({
  turn,
  streamingText,
  agentLabel,
  onApproval,
  onViewTool,
  onViewDiff,
}: TurnViewProps) {
  const { t } = useLocale()
  const ended = isEnded(turn)
  // 用户手动展开或收起后以用户为准；否则运行中展开、结束后折叠。
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? !ended
  const hasWork = turn.work.length > 0
  const showHeader = hasWork || !ended
  return (
    <section className="turn" data-status={turn.status} data-turn={turn.key}>
      {turn.userText ? (
        <div className="turn-user">
          <div className="msg-user">{turn.userText}</div>
          <UserActions text={turn.userText} />
        </div>
      ) : null}
      <div className="turn-agent">
        {showHeader ? (
          <WorkHeader
            turn={turn}
            open={open}
            canToggle={hasWork}
            agentLabel={agentLabel}
            onToggle={() => setManual(!open)}
          />
        ) : null}
        {hasWork && open ? (
          <div className="turn-work">
            {turn.work.map((item) => (
              <WorkItemView key={item.key} item={item} onViewTool={onViewTool} />
            ))}
          </div>
        ) : null}
        {turn.approvals.map(({ request, resolved }) => (
          <ApprovalCard
            key={`approval-${request.id}`}
            request={request}
            resolved={resolved}
            onApproval={onApproval}
          />
        ))}
        {turn.answer ? (
          <div className="msg-ai md">
            <MessageText text={turn.answer} />
          </div>
        ) : null}
        {streamingText ? (
          <div className="msg-ai md is-streaming">
            <MessageText text={streamingText} />
            <span className="stream-cursor" aria-label={t("chat.streaming")} />
          </div>
        ) : null}
        {turn.changes.map((summary, index) => (
          <DiffSummary key={`changes-${index}`} summary={summary} onView={onViewDiff} />
        ))}
        {turn.status === "interrupted" ? (
          <div className="event-line run-interrupted">
            <CircleStop className="ic ic-sm" aria-hidden="true" />
            {t("chat.interrupted")}
          </div>
        ) : null}
        {turn.status === "failed" ? (
          <div className="event-line t-bad">
            <AlertTriangle className="ic ic-sm" aria-hidden="true" />
            {turn.error || t("chat.error")}
          </div>
        ) : null}
        {ended && turn.replyText ? <TurnActions text={turn.replyText} at={turn.replyAt} /> : null}
      </div>
    </section>
  )
}

/** 只在这一轮的内容、流式文本或 agent 名变化时重渲染。 */
export const TurnView = memo(
  TurnViewImpl,
  (previous, next) =>
    previous.turn.signature === next.turn.signature &&
    previous.streamingText === next.streamingText &&
    previous.agentLabel === next.agentLabel &&
    previous.onApproval === next.onApproval &&
    previous.onViewTool === next.onViewTool &&
    previous.onViewDiff === next.onViewDiff,
)
