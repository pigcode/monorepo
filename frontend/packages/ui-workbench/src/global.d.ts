/** preload 暴露的最小原生桥；渲染进程不直接访问 Node。 */
interface Window {
  pigcodeNative?: {
    platform: string
    setThemeSource(source: "light" | "dark" | "system"): Promise<void>
    windowControl(action: "minimize" | "maximize" | "close"): Promise<void>
    isMaximized(): Promise<boolean>
    isFullScreen?(): Promise<boolean>
    onFullScreenChange?(listener: (fullScreen: boolean) => void): () => void
    setTitleBarColors?(colors: { color: string; symbolColor: string }): Promise<void>
    popupMenu?(
      items: ReadonlyArray<
        | { type: "separator" }
        | { id: string; label: string; accelerator?: string; enabled?: boolean }
        | { role: string; label?: string }
      >,
      position: { x: number; y: number },
    ): Promise<string | null>
    pickFolder?(labels?: { title?: string; buttonLabel?: string }): Promise<string | null>
    /** 在系统文件管理器里打开文件夹；不是已存在的目录时拒绝。 */
    openFolder?(path: string): Promise<void>
    /** 本机装了、能用 URL 打开文件夹的编辑器。 */
    listEditors?(): Promise<Array<{ id: string; name: string }>>
    openInEditor?(editorId: string, path: string): Promise<void>
    previewOpen(url: string): Promise<{ id: string }>
    previewClose(id?: string): void
  }
}

/** 与 ui-primitives 保持一致的 Vite 环境声明，供跨包 typecheck 使用。 */
interface ImportMetaEnv {
  readonly DEV: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
