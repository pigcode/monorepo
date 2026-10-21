/**
 * 把线程事件整理成一轮一轮的对话：用户消息、这一轮的工作（工具、过程消息、计划、子 agent）、
 * 待处理的审批、最后的回答、文件改动与结束状态。时间线按轮渲染，结束的轮把工作折叠起来。
 */
import type { ThreadEvent } from "@pigcode/contracts"
import type { ApprovalDecision, ApprovalRequest } from "./approval-card"
import type { FileChangeSummary } from "./diff-summary"
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
import type { PlanUpdate } from "./plan-card"
import type { SubagentCall } from "./subagent-card"
import { browserAction, isCommandTool, type ToolCall, type ToolStatus } from "./tool-meta"

/** 一轮里的一项工作。 */
export type WorkItem =
  | { kind: "message"; key: string; text: string }
  | { kind: "tool"; key: string; tool: ToolCall }
  | { kind: "explore"; key: string; tools: ToolCall[] }
  | { kind: "commands"; key: string; tools: ToolCall[] }
  | { kind: "browser"; key: string; tools: ToolCall[] }
  | { kind: "plan"; key: string; plan: PlanUpdate }
  | { kind: "subagent"; key: string; subagent: SubagentCall }

/** 一轮的状态；waiting 表示在等用户审批。 */
export type TurnStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "interrupted"

/** 一轮对话。signature 在内容不变时保持不变，供渲染时跳过未变化的轮。 */
export interface Turn {
  key: string
  runId: string | null
  userText: string | null
  agentId: string | null
  status: TurnStatus
  startedAt: string | null
  endedAt: string | null
  work: WorkItem[]
  approvals: Array<{ request: ApprovalRequest; resolved: ApprovalDecision | undefined }>
  /** 结束后的最终回答；运行中为 null，所有文字都算过程。 */
  answer: string | null
  /** 这一轮助手说过的全部文字，复制按钮用。 */
  replyText: string
  replyAt: string | null
  changes: FileChangeSummary[]
  error: string | null
  signature: string
}

/** 时间线上的一项：一轮对话、切换 agent 的分隔线，或子代理带上主会话近况的提示。 */
export type TimelineEntry =
  | { kind: "turn"; turn: Turn }
  | { kind: "switch"; key: string; agentId: string; handoff: boolean }
  | { kind: "brief"; key: string }

/** 查阅类工具：连续多个时合成一行「查阅 N 个文件」。 */
const EXPLORE_TOOL = /^(read|view|cat|open|grep|glob|search|find|ls|list)/i

/** 判断工具是否属于查阅类。 */
export function isExploreTool(name: string): boolean {
  return EXPLORE_TOOL.test(name)
}

function emptyTurn(key: string, runId: string | null): Turn {
  return {
    key,
    runId,
    userText: null,
    agentId: null,
    status: "completed",
    startedAt: null,
    endedAt: null,
    work: [],
    approvals: [],
    answer: null,
    replyText: "",
    replyAt: null,
    changes: [],
    error: null,
    signature: "",
  }
}

type GroupKind = "explore" | "commands" | "browser"

/** 工具属于哪种可合并的分组：已完成的查阅、已结束的命令与浏览器操作；其余不合并。 */
function groupKind(tool: ToolCall): GroupKind | null {
  if (isExploreTool(tool.name) && tool.status === "completed") return "explore"
  if (isCommandTool(tool.name) && tool.status !== "running") return "commands"
  if (browserAction(tool.name) && tool.status !== "running") return "browser"
  return null
}

/** 连续的已完成查阅、连续的已结束命令各自合成一组；只有一个时仍按普通工具显示。 */
function groupWork(items: WorkItem[]): WorkItem[] {
  const result: WorkItem[] = []
  let run: Array<Extract<WorkItem, { kind: "tool" }>> = []
  let runKind: GroupKind | null = null
  const flush = () => {
    if (run.length >= 2 && runKind) {
      result.push({
        kind: runKind,
        key: `${runKind}-${run[0]?.key ?? ""}`,
        tools: run.map((item) => item.tool),
      })
    } else {
      result.push(...run)
    }
    run = []
    runKind = null
  }
  for (const item of items) {
    const kind = item.kind === "tool" ? groupKind(item.tool) : null
    if (item.kind === "tool" && kind) {
      if (kind !== runKind) flush()
      runKind = kind
      run.push(item)
      continue
    }
    flush()
    result.push(item)
  }
  flush()
  return result
}

/** 结束状态对应的事件类型。 */
const END_STATUS: Partial<Record<ThreadEvent["type"], TurnStatus>> = {
  "run.completed": "completed",
  "run.failed": "failed",
  "run.interrupted": "interrupted",
}

/**
 * 按 runId 分轮；没有 runId 的助手消息各自成一轮。正在流式输出时（streaming）文字属于最后一个
 * 未结束的轮，没有未结束的轮时补一个运行中的轮。流式文字本身不参与分轮，增量到来时不必重算。
 */
export function buildTimeline(events: readonly ThreadEvent[], streaming = false): TimelineEntry[] {
  const sorted = [...events].sort((left, right) => left.seq - right.seq)
  const tools = collectTools(sorted)
  const resolved = collectResolved(sorted)
  const subagents = collectSubagents(sorted)
  const entries: TimelineEntry[] = []
  const turns = new Map<string, Turn>()
  const messages = new Map<string, Array<{ text: string; at: string; index: number }>>()
  const seenTools = new Set<string>()

  const turnFor = (event: ThreadEvent): Turn => {
    const key = event.runId ?? `seq-${event.seq}`
    let turn = turns.get(key)
    if (!turn) {
      turn = emptyTurn(key, event.runId)
      turn.startedAt = event.createdAt
      turns.set(key, turn)
      entries.push({ kind: "turn", turn })
    }
    turn.signature += `|${event.seq}`
    return turn
  }

  for (const event of sorted) {
    const payload = asRecord(event.payload)
    if (event.type === "thread.updated" && event.runId === null) {
      const agentId = asText(payload?.providerId)
      if (agentId)
        entries.push({
          kind: "switch",
          key: `switch-${event.seq}`,
          agentId,
          handoff: Boolean(asText(payload?.handoff)),
        })
      else if (asText(payload?.handoff)) entries.push({ kind: "brief", key: `brief-${event.seq}` })
      continue
    }
    if (event.runId === null && event.type !== "message.completed") continue
    const turn = turnFor(event)
    // 子 agent 的消息与工具在它自己的卡片里显示；这里只记进签名，让卡片随之刷新。
    if (isParentScoped(event.type) && asText(payload?.parentToolUseId)) continue
    switch (event.type) {
      case "run.queued":
        turn.status = "queued"
        break
      case "run.started":
        turn.status = "running"
        turn.startedAt = event.createdAt
        turn.agentId = asText(payload?.providerId) ?? turn.agentId
        turn.userText = asText(payload?.text) ?? turn.userText
        break
      case "message.completed": {
        const text = asText(payload?.text)
        if (!text) break
        if (asText(payload?.role) === "user") {
          turn.userText = text
          break
        }
        const list = messages.get(turn.key) ?? []
        list.push({ text, at: event.createdAt, index: turn.work.length })
        messages.set(turn.key, list)
        turn.work.push({ kind: "message", key: `msg-${event.seq}`, text })
        break
      }
      case "tool.started":
      case "tool.completed": {
        const status: ToolStatus = event.type === "tool.started" ? "running" : "completed"
        const tool = toolFromEvent(event, status)
        if (!tool || seenTools.has(tool.id)) break
        seenTools.add(tool.id)
        turn.work.push({ kind: "tool", key: `tool-${tool.id}`, tool: tools.get(tool.id) ?? tool })
        break
      }
      case "subagent.started": {
        const id = asText(payload?.toolCallId) ?? asText(payload?.id)
        const subagent = id ? subagents.get(id) : undefined
        if (subagent) turn.work.push({ kind: "subagent", key: `subagent-${subagent.id}`, subagent })
        break
      }
      case "plan.updated": {
        const plan = planFromEvent(event)
        if (!plan) break
        // 同一轮只保留最新的计划，放在第一次出现计划的位置。
        const existing = turn.work.findIndex((item) => item.kind === "plan")
        const item: WorkItem = {
          kind: "plan",
          key: existing >= 0 ? (turn.work[existing]?.key ?? "") : `plan-${event.seq}`,
          plan,
        }
        if (existing >= 0) turn.work[existing] = item
        else turn.work.push(item)
        break
      }
      case "approval.requested": {
        const request = approvalFromEvent(event)
        if (request) turn.approvals.push({ request, resolved: resolved.get(request.id) })
        if (turn.status === "running") turn.status = "waiting"
        break
      }
      case "approval.resolved":
        if (turn.status === "waiting") turn.status = "running"
        break
      case "file.changed": {
        const summary = diffFromEvent(event)
        if (summary) turn.changes.push(summary)
        break
      }
      case "run.completed":
      case "run.failed":
      case "run.interrupted":
        turn.status = END_STATUS[event.type] ?? "completed"
        turn.endedAt = event.createdAt
        if (event.type === "run.failed") turn.error = asText(payload?.message) ?? ""
        break
      default:
        break
    }
  }

  // 没有 runId 的消息（旧数据）本身就是一轮完整的回答。
  for (const turn of turns.values()) {
    if (turn.runId === null && turn.status !== "running") turn.endedAt ??= turn.startedAt
  }

  const open = [...turns.values()].reverse().find((turn) => !isEnded(turn))
  if (streaming && !open) {
    const turn = emptyTurn("streaming", null)
    turn.status = "running"
    entries.push({ kind: "turn", turn })
  }

  for (const turn of turns.values()) finalizeTurn(turn, messages.get(turn.key) ?? [])
  return entries
}

/** 这一轮是否已经结束。 */
export function isEnded(turn: Pick<Turn, "status" | "runId" | "endedAt">): boolean {
  return turn.status === "completed" || turn.status === "failed" || turn.status === "interrupted"
}

/** 结束的轮把最后一条助手消息提出来作为回答，其余工作再做查阅分组。 */
function finalizeTurn(turn: Turn, texts: Array<{ text: string; at: string; index: number }>): void {
  turn.replyText = texts.map((entry) => entry.text).join("\n\n")
  turn.replyAt = texts.at(-1)?.at ?? null
  const last = texts.at(-1)
  if (isEnded(turn) && last && turn.work[last.index]?.kind === "message") {
    turn.answer = last.text
    turn.work = turn.work.filter((_item, index) => index !== last.index)
  }
  turn.work = groupWork(turn.work)
  turn.signature += `|${turn.status}|${turn.approvals.map((entry) => entry.resolved ?? "-").join(",")}`
}

/** 是否还有未处理的审批。 */
export function hasPendingApproval(events: ThreadEvent[]): boolean {
  const resolved = collectResolved(events)
  for (const event of events) {
    if (event.type !== "approval.requested") continue
    const request = approvalFromEvent(event)
    if (request && !resolved.has(request.id)) return true
  }
  return false
}
