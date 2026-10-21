/** 浏览器 surface：地址栏、前进后退与内嵌的 loopback 页面；也可以在独立窗口打开。 */
import { useState, type FormEvent } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from "lucide-react"
import { Button } from "@pigcode/ui-primitives"

/** 在独立窗口打开页面的原生桥签名；测试可注入替身。 */
export type PreviewOpen = (url: string) => Promise<{ id: string }>

/** 允许的 loopback 主机名；与主进程 preview.ts 的校验保持一致。 */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"])

/** 判断 URL 是否指向本机 http/https。 */
export function isLoopbackUrl(value: string): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  return LOOPBACK_HOSTS.has(url.hostname)
}

/**
 * 把地址栏输入补全为完整 URL：「3000」→ http://localhost:3000，「localhost:5173/a」补上 http://。
 * 不是 loopback 地址时返回 null。
 */
export function normalizeBrowserUrl(input: string): string | null {
  const value = input.trim()
  if (value.length === 0) return null
  let candidate = value
  if (/^\d{2,5}(\/.*)?$/.test(value)) candidate = `http://localhost:${value}`
  else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(value)) candidate = `http://${value}`
  try {
    const url = new URL(candidate)
    return isLoopbackUrl(url.href) ? url.href : null
  } catch {
    return null
  }
}

/** 浏览器文案；容器按 locale 注入。 */
export interface BrowserViewLabels {
  address: string
  back: string
  forward: string
  reload: string
  external: string
  empty: string
  emptyHint: string
  invalid: string
  bridgeMissing: string
}

/** 默认中文文案。 */
export const DEFAULT_BROWSER_LABELS: BrowserViewLabels = {
  address: "输入本地地址，例如 localhost:3000",
  back: "后退",
  forward: "前进",
  reload: "重新加载",
  external: "在新窗口打开",
  empty: "还没有预览",
  emptyHint: "在上方输入本地地址，或先在终端里启动 dev server。",
  invalid: "仅支持本地 http/https 地址（localhost、127.0.0.1、[::1]）",
  bridgeMissing: "当前环境不支持预览窗口",
}

/** 默认通过 preload 暴露的 pigcodeNative 打开窗口。 */
function openInNativeWindow(url: string): Promise<{ id: string }> {
  const bridge = typeof window === "undefined" ? undefined : window.pigcodeNative
  if (!bridge?.previewOpen) return Promise.reject(new Error("PREVIEW_BRIDGE_UNAVAILABLE"))
  return bridge.previewOpen(url)
}

/** 把主进程错误码映射成可读文案；未知错误原样展示。 */
function openError(error: unknown, labels: BrowserViewLabels): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes("PREVIEW_URL_NOT_ALLOWED")) return labels.invalid
  if (message.includes("PREVIEW_BRIDGE_UNAVAILABLE")) return labels.bridgeMissing
  return message
}

/** 浏览器属性。 */
export interface BrowserViewProps {
  initialUrl?: string
  /** 每次导航后回调，容器用主机名更新标签标题。 */
  onNavigate?: (url: string) => void
  openExternal?: PreviewOpen
  labels?: Partial<BrowserViewLabels>
}

/** 浏览器 surface；历史只记录地址栏导航，页面内部跳转留在 iframe 里。 */
export function BrowserView({
  initialUrl,
  onNavigate,
  openExternal = openInNativeWindow,
  labels: overrides,
}: BrowserViewProps) {
  const labels: BrowserViewLabels = { ...DEFAULT_BROWSER_LABELS, ...overrides }
  const initial = initialUrl ? normalizeBrowserUrl(initialUrl) : null
  const [history, setHistory] = useState<string[]>(initial ? [initial] : [])
  const [index, setIndex] = useState(initial ? 0 : -1)
  const [reloads, setReloads] = useState(0)
  const [address, setAddress] = useState(initial ?? "")
  const [error, setError] = useState<string | null>(null)
  const current = history[index] ?? null

  function go(nextIndex: number): void {
    const url = history[nextIndex]
    if (url === undefined) return
    setIndex(nextIndex)
    setAddress(url)
    setError(null)
    onNavigate?.(url)
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const url = normalizeBrowserUrl(address)
    if (!url) {
      setError(labels.invalid)
      return
    }
    setError(null)
    setAddress(url)
    if (url === current) {
      setReloads((value) => value + 1)
      return
    }
    setHistory((list) => [...list.slice(0, index + 1), url])
    setIndex(index + 1)
    onNavigate?.(url)
  }

  async function openWindow(): Promise<void> {
    if (!current) return
    setError(null)
    try {
      await openExternal(current)
    } catch (cause) {
      setError(openError(cause, labels))
    }
  }

  return (
    <div className="browser-view">
      <div className="browser-toolbar">
        <Button
          variant="plain"
          size="icon"
          type="button"
          aria-label={labels.back}
          title={labels.back}
          disabled={index <= 0}
          onClick={() => go(index - 1)}
        >
          <ArrowLeft className="ic ic-sm" aria-hidden="true" />
        </Button>
        <Button
          variant="plain"
          size="icon"
          type="button"
          aria-label={labels.forward}
          title={labels.forward}
          disabled={index >= history.length - 1}
          onClick={() => go(index + 1)}
        >
          <ArrowRight className="ic ic-sm" aria-hidden="true" />
        </Button>
        <Button
          variant="plain"
          size="icon"
          type="button"
          aria-label={labels.reload}
          title={labels.reload}
          disabled={!current}
          onClick={() => setReloads((value) => value + 1)}
        >
          <RotateCw className="ic ic-sm" aria-hidden="true" />
        </Button>
        <form className="browser-address" onSubmit={submit}>
          <input
            type="text"
            value={address}
            placeholder={labels.address}
            aria-label={labels.address}
            aria-invalid={error === labels.invalid || undefined}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setAddress(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
          />
        </form>
        <Button
          variant="plain"
          size="icon"
          type="button"
          aria-label={labels.external}
          title={labels.external}
          disabled={!current}
          onClick={() => void openWindow()}
        >
          <ExternalLink className="ic ic-sm" aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p className="browser-error" role="alert">
          {error}
        </p>
      ) : null}
      {current ? (
        <iframe
          key={`${index}:${reloads}`}
          className="browser-frame"
          src={current}
          title={current}
          sandbox="allow-scripts allow-forms allow-same-origin allow-modals allow-downloads"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="browser-empty">
          <span className="browser-empty-icon">
            <Globe className="ic" aria-hidden="true" />
          </span>
          <strong>{labels.empty}</strong>
          <p>{labels.emptyHint}</p>
        </div>
      )}
    </div>
  )
}
