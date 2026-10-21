/** 多会话 tab 栏：展示已打开线程、活动线程与后台运行状态。 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react"
import type { Thread } from "@pigcode/contracts"
import { useLocale, type MessageKey } from "@pigcode/ui-primitives"

/** tab 状态点取值；与 Renderer 的线程视图状态保持一致。 */
export type ThreadTabStatus =
  "idle" | "queued" | "running" | "waiting-approval" | "completed" | "failed" | "interrupted"

/** 线程状态到 locale key 的映射；idle 不显示可读状态文案。 */
const STATUS_MESSAGE: Record<ThreadTabStatus, MessageKey | null> = {
  idle: null,
  queued: "tabs.status.queued",
  running: "tabs.status.running",
  "waiting-approval": "tabs.status.waitingApproval",
  completed: "tabs.status.completed",
  failed: "tabs.status.failed",
  interrupted: "tabs.status.interrupted",
}

/** ThreadTabs 的公开 props；数据由容器从 store 读取。 */
export interface ThreadTabsProps {
  /** 全部已知线程，用于解析标题。 */
  threads: Thread[]
  /** 以 tab 打开并订阅的线程顺序。 */
  openThreadIds: string[]
  activeThreadId: string | null
  /** 按 threadId 索引的运行状态。 */
  statusByThread: Record<string, ThreadTabStatus>
  onActivate: (threadId: string) => void
  onClose: (threadId: string) => void
  /** 新建会话；传入时在 tab 末尾显示 +。 */
  onNew?: () => void
}

/** 横向溢出的方向；决定两侧渐隐遮罩。 */
type Overflow = "" | "start" | "end" | "both"

/** 把 provider id 缩成 tab 上的短标记。 */
function providerMark(thread: Thread): string {
  const id = thread.lastProviderId ?? thread.defaultProviderId
  if (id === "claude") return "CL"
  if (id === "codex") return "CX"
  return id.slice(0, 2).toUpperCase()
}

/** 渲染多会话 tab 栏；没有打开线程时不占用布局。 */
export function ThreadTabs({
  threads,
  openThreadIds,
  activeThreadId,
  statusByThread,
  onActivate,
  onClose,
  onNew,
}: ThreadTabsProps) {
  const { t } = useLocale()
  const listRef = useRef<HTMLDivElement>(null)
  const [overflow, setOverflow] = useState<Overflow>("")
  const tabs = openThreadIds
    .map((id) => threads.find((thread) => thread.id === id))
    .filter((thread): thread is Thread => thread !== undefined)

  /** 根据滚动位置判断哪一侧还有被遮住的 tab。 */
  const updateOverflow = useCallback(() => {
    const element = listRef.current
    if (!element) return
    const start = element.scrollLeft > 2
    const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 2
    setOverflow(start && end ? "both" : start ? "start" : end ? "end" : "")
  }, [])

  // tab 数量或容器宽度变化时重新判断溢出；jsdom 没有 ResizeObserver 时只算一次。
  useEffect(() => {
    updateOverflow()
    const element = listRef.current
    if (!element || typeof ResizeObserver === "undefined") return undefined
    const observer = new ResizeObserver(() => updateOverflow())
    observer.observe(element)
    return () => observer.disconnect()
  }, [updateOverflow, tabs.length])

  // 切换活动 tab 时把它滚进可视区，后台新开的会话也能立即被看到。
  useEffect(() => {
    const element = listRef.current?.querySelector<HTMLElement>(
      '[role="tab"][aria-selected="true"]',
    )
    element?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [activeThreadId])

  if (tabs.length === 0) return null

  /** 键盘激活 tab：Enter/Space 等同点击。 */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>, threadId: string): void {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    onActivate(threadId)
  }

  return (
    <div className="thread-tabs" data-overflow={overflow || undefined}>
      <div
        className="thread-tabs-scroll"
        role="tablist"
        aria-label={t("tabs.label")}
        ref={listRef}
        onScroll={updateOverflow}
      >
        {tabs.map((thread) => {
          const active = thread.id === activeThreadId
          const status = statusByThread[thread.id] ?? "idle"
          const statusKey = STATUS_MESSAGE[status]
          const statusText = statusKey ? t(statusKey) : null
          return (
            <div
              key={thread.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className={active ? "thread-tab is-active" : "thread-tab"}
              title={thread.title}
              onClick={() => onActivate(thread.id)}
              onKeyDown={(event) => onKeyDown(event, thread.id)}
            >
              <span className="tab-provider" aria-hidden="true">
                {providerMark(thread)}
              </span>
              <span className="tab-title truncate">{thread.title}</span>
              {statusText ? (
                <span
                  className="tab-status"
                  role="status"
                  data-status={status}
                  aria-label={statusText}
                  title={statusText}
                />
              ) : (
                <span className="tab-status" data-status={status} aria-hidden="true" />
              )}
              <button
                type="button"
                className="tab-close"
                aria-label={`${t("tabs.close")} ${thread.title}`}
                title={t("tabs.close")}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(thread.id)
                }}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
          )
        })}
      </div>
      {onNew ? (
        <button
          type="button"
          className="tab-new"
          aria-label={t("nav.newThread")}
          title={`${t("nav.newThread")} ⌘N`}
          onClick={onNew}
        >
          +
        </button>
      ) : null}
    </div>
  )
}
