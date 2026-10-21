// 负责会话输入区：TipTap 正文、权限、模型和思考深度菜单，以及发送/停止按钮。
import { Placeholder } from "@tiptap/extension-placeholder"
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { ArrowUp, Check, ChevronDown, Hand, Plus, Square } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
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

/** 思考深度对应的 locale key。 */
const depthKeys: Record<ThinkingDepth, MessageKey> = {
  off: "composer.depth.off",
  low: "composer.depth.low",
  medium: "composer.depth.medium",
  high: "composer.depth.high",
  max: "composer.depth.max",
}

/** 模型胶囊里可切换的 provider。 */
export interface ComposerProvider {
  id: string
  label: string
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
  /** 当前 provider 与可切换的 provider；运行中或少于两个时不显示切换项。 */
  provider?: string
  providers?: readonly ComposerProvider[]
  onProvider?: (providerId: string) => void
  /** 当前模型与可选模型；没有可选模型时菜单里不显示模型组。 */
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
  provider,
  providers = [],
  onProvider,
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
  const editorRef = useRef<Editor | null>(null)

  /** 交出文本后清空输入区，下一条消息从空白开始。 */
  function send(text: string): void {
    submitRef.current(text)
    editorRef.current?.commands.clearContent(true)
  }
  const sendRef = useRef(send)
  sendRef.current = send

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
      Placeholder.configure({ placeholder: () => placeholderRef.current }),
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
        if (text) sendRef.current(text)
        return true
      },
    },
  })
  editorRef.current = editor

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
  const depthLabel = t(depthKeys[depth])
  const providerLabel = providers.find((item) => item.id === provider)?.label ?? provider
  const chipName = model ?? providerLabel ?? t("chat.environment.model")
  const canSwitchProvider = providers.length > 1 && Boolean(onProvider) && !running
  const availablePermissionModes = canPlan
    ? permissionModes
    : permissionModes.filter((id) => id !== "plan")

  function submit(): void {
    if (disabled) return
    const text = editor?.getText().trim() ?? ""
    if (text) send(text)
  }

  return (
    <div className="composer-shell">
      <div className={tall ? "composer is-tall" : "composer"}>
        <EditorContent editor={editor} />
        <div className="composer-bar">
          <div className="composer-side">
            <Button
              variant="plain"
              className="icon-btn composer-attach"
              type="button"
              aria-label={t("composer.attach")}
              title={t("composer.attach")}
            >
              <Plus className="ic" aria-hidden="true" />
            </Button>
          </div>
          <div className="composer-side end">
            <Menu.Root>
              <Menu.Trigger className="chip-btn model-chip" type="button" title={t("composer.modelMenu")}>
                <span className="model-dot" aria-hidden="true" />
                <span className="model-name truncate">{chipName}</span>
                <span className="model-depth">
                  {t("composer.depth.label")} {depthLabel}
                </span>
                <ChevronDown className="ic chip-caret" aria-hidden="true" />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  className="menu-positioner"
                  side={menuSide}
                  align="end"
                  sideOffset={6}
                >
                  <Menu.Popup className="menu-popup model-menu">
                    {canSwitchProvider ? (
                      <Menu.Group>
                        <Menu.Label className="menu-label">
                          {t("chat.environment.provider")}
                        </Menu.Label>
                        {providers.map((item) => (
                          <Menu.Item
                            key={item.id}
                            className="menu-item"
                            onClick={() => onProvider?.(item.id)}
                          >
                            <span className="grow">{item.label}</span>
                            {item.id === provider ? (
                              <Check className="ic check-mark" aria-hidden="true" />
                            ) : null}
                          </Menu.Item>
                        ))}
                      </Menu.Group>
                    ) : null}
                    {models.length > 0 ? (
                      <Menu.Group>
                        {canSwitchProvider ? <Menu.Separator className="menu-sep" /> : null}
                        <Menu.Label className="menu-label">{t("chat.environment.model")}</Menu.Label>
                        {models.map((item) => (
                          <Menu.Item key={item} className="menu-item" onClick={() => onModel?.(item)}>
                            <span className="grow">{item}</span>
                            {item === model ? (
                              <Check className="ic check-mark" aria-hidden="true" />
                            ) : null}
                          </Menu.Item>
                        ))}
                      </Menu.Group>
                    ) : null}
                    <Menu.Group>
                      {canSwitchProvider || models.length > 0 ? (
                        <Menu.Separator className="menu-sep" />
                      ) : null}
                      <Menu.Label className="menu-label">{t("composer.depth.label")}</Menu.Label>
                      {thinkingDepths.map((id) => (
                        <Menu.Item key={id} className="menu-item" onClick={() => onDepth?.(id)}>
                          <span className="grow">{t(depthKeys[id])}</span>
                          {id === depth ? <Check className="ic check-mark" aria-hidden="true" /> : null}
                        </Menu.Item>
                      ))}
                    </Menu.Group>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            {running && canInterrupt ? (
              <Button
                variant="plain"
                className="send"
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
                title={t("chat.send")}
                aria-disabled={empty || disabled ? true : undefined}
                onClick={submit}
              >
                <ArrowUp className="ic" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-under">
        <Menu.Root>
          <Menu.Trigger className="chip-btn" type="button">
            <Hand className="ic" aria-hidden="true" />
            {permissionLabel}
            <ChevronDown className="ic chip-caret" aria-hidden="true" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="menu-positioner" side={menuSide} align="start" sideOffset={6}>
              <Menu.Popup className="menu-popup">
                {availablePermissionModes.map((id) => (
                  <Menu.Item key={id} className="menu-item" onClick={() => onPermissionMode?.(id)}>
                    <span className="grow">
                      <span>{t(permissionKeys[id].label)}</span>
                      <span className="menu-item-desc">{t(permissionKeys[id].description)}</span>
                    </span>
                    {id === permissionMode ? (
                      <Check className="ic check-mark" aria-hidden="true" />
                    ) : null}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <span className="composer-hint">{t("chat.sendHint")}</span>
      </div>
    </div>
  )
}
