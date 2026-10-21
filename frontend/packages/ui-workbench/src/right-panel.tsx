/** 右侧面板：多标签的 surface（浏览器、终端、文件、Diff、PR、检查点）、添加菜单与空状态启动器。 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import {
  FileDiff,
  Files,
  Globe,
  GitPullRequest,
  History,
  Plus,
  SquareTerminal,
  X,
  type LucideIcon,
} from "lucide-react"
import { Menu } from "@pigcode/ui-primitives"

/** 可以打开的 surface 种类；顺序即启动器与添加菜单里的顺序。 */
export const SURFACE_KINDS = ["browser", "terminal", "files", "diff", "pr", "checkpoint"] as const

/** surface 种类标识。 */
export type SurfaceKind = (typeof SURFACE_KINDS)[number]

/** 启动器与添加菜单里的单键快捷键。 */
export const SURFACE_SHORTCUTS: Record<SurfaceKind, string> = {
  browser: "B",
  terminal: "T",
  files: "F",
  diff: "D",
  pr: "P",
  checkpoint: "C",
}

/** 可以同时打开多个实例的种类；其余种类再次打开时切到已有标签。 */
export const MULTI_INSTANCE_KINDS: ReadonlySet<SurfaceKind> = new Set(["browser", "terminal"])

const SURFACE_ICONS: Record<SurfaceKind, LucideIcon> = {
  browser: Globe,
  terminal: SquareTerminal,
  files: Files,
  diff: FileDiff,
  pr: GitPullRequest,
  checkpoint: History,
}

/** 右侧面板里的一个标签。 */
export interface PanelSurface {
  id: string
  kind: SurfaceKind
  title: string
  /** 浏览器最近一次导航的地址；面板随会话重新挂载时用它恢复页面。 */
  url?: string
  /** 文件标签要显示的文件（项目内相对路径），从聊天里点文件时设置。 */
  path?: string
}

/** 一组标签与当前激活的标签；没有标签时 activeId 为 null，面板显示启动器。 */
export interface PanelSurfaceState {
  surfaces: PanelSurface[]
  activeId: string | null
}

/** 空面板。 */
export const EMPTY_SURFACE_STATE: PanelSurfaceState = { surfaces: [], activeId: null }

/**
 * 打开一个 surface：单实例种类已存在时只切换过去；多实例种类追加新标签。
 * title 收到同种类的序号（从 1 开始），用于生成「终端 2」这样的标题。
 */
export function addSurface(
  state: PanelSurfaceState,
  kind: SurfaceKind,
  id: string,
  title: (index: number) => string,
): PanelSurfaceState {
  if (!MULTI_INSTANCE_KINDS.has(kind)) {
    const existing = state.surfaces.find((surface) => surface.kind === kind)
    if (existing) return { ...state, activeId: existing.id }
  }
  const used = new Set(
    state.surfaces.filter((surface) => surface.kind === kind).map((surface) => surface.title),
  )
  let index = 1
  while (used.has(title(index))) index += 1
  return {
    surfaces: [...state.surfaces, { id, kind, title: title(index) }],
    activeId: id,
  }
}

/** 关闭一个 surface；关闭的是当前标签时激活右侧邻居，没有则激活左侧邻居。 */
export function closeSurface(state: PanelSurfaceState, id: string): PanelSurfaceState {
  const index = state.surfaces.findIndex((surface) => surface.id === id)
  if (index === -1) return state
  const surfaces = state.surfaces.filter((surface) => surface.id !== id)
  if (state.activeId !== id) return { surfaces, activeId: state.activeId }
  const next = surfaces[index] ?? surfaces[index - 1] ?? null
  return { surfaces, activeId: next?.id ?? null }
}

/** 修改某个标签的标题、地址或文件，例如浏览器加载页面后显示主机名。 */
export function updateSurface(
  state: PanelSurfaceState,
  id: string,
  patch: Partial<Pick<PanelSurface, "title" | "url" | "path">>,
): PanelSurfaceState {
  return {
    ...state,
    surfaces: state.surfaces.map((surface) =>
      surface.id === id ? { ...surface, ...patch } : surface,
    ),
  }
}

/** 右侧面板文案；容器按 locale 注入，组件本身不依赖 locale。 */
export interface RightPanelLabels {
  panel: string
  tabs: string
  launcher: string
  add: string
  close: string
  surfaces: Record<SurfaceKind, string>
}

/** 默认中文文案。 */
export const DEFAULT_RIGHT_PANEL_LABELS: RightPanelLabels = {
  panel: "右侧面板",
  tabs: "面板标签",
  launcher: "打开一个面板",
  add: "添加面板",
  close: "关闭",
  surfaces: {
    browser: "浏览器",
    terminal: "终端",
    files: "文件",
    diff: "Diff",
    pr: "PR",
    checkpoint: "检查点",
  },
}

/** 右侧面板属性；标签内容由容器渲染为 children，以便终端与浏览器在切换标签时保持挂载。 */
export interface RightPanelProps {
  threadId: string
  surfaces: readonly PanelSurface[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onAdd: (kind: SurfaceKind) => void
  /** 暂不可用的种类及原因；在启动器和菜单里置灰。 */
  unavailable?: Partial<Record<SurfaceKind, string>>
  /** 标签栏右侧的布局按钮（最大化、底部终端、收起面板）。 */
  controls?: ReactNode
  labels?: Partial<Omit<RightPanelLabels, "surfaces">> & {
    surfaces?: Partial<Record<SurfaceKind, string>>
  }
  children?: ReactNode
}

/** 弹层打开时不响应启动器快捷键，避免和菜单、对话框的键盘操作冲突。 */
const BLOCKING_LAYERS = ".menu-popup, [role='dialog'], .palette"

/** 焦点在可输入元素里时不拦截单键快捷键。 */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !==
      null
  )
}

/** 按键是否是某个可用 surface 的快捷键。 */
function shortcutKind(
  event: Pick<globalThis.KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing">,
  available: readonly SurfaceKind[],
): SurfaceKind | null {
  if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return null
  const key = event.key.toUpperCase()
  return available.find((kind) => SURFACE_SHORTCUTS[kind] === key) ?? null
}

function SurfaceIcon({ kind }: { kind: SurfaceKind }) {
  const Icon = SURFACE_ICONS[kind]
  return <Icon className="ic ic-sm" aria-hidden="true" />
}

/** 空面板：列出可以打开的 surface；面板显示时单键即可打开，方向键在列表里移动。 */
function SurfaceLauncher({
  labels,
  unavailable,
  onAdd,
}: {
  labels: RightPanelLabels
  unavailable: Partial<Record<SurfaceKind, string>>
  onAdd: (kind: SurfaceKind) => void
}) {
  const available = SURFACE_KINDS.filter((kind) => unavailable[kind] === undefined)
  const [highlight, setHighlight] = useState(-1)
  const root = useRef<HTMLDivElement | null>(null)
  const latest = useRef({ available, onAdd })
  latest.current = { available, onAdd }

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.defaultPrevented || isTypingTarget(event.target)) return
      // 面板收起时外壳只是隐藏它，启动器仍然挂载。
      if (!root.current || root.current.closest("[hidden]")) return
      if (document.querySelector(BLOCKING_LAYERS)) return
      const kind = shortcutKind(event, latest.current.available)
      if (!kind) return
      event.preventDefault()
      latest.current.onAdd(kind)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  function onListKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (available.length === 0) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setHighlight((current) => (current + 1) % available.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setHighlight((current) => (current <= 0 ? available.length - 1 : current - 1))
    } else if (event.key === "Enter" && event.target === event.currentTarget) {
      const kind = available[highlight]
      if (!kind) return
      event.preventDefault()
      onAdd(kind)
    }
  }

  return (
    <div
      ref={root}
      className="surface-launcher"
      tabIndex={0}
      aria-label={labels.launcher}
      onKeyDown={onListKeyDown}
    >
      <div className="surface-launcher-inner">
        <h3>{labels.launcher}</h3>
        <div className="surface-launcher-list">
          {SURFACE_KINDS.map((kind) => {
            const reason = unavailable[kind]
            const highlighted = available[highlight] === kind
            return (
              <button
                key={kind}
                type="button"
                className="surface-launcher-item"
                data-highlighted={highlighted || undefined}
                disabled={reason !== undefined}
                title={reason}
                aria-keyshortcuts={SURFACE_SHORTCUTS[kind]}
                onMouseEnter={() => setHighlight(available.indexOf(kind))}
                onClick={() => onAdd(kind)}
              >
                <SurfaceIcon kind={kind} />
                <span className="grow truncate">{labels.surfaces[kind]}</span>
                <kbd aria-hidden="true">{SURFACE_SHORTCUTS[kind]}</kbd>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 标签栏末尾的「+」：菜单打开时同样支持单键选择。 */
function AddSurfaceMenu({
  labels,
  unavailable,
  onAdd,
}: {
  labels: RightPanelLabels
  unavailable: Partial<Record<SurfaceKind, string>>
  onAdd: (kind: SurfaceKind) => void
}) {
  const [open, setOpen] = useState(false)
  const available = SURFACE_KINDS.filter((kind) => unavailable[kind] === undefined)

  function onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>): void {
    const kind = shortcutKind(event.nativeEvent, available)
    if (!kind) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    onAdd(kind)
  }

  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Menu.Trigger
        className="icon-btn surface-add"
        type="button"
        aria-label={labels.add}
        title={labels.add}
      >
        <Plus className="ic ic-sm" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side="bottom" align="start" sideOffset={6}>
          <Menu.Popup className="menu-popup surface-menu" onKeyDownCapture={onKeyDownCapture}>
            {SURFACE_KINDS.map((kind) => (
              <Menu.Item
                key={kind}
                className="menu-item"
                disabled={unavailable[kind] !== undefined}
                aria-keyshortcuts={SURFACE_SHORTCUTS[kind]}
                onClick={() => onAdd(kind)}
              >
                <SurfaceIcon kind={kind} />
                <span className="grow">{labels.surfaces[kind]}</span>
                <kbd className="menu-kbd" aria-hidden="true">
                  {SURFACE_SHORTCUTS[kind]}
                </kbd>
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** 右侧面板；标签与激活状态完全受控。 */
export function RightPanel({
  threadId,
  surfaces,
  activeId,
  onActivate,
  onClose,
  onAdd,
  unavailable = {},
  controls,
  labels: overrides,
  children,
}: RightPanelProps) {
  const labels: RightPanelLabels = {
    ...DEFAULT_RIGHT_PANEL_LABELS,
    ...overrides,
    surfaces: { ...DEFAULT_RIGHT_PANEL_LABELS.surfaces, ...overrides?.surfaces },
  }
  const tablist = useRef<HTMLDivElement | null>(null)
  const activeTitle = surfaces.find((surface) => surface.id === activeId)?.title

  // 标签多到需要横向滚动时，保证当前标签可见；标题变长（浏览器换成主机名）也要重新滚动。
  useEffect(() => {
    if (!activeId) return
    const tab = Array.from(tablist.current?.children ?? []).find((element) =>
      element.querySelector(`[id="surface-tab-${activeId}"]`),
    )
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" })
  }, [activeId, activeTitle, surfaces.length])

  return (
    <aside className="right-panel" aria-label={labels.panel} data-thread-id={threadId}>
      <div className="right-panel-bar">
        <div className="surface-tabs" role="tablist" aria-label={labels.tabs} ref={tablist}>
          {surfaces.map((surface) => {
            const active = surface.id === activeId
            return (
              <div
                key={surface.id}
                className="surface-tab"
                data-active={active || undefined}
                data-kind={surface.kind}
                role="presentation"
                onAuxClick={(event) => {
                  if (event.button !== 1) return
                  event.preventDefault()
                  onClose(surface.id)
                }}
              >
                <button
                  type="button"
                  className="surface-tab-close"
                  aria-label={`${labels.close} ${surface.title}`}
                  title={`${labels.close} ${surface.title}`}
                  onClick={() => onClose(surface.id)}
                >
                  <span className="surface-tab-icon">
                    <SurfaceIcon kind={surface.kind} />
                  </span>
                  <X className="ic ic-sm surface-tab-x" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  role="tab"
                  id={`surface-tab-${surface.id}`}
                  className="surface-tab-label"
                  aria-selected={active}
                  aria-controls="right-panel-body"
                  onClick={() => onActivate(surface.id)}
                >
                  <span className="truncate">{surface.title}</span>
                </button>
              </div>
            )
          })}
        </div>
        <AddSurfaceMenu labels={labels} unavailable={unavailable} onAdd={onAdd} />
        <span className="right-panel-drag" />
        {controls}
      </div>
      <div
        className="right-panel-body"
        id="right-panel-body"
        role="tabpanel"
        {...(activeId ? { "aria-labelledby": `surface-tab-${activeId}` } : {})}
      >
        {activeId === null ? (
          <SurfaceLauncher labels={labels} unavailable={unavailable} onAdd={onAdd} />
        ) : null}
        {children}
      </div>
    </aside>
  )
}
