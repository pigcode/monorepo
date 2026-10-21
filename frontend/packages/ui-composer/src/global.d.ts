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
    previewOpen(url: string): Promise<{ id: string }>
    previewClose(id?: string): void
  }
}
