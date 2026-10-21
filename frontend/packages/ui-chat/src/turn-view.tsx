/**
 * 一轮对话：右侧的用户气泡；助手一侧先是「工作中 / 已工作 N 秒」的折叠头，
 * 下面是工具、过程消息、计划与子 agent，再下面是待处理的审批、最终回答、文件改动与操作栏。
 * 运行中工作区展开，结束后自动折叠，只留下最终回答。
 */
import { memo, useEffect, useState } from "react"
import { AlertTriangle, Check, ChevronRight, CircleStop, Copy, FileDiff } from "lucide-react"
import { DotMatrix, copyText, useLocale } from "@pigcode/ui-primitives"
import { ApprovalCard, type ApprovalDecision } from "./approval-card"
import { CommandGroup } from "./command-row"
import { DiffSummary, type FileChangeSummary } from "./diff-summary"
import { elapsed, formatDuration, useNow } from "./duration"
import { MessageText } from "./message-item"
import { PlanCard } from "./plan-card"
import { QuestionCard } from "./question-card"
import { SubagentCard } from "./subagent-card"
import {
  BrowserGroup,
  ExploreGroup,
  ToolCard,
  diffStats,
  toolFilePath,
  type ToolCall,
} from "./tool-card"
import { TurnActions } from "./turn-actions"
import { isEnded, type Turn, type WorkItem } from "./turns"

export { formatDuration } from "./duration"

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
  const asking = turn.questions.some((entry) => entry.answers === undefined)
  const label =
    turn.status === "queued"
      ? t("tabs.status.queued")
      : turn.status === "waiting"
        ? t(asking ? "chat.status.waitingAnswer" : "chat.status.waitingApproval")
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

/** 这一轮改过的文件与行数，来自编辑类工具的输入。 */
function turnChanges(turn: Turn): FileChangeSummary | null {
  const files = new Set<string>()
  let additions = 0
  let deletions = 0
  for (const item of turn.work) {
    const tools =
      item.kind === "tool"
        ? [item.tool]
        : item.kind === "explore" || item.kind === "commands" || item.kind === "browser"
          ? item.tools
          : []
    for (const tool of tools) {
      const stats = tool.status === "completed" ? diffStats(tool) : null
      if (!stats) continue
      additions += stats.added
      deletions += stats.removed
      const path = toolFilePath(tool)
      if (path) files.add(path)
    }
  }
  if (files.size === 0 && additions === 0 && deletions === 0) return null
  return { files: [...files].map((path) => ({ path, lines: [] })), additions, deletions }
}

/** 一轮结束后的改动入口：文件数与行数，点开在右栏 Diff 里看。 */
function ChangesChip({
  summary,
  onView,
}: {
  summary: FileChangeSummary
  onView: (summary: FileChangeSummary) => void
}) {
  const { t } = useLocale()
  return (
    <button type="button" className="turn-changes" onClick={() => onView(summary)}>
      <FileDiff className="ic ic-sm" aria-hidden="true" />
      <span>{t("chat.changes.files").replace("{count}", String(summary.files.length))}</span>
      <span className="add">+{summary.additions}</span>
      <span className="del">−{summary.deletions}</span>
      <span className="turn-changes-cta">{t("chat.changes.review")}</span>
    </button>
  )
}

/** 工作区里的一项。 */
function WorkItemView({
  item,
  liveOutput,
  onViewTool,
  onOpenSubagent,
}: {
  item: WorkItem
  liveOutput: Readonly<Record<string, string>> | undefined
  onViewTool: ((tool: ToolCall) => void) | undefined
  onOpenSubagent: ((id: string) => void) | undefined
}) {
  switch (item.kind) {
    case "message":
      return (
        <div className="work-message md">
          <MessageText text={item.text} />
        </div>
      )
    case "tool":
      return <ToolCard tool={item.tool} live={liveOutput?.[item.tool.id]} onView={onViewTool} />
    case "explore":
      return <ExploreGroup tools={item.tools} onView={onViewTool} />
    case "commands":
      return <CommandGroup tools={item.tools} />
    case "browser":
      return <BrowserGroup tools={item.tools} onView={onViewTool} />
    case "plan":
      return <PlanCard plan={item.plan} />
    case "subagent":
      return <SubagentCard subagent={item.subagent} onOpen={onOpenSubagent} />
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
  onOpenSubagent?: ((id: string) => void) | undefined
  /** 回答 agent 的提问。 */
  onAnswer?: ((requestId: string, answers: string[]) => void) | undefined
  /** 运行中命令已经流出的输出；只传给正在运行的那一轮。 */
  liveOutput?: Readonly<Record<string, string>> | undefined
}

function TurnViewImpl({
  turn,
  streamingText,
  liveOutput,
  agentLabel,
  onApproval,
  onViewTool,
  onViewDiff,
  onOpenSubagent,
  onAnswer,
}: TurnViewProps) {
  const { t } = useLocale()
  const ended = isEnded(turn)
  // 用户手动展开或收起后以用户为准；否则运行中展开、结束后折叠。
  const [manual, setManual] = useState<boolean | null>(null)
  const open = manual ?? !ended
  const hasWork = turn.work.length > 0
  const showHeader = hasWork || !ended
  const changes = ended ? turnChanges(turn) : null
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
              <WorkItemView
                key={item.key}
                item={item}
                liveOutput={liveOutput}
                onViewTool={onViewTool}
                onOpenSubagent={onOpenSubagent}
              />
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
        {turn.questions.map(({ request, answers }) => (
          <QuestionCard
            key={`question-${request.id}`}
            request={request}
            answers={answers ?? (ended ? [] : undefined)}
            onAnswer={onAnswer ?? (() => undefined)}
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
        {ended && onViewDiff && changes ? (
          <ChangesChip summary={changes} onView={onViewDiff} />
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
    previous.liveOutput === next.liveOutput &&
    previous.agentLabel === next.agentLabel &&
    previous.onApproval === next.onApproval &&
    previous.onViewTool === next.onViewTool &&
    previous.onViewDiff === next.onViewDiff &&
    previous.onOpenSubagent === next.onOpenSubagent &&
    previous.onAnswer === next.onAnswer,
)
