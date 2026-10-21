/**
 * 应用外壳：Windows/Linux 的标题栏、侧栏顶行按钮、工作区/设置侧栏与内容区。
 * 窗口按钮全部由系统绘制：macOS 的交通灯落在侧栏顶行，Windows/Linux 的按钮叠在标题栏上。
 */
import {
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react"
import type { Project, Thread } from "@pigcode/contracts"
import { Button, formatShortcut, useLocale } from "@pigcode/ui-primitives"
import { AddProjectDialog } from "./add-project-dialog"
import { CommandPalette } from "./command-palette"
import { Icon } from "./icon"
import { SettingsSidebar, type SettingsSection } from "./settings-sidebar"
import type { ThreadStatus } from "./thread-status"
import { TitleBar } from "./title-bar"
import { titleBarMenus } from "./title-bar-menus"
import { WindowControls } from "./window-controls"
import { WorkspaceSidebar } from "./workspace-sidebar"

/** 顶层视图：聊天、设置与插件。 */
export type ShellView = "chat" | "settings" | "plugins"

const RIGHT_MIN = 320
const RIGHT_MAX_RATIO = 0.58
const RIGHT_STORAGE_KEY = "pigcode.rightWidth"

/** 把右栏宽度限制在窗口可承受范围内。 */
function clampRightWidth(width: number): number {
  const max = Math.max(RIGHT_MIN, Math.round((typeof window === "undefined" ? 1200 : window.innerWidth) * RIGHT_MAX_RATIO))
  return Math.min(max, Math.max(RIGHT_MIN, Math.round(width)))
}

/** 读取上次保存的右栏宽度；存储不可用时回到默认值。 */
function initialRightWidth(): number {
  try {
    const saved = Number.parseInt(window.localStorage.getItem(RIGHT_STORAGE_KEY) ?? "", 10)
    if (Number.isFinite(saved)) return clampRightWidth(saved)
  } catch {
    // 隐私模式或测试环境可能禁用 localStorage；使用默认宽度。
  }
  return 460
}

/** 原生桥报告的平台；浏览器与测试环境里为空字符串。 */
function nativePlatform(): string {
  return typeof window === "undefined" ? "" : (window.pigcodeNative?.platform ?? "")
}

/** Windows 与 Linux 由页面绘制标题栏，系统窗口按钮叠在它上面。 */
export function hasCustomTitleBar(platform: string): boolean {
  return platform === "win32" || platform === "linux"
}

/** 与 globals.css 的窄窗口断点一致：更窄时侧栏改成浮在内容上的抽屉。 */
const NARROW_QUERY = "(max-width: 960px)"

function matchesNarrow(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(NARROW_QUERY).matches
    : false
}

/** 窗口是否窄到侧栏改成抽屉。 */
function useNarrowWindow(): boolean {
  const [narrow, setNarrow] = useState(matchesNarrow)
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const list = window.matchMedia(NARROW_QUERY)
    const onChange = (event: MediaQueryListEvent): void => setNarrow(event.matches)
    list.addEventListener("change", onChange)
    return () => list.removeEventListener("change", onChange)
  }, [])
  return narrow
}

/** 外壳所需的数据与事件；项目/线程数据由 store 传入。 */
export interface ShellProps {
  view: ShellView
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  /** 线程运行状态；用于侧栏的状态点。 */
  threadStatus?: Record<string, ThreadStatus>
  expandedProjects?: Record<string, boolean>
  sidebarOpen?: boolean
  /** 右栏内容；由调用方按当前线程组装。收起时只隐藏，不卸载，终端与页面得以保留。 */
  rightPanel?: ReactNode
  /** 右栏是否展开；缺省视为展开。 */
  rightOpen?: boolean
  /** 右栏占满工作区，聊天区暂时隐藏。 */
  rightMaximized?: boolean
  /** 右栏折叠切换；供调用方接入快捷键或头部按钮。 */
  onToggleRight?: () => void
  /** 聊天区下方的抽屉，例如底部终端。 */
  bottomPanel?: ReactNode
  /** 底部终端切换；接入 ⌃` 快捷键。 */
  onToggleTerminal?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  settingsSection?: SettingsSection
  onToggleSidebar?: () => void
  onBack?: () => void
  onForward?: () => void
  onView: (view: ShellView) => void
  onSettingsSection?: (section: SettingsSection) => void
  /** 创建项目；name 为 undefined 时用文件夹名。 */
  onAddProject: (path: string, name?: string) => void
  onToggleProject?: (projectId: string, expanded: boolean) => void
  onNewThread: (projectId?: string) => void
  onOpenThread: (threadId: string) => void
  /** 侧栏底部扩展区，用于宿主渲染第三方 UI 插件面板。 */
  sidebarExtra?: ReactNode
  children?: ReactNode
}

/** 普通页面的内容区：顶栏拖动区加可滚动区域。 */
export function ScrollPanel({ children }: { children: ReactNode }) {
  return (
    <section className="view">
      <PanelTop />
      <div className="panel-scroll">{children}</div>
    </section>
  )
}

/** 内容区顶栏，只放拖动区和可选操作。 */
export function PanelTop({ children }: { children?: ReactNode }) {
  return (
    <div className="panel-top">
      <span className="spacer" />
      {children}
    </div>
  )
}

/**
 * 组合窗口外壳。受控 props（expandedProjects/sidebarOpen）存在时由调用方管理，
 * 否则使用组件内部状态，方便 M0-B 的集成阶段逐步接管。
 */
export function Shell({
  view,
  projects,
  threads,
  activeThreadId,
  threadStatus,
  expandedProjects,
  sidebarOpen,
  rightPanel,
  rightOpen = true,
  rightMaximized = false,
  onToggleRight,
  bottomPanel,
  onToggleTerminal,
  canGoBack = false,
  canGoForward = false,
  settingsSection,
  onToggleSidebar,
  onBack,
  onForward,
  onView,
  onSettingsSection,
  onAddProject,
  onToggleProject,
  onNewThread,
  onOpenThread,
  sidebarExtra,
  children,
}: ShellProps) {
  const { t } = useLocale()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [rightWidth, setRightWidth] = useState(initialRightWidth)
  const [localExpanded, setLocalExpanded] = useState<Record<string, boolean>>({})
  const [localSidebarOpen, setLocalSidebarOpen] = useState(true)
  const inSettings = view !== "chat"
  const platform = nativePlatform()
  const narrow = useNarrowWindow()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // 抽屉只在窄窗口里有意义；变宽后复位，下次变窄时从收起开始。
  useEffect(() => {
    if (!narrow) setDrawerOpen(false)
  }, [narrow])

  // 切到别的会话或页面后收起抽屉，回到内容。
  useEffect(() => {
    setDrawerOpen(false)
  }, [activeThreadId, view, settingsSection])

  useEffect(() => {
    if (!drawerOpen) return
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setDrawerOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [drawerOpen])

  // 标题栏、交通灯留白和配色按平台区分，CSS 依赖 html[data-platform]；绘制前写入，避免布局跳动。
  useLayoutEffect(() => {
    document.documentElement.dataset.platform = platform
  }, [platform])

  // macOS 全屏时交通灯隐藏，CSS 依赖 html[data-fullscreen] 收回留白。
  useEffect(() => {
    const bridge = window.pigcodeNative
    if (!bridge?.onFullScreenChange) return
    const root = document.documentElement
    const apply = (fullScreen: boolean): void => {
      if (fullScreen) root.dataset.fullscreen = "true"
      else delete root.dataset.fullscreen
    }
    void bridge
      .isFullScreen?.()
      .then(apply)
      .catch(() => undefined)
    return bridge.onFullScreenChange(apply)
  }, [])

  // 记住工作台宽度；窗口变窄时重新夹紧，避免右栏挤掉主内容。
  useEffect(() => {
    try {
      window.localStorage.setItem(RIGHT_STORAGE_KEY, String(rightWidth))
    } catch {
      // 存储不可用时不阻塞界面。
    }
  }, [rightWidth])

  useEffect(() => {
    function handleResize(): void {
      setRightWidth((width) => clampRightWidth(width))
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  // 全局快捷键：⌘K 面板、⌘N 新会话、⌘B 侧栏、⌘J 右栏、⌃` 底部终端、⌘, 设置。
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.ctrlKey && !event.metaKey && !event.altKey && event.code === "Backquote") {
        if (!onToggleTerminal) return
        event.preventDefault()
        onToggleTerminal()
        return
      }
      if (!event.metaKey && !event.ctrlKey) return
      const target = event.target as HTMLElement | null
      const editing =
        target?.isContentEditable === true ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      const key = event.key.toLowerCase()
      if (key === "k") {
        event.preventDefault()
        setPaletteOpen((value) => !value)
        return
      }
      if (editing) return
      if (key === "n") {
        event.preventDefault()
        onNewThread()
      } else if (key === "b") {
        event.preventDefault()
        toggleSidebar()
      } else if (key === "j") {
        event.preventDefault()
        onToggleRight?.()
      } else if (event.key === ",") {
        event.preventDefault()
        onView("settings")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [onNewThread, onToggleRight, onToggleTerminal, onView, sidebarOpen, narrow])

  const expanded = expandedProjects ?? localExpanded
  const open = sidebarOpen ?? localSidebarOpen
  const section: SettingsSection = settingsSection ?? (view === "plugins" ? "plugins" : "general")

  /** 宽窗口里收起或展开侧栏；窄窗口里开关抽屉。 */
  function toggleSidebar(): void {
    if (narrow) {
      setDrawerOpen((current) => !current)
      return
    }
    if (sidebarOpen === undefined) setLocalSidebarOpen((current) => !current)
    onToggleSidebar?.()
  }

  function toggleProject(projectId: string, next: boolean): void {
    if (expandedProjects === undefined) {
      setLocalExpanded((current) => ({ ...current, [projectId]: next }))
    }
    onToggleProject?.(projectId, next)
  }

  function selectSection(next: SettingsSection): void {
    onSettingsSection?.(next)
    onView(next === "plugins" ? "plugins" : "settings")
  }

  const showRight = rightPanel !== undefined && rightOpen
  const appClass = [
    "app",
    open ? "" : "is-collapsed",
    narrow && drawerOpen ? "is-drawer-open" : "",
    showRight ? "has-right" : "",
    showRight && rightMaximized ? "is-right-max" : "",
  ]
    .filter(Boolean)
    .join(" ")
  const appStyle = { "--right-w": `${rightWidth}px` } as CSSProperties

  /** 拖动右栏分隔条；向左拖变宽，向右拖变窄。 */
  function startResize(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = rightWidth
    const move = (moveEvent: PointerEvent): void => {
      setRightWidth(clampRightWidth(startWidth + startX - moveEvent.clientX))
    }
    const up = (): void => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      document.body.classList.remove("is-resizing")
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
    document.body.classList.add("is-resizing")
  }

  function onResizerKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    setRightWidth((width) => clampRightWidth(width + (event.key === "ArrowLeft" ? 24 : -24)))
  }

  const menus = hasCustomTitleBar(platform)
    ? titleBarMenus({
        t,
        newThread: () => onNewThread(),
        addProject: () => setDialogOpen(true),
        settings: () => onView("settings"),
        about: () => selectSection("general"),
        palette: () => setPaletteOpen(true),
        toggleSidebar,
        toggleRight: onToggleRight,
        toggleTerminal: onToggleTerminal,
      })
    : null

  return (
    <div className={appClass} style={appStyle}>
      {menus ? <TitleBar menus={menus} label={t("menu.label")} /> : null}
      <WindowControls
        sidebarOpen={narrow ? drawerOpen : open}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onToggleSidebar={toggleSidebar}
        onSearch={() => setPaletteOpen(true)}
        onBack={() => onBack?.()}
        onForward={() => onForward?.()}
      />
      <aside className="sidebar" aria-label={inSettings ? t("settings.title") : t("nav.projects")}>
        <div className="side-top" />
        <div className="side-scroll">
          {inSettings ? (
            <SettingsSidebar
              activeSection={section}
              onSelect={selectSection}
              onExit={() => onView("chat")}
            />
          ) : (
            <WorkspaceSidebar
              projects={projects}
              threads={threads}
              activeThreadId={activeThreadId}
              threadStatus={threadStatus}
              expandedProjects={expanded}
              onAddProject={() => setDialogOpen(true)}
              onToggleProject={toggleProject}
              onOpenThread={(threadId) => {
                setDrawerOpen(false)
                onOpenThread(threadId)
              }}
              onNewThread={(projectId) => {
                setDrawerOpen(false)
                onNewThread(projectId)
              }}
              onOpenSchedules={() => selectSection("schedules")}
              onOpenPlugins={() => selectSection("plugins")}
            />
          )}
          {sidebarExtra}
        </div>
        {!inSettings ? (
          <div className="side-foot">
            <span className="side-account">
              <span className="side-avatar" aria-hidden="true">
                <Icon name="snout" />
              </span>
              <span className="truncate">Pigcode</span>
            </span>
            <Button
              variant="plain"
              className="icon-btn foot-gear"
              type="button"
              aria-label={t("settings.title")}
              title={`${t("settings.title")} ${formatShortcut("Mod+,")}`}
              onClick={() => onView("settings")}
            >
              <Icon name="gear" />
            </Button>
          </div>
        ) : null}
      </aside>
      <div className="drawer-scrim" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
      <div className="workspace">
        <main className="panel">
          {children}
          {bottomPanel}
        </main>
        {rightPanel !== undefined ? (
          <div className="right-panel-slot" hidden={!showRight}>
            {showRight && !rightMaximized ? (
              <div
                className="panel-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={t("panel.label")}
                aria-valuemin={RIGHT_MIN}
                aria-valuemax={clampRightWidth(Number.MAX_SAFE_INTEGER)}
                aria-valuenow={rightWidth}
                tabIndex={0}
                onPointerDown={startResize}
                onKeyDown={onResizerKey}
                onDoubleClick={() => setRightWidth(clampRightWidth(460))}
              />
            ) : null}
            {rightPanel}
          </div>
        ) : null}
      </div>
      <AddProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={(path, name) => onAddProject(path, name)}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        projects={projects}
        threads={threads}
        activeThreadId={activeThreadId}
        onNewThread={() => onNewThread()}
        onOpenThread={onOpenThread}
        onAddProject={() => setDialogOpen(true)}
        onSettings={() => onView("settings")}
        onPlugins={() => onView("plugins")}
        onToggleSidebar={toggleSidebar}
        {...(onToggleRight ? { onToggleWorkbench: () => onToggleRight() } : {})}
      />
    </div>
  )
}
