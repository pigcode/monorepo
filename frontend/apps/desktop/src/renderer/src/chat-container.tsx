/** 聊天页容器：从 store 读取线程与事件，把输入框里的操作（发送、切换 agent/模型、权限）交给 Host。 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import type { PermissionMode, Thread } from "@pigcode/contracts"
import { useAppStore, type AppStore, type Connection } from "@pigcode/client-runtime"
import { useLocale } from "@pigcode/ui-primitives"
import { ChatView, type ApprovalDecision } from "@pigcode/ui-chat"
import type { ComposerCommand } from "@pigcode/ui-composer"
import { OpenInButton } from "@pigcode/ui-shell"
import type { ClientPluginController } from "./client-plugins"
import { useAgents, useModelCatalog } from "./agents"

/** 核心容器共享的依赖。 */
export interface CoreDeps {
  connection: Connection
  store: AppStore
  plugins: ClientPluginController
}

/** chat.view slot 传入聊天容器的右栏控制；第三方聊天视图可以忽略。 */
export interface ChatSlotProps {
  rightOpen?: boolean
  onToggleRight?: () => void
  /** 线程头末尾的布局按钮；右栏展开时为 null，按钮在右栏标签栏里。 */
  layoutControls?: ReactNode
  onNewThread?: () => void
}

/** 把 unknown 错误转成可展示文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 用 Host 返回的线程记录替换 store 里的同 id 线程。 */
function patchThread(store: AppStore, threadId: string, patch: Partial<Thread>): void {
  const threads = store
    .getSnapshot()
    .threads.map((item) => (item.id === threadId ? { ...item, ...patch } : item))
  store.update({ threads })
}

/** 聊天页容器。 */
export function ChatViewContainer({
  deps,
  rightOpen = false,
  onToggleRight,
  layoutControls,
  onNewThread,
}: { deps: CoreDeps } & ChatSlotProps) {
  const state = useAppStore(deps.store)
  const { t } = useLocale()
  const thread = state.threads.find((item) => item.id === state.activeThreadId) ?? null
  const project = state.projects.find((item) => item.id === thread?.projectId)
  const connected = state.status === "connected"
  const agents = useAgents(deps.connection, state.providerRevision, connected)
  const { catalog, load } = useModelCatalog(deps.connection, state.providerRevision, connected)
  const [notice, setNotice] = useState<string | null>(null)
  const threadId = thread?.id ?? null

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const fail = useCallback(
    (error: unknown) => deps.store.update({ error: messageOf(error) }),
    [deps.store],
  )

  /** 最近一条带 runId 的事件所属的 run；中断与审批都作用在它上面。 */
  function latestRunId(): string | null {
    return [...state.events].reverse().find((event) => event.runId !== null)?.runId ?? null
  }

  function interrupt(): void {
    const runId = latestRunId()
    if (!runId || !threadId) return
    void deps.connection.call("run.interrupt", { threadId, runId }).catch(fail)
  }

  function respondApproval(requestId: string, decision: ApprovalDecision): void {
    const runId = latestRunId()
    if (!runId || !threadId) return
    void deps.connection
      .call("run.respondApproval", { threadId, runId, requestId, decision })
      .catch(fail)
  }

  /** 切换 agent 与模型；换了 agent 时提示上下文以摘要交接。 */
  function selectModel(agentId: string, modelId: string): void {
    if (!thread) return
    const previousAgent = thread.lastProviderId ?? thread.defaultProviderId
    void deps.connection
      .call("thread.switchProvider", { threadId: thread.id, providerId: agentId, modelId })
      .then(() => {
        patchThread(deps.store, thread.id, { lastProviderId: agentId, lastModelId: modelId })
        if (agentId !== previousAgent) {
          const name = agents.find((agent) => agent.id === agentId)?.label ?? agentId
          setNotice(`${t("chat.provider.next")} ${name}`)
        }
      })
      .catch(fail)
  }

  function setPermissionMode(mode: PermissionMode): void {
    if (!thread) return
    patchThread(deps.store, thread.id, { permissionMode: mode })
    void deps.connection
      .call("thread.setPermissionMode", { threadId: thread.id, permissionMode: mode })
      .catch((error: unknown) => {
        patchThread(deps.store, thread.id, { permissionMode: thread.permissionMode })
        fail(error)
      })
  }

  const files = useMemo(
    () =>
      threadId
        ? async () => {
            const entries = (await deps.connection.call("workspace.tree", { threadId })) as Array<{
              path: string
            }>
            return entries.map((entry) => entry.path)
          }
        : undefined,
    [deps.connection, threadId],
  )

  const commands = useMemo<ComposerCommand[]>(
    () => [
      ...(onNewThread
        ? [
            {
              id: "new",
              label: "/new",
              description: t("nav.newThread"),
              keywords: ["新会话"],
              run: onNewThread,
            },
          ]
        : []),
      ...(onToggleRight
        ? [
            {
              id: "panel",
              label: "/panel",
              description: t("panel.toggleRight"),
              keywords: ["工作台"],
              run: onToggleRight,
            },
          ]
        : []),
    ],
    [onNewThread, onToggleRight, t],
  )

  return (
    <>
      {notice ? (
        <div className="toast-stack" role="status" aria-live="polite">
          <div className="toast">{notice}</div>
        </div>
      ) : null}
      <ChatView
        thread={thread}
        events={state.events}
        streamingText={state.streamingText}
        capabilities={state.providerCapabilities}
        agents={agents}
        catalog={catalog}
        onLoadModels={load}
        {...(project ? { cwd: project.rootPath } : {})}
        onStart={(text, options) => {
          if (!threadId) return
          void deps.connection
            .startRun(threadId, text, options.effort ? { effort: options.effort } : {})
            .catch(fail)
        }}
        onInterrupt={interrupt}
        onApproval={respondApproval}
        onSelectModel={selectModel}
        onPermissionMode={setPermissionMode}
        {...(files ? { files } : {})}
        commands={commands}
        rightOpen={rightOpen}
        {...(onToggleRight ? { onToggleRight } : {})}
        {...(layoutControls !== undefined ? { layoutControls } : {})}
        {...(project ? { openIn: <OpenInButton path={project.rootPath} /> } : {})}
      />
    </>
  )
}
