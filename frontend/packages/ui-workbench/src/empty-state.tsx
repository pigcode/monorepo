/** 工作台空状态：一个图标、一句话，最多一个动作；各面板共用同一种节奏。 */
import type { ReactNode } from "react"
import { Loader2 } from "lucide-react"

/** 空状态属性；文案由调用方按 locale 注入。 */
export interface WorkbenchEmptyProps {
  icon?: ReactNode
  /** 一句话说明当前为什么是空的。 */
  title: string
  /** 可选的补充说明；保持一行以内。 */
  description?: string
  /** 可选的唯一动作，例如“创建检查点”。 */
  action?: ReactNode
  /** 加载中：没有传 icon 时显示旋转图标。 */
  loading?: boolean
  className?: string
}

/** 居中渲染空状态；标题沿用 workbench-empty 类名，便于已有查询与测试复用。 */
export function WorkbenchEmpty({
  icon,
  title,
  description,
  action,
  loading = false,
  className,
}: WorkbenchEmptyProps) {
  const glyph = icon ?? (loading ? <Loader2 className="ic ic-lg spin" /> : null)
  return (
    <div
      className={className ? `workbench-empty-state ${className}` : "workbench-empty-state"}
      data-loading={loading || undefined}
    >
      {glyph ? (
        <span className="workbench-empty-icon" aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      <p className="workbench-empty">{title}</p>
      {description ? <p className="workbench-empty-desc">{description}</p> : null}
      {action ? <div className="workbench-empty-action">{action}</div> : null}
    </div>
  )
}
