/** 右侧面板文案：把 locale key 映射成各 surface 与布局按钮的 labels。 */
import type { MessageKey } from "@pigcode/ui-primitives"
import type {
  BrowserViewLabels,
  PanelLayoutLabels,
  PrPanelLabels,
  RightPanelLabels,
  SurfaceKind,
} from "@pigcode/ui-workbench"

/** useLocale() 暴露的 t 函数签名。 */
export type Translate = (key: MessageKey) => string

/** surface 种类名称。 */
export function surfaceLabels(t: Translate): Record<SurfaceKind, string> {
  return {
    browser: t("workbench.browser"),
    terminal: t("workbench.terminal"),
    files: t("workbench.files"),
    diff: t("workbench.diff"),
    pr: t("workbench.pr"),
    checkpoint: t("workbench.checkpoint"),
  }
}

/** 右侧面板框架文案。 */
export function rightPanelLabels(t: Translate): RightPanelLabels {
  return {
    panel: t("panel.label"),
    tabs: t("panel.tabs"),
    launcher: t("panel.launcher"),
    add: t("panel.add"),
    close: t("panel.close"),
    surfaces: surfaceLabels(t),
  }
}

/** 新标签的标题；终端与浏览器按序号区分。 */
export function surfaceTitle(t: Translate, kind: SurfaceKind, index: number): string {
  const name = surfaceLabels(t)[kind]
  if (kind === "terminal") return `${name} ${index}`
  if (kind === "browser" && index > 1) return `${name} ${index}`
  return name
}

/** 布局按钮文案。 */
export function layoutLabels(t: Translate): PanelLayoutLabels {
  return {
    maximize: t("panel.maximize"),
    restore: t("panel.restore"),
    terminal: t("panel.toggleTerminal"),
    right: t("panel.toggleRight"),
  }
}

/** 浏览器文案。 */
export function browserLabels(t: Translate): BrowserViewLabels {
  return {
    address: t("browser.address"),
    back: t("browser.back"),
    forward: t("browser.forward"),
    reload: t("browser.reload"),
    external: t("browser.external"),
    empty: t("browser.empty"),
    emptyHint: t("browser.emptyHint"),
    invalid: t("preview.invalid"),
    bridgeMissing: t("preview.bridgeMissing"),
    agent: t("browser.agent"),
    actions: {
      open: t("browser.action.open"),
      navigate: t("browser.action.navigate"),
      back: t("browser.action.back"),
      forward: t("browser.action.forward"),
      reload: t("browser.action.reload"),
      snapshot: t("browser.action.snapshot"),
      click: t("browser.action.click"),
      type: t("browser.action.type"),
      press: t("browser.action.press"),
      scroll: t("browser.action.scroll"),
      wait: t("browser.action.wait"),
      evaluate: t("browser.action.evaluate"),
      screenshot: t("browser.action.screenshot"),
    },
  }
}

/** PR 面板文案。 */
export function prPanelLabels(t: Translate): PrPanelLabels {
  return {
    empty: t("pr.empty"),
    loading: t("pr.loading"),
    title: t("pr.title"),
    titlePlaceholder: t("pr.titlePlaceholder"),
    body: t("pr.body"),
    bodyPlaceholder: t("pr.bodyPlaceholder"),
    base: t("pr.base"),
    basePlaceholder: t("pr.basePlaceholder"),
    create: t("pr.create"),
    creating: t("pr.creating"),
  }
}
