/** 工作区侧栏：主导航、项目与会话列表；会话可按项目分组或按时间排成一列。 */
import { useRef, useState } from "react"
import type { Project, Thread } from "@pigcode/contracts"
import {
  Button,
  ContextMenu,
  Menu,
  formatShortcut,
  useLocale,
  useSidebarGrouping,
  type SidebarGrouping,
} from "@pigcode/ui-primitives"
import { Icon } from "./icon"
import { THREAD_STATUS_MESSAGE, type ThreadStatus } from "./thread-status"

/** 工作区侧栏所需的数据与事件；数据由 store 传入。 */
export interface WorkspaceSidebarProps {
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  threadStatus?: Record<string, ThreadStatus> | undefined
  expandedProjects: Record<string, boolean>
  onAddProject: () => void
  onToggleProject: (projectId: string, expanded: boolean) => void
  onOpenThread: (threadId: string) => void
  onNewThread: (projectId?: string) => void
  onOpenSettings?: () => void
  /** 定时任务入口；不传时不显示。 */
  onOpenSchedules?: () => void
  /** 插件入口；不传时不显示。 */
  onOpenPlugins?: () => void
  /** 右键菜单里的重命名与归档；两个都传时会话行才有右键菜单。 */
  onRenameThread?: ((threadId: string, title: string) => void) | undefined
  onArchiveThread?: ((threadId: string) => void) | undefined
  /** 按住 ⌘/Ctrl 时在前九个会话上显示数字快捷键。 */
  shortcutHints?: boolean
}

/** 侧栏里从上到下可见的会话；⌘/Ctrl+数字按这个顺序跳转。 */
export function visibleThreads(
  projects: readonly Project[],
  threads: readonly Thread[],
  grouping: SidebarGrouping,
  expandedProjects: Record<string, boolean>,
): Thread[] {
  const known = new Set(projects.map((project) => project.id))
  const live = threads.filter((thread) => thread.archivedAt === null && known.has(thread.projectId))
  if (grouping === "time") {
    return [...live].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }
  return projects.flatMap((project) =>
    (expandedProjects[project.id] ?? true)
      ? live.filter((thread) => thread.projectId === project.id)
      : [],
  )
}

/** 把 provider id 缩成侧栏可读的短标记。 */
function providerMark(thread: Thread): string {
  const id = thread.lastProviderId ?? thread.defaultProviderId
  if (id === "claude") return "CL"
  if (id === "codex") return "CX"
  return id.slice(0, 2).toUpperCase()
}

/** 把线程更新时间格式化成「刚刚 / 3分钟 / 2小时 / 5天」这样常驻显示的短文本。 */
export function formatThreadTime(value: string, locale: string, now = Date.now()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const zh = locale.startsWith("zh")
  const minutes = Math.floor((now - date.getTime()) / 60_000)
  if (minutes < 1) return zh ? "刚刚" : "now"
  if (minutes < 60) return zh ? `${minutes}分钟` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return zh ? `${hours}小时` : `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return zh ? `${days}天` : `${days}d`
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date)
}

/** 会话行右键菜单的动作。 */
interface ThreadActions {
  onStartRename: () => void
  onRename: (title: string) => void
  onCancelRename: () => void
  onArchive: () => void
}

/** 改名输入框：回车或失焦提交，Esc 取消；没有改动时等同取消。 */
function RenameInput({
  title,
  onRename,
  onCancel,
}: {
  title: string
  onRename: (title: string) => void
  onCancel: () => void
}) {
  const { t } = useLocale()
  const done = useRef(false)
  function finish(value: string | null): void {
    if (done.current) return
    done.current = true
    const next = value?.trim() ?? ""
    if (next && next !== title) onRename(next)
    else onCancel()
  }
  return (
    <input
      className="sess-rename"
      defaultValue={title}
      autoFocus
      maxLength={120}
      aria-label={t("sidebar.threadName")}
      onFocus={(event) => event.currentTarget.select()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          finish(event.currentTarget.value)
        } else if (event.key === "Escape") {
          event.preventDefault()
          finish(null)
        }
      }}
      onBlur={(event) => finish(event.currentTarget.value)}
    />
  )
}

/** 一行会话：状态点、标题、补充信息（provider 或项目名）与时间；按住 ⌘/Ctrl 时时间换成快捷键。 */
function ThreadRow({
  thread,
  active,
  status,
  detail,
  detailClass,
  shortcut,
  editing,
  actions,
  onOpen,
}: {
  thread: Thread
  active: boolean
  status: ThreadStatus
  detail: string
  detailClass: string
  shortcut: string | null
  editing: boolean
  actions: ThreadActions | null
  onOpen: () => void
}) {
  const { t, locale } = useLocale()
  const statusKey = THREAD_STATUS_MESSAGE[status]
  if (editing && actions) {
    return (
      <div className="sess is-editing" data-status={status}>
        <span className="sess-dot" data-status={status} />
        <RenameInput title={thread.title} onRename={actions.onRename} onCancel={actions.onCancelRename} />
      </div>
    )
  }
  const row = (
    <Button
      variant="plain"
      className={active ? "sess is-active" : "sess"}
      type="button"
      aria-current={active ? "page" : undefined}
      data-status={status}
      onClick={onOpen}
    >
      <span className="sess-dot" data-status={status} />
      {statusKey ? <span className="sr-only">{t(statusKey)}</span> : null}
      <span className="sess-title truncate">{thread.title}</span>
      {shortcut ? (
        <kbd className="sess-kbd">{shortcut}</kbd>
      ) : (
        <>
          <span className={`${detailClass} truncate`}>{detail}</span>
          <time dateTime={thread.updatedAt}>{formatThreadTime(thread.updatedAt, locale)}</time>
        </>
      )}
    </Button>
  )
  if (!actions) return row
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className="sess-menu-area">{row}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className="menu-positioner">
          <ContextMenu.Popup className="menu-popup" finalFocus={false}>
            <ContextMenu.Item className="menu-item" onClick={actions.onStartRename}>
              <Icon name="pencil" small />
              <span className="grow">{t("sidebar.rename")}</span>
            </ContextMenu.Item>
            <ContextMenu.Item className="menu-item" onClick={actions.onArchive}>
              <Icon name="archive" small />
              <span className="grow">{t("sidebar.archive")}</span>
            </ContextMenu.Item>
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

/** 「项目」标题旁的排列方式菜单。 */
function GroupingMenu({
  value,
  onChange,
}: {
  value: SidebarGrouping
  onChange: (value: SidebarGrouping) => void
}) {
  const { t } = useLocale()
  const options: Array<{ id: SidebarGrouping; label: string }> = [
    { id: "project", label: t("settings.general.byProject") },
    { id: "time", label: t("settings.general.byTime") },
  ]
  return (
    <Menu.Root>
      <Menu.Trigger
        className="icon-btn"
        type="button"
        aria-label={t("sidebar.grouping")}
        title={t("sidebar.grouping")}
      >
        <Icon name="filter" small />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="menu-popup">
            {options.map((option) => (
              <Menu.Item key={option.id} className="menu-item" onClick={() => onChange(option.id)}>
                <span className="grow">{option.label}</span>
                {option.id === value ? <Icon name="check" small className="check-mark" /> : null}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** 绘制工作区导航，不读取会话内核。 */
export function WorkspaceSidebar({
  projects,
  threads,
  activeThreadId,
  threadStatus = {},
  expandedProjects,
  onAddProject,
  onToggleProject,
  onOpenThread,
  onNewThread,
  onOpenSchedules,
  onOpenPlugins,
  onRenameThread,
  onArchiveThread,
  shortcutHints = false,
}: WorkspaceSidebarProps) {
  const { t } = useLocale()
  const [grouping, setGrouping] = useSidebarGrouping()
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const projectNames = new Map(projects.map((project) => [project.id, project.name]))
  const liveThreads = threads.filter(
    (thread) => thread.archivedAt === null && projectNames.has(thread.projectId),
  )
  const order = visibleThreads(projects, threads, grouping, expandedProjects)
  const shortcutIndex = new Map(order.slice(0, 9).map((thread, index) => [thread.id, index + 1]))
  const actionsFor = (thread: Thread): ThreadActions | null =>
    onRenameThread && onArchiveThread
      ? {
          onStartRename: () => setRenamingId(thread.id),
          onRename: (title) => {
            setRenamingId(null)
            onRenameThread(thread.id, title)
          },
          onCancelRename: () => setRenamingId(null),
          onArchive: () => onArchiveThread(thread.id),
        }
      : null
  const row = (thread: Thread, detail: string, detailClass: string) => {
    const index = shortcutHints ? shortcutIndex.get(thread.id) : undefined
    return (
      <ThreadRow
        key={thread.id}
        thread={thread}
        active={thread.id === activeThreadId}
        status={threadStatus[thread.id] ?? "idle"}
        detail={detail}
        detailClass={detailClass}
        shortcut={index ? formatShortcut(`Mod+${index}`) : null}
        editing={renamingId === thread.id}
        actions={actionsFor(thread)}
        onOpen={() => onOpenThread(thread.id)}
      />
    )
  }

  return (
    <>
      <nav className="side-actions" aria-label={t("nav.projects")}>
        <Button
          variant="plain"
          className="nav-item new-thread-btn"
          type="button"
          aria-label={t("nav.newThread")}
          onClick={() => onNewThread()}
        >
          <Icon name="compose" />
          <span className="grow">{t("nav.newThread")}</span>
          <kbd className="nav-kbd">{formatShortcut("Mod+n")}</kbd>
        </Button>
        {onOpenSchedules ? (
          <Button variant="plain" className="nav-item" type="button" onClick={onOpenSchedules}>
            <Icon name="clock" />
            <span className="grow">{t("settings.schedules")}</span>
          </Button>
        ) : null}
        {onOpenPlugins ? (
          <Button variant="plain" className="nav-item" type="button" onClick={onOpenPlugins}>
            <Icon name="cube" />
            <span className="grow">{t("settings.plugins")}</span>
          </Button>
        ) : null}
      </nav>
      <div className="side-label">
        <span>{grouping === "time" ? t("sidebar.recent") : t("nav.projects")}</span>
        <GroupingMenu value={grouping} onChange={setGrouping} />
        <Button
          variant="plain"
          className="icon-btn"
          type="button"
          aria-label={t("nav.addProject")}
          title={t("nav.addProject")}
          onClick={onAddProject}
        >
          <Icon name="folder-plus" small />
        </Button>
      </div>
      {projects.length === 0 ? (
        <Button
          variant="plain"
          className="nav-item side-add-project"
          type="button"
          onClick={onAddProject}
        >
          <Icon name="plus" />
          <span className="grow">{t("nav.addProject")}</span>
        </Button>
      ) : null}
      {grouping === "time" ? (
        <div className="recent-sessions">
          {projects.length > 0 && liveThreads.length === 0 ? (
            <p className="side-empty">{t("sidebar.noThreads")}</p>
          ) : null}
          {order.map((thread) =>
            row(thread, projectNames.get(thread.projectId) ?? "", "sess-project"),
          )}
        </div>
      ) : (
        projects.map((project) => {
          const open = expandedProjects[project.id] ?? true
          const projectThreads = liveThreads.filter((thread) => thread.projectId === project.id)
          return (
            <div key={project.id} className="proj-block">
              <div className="proj-row">
                <Button
                  variant="plain"
                  className="proj"
                  type="button"
                  aria-expanded={open}
                  onClick={() => onToggleProject(project.id, !open)}
                >
                  <Icon name={open ? "folder-open" : "folder"} className="proj-folder" />
                  <span className="truncate">{project.name}</span>
                </Button>
                <Button
                  variant="plain"
                  className="icon-btn proj-add"
                  type="button"
                  aria-label={t("nav.newThread")}
                  title={t("nav.newThread")}
                  onClick={() => onNewThread(project.id)}
                >
                  <Icon name="plus" small />
                </Button>
              </div>
              {open ? (
                <div className="proj-sessions">
                  {projectThreads.length === 0 ? (
                    <p className="side-empty">{t("sidebar.noThreads")}</p>
                  ) : null}
                  {projectThreads.map((thread) =>
                    row(thread, providerMark(thread), "sess-provider"),
                  )}
                </div>
              ) : null}
            </div>
          )
        })
      )}
    </>
  )
}
