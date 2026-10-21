/** 工作区侧栏：主导航、项目与会话列表。 */
import type { Project, Thread } from "@pigcode/contracts"
import { Button, formatShortcut, useLocale } from "@pigcode/ui-primitives"
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
}: WorkspaceSidebarProps) {
  const { t, locale } = useLocale()
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
        <span>{t("nav.projects")}</span>
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
      {projects.map((project) => {
        const open = expandedProjects[project.id] ?? true
        const projectThreads = threads.filter(
          (thread) => thread.projectId === project.id && thread.archivedAt === null,
        )
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
                {projectThreads.map((thread) => {
                  const active = thread.id === activeThreadId
                  const status = threadStatus[thread.id] ?? "idle"
                  const statusKey = THREAD_STATUS_MESSAGE[status]
                  return (
                    <Button
                      variant="plain"
                      key={thread.id}
                      className={active ? "sess is-active" : "sess"}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      data-status={status}
                      onClick={() => onOpenThread(thread.id)}
                    >
                      <span className="sess-dot" data-status={status} />
                      {statusKey ? <span className="sr-only">{t(statusKey)}</span> : null}
                      <span className="sess-title truncate">{thread.title}</span>
                      <span className="sess-provider">{providerMark(thread)}</span>
                      <time dateTime={thread.updatedAt}>
                        {formatThreadTime(thread.updatedAt, locale)}
                      </time>
                    </Button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      })}
    </>
  )
}
