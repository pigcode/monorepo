/** 右侧面板容器：把浏览器、终端、文件、Diff、PR 与检查点 surface 接到 Host RPC。 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { Plus, Trash2 } from "lucide-react"
import type { Connection } from "@pigcode/client-runtime"
import type { PullRequestInfo } from "@pigcode/contracts"
import { Button, useLocale } from "@pigcode/ui-primitives"
import {
  BrowserView,
  CheckpointPanel,
  DiffView,
  FilePreview,
  FileTree,
  PrPanel,
  RightPanel,
  WorktreePicker,
  addSurface,
  closeSurface,
  renameSurface,
  type CheckpointPhase,
  type FilePreviewFile,
  type PanelSurfaceState,
  type PrCreateInput,
  type SurfaceKind,
} from "@pigcode/ui-workbench"
import { TerminalSurface } from "./terminal-surface"
import { browserLabels, prPanelLabels, rightPanelLabels, surfaceTitle } from "./workbench-labels"

/** 右侧面板属性；标签状态由 App 按线程保存，线程切换时父组件用 key 重新挂载以释放终端。 */
export interface WorkbenchPanelProps {
  connection: Connection
  threadId: string
  panel: PanelSurfaceState
  onPanelChange: (update: (state: PanelSurfaceState) => PanelSurfaceState) => void
  /** 标签栏右侧的布局按钮。 */
  controls?: ReactNode
  onError: (message: string) => void
}

let surfaceSeq = 0

/** 生成 surface id；只需在本窗口内唯一。 */
function nextSurfaceId(): string {
  surfaceSeq += 1
  return `surface-${surfaceSeq}`
}

/** workspace.tree 返回的条目。 */
interface WorkspaceEntry {
  path: string
}

/** checkpoint.list 返回的记录；只保留 UI 需要的字段。 */
interface CheckpointRecord {
  id: string
  runId: string | null
  phase: CheckpointPhase
  commitSha: string | null
  label: string | null
  createdAt: string
}

/** worktree.create/switch 返回的记录。 */
interface WorktreeRecord {
  id: string
  path: string
  branch: string | null
}

/** 把 unknown 错误转成可展示文本。 */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 带结果类型的 RPC 调用；方法名与参数由 contracts 校验。 */
async function callRpc<T>(connection: Connection, method: string, params: unknown): Promise<T> {
  return (await connection.call(method, params)) as T
}

/** 右侧面板；文件、Diff、PR 的数据只在对应标签激活时加载，终端与浏览器标签切走后保持挂载。 */
export function WorkbenchPanel({
  connection,
  threadId,
  panel,
  onPanelChange,
  controls,
  onError,
}: WorkbenchPanelProps) {
  const { t } = useLocale()
  const tab: SurfaceKind | null =
    panel.surfaces.find((surface) => surface.id === panel.activeId)?.kind ?? null
  const [entries, setEntries] = useState<WorkspaceEntry[]>([])
  const [treeError, setTreeError] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [file, setFile] = useState<FilePreviewFile | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const [checkpoints, setCheckpoints] = useState<CheckpointRecord[]>([])
  const [checkpointError, setCheckpointError] = useState<string | null>(null)
  const [checkpointBusy, setCheckpointBusy] = useState(false)
  const [diff, setDiff] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [diffBase, setDiffBase] = useState<string | null>(null)
  const [worktrees, setWorktrees] = useState<WorktreeRecord[]>([])
  const [activeWorktree, setActiveWorktree] = useState<string | null>(null)
  const [worktreeBusy, setWorktreeBusy] = useState(false)
  const [pullRequest, setPullRequest] = useState<PullRequestInfo | null>(null)
  const [prLoading, setPrLoading] = useState(false)
  const [prCreating, setPrCreating] = useState(false)
  const [prError, setPrError] = useState<string | null>(null)

  // 文件树：每次进入文件标签都重新读取，反映终端或外部编辑后的状态。
  useEffect(() => {
    if (tab !== "files") return undefined
    let cancelled = false
    setTreeError(null)
    void callRpc<WorkspaceEntry[]>(connection, "workspace.tree", { threadId })
      .then((list) => {
        if (!cancelled) setEntries(list)
      })
      .catch((error: unknown) => {
        if (!cancelled) setTreeError(messageOf(error))
      })
    return () => {
      cancelled = true
    }
  }, [tab, threadId, connection])

  // 选中文件后通过 Host 读取，Renderer 不触碰磁盘。
  useEffect(() => {
    if (!selectedPath) {
      setFile(null)
      setFileError(null)
      return undefined
    }
    let cancelled = false
    setFileLoading(true)
    setFileError(null)
    void callRpc<FilePreviewFile>(connection, "workspace.readFile", {
      threadId,
      path: selectedPath,
    })
      .then((result) => {
        if (!cancelled) setFile(result)
      })
      .catch((error: unknown) => {
        if (!cancelled) setFileError(messageOf(error))
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedPath, threadId, connection])

  /** 重新拉取 checkpoint 列表；Diff 与 Checkpoint tab 共用。 */
  const refreshCheckpoints = useCallback(async (): Promise<void> => {
    const list = await callRpc<CheckpointRecord[]>(connection, "checkpoint.list", { threadId })
    setCheckpoints(list)
  }, [connection, threadId])

  useEffect(() => {
    setCheckpointError(null)
    void refreshCheckpoints().catch((error: unknown) => setCheckpointError(messageOf(error)))
  }, [refreshCheckpoints])

  /** checkpoint 提交落盘的 commit；Diff 的基准与目标只从这里取。 */
  const committed = useMemo(
    () => checkpoints.filter((checkpoint) => checkpoint.commitSha !== null),
    [checkpoints],
  )
  const defaultBase = useMemo(() => {
    const baselines = committed.filter((checkpoint) => checkpoint.phase === "baseline")
    return baselines[baselines.length - 1]?.commitSha ?? null
  }, [committed])
  const headSha = useMemo(() => {
    const finals = committed.filter((checkpoint) => checkpoint.phase !== "baseline")
    return finals[finals.length - 1]?.commitSha ?? "HEAD"
  }, [committed])
  const baseSha = diffBase ?? defaultBase

  // Diff：选中 checkpoint 作基准，未选中时用最近 run 的 baseline/final。
  useEffect(() => {
    if (tab !== "diff") return undefined
    let cancelled = false
    setDiffLoading(true)
    setDiffError(null)
    void callRpc<string>(connection, "git.diff", {
      threadId,
      base: baseSha ?? "HEAD",
      head: headSha,
    })
      .then((text) => {
        if (!cancelled) setDiff(text)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDiff("")
          setDiffError(messageOf(error))
        }
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, threadId, connection, baseSha, headSha])

  // PR：进入 tab 时查询当前分支；没有 PR 与 gh 错误都作为面板状态展示。
  useEffect(() => {
    if (tab !== "pr") return undefined
    let cancelled = false
    setPrLoading(true)
    setPrError(null)
    void callRpc<PullRequestInfo | null>(connection, "pr.status", { threadId })
      .then((info) => {
        if (!cancelled) setPullRequest(info)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPullRequest(null)
          setPrError(messageOf(error))
        }
      })
      .finally(() => {
        if (!cancelled) setPrLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [tab, threadId, connection])

  async function createCheckpoint(): Promise<void> {
    setCheckpointBusy(true)
    setCheckpointError(null)
    try {
      await connection.call("checkpoint.create", { threadId })
      await refreshCheckpoints()
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setCheckpointBusy(false)
    }
  }

  async function restoreCheckpoint(checkpointId: string): Promise<void> {
    setCheckpointBusy(true)
    setCheckpointError(null)
    try {
      await connection.call("checkpoint.restore", { threadId, checkpointId })
      await refreshCheckpoints()
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setCheckpointBusy(false)
    }
  }

  /** 创建 PR；成功后替换状态卡，失败时把错误交给面板展示。 */
  async function createPullRequest(input: PrCreateInput): Promise<void> {
    setPrCreating(true)
    setPrError(null)
    try {
      setPullRequest(
        await callRpc<PullRequestInfo>(connection, "pr.create", { threadId, ...input }),
      )
    } catch (error) {
      setPrError(messageOf(error))
      throw error
    } finally {
      setPrCreating(false)
    }
  }

  /** worktree 列表没有 list RPC；这里只保留本次会话内创建过的记录。 */
  async function createWorktree(): Promise<void> {
    setWorktreeBusy(true)
    try {
      const worktree = await callRpc<WorktreeRecord>(connection, "worktree.create", { threadId })
      setWorktrees((current) => [
        ...current.filter((item) => item.path !== worktree.path),
        worktree,
      ])
      setActiveWorktree(worktree.path)
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setWorktreeBusy(false)
    }
  }

  async function switchWorktree(path: string): Promise<void> {
    setWorktreeBusy(true)
    try {
      const worktree = await callRpc<WorktreeRecord>(connection, "worktree.switch", {
        threadId,
        path,
      })
      setActiveWorktree(worktree.path)
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setWorktreeBusy(false)
    }
  }

  async function removeWorktree(): Promise<void> {
    setWorktreeBusy(true)
    try {
      await connection.call("worktree.remove", { threadId })
      setWorktrees((current) => current.filter((item) => item.path !== activeWorktree))
      setActiveWorktree(null)
    } catch (error) {
      onError(messageOf(error))
    } finally {
      setWorktreeBusy(false)
    }
  }

  const labels = rightPanelLabels(t)
  const prLabels = prPanelLabels(t)
  const webLabels = browserLabels(t)

  function add(kind: SurfaceKind): void {
    onPanelChange((state) =>
      addSurface(state, kind, nextSurfaceId(), (index) => surfaceTitle(t, kind, index)),
    )
  }

  function close(id: string): void {
    onPanelChange((state) => closeSurface(state, id))
  }

  function retitleBrowser(id: string, url: string): void {
    onPanelChange((state) => renameSurface(state, id, new URL(url).host))
  }

  const content: Record<"files" | "diff" | "checkpoint" | "pr", ReactNode> = {
    files: (
      <div className="workbench-files">
        <div className="workbench-worktree-compact">
          <WorktreePicker
            worktrees={worktrees}
            activePath={activeWorktree}
            onCreate={createWorktree}
            onSwitch={switchWorktree}
            onRemove={removeWorktree}
            busy={worktreeBusy}
            compact
          />
        </div>
        {treeError ? (
          <p className="workbench-error">{treeError}</p>
        ) : (
          <FileTree entries={entries} selectedPath={selectedPath} onSelect={setSelectedPath} />
        )}
        <FilePreview file={file} loading={fileLoading} error={fileError} />
      </div>
    ),
    diff: (
      <div className="workbench-diff">
        {committed.length > 0 ? (
          <label className="workbench-diff-base">
            <span>{t("workbench.diffBase")}</span>
            <select
              value={baseSha ?? ""}
              onChange={(event) => setDiffBase(event.target.value || null)}
            >
              {[...committed].reverse().map((checkpoint) => (
                <option key={checkpoint.id} value={checkpoint.commitSha ?? ""}>
                  {checkpoint.label ?? checkpoint.phase} · {checkpoint.createdAt}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {diffError ? (
          <p className="workbench-error">{diffError}</p>
        ) : diffLoading ? (
          <p className="workbench-empty">正在读取 diff…</p>
        ) : (
          <DiffView diff={diff} />
        )}
      </div>
    ),
    checkpoint: (
      <div className="workbench-checkpoints">
        <header className="workbench-section-header">
          <span>{t("workbench.checkpoint")}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={checkpointBusy}
            onClick={() => void createCheckpoint()}
          >
            {t("workbench.createCheckpoint")}
          </Button>
        </header>
        {checkpointError ? <p className="workbench-error">{checkpointError}</p> : null}
        <CheckpointPanel
          checkpoints={checkpoints}
          onRestore={restoreCheckpoint}
          restoring={checkpointBusy}
        />
      </div>
    ),
    pr: (
      <PrPanel
        pullRequest={pullRequest}
        loading={prLoading}
        creating={prCreating}
        error={prError}
        onCreate={createPullRequest}
        labels={prLabels}
      />
    ),
  }

  return (
    <div className="workbench">
      <RightPanel
        threadId={threadId}
        surfaces={panel.surfaces}
        activeId={panel.activeId}
        onActivate={(id) => onPanelChange((state) => ({ ...state, activeId: id }))}
        onClose={close}
        onAdd={add}
        controls={controls}
        labels={labels}
      >
        {panel.surfaces.map((surface) => {
          const active = surface.id === panel.activeId
          if (surface.kind === "terminal") {
            return (
              <div key={surface.id} className="surface-pane" hidden={!active}>
                <TerminalSurface
                  connection={connection}
                  threadId={threadId}
                  active={active}
                  tools={
                    <>
                      <Button
                        variant="plain"
                        size="icon"
                        type="button"
                        aria-label={t("terminal.new")}
                        title={t("terminal.new")}
                        onClick={() => add("terminal")}
                      >
                        <Plus className="ic ic-sm" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="plain"
                        size="icon"
                        type="button"
                        aria-label={t("terminal.kill")}
                        title={t("terminal.kill")}
                        onClick={() => close(surface.id)}
                      >
                        <Trash2 className="ic ic-sm" aria-hidden="true" />
                      </Button>
                    </>
                  }
                />
              </div>
            )
          }
          if (surface.kind === "browser") {
            return (
              <div key={surface.id} className="surface-pane" hidden={!active}>
                <BrowserView
                  labels={webLabels}
                  onNavigate={(url) => retitleBrowser(surface.id, url)}
                />
              </div>
            )
          }
          if (!active) return null
          return (
            <div key={surface.id} className="surface-pane surface-scroll">
              {content[surface.kind]}
            </div>
          )
        })}
      </RightPanel>
    </div>
  )
}
