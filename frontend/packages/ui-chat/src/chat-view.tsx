/** 聊天主视图：标签栏（主会话与子代理）、消息时间线、输入框与环境抽屉。 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { ProviderCapabilities, Thread, ThreadEvent } from "@pigcode/contracts"
import { ArrowDown, ArrowLeft, Ellipsis, PanelRight } from "lucide-react"
import {
  Composer,
  type ComposerAgent,
  type ComposerCommand,
  type ComposerModelCatalog,
  type ComposerSubmitOptions,
  type PermissionMode,
} from "@pigcode/ui-composer"
import { Button, formatShortcut, useLocale } from "@pigcode/ui-primitives"
import type { ApprovalDecision } from "./approval-card"
import type { FileChangeSummary } from "./diff-summary"
import { EnvironmentDrawer, type EnvironmentInfo } from "./environment-drawer"
import { MessageList, type EmptyStateText } from "./message-list"
import type { SubagentCall } from "./subagent-card"
import { SubagentView } from "./subagent-view"
import { ThreadTabs, type ThreadTabsProps } from "./thread-tabs"
import type { ToolCall } from "./tool-card"

/** 线程头切换入口需要的 provider 展示信息。 */
export interface ProviderOption {
  id: string
  displayName: string
}

/** ChatView 的公开 props；数据全部由调用方传入，不读取 fixture。 */
export interface ChatViewProps {
  thread?: Thread | null
  events: ThreadEvent[]
  streamingText?: string
  /** 当前工作目录；Task 12 的容器可以传入项目根目录。 */
  cwd?: string
  /** 发送消息；交给 composer 提交，附带本次的思考深度。 */
  onStart?: (text: string, options: ComposerSubmitOptions) => void
  /** 兼容计划接口里的 onSubmit 命名。 */
  onSubmit?: (text: string, options: ComposerSubmitOptions) => void
  onInterrupt?: () => void
  onApproval?: (requestId: string, decision: ApprovalDecision) => void
  /** 当前 provider 的能力；未提供时按全部可用处理，保持旧行为。 */
  capabilities?: ProviderCapabilities | null
  /** 可选的 agent；输入框的模型选择器按 agent 分组列出各自的模型。 */
  agents?: readonly ComposerAgent[]
  /** 各 agent 的模型目录；选择器展开到某个 agent 时通过 onLoadModels 懒加载。 */
  catalog?: ComposerModelCatalog
  onLoadModels?: (agentId: string) => void
  /** 切换 agent 与模型；容器应调用 thread.switchProvider。 */
  onSelectModel?: (agentId: string, modelId: string) => void
  /** 修改线程权限模式；容器应调用 thread.setPermissionMode。 */
  onPermissionMode?: (mode: PermissionMode) => void
  /** @ 引用时可选的项目文件。 */
  files?: () => Promise<readonly string[]>
  /** 输入框里的 / 命令。 */
  commands?: readonly ComposerCommand[]
  onViewTool?: (tool: ToolCall) => void
  onViewDiff?: (summary: FileChangeSummary) => void
  /** 右栏是否展开；提供 onToggleRight 且没有 layoutControls 时在线程头显示右栏按钮。 */
  rightOpen?: boolean
  /** 切换右栏；由容器维护展开状态。 */
  onToggleRight?: () => void
  /** 线程头末尾的布局按钮，替代单个右栏按钮；传 null 表示按钮已放在别处（例如右栏标签栏）。 */
  layoutControls?: ReactNode
  /** 线程头右侧「在编辑器中打开项目」的入口；由容器按项目目录组装。 */
  openIn?: ReactNode
  /** 线程头的标签栏：主会话与子代理；不提供时只显示主会话标题。 */
  tabs?: ThreadTabsProps | undefined
  /** 正在查看的派生子代理；有值时显示它的只读过程，不显示输入框。 */
  subagent?: SubagentCall | null | undefined
  /** 在标签页中打开时间线里的派生子代理。 */
  onOpenSubagent?: ((id: string) => void) | undefined
  /** 从派生子代理的只读视图回到主会话。 */
  onBackToMain?: (() => void) | undefined
  /** 空会话的文案；子代理会话用它说明共用工作目录。 */
  empty?: EmptyStateText | undefined
}

/** 根据事件流判断当前 run 是否仍在进行。 */
function isRunOpen(events: ThreadEvent[]): boolean {
  let running = false
  for (const event of events) {
    if (event.type === "run.started") running = true
    else if (
      event.type === "run.completed" ||
      event.type === "run.failed" ||
      event.type === "run.interrupted"
    ) {
      running = false
    }
  }
  return running
}

/** 渲染聊天页。 */
export function ChatView({
  thread = null,
  events,
  streamingText = "",
  cwd,
  onStart,
  onSubmit,
  onInterrupt,
  onApproval,
  capabilities = null,
  agents = [],
  catalog = {},
  onLoadModels,
  onSelectModel,
  onPermissionMode,
  files,
  commands,
  onViewTool,
  onViewDiff,
  rightOpen = false,
  onToggleRight,
  layoutControls,
  openIn,
  tabs,
  subagent = null,
  onOpenSubagent,
  onBackToMain,
  empty,
}: ChatViewProps) {
  const submit = onSubmit ?? onStart
  const { t } = useLocale()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const threadRef = useRef<HTMLDivElement>(null)
  const [pinned, setPinned] = useState(true)
  // capability 为 false 时隐藏对应控件；未加载能力时保持旧行为。
  const canInterrupt = capabilities?.streaming ?? true
  const canPlan = capabilities?.plan ?? true
  const canApprove = capabilities?.approvals ?? true
  // 事件数组只在有新事件时变化；流式增量不触发这些整表扫描。
  const visibleEvents = useMemo(
    () =>
      canApprove
        ? events
        : events.filter(
            (event) => event.type !== "approval.requested" && event.type !== "approval.resolved",
          ),
    [events, canApprove],
  )
  const runOpen = useMemo(() => isRunOpen(events), [events])
  const running = Boolean(streamingText) || runOpen
  const providerId = thread?.lastProviderId ?? thread?.defaultProviderId ?? null
  const modelId = thread?.lastModelId ?? null
  const agentName = useCallback(
    (agentId: string) => agents.find((agent) => agent.id === agentId)?.label ?? agentId,
    [agents],
  )
  const environment: EnvironmentInfo = {
    providerId: providerId ?? t("chat.environment.unknown"),
    cwd,
    modelId,
    permissionMode: thread?.permissionMode ?? "workspace-write",
  }
  const projectName = cwd?.split(/[\\/]/).filter(Boolean).at(-1)
  const viewKey = subagent ? `subagent:${subagent.id}` : (thread?.id ?? null)

  useEffect(() => {
    setPinned(true)
  }, [viewKey])

  useEffect(() => {
    if (!pinned) return
    const element = threadRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [events, streamingText, pinned, subagent])

  function handleScroll(): void {
    const element = threadRef.current
    if (!element) return
    setPinned(element.scrollHeight - element.scrollTop - element.clientHeight < 64)
  }

  function jumpToLatest(): void {
    setPinned(true)
    const element = threadRef.current
    element?.scrollTo({ top: element.scrollHeight, behavior: "smooth" })
  }

  const mainTitle = thread
    ? projectName
      ? `${projectName} / ${thread.title}`
      : thread.title
    : undefined

  return (
    <section className="view">
      <div className="panel-top">
        {tabs ? (
          <ThreadTabs {...tabs} />
        ) : thread ? (
          <ThreadTabs
            tabs={[{ id: "main", kind: "main", title: thread.title, description: mainTitle }]}
            activeId="main"
            onSelect={() => undefined}
          />
        ) : null}
        <span className="spacer" />
        {thread ? openIn : null}
        <Button
          variant="plain"
          size="icon"
          type="button"
          aria-label={t("chat.environment")}
          title={t("chat.environment")}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((value) => !value)}
        >
          <Ellipsis className="ic" aria-hidden="true" />
        </Button>
        {layoutControls !== undefined ? (
          layoutControls
        ) : onToggleRight ? (
          <Button
            variant="plain"
            size="icon"
            type="button"
            aria-label={t("panel.toggleRight")}
            title={`${t("panel.toggleRight")} ${formatShortcut("Mod+j")}`}
            aria-pressed={rightOpen}
            onClick={onToggleRight}
          >
            <PanelRight className="ic" aria-hidden="true" />
          </Button>
        ) : null}
      </div>
      <div className="thread" ref={threadRef} onScroll={handleScroll}>
        {subagent ? (
          <SubagentView subagent={subagent} onViewTool={onViewTool} />
        ) : (
          <MessageList
            events={visibleEvents}
            streamingText={streamingText}
            agentName={agentName}
            onApproval={onApproval ?? (() => undefined)}
            onViewTool={onViewTool}
            onViewDiff={onViewDiff}
            onOpenSubagent={onOpenSubagent}
            empty={empty}
          />
        )}
      </div>
      {!pinned ? (
        <button type="button" className="jump-latest" onClick={jumpToLatest}>
          <ArrowDown className="ic ic-sm" aria-hidden="true" />
          {t("chat.jumpLatest")}
        </button>
      ) : null}
      <div className="composer-wrap">
        {subagent ? (
          <div className="subagent-readonly" role="note">
            <span>{t("chat.subagent.readonly")}</span>
            {onBackToMain ? (
              <button type="button" className="subagent-back" onClick={onBackToMain}>
                <ArrowLeft className="ic ic-sm" aria-hidden="true" />
                {t("chat.subagent.back")}
              </button>
            ) : null}
          </div>
        ) : (
          <Composer
            onSubmit={(text, options) => submit?.(text, options)}
            onStop={onInterrupt ?? (() => undefined)}
            running={running}
            disabled={!thread}
            autoFocus={Boolean(thread) && visibleEvents.length === 0 && !running}
            draftKey={thread?.id ?? null}
            agents={agents}
            agentId={providerId}
            modelId={modelId}
            catalog={catalog}
            {...(onLoadModels ? { onLoadModels } : {})}
            {...(thread && onSelectModel ? { onSelectModel } : {})}
            permissionMode={thread?.permissionMode ?? "workspace-write"}
            {...(thread && onPermissionMode ? { onPermissionMode } : {})}
            {...(files ? { files } : {})}
            {...(commands ? { commands } : {})}
            canPlan={canPlan}
            canInterrupt={canInterrupt}
          />
        )}
      </div>
      <EnvironmentDrawer
        open={drawerOpen}
        info={environment}
        onClose={() => setDrawerOpen(false)}
      />
    </section>
  )
}
