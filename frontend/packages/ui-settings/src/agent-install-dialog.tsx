// 安装 agent 插件的对话框：npm 包、tarball 或本地插件目录，并提示插件以 Host 权限运行。
import { useState, type FormEvent } from "react"
import { FolderOpen, ShieldAlert } from "lucide-react"
import { Button, Dialog, Input, useLocale } from "@pigcode/ui-primitives"

/** 对话框属性；onInstall 失败时抛错，对话框展示原因并保持打开。 */
export interface AgentInstallDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInstall: (spec: string) => Promise<void>
  /** 选择本地插件目录；没有时不显示按钮。 */
  onPickFolder?: (() => Promise<string | null>) | undefined
}

/** 渲染安装对话框；安装成功后关闭并清空输入。 */
export function AgentInstallDialog({
  open,
  onOpenChange,
  onInstall,
  onPickFolder,
}: AgentInstallDialogProps) {
  const { t } = useLocale()
  const [spec, setSpec] = useState("")
  const [installing, setInstalling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const value = spec.trim()
    if (!value) return
    setInstalling(true)
    setError(null)
    try {
      await onInstall(value)
      setSpec("")
      onOpenChange(false)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason)
      setError(t("agents.failed").replace("{reason}", message))
    } finally {
      setInstalling(false)
    }
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!installing) onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className="agent-install">
          <form onSubmit={(event) => void submit(event)}>
            <Dialog.Title className="agent-install-title">{t("agents.install.title")}</Dialog.Title>
            <Dialog.Description className="agent-muted">
              {t("agents.install.description")}
            </Dialog.Description>
            <label className="agent-field-label" htmlFor="agent-install-spec">
              {t("agents.install.spec")}
            </label>
            <div className="agent-input-row">
              <Input
                id="agent-install-spec"
                className="agent-input mono"
                value={spec}
                autoFocus
                spellCheck={false}
                autoComplete="off"
                placeholder={t("agents.install.placeholder")}
                onChange={(event) => setSpec(event.target.value)}
              />
              {onPickFolder ? (
                <Button
                  size="sm"
                  type="button"
                  disabled={installing}
                  onClick={() => {
                    void onPickFolder().then((folder) => {
                      if (folder) setSpec(folder)
                    })
                  }}
                >
                  <FolderOpen className="ic ic-sm" aria-hidden="true" />
                  {t("agents.install.chooseFolder")}
                </Button>
              ) : null}
            </div>
            <p className="agent-trust">
              <ShieldAlert className="ic ic-sm" aria-hidden="true" />
              {t("agents.install.trust")}
            </p>
            {error ? (
              <p className="error-text" role="alert">
                {error}
              </p>
            ) : null}
            <div className="agent-install-actions">
              <Dialog.Close render={<Button type="button" variant="ghost" disabled={installing} />}>
                {t("agents.install.cancel")}
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={installing || !spec.trim()}>
                {installing ? t("plugins.installing") : t("agents.install.submit")}
              </Button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
