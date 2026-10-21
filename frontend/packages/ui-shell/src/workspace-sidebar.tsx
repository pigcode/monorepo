/** 工作区侧栏：项目分组下的会话列表，每行一个状态点、标题和相对时间。 */
import type { Project, Thread } from "@pigcode/contracts"
import { Button, useLocale } from "@pigcode/ui-primitives"
import { Icon } from "./icon"
import type { ThreadTabStatus } from "./thread-tabs"

/** 工作区侧栏所需的数据与事件；数据由 store 传入。 */
export interface WorkspaceSidebarProps {
  projects: Project[]
  threads: Thread[]
  activeThreadId: string | null
  threadStatus?: Record<string, ThreadTabStatus> | undefined
  expandedProjects: Record<string, boolean>
  onAddProject: () => void
  onToggleProject: (projectId: string, expanded: boolean) => void
  onOpenThread: (threadId: string) => void
  onNewThread: (projectId?: string) => void
  onOpenSettings?: () => void
  /** 搜索入口现在位于侧栏顶部；保留以兼容旧调用方。 */
  onSearch?: () => void
}

/** 把 provider id 变成可读名字；未知 id 原样显示。 */
export function providerLabel(thread: Thread): string {
  const id = thread.lastProviderId ?? thread.defaultProviderId
  if (id === "claude") return "Claude"
  if (id === "codex") return "Codex"
  return id
}

/** 把线程更新时间压成「2m / 3h / 5d」这样的短标记；超过一周显示月日。 */
export function formatThreadTime(value: string, locale: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return locale.startsWith("zh") ? "刚刚" : "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
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
}: WorkspaceSidebarProps) {
  const { t, locale } = useLocale()
  return (
    <>
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
      <Button
        variant="plain"
        className="side-row side-row-add"
        type="button"
        onClick={onAddProject}
      >
        <Icon name="plus" small />
        <span className="grow">{t("nav.addProject")}</span>
      </Button>
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
                title={project.rootPath}
                onClick={() => onToggleProject(project.id, !open)}
              >
                <Icon name="folder" small className="proj-folder" />
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
                  return (
                    <Button
                      variant="plain"
                      key={thread.id}
                      className={active ? "sess is-active" : "sess"}
                      type="button"
                      aria-current={active ? "page" : undefined}
                      data-status={status}
                      title={`${thread.title} · ${providerLabel(thread)}`}
                      onClick={() => onOpenThread(thread.id)}
                    >
                      <span className="sess-dot" data-status={status} aria-hidden="true" />
                      <span className="sess-title truncate">{thread.title}</span>
                      <time className="sess-time num">
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
