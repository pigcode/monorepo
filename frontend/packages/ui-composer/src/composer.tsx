// 负责会话输入区：TipTap 正文、权限、模型和思考深度菜单，以及发送/停止按钮。
import { Placeholder } from "@tiptap/extension-placeholder"
import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import {
  ArrowUp,
  Check,
  ChevronDown,
  Hand,
  Infinity as InfinityIcon,
  ListChecks,
  Plus,
  Square,
  type LucideIcon,
} from "lucide-react"
import { useEffect, useMemo, useRef, type ReactNode } from "react"
import { Button, Menu, useLocale, type MessageKey } from "@pigcode/ui-primitives"
import {
  getComposerKeyAction,
  permissionModes,
  thinkingDepths,
  type PermissionMode,
  type ThinkingDepth,
} from "./composer-options"
import { createSmartPunctuation } from "./smart-punctuation"

/** 权限模式对应的 locale key。 */
const permissionKeys: Record<PermissionMode, { label: MessageKey; description: MessageKey }> = {
  ask: { label: "composer.permission.ask", description: "composer.permission.ask.description" },
  edit: {
    label: "composer.permission.edit",
    description: "composer.permission.edit.description",
  },
  plan: {
    label: "composer.permission.plan",
    description: "composer.permission.plan.description",
  },
}

/** 权限模式的图标：询问用手势，自动改文件用 ∞，只做计划用清单。 */
const permissionIcons: Record<PermissionMode, LucideIcon> = {
  ask: Hand,
  edit: InfinityIcon,
  plan: ListChecks,
}

/** 思考深度对应的 locale key。 */
const depthKeys: Record<ThinkingDepth, MessageKey> = {
  off: "composer.depth.off",
  low: "composer.depth.low",
  medium: "composer.depth.medium",
  high: "composer.depth.high",
  max: "composer.depth.max",
}

/** 会话输入区 props；模型、权限与思考深度都由调用方控制。 */
export interface ComposerProps {
  /** 提交纯文本；空内容不会回调。 */
  onSubmit: (text: string) => void
  /** 运行中点击停止按钮。 */
  onStop: () => void
  /** 有 run 进行中时把发送按钮换成停止按钮。 */
  running?: boolean
  /** 禁用输入与发送。 */
  disabled?: boolean
  /** 首页使用更高的输入区。 */
  tall?: boolean
  /** 菜单展开方向。 */
  menuSide?: "top" | "bottom"
  /** 覆盖默认的 locale 占位文案。 */
  placeholder?: string
  /** 当前模型；没有模型数据时不显示模型菜单。 */
  model?: string
  models?: readonly string[]
  onModel?: (model: string) => void
  permissionMode?: PermissionMode
  onPermissionMode?: (mode: PermissionMode) => void
  /** provider 不支持计划模式时隐藏该权限选项。 */
  canPlan?: boolean
  /** provider 不支持中断时隐藏停止按钮。 */
  canInterrupt?: boolean
  depth?: ThinkingDepth
  onDepth?: (depth: ThinkingDepth) => void
  /** 是否启用智能标点；默认开启。 */
  smartPunctuation?: boolean
  /** 空会话首次出现时自动聚焦输入区。 */
  autoFocus?: boolean
  /** 输入框外侧那一行的开头，通常是 provider 切换入口。 */
  footerStart?: ReactNode
  /** 输入框外侧那一行的末尾，通常是运行状态。 */
  footerEnd?: ReactNode
  /** 外侧那一行放在输入框上方还是下方；空会话居中时放上方。 */
  footerPosition?: "above" | "below"
}

/** 绘制 TipTap 输入区并保证空内容不可提交。 */
export function Composer({
  onSubmit,
  onStop,
  running = false,
  disabled = false,
  tall = false,
  menuSide = "top",
  placeholder,
  model,
  models = [],
  onModel,
  permissionMode = "ask",
  onPermissionMode,
  canPlan = true,
  canInterrupt = true,
  depth = "medium",
  onDepth,
  smartPunctuation = true,
  autoFocus = false,
  footerStart,
  footerEnd,
  footerPosition = "below",
}: ComposerProps) {
  const { t } = useLocale()
  const label = placeholder ?? t("composer.placeholder")
  const inputLabel = t("composer.input")

  const submitRef = useRef(onSubmit)
  submitRef.current = onSubmit
  const smartRef = useRef(smartPunctuation)
  smartRef.current = smartPunctuation
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const runningRef = useRef(running)
  runningRef.current = running
  const placeholderRef = useRef(label)
  placeholderRef.current = label
  const inputLabelRef = useRef(inputLabel)
  inputLabelRef.current = inputLabel

  const smartExtension = useMemo(() => createSmartPunctuation(() => smartRef.current), [])
  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
        // 没有会话时输入区是禁用的，但占位文案仍然要说明这里能做什么。
        showOnlyWhenEditable: false,
      }),
      smartExtension,
    ],
    editorProps: {
      attributes: () => ({
        class: "tiptap",
        "aria-label": inputLabelRef.current,
      }),
      handleKeyDown: (view, event) => {
        if (event.isComposing) return false
        const action = getComposerKeyAction(event.key, event.shiftKey)
        if (action === "ignore" || action === "newline") return false
        event.preventDefault()
        if (disabledRef.current || runningRef.current) return true
        const text = view.state.doc.textContent.trim()
        if (text) submitRef.current(text)
        return true
      },
    },
  })

  useEffect(() => {
    editor?.setEditable(!disabled)
  }, [editor, disabled])

  useEffect(() => {
    if (autoFocus && !disabled) editor?.commands.focus()
  }, [autoFocus, disabled, editor])

  const empty =
    useEditorState({
      editor,
      selector: ({ editor: current }) => !current || current.isEmpty,
    }) ?? true

  const permissionLabel = t(permissionKeys[permissionMode].label)
  const PermissionIcon = permissionIcons[permissionMode]
  const depthLabel = t(depthKeys[depth])
  const showModel = Boolean(model) && models.length > 0
  const availablePermissionModes = canPlan
    ? permissionModes
    : permissionModes.filter((id) => id !== "plan")

  function submit(): void {
    if (disabled) return
    const text = editor?.getText().trim() ?? ""
    if (text) onSubmit(text)
  }

  const permissionMenu = (
    <Menu.Root>
      <Menu.Trigger className="chip-btn chip-mode" type="button">
        <PermissionIcon className="ic" aria-hidden="true" />
        {permissionLabel}
        <ChevronDown className="ic chip-caret" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side={menuSide} align="start" sideOffset={6}>
          <Menu.Popup className="menu-popup">
            {availablePermissionModes.map((id) => {
              const ItemIcon = permissionIcons[id]
              return (
                <Menu.Item key={id} className="menu-item" onClick={() => onPermissionMode?.(id)}>
                  <ItemIcon className="ic" aria-hidden="true" />
                  <span className="grow">
                    <span>{t(permissionKeys[id].label)}</span>
                    <span className="muted" style={{ display: "block", fontSize: 12 }}>
                      {t(permissionKeys[id].description)}
                    </span>
                  </span>
                  {id === permissionMode ? (
                    <Check className="ic check-mark" aria-hidden="true" />
                  ) : null}
                </Menu.Item>
              )
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )

  const depthMenu = (
    <Menu.Root>
      <Menu.Trigger className="chip-btn" type="button" title={t("composer.depth.label")}>
        <span className="chip-label-optional">{t("composer.depth.label")}</span>
        {depthLabel}
        <ChevronDown className="ic chip-caret" aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side={menuSide} align="start" sideOffset={6}>
          <Menu.Popup className="menu-popup">
            {thinkingDepths.map((id) => (
              <Menu.Item key={id} className="menu-item" onClick={() => onDepth?.(id)}>
                {t(depthKeys[id])}
                {id === depth ? <Check className="ic check-mark" aria-hidden="true" /> : null}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )

  // 输入框外侧的一行：provider、权限、思考深度在左，运行状态在右。
  const foot = (
    <div className="composer-foot">
      {footerStart}
      {permissionMenu}
      {depthMenu}
      <span className="grow" />
      {footerEnd}
    </div>
  )

  return (
    <div className="composer-stack" data-foot={footerPosition}>
      {footerPosition === "above" ? foot : null}
      <div className={tall ? "composer is-tall" : "composer"} data-running={running || undefined}>
        <EditorContent editor={editor} />
        <div className="composer-bar">
          <div className="composer-side">
            <Button
              variant="plain"
              className="composer-plus"
              type="button"
              aria-label={t("composer.attach")}
              title={t("composer.attach")}
              disabled={disabled}
            >
              <Plus className="ic" aria-hidden="true" />
            </Button>
          </div>
          <div className="composer-side end">
            {showModel ? (
              <Menu.Root>
                <Menu.Trigger className="chip-btn chip-model" type="button">
                  {model}
                  <ChevronDown className="ic chip-caret" aria-hidden="true" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner
                    className="menu-positioner"
                    side={menuSide}
                    align="end"
                    sideOffset={6}
                  >
                    <Menu.Popup className="menu-popup">
                      {models.map((item) => (
                        <Menu.Item key={item} className="menu-item" onClick={() => onModel?.(item)}>
                          {item}
                          {item === model ? (
                            <Check className="ic check-mark" aria-hidden="true" />
                          ) : null}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            ) : null}
            {running && canInterrupt ? (
              <Button
                variant="plain"
                className="send is-stop"
                type="button"
                aria-label={t("chat.interrupt")}
                title={t("chat.interrupt")}
                onClick={onStop}
              >
                <Square className="ic" aria-hidden="true" />
              </Button>
            ) : running ? null : (
              <Button
                variant="plain"
                className="send"
                type="button"
                aria-label={t("chat.send")}
                title={t("chat.sendHint")}
                aria-disabled={empty || disabled ? true : undefined}
                onClick={submit}
              >
                <ArrowUp className="ic" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
      {footerPosition === "below" ? foot : null}
    </div>
  )
}
