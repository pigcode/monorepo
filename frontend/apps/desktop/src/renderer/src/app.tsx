/** 应用外壳：把 store/connection 接到 Shell、聊天、设置与插件管理器。 */
import { useEffect, useRef, useState, type ReactNode } from "react"
import type { Project, Thread } from "@pigcode/contracts"
import {
  AppRenderer,
  SlotHost,
  useAppStore,
  type AppStore,
  type Connection,
  type SlotRegistry,
} from "@pigcode/client-runtime"
import {
  useAppearance,
  useLocale,
  type AppearanceController,
  type Locale,
} from "@pigcode/ui-primitives"
import { ChatView, type ApprovalDecision, type ProviderOption } from "@pigcode/ui-chat"
import { OpenInMenu, type SettingsSection, type ShellView, type ThreadStatus } from "@pigcode/ui-shell"
import {
  EMPTY_SURFACE_STATE,
  PanelLayoutControls,
  type PanelLayoutControlsProps,
  type PanelSurfaceState,
} from "@pigcode/ui-workbench"
import type { ClientPluginController } from "./client-plugins"
import { PluginPanels } from "./client-plugins"
import { ConnectionBanner } from "./connection-banner"
import {
  EMPTY_HISTORY,
  canGoBack,
  canGoForward,
  currentLocation,
  goBack,
  goForward,
  pruneHistory,
  pushLocation,
  type NavHistory,
  type NavLocation,
} from "./navigation"
import { listProviders, loadProviderContext, pickProviderId } from "./providers"
import { TerminalDrawer } from "./terminal-drawer"
import { WorkbenchPanel } from "./workbench"
import { layoutLabels } from "./workbench-labels"
import {
  addProject,
  archiveThread,
  removeProject,
  renameProject,
  renameThread,
} from "./workspace-actions"

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

/** settings.section slot 传给核心设置视图的属性。 */
export interface SettingsSlotProps {
  section: SettingsSection
  onSection: (section: SettingsSection) => void
  onClose: () => void
  appearance: AppearanceController
}

/** App 的依赖。 */
export interface AppProps extends CoreDeps {
  slots: SlotRegistry
  locale: Locale
}

/** 把 unknown 错误转成可展示文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 聊天页容器：从 store 读取线程与事件，把操作交给 connection。 */
export function ChatViewContainer({
  deps,
  rightOpen = false,
  onToggleRight,
  layoutControls,
}: { deps: CoreDeps } & ChatSlotProps) {
  const state = useAppStore(deps.store)
  const thread = state.threads.find((item) => item.id === state.activeThreadId) ?? null
  const project = state.projects.find((item) => item.id === thread?.projectId)
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([])
  const { t } = useLocale()
  const [providerNotice, setProviderNotice] = useState<string | null>(null)

  // provider 列表只用于线程头切换入口；插件启停后按 revision 重新拉取。
  useEffect(() => {
    let cancelled = false
    void listProviders(deps.connection)
      .then((providers) => {
        if (!cancelled) {
          setProviderOptions(
            providers.map((provider) => ({ id: provider.id, displayName: provider.displayName })),
          )
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [deps.connection, state.providerRevision])

  function interrupt(): void {
    const runId = [...state.events].reverse().find((event) => event.runId !== null)?.runId
    if (!runId || !state.activeThreadId) return
    void deps.connection
      .call("run.interrupt", { threadId: state.activeThreadId, runId })
      .catch((error: unknown) => deps.store.update({ error: messageOf(error) }))
  }

  /** 把审批决议提交给 Host；runId 取最近一条带 runId 的事件。 */
  function respondApproval(requestId: string, decision: ApprovalDecision): void {
    const runId = [...state.events].reverse().find((event) => event.runId !== null)?.runId
    if (!runId || !state.activeThreadId) return
    void deps.connection
      .call("run.respondApproval", {
        threadId: state.activeThreadId,
        runId,
        requestId,
        decision,
      })
      .catch((error: unknown) => deps.store.update({ error: messageOf(error) }))
  }

  /** 切换 provider；Host 端语义由 Task 6 的 thread.switchProvider 落地。 */
  function switchProvider(providerId: string): void {
    if (!thread) return
    void deps.connection
      .call("thread.switchProvider", {
        threadId: thread.id,
        providerId,
        modelId: null,
      })
      .then(() => {
        const threads = deps.store
          .getSnapshot()
          .threads.map((item) =>
            item.id === thread.id
              ? { ...item, lastProviderId: providerId, lastModelId: null }
              : item,
          )
        deps.store.update({ threads })
        const name = providerOptions.find((provider) => provider.id === providerId)?.displayName
        setProviderNotice(`${t("chat.provider.next")} ${name ?? providerId}`)
        setTimeout(() => setProviderNotice(null), 4000)
      })
      .catch((error: unknown) => deps.store.update({ error: messageOf(error) }))
  }

  /** 切换模型；通过同一个 thread.switchProvider 命令交给 Host。 */
  function switchModel(modelId: string): void {
    if (!thread) return
    const providerId = thread.lastProviderId ?? thread.defaultProviderId
    void deps.connection
      .call("thread.switchProvider", {
        threadId: thread.id,
        providerId,
        modelId,
      })
      .then(() => {
        const threads = deps.store
          .getSnapshot()
          .threads.map((item) => (item.id === thread.id ? { ...item, lastModelId: modelId } : item))
        deps.store.update({ threads })
      })
      .catch((error: unknown) => deps.store.update({ error: messageOf(error) }))
  }

  return (
    <>
      {providerNotice ? (
        <div className="toast-stack" role="status" aria-live="polite">
          <div className="toast">{providerNotice}</div>
        </div>
      ) : null}
      <ChatView
        thread={thread}
        events={state.events}
        streamingText={state.streamingText}
        capabilities={state.providerCapabilities}
        models={state.providerModels}
        providers={providerOptions}
        {...(project ? { cwd: project.rootPath } : {})}
        onStart={(text) => {
          if (!state.activeThreadId) return
          void deps.connection
            .startRun(state.activeThreadId, text)
            .catch((error: unknown) => deps.store.update({ error: messageOf(error) }))
        }}
        onInterrupt={interrupt}
        onApproval={respondApproval}
        onSwitchProvider={switchProvider}
        onSwitchModel={switchModel}
        rightOpen={rightOpen}
        {...(onToggleRight ? { onToggleRight } : {})}
        {...(layoutControls !== undefined ? { layoutControls } : {})}
        {...(project ? { openIn: <OpenInMenu path={project.rootPath} /> } : {})}
      />
    </>
  )
}

/** 布局按钮；App 位于 LocaleProvider 之外，文案在渲染处读取。 */
function LayoutControls(props: Omit<PanelLayoutControlsProps, "labels">) {
  const { t } = useLocale()
  return <PanelLayoutControls {...props} labels={layoutLabels(t)} />
}

/** 应用根组件。 */
export function App({ store, slots, connection, plugins, locale }: AppProps) {
  const state = useAppStore(store)
  const appearance = useAppearance()
  const [view, setView] = useState<ShellView>("chat")
  const [section, setSection] = useState<SettingsSection>("general")
  const [rightOpen, setRightOpen] = useState(false)
  const [rightMaximized, setRightMaximized] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  // 底部终端第一次打开后才挂载，之后收起只隐藏，shell 会话保留到切换线程。
  const [terminalStarted, setTerminalStarted] = useState(false)
  const [panels, setPanels] = useState<Record<string, PanelSurfaceState>>({})
  const [history, setHistory] = useState<NavHistory>(EMPTY_HISTORY)
  const initialLoadDone = useRef(false)

  // 每次落到新的位置都记一笔；从历史里跳转时当前位置已经对上，不会重复记录。
  useEffect(() => {
    const location: NavLocation | null =
      view === "plugins"
        ? { kind: "plugins" }
        : view === "settings"
          ? { kind: "settings", section }
          : state.activeThreadId
            ? { kind: "thread", threadId: state.activeThreadId }
            : null
    if (location) setHistory((current) => pushLocation(current, location))
  }, [view, section, state.activeThreadId])

  // 首次连上 Host 后拉取项目与线程；重连时保留当前界面状态。
  useEffect(() => {
    if (state.status !== "connected" || initialLoadDone.current) return
    initialLoadDone.current = true
    void (async () => {
      try {
        const projects = (await connection.call("project.list", {})) as Project[]
        const threads = (await connection.call("thread.list", {})) as Thread[]
        store.update({ projects, threads })
      } catch (error) {
        initialLoadDone.current = false
        store.update({ error: messageOf(error) })
      }
    })()
  }, [state.status, connection, store])

  // 当前线程变化时刷新能力与模型列表，驱动按 capability 隐藏控件。
  useEffect(() => {
    if (state.status !== "connected") return
    const thread = state.threads.find((item) => item.id === state.activeThreadId)
    if (!thread) return
    void loadProviderContext(connection, store, thread).catch((error: unknown) =>
      store.update({ error: messageOf(error) }),
    )
  }, [state.status, state.activeThreadId, state.threads, connection, store])

  /** 新建会话；没指定项目时放进当前会话所在的项目，再退回第一个项目。 */
  async function createThread(projectId?: string): Promise<void> {
    const snapshot = store.getSnapshot()
    const activeProjectId = snapshot.threads.find(
      (thread) => thread.id === snapshot.activeThreadId,
    )?.projectId
    const project = projectId
      ? snapshot.projects.find((item) => item.id === projectId)
      : (snapshot.projects.find((item) => item.id === activeProjectId) ?? snapshot.projects[0])
    if (!project) return
    try {
      const providerId = await pickProviderId(connection)
      const thread = (await connection.call("thread.create", {
        projectId: project.id,
        title: locale === "en-US" ? "New thread" : "新会话",
        providerId,
      })) as Thread
      store.update({
        threads: [thread, ...store.getSnapshot().threads],
        activeProjectId: project.id,
        error: null,
      })
      // 新线程立即成为 tab 与活动会话，再向 Host 订阅事件。
      store.openThread(thread.id)
      store.setActiveThread(thread.id)
      setView("chat")
      await connection.openThread(thread.id)
    } catch (error) {
      store.update({ error: messageOf(error) })
    }
  }

  function openThread(threadId: string): void {
    store.openThread(threadId)
    store.setActiveThread(threadId)
    setView("chat")
    void connection
      .openThread(threadId)
      .catch((error: unknown) => store.update({ error: messageOf(error) }))
  }

  /** 沿历史后退或前进；先去掉已经不存在的会话。 */
  function travel(direction: "back" | "forward"): void {
    const live = new Set(
      store
        .getSnapshot()
        .threads.filter((thread) => thread.archivedAt === null)
        .map((thread) => thread.id),
    )
    const pruned = pruneHistory(
      history,
      (location) => location.kind !== "thread" || live.has(location.threadId),
    )
    const next = direction === "back" ? goBack(pruned) : goForward(pruned)
    setHistory(next)
    const target = currentLocation(next)
    if (!target || next === pruned) return
    if (target.kind === "thread") openThread(target.threadId)
    else if (target.kind === "settings") {
      setSection(target.section)
      setView("settings")
    } else setView("plugins")
  }

  const effectiveSection: SettingsSection = view === "plugins" ? "plugins" : section
  const threadStatus: Record<string, ThreadStatus> = {}
  for (const [threadId, viewState] of Object.entries(state.threadStates)) {
    threadStatus[threadId] = viewState.status
  }
  const activeThreadId = view === "chat" ? state.activeThreadId : null

  function toggleRight(): void {
    setRightOpen((value) => !value)
    setRightMaximized(false)
  }

  function toggleTerminal(): void {
    if (!activeThreadId) return
    setTerminalStarted(true)
    setTerminalOpen((value) => !value)
  }

  function updatePanel(threadId: string, update: (panel: PanelSurfaceState) => PanelSurfaceState) {
    setPanels((current) => ({
      ...current,
      [threadId]: update(current[threadId] ?? EMPTY_SURFACE_STATE),
    }))
  }

  const layoutControls = (maximizable: boolean) => (
    <LayoutControls
      rightOpen={rightOpen}
      onToggleRight={toggleRight}
      terminalOpen={terminalOpen}
      onToggleTerminal={toggleTerminal}
      {...(maximizable
        ? { maximized: rightMaximized, onToggleMaximize: () => setRightMaximized((value) => !value) }
        : {})}
      disabled={!activeThreadId}
    />
  )

  return (
    <AppRenderer
      locale={locale}
      view={view}
      projects={state.projects}
      threads={state.threads}
      activeThreadId={state.activeThreadId}
      threadStatus={threadStatus}
      onToggleRight={toggleRight}
      onToggleTerminal={toggleTerminal}
      canGoBack={canGoBack(history)}
      canGoForward={canGoForward(history)}
      onBack={() => travel("back")}
      onForward={() => travel("forward")}
      settingsSection={effectiveSection}
      onView={setView}
      onSettingsSection={setSection}
      onAddProject={(path, name) => {
        void addProject(connection, store, path, name).catch((error: unknown) =>
          store.update({ error: messageOf(error) }),
        )
      }}
      onNewThread={(projectId) => void createThread(projectId)}
      onOpenThread={openThread}
      onRenameThread={(threadId, title) => {
        void renameThread(connection, store, threadId, title).catch((error: unknown) =>
          store.update({ error: messageOf(error) }),
        )
      }}
      onArchiveThread={(threadId) => {
        void archiveThread(connection, store, threadId)
          .then((next) => {
            if (next) openThread(next)
          })
          .catch((error: unknown) => store.update({ error: messageOf(error) }))
      }}
      onRenameProject={(projectId, name) => {
        void renameProject(connection, store, projectId, name).catch((error: unknown) =>
          store.update({ error: messageOf(error) }),
        )
      }}
      onRemoveProject={(projectId) => {
        void removeProject(connection, store, projectId)
          .then((next) => {
            if (next) openThread(next)
          })
          .catch((error: unknown) => store.update({ error: messageOf(error) }))
      }}
      sidebarExtra={<PluginPanels controller={plugins} />}
      rightOpen={rightOpen}
      rightMaximized={rightMaximized}
      rightPanel={
        activeThreadId ? (
          <WorkbenchPanel
            key={activeThreadId}
            connection={connection}
            threadId={activeThreadId}
            panel={panels[activeThreadId] ?? EMPTY_SURFACE_STATE}
            onPanelChange={(update) => updatePanel(activeThreadId, update)}
            controls={layoutControls(true)}
            onError={(message) => store.update({ error: message })}
          />
        ) : undefined
      }
      bottomPanel={
        activeThreadId && terminalStarted ? (
          <TerminalDrawer
            key={activeThreadId}
            connection={connection}
            threadId={activeThreadId}
            open={terminalOpen}
            onClose={() => setTerminalOpen(false)}
          />
        ) : undefined
      }
    >
      <ConnectionBanner store={store} />
      {view === "chat" ? (
        <SlotHost<ChatSlotProps>
          registry={slots}
          name="chat.view"
          props={{
            rightOpen,
            onToggleRight: toggleRight,
            layoutControls: rightOpen && activeThreadId ? null : layoutControls(false),
            onNewThread: () => void createThread(),
          }}
        />
      ) : (
        <SlotHost<SettingsSlotProps>
          registry={slots}
          name="settings.section"
          props={{
            section: effectiveSection,
            onSection: setSection,
            onClose: () => setView("chat"),
            appearance,
          }}
        />
      )}
    </AppRenderer>
  )
}
