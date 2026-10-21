/** 应用外壳：把 store/connection 接到 Shell、聊天、设置与插件管理器。 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react"
import type { Project, Thread } from "@pigcode/contracts"
import { AppRenderer, SlotHost, useAppStore, type SlotRegistry } from "@pigcode/client-runtime"
import {
  useAppearance,
  useLocale,
  type AppearanceController,
  type Locale,
} from "@pigcode/ui-primitives"
export type { ChatSlotProps, CoreDeps } from "./chat-container"
export { ChatViewContainer } from "./chat-container"
import type { SettingsSection, ShellView, ThreadStatus } from "@pigcode/ui-shell"
import {
  EMPTY_SURFACE_STATE,
  PanelLayoutControls,
  type PanelLayoutControlsProps,
  type PanelSurfaceState,
} from "@pigcode/ui-workbench"
import { PluginPanels } from "./client-plugins"
import type { ChatSlotProps, CoreDeps } from "./chat-container"
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
import { loadProviderContext, pickProviderId } from "./providers"

// 工作台（xterm、diff）与底部终端在第一次打开时才加载，冷启动只加载聊天需要的代码。
const WorkbenchPanel = lazy(() =>
  import("./workbench").then((module) => ({ default: module.WorkbenchPanel })),
)
const TerminalDrawer = lazy(() =>
  import("./terminal-drawer").then((module) => ({ default: module.TerminalDrawer })),
)
import { layoutLabels } from "./workbench-labels"
import {
  addProject,
  archiveThread,
  removeProject,
  renameProject,
  renameThread,
} from "./workspace-actions"

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

const BUSY: ReadonlySet<ThreadStatus> = new Set(["running", "queued", "waiting-approval"])

/** 侧栏状态：主会话空闲但有子代理在忙时，主会话显示子代理的状态。 */
export function mergeChildStatus(
  threads: readonly Thread[],
  threadStates: Readonly<Record<string, { status: ThreadStatus }>>,
): Record<string, ThreadStatus> {
  const result: Record<string, ThreadStatus> = {}
  for (const [threadId, viewState] of Object.entries(threadStates)) {
    result[threadId] = viewState.status
  }
  for (const thread of threads) {
    if (!thread.parentThreadId || thread.archivedAt !== null) continue
    const status = threadStates[thread.id]?.status
    const parent = result[thread.parentThreadId]
    if (status && BUSY.has(status) && !(parent && BUSY.has(parent))) {
      result[thread.parentThreadId] = status
    }
  }
  return result
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
  // 右栏第一次打开后才挂载（按需加载工作台代码），之后收起只隐藏，终端与浏览器标签保留。
  const [rightStarted, setRightStarted] = useState(false)
  const [rightMaximized, setRightMaximized] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  // 底部终端第一次打开后才挂载，之后收起只隐藏，shell 会话保留到切换线程。
  const [terminalStarted, setTerminalStarted] = useState(false)
  const [panels, setPanels] = useState<Record<string, PanelSurfaceState>>({})
  const [history, setHistory] = useState<NavHistory>(EMPTY_HISTORY)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (rightOpen) setRightStarted(true)
  }, [rightOpen])

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

  // 当前线程或它的 provider 变化时刷新能力，驱动按 capability 隐藏控件。
  // 只依赖 provider id：线程标题、更新时间这类变化不需要重新查询。
  const activeThread = state.threads.find((item) => item.id === state.activeThreadId)
  const activeProviderId = activeThread
    ? (activeThread.lastProviderId ?? activeThread.defaultProviderId)
    : null
  useEffect(() => {
    if (state.status !== "connected" || !activeProviderId) return
    const thread = store.getSnapshot().threads.find((item) => item.id === state.activeThreadId)
    if (!thread) return
    void loadProviderContext(connection, store, thread).catch((error: unknown) =>
      store.update({ error: messageOf(error) }),
    )
  }, [state.status, state.activeThreadId, activeProviderId, connection, store])

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
  // 子代理只在主会话的标签栏里出现；侧栏和命令面板只列主会话。
  const mainThreads = useMemo(
    () => state.threads.filter((thread) => !thread.parentThreadId),
    [state.threads],
  )
  const threadStatus = useMemo(
    () => mergeChildStatus(state.threads, state.threadStates),
    [state.threads, state.threadStates],
  )
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
        ? {
            maximized: rightMaximized,
            onToggleMaximize: () => setRightMaximized((value) => !value),
          }
        : {})}
      disabled={!activeThreadId}
    />
  )

  return (
    <AppRenderer
      locale={locale}
      view={view}
      projects={state.projects}
      threads={mainThreads}
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
        activeThreadId && (rightStarted || rightOpen) ? (
          <Suspense fallback={null}>
            <WorkbenchPanel
              key={activeThreadId}
              connection={connection}
              threadId={activeThreadId}
              panel={panels[activeThreadId] ?? EMPTY_SURFACE_STATE}
              onPanelChange={(update) => updatePanel(activeThreadId, update)}
              controls={layoutControls(true)}
              onError={(message) => store.update({ error: message })}
            />
          </Suspense>
        ) : undefined
      }
      bottomPanel={
        activeThreadId && terminalStarted ? (
          <Suspense fallback={null}>
            <TerminalDrawer
              key={activeThreadId}
              connection={connection}
              threadId={activeThreadId}
              open={terminalOpen}
              onClose={() => setTerminalOpen(false)}
            />
          </Suspense>
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
