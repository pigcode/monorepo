/**
 * 终端命令的一行：运行中显示「正在执行」与命令、耗时，有输出流时自动展开并跟随最新输出；
 * 结束后收起成「终端 · 命令 · 耗时」，失败时显示退出码。展开后是 `$ 命令` 与输出区，
 * 长命令先显示三行，输出区超过八行可滚动，往上翻时停止跟随。连续的命令合成一组。
 */
import { memo, useLayoutEffect, useRef, useState } from "react"
import { ArrowDown, ChevronDown, ChevronRight, SquareTerminal } from "lucide-react"
import { useLocale } from "@pigcode/ui-primitives"
import { elapsed, formatDuration, useNow } from "./duration"
import { commandText, toolPreview, type ToolCall } from "./tool-meta"
import { useToolOpen } from "./tool-open"

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[ -/]*[@-~]`, "g")

/** 去掉终端颜色等控制序列。 */
export function plainOutput(text: string): string {
  return text.replace(ANSI, "").replace(/\r\n?/g, "\n")
}

function firstLine(text: string | undefined): string {
  return (
    (text ?? "")
      .split("\n")
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
  )
}

/** `$ 命令`：超过三行时折叠，可以展开看完整命令。 */
function CommandText({ command }: { command: string }) {
  const { t } = useLocale()
  const box = useRef<HTMLPreElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  useLayoutEffect(() => {
    const element = box.current
    if (!element || expanded) return
    setOverflowing(element.scrollHeight > element.clientHeight + 1)
  }, [command, expanded])
  return (
    <div className="cmd-text">
      <span className="cmd-prompt" aria-hidden="true">
        $
      </span>
      <div className="cmd-text-body">
        <pre ref={box} data-expanded={expanded || undefined}>
          {command}
        </pre>
        {overflowing || expanded ? (
          <button
            type="button"
            className="cmd-more"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? t("chat.command.collapse") : t("chat.command.expand")}
            <ChevronDown className="ic ic-xs" aria-hidden="true" data-up={expanded || undefined} />
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** 输出区：运行中跟随最新输出，用户往上翻时停止跟随，回到底部后继续。 */
function CommandOutput({ text, running }: { text: string; running: boolean }) {
  const { t } = useLocale()
  const scroller = useRef<HTMLDivElement>(null)
  const [following, setFollowing] = useState(true)
  const output = plainOutput(text)
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/\n+$/, "")
  useLayoutEffect(() => {
    const element = scroller.current
    if (element && following) element.scrollTop = element.scrollHeight
  }, [output, following])
  if (!output.trim()) {
    return (
      <div className="cmd-output is-empty">
        {running ? t("chat.command.waiting") : t("chat.command.noOutput")}
      </div>
    )
  }
  return (
    <div className="cmd-output-wrap">
      <div
        ref={scroller}
        className="cmd-output"
        tabIndex={0}
        aria-label={t("chat.tool.output")}
        onScroll={(event) => {
          const element = event.currentTarget
          setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight <= 8)
        }}
      >
        <pre>{output}</pre>
      </div>
      {running && !following ? (
        <button type="button" className="cmd-latest" onClick={() => setFollowing(true)}>
          <ArrowDown className="ic ic-xs" aria-hidden="true" />
          {t("chat.command.latest")}
        </button>
      ) : null}
    </div>
  )
}

/** 一条终端命令。live 是运行中已经流出的输出。 */
export const CommandRow = memo(function CommandRow({
  tool,
  live,
}: {
  tool: ToolCall
  live?: string | undefined
}) {
  const { t, locale } = useLocale()
  const running = tool.status === "running"
  const command = commandText(tool.input) ?? toolPreview(tool.input) ?? ""
  const output = running ? (live ?? "") : (tool.output ?? "")
  const [open, setOpen] = useToolOpen(tool.id, running && Boolean(live))
  const now = useNow(running)
  const ms = elapsed(tool.startedAt, running ? now : tool.endedAt)
  const duration = ms !== null && (!running || ms >= 1000) ? formatDuration(ms, locale) : null
  const failed = tool.status === "failed"
  const failure = failed
    ? tool.exitCode !== undefined
      ? t("chat.command.exit").replace("{code}", String(tool.exitCode))
      : t("chat.tool.failed")
    : null
  return (
    <div
      className={open ? "tool-row cmd-row is-open" : "tool-row cmd-row"}
      data-status={tool.status}
    >
      <button
        type="button"
        className="tool-row-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SquareTerminal className="ic ic-sm tool-row-icon" aria-hidden="true" />
        <span className={running ? "tool-row-kind tool-shimmer" : "tool-row-kind"}>
          {running ? t("chat.command.running") : t("chat.command.kind")}
        </span>
        <span className="tool-row-target cmd-summary truncate" title={command}>
          {firstLine(command)}
        </span>
        {failure ? (
          <span className="tool-row-status is-failed" title={firstLine(plainOutput(output))}>
            {failure}
          </span>
        ) : null}
        {duration ? <span className="tool-row-meta">{duration}</span> : null}
        <ChevronRight className="ic ic-sm tool-row-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="cmd-card">
          <CommandText command={command} />
          <CommandOutput text={output} running={running} />
        </div>
      ) : null}
    </div>
  )
})

/** 连续的已结束命令合成一行「终端 · N 个命令」，展开后逐条列出。 */
export const CommandGroup = memo(function CommandGroup({ tools }: { tools: readonly ToolCall[] }) {
  const { t } = useLocale()
  const [open, setOpen] = useToolOpen(`commands-${tools[0]?.id ?? ""}`, false)
  const failed = tools.filter((tool) => tool.status === "failed").length
  const summary = [
    t("chat.command.count").replace("{count}", String(tools.length)),
    failed > 0 ? t("chat.command.failedCount").replace("{count}", String(failed)) : null,
  ]
    .filter(Boolean)
    .join(t("chat.command.separator"))
  return (
    <div
      className={open ? "tool-row tool-group cmd-group is-open" : "tool-row tool-group cmd-group"}
      data-status={failed > 0 ? "failed" : "completed"}
    >
      <button
        type="button"
        className="tool-row-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <SquareTerminal className="ic ic-sm tool-row-icon" aria-hidden="true" />
        <span className="tool-row-kind">{t("chat.command.kind")}</span>
        <span className="tool-row-target truncate">{summary}</span>
        <ChevronRight className="ic ic-sm tool-row-chev" aria-hidden="true" />
      </button>
      {open ? (
        <div className="tool-group-body">
          {tools.map((tool) => (
            <CommandRow key={tool.id} tool={tool} />
          ))}
        </div>
      ) : null}
    </div>
  )
})
