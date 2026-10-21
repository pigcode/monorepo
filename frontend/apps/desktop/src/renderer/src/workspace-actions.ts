/** 侧栏右键菜单里对会话的操作：先让 Host 落库，再把返回的记录写回 store。 */
import type { Thread } from "@pigcode/contracts"
import type { AppStore, Connection } from "@pigcode/client-runtime"

/** 用 Host 返回的记录替换 store 里的同一个会话。 */
function replaceThread(store: AppStore, thread: Thread): void {
  store.update({
    threads: store.getSnapshot().threads.map((item) => (item.id === thread.id ? thread : item)),
  })
}

/** 重命名会话；没打开过的会话收不到 thread.updated，所以直接用返回值更新侧栏。 */
export async function renameThread(
  connection: Connection,
  store: AppStore,
  threadId: string,
  title: string,
): Promise<void> {
  const thread = (await connection.call("thread.rename", { threadId, title })) as Thread
  replaceThread(store, thread)
}

/** 归档后接着看的会话：同一项目里最近更新的，没有时取所有项目里最近的。 */
function nextThread(store: AppStore, archived: Thread): string | null {
  const { threads, projects } = store.getSnapshot()
  const known = new Set(projects.map((project) => project.id))
  const live = threads
    .filter((thread) => thread.archivedAt === null && known.has(thread.projectId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  return (live.find((thread) => thread.projectId === archived.projectId) ?? live[0])?.id ?? null
}

/**
 * 归档会话并退订它的事件。归档的是正在看的会话时，返回接下来要打开的会话；
 * 否则或者已经没有别的会话时返回 null。
 */
export async function archiveThread(
  connection: Connection,
  store: AppStore,
  threadId: string,
): Promise<string | null> {
  const archived = (await connection.call("thread.archive", { threadId })) as Thread
  replaceThread(store, archived)
  const wasActive = store.getSnapshot().activeThreadId === threadId
  store.closeThread(threadId)
  void connection.closeThread(threadId).catch(() => undefined)
  return wasActive ? nextThread(store, archived) : null
}
