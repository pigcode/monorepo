/** 文件变更摘要：一张「N 个文件已更改」卡片，列出文件与各自的增删数，点击「查看」展开 diff。 */
import { useState } from "react"
import { FileText } from "lucide-react"
import { Button, useLocale } from "@pigcode/ui-primitives"

/** 单个文件的 diff 行。 */
export interface DiffFile {
  path: string
  lines: string[]
}

/** 一次文件变更的汇总。 */
export interface FileChangeSummary {
  files: DiffFile[]
  additions: number
  deletions: number
}

/** 默认只列出前几个文件，其余折叠在「显示更多」后面。 */
const VISIBLE_FILES = 4

/** 根据行首字符给出 diff 行样式。 */
function lineClass(line: string): string {
  if (line.startsWith("+")) return "add"
  if (line.startsWith("-") || line.startsWith("−")) return "del"
  return "hunk"
}

/** 取出行首的增删标记，普通行留空。 */
function lineMark(line: string): string {
  const first = line[0]
  if (first === "+" || first === "-" || first === "−") return first
  return " "
}

/** 统计单个文件的增删行数；没有 diff 行时返回 null，不显示计数。 */
function fileCounts(file: DiffFile): { additions: number; deletions: number } | null {
  if (file.lines.length === 0) return null
  let additions = 0
  let deletions = 0
  for (const line of file.lines) {
    if (line.startsWith("+")) additions += 1
    else if (line.startsWith("-") || line.startsWith("−")) deletions += 1
  }
  return { additions, deletions }
}

/** 路径的最后一段作为文件名，目录放在后面变灰。 */
function splitPath(path: string): { name: string; dir: string } {
  const index = path.lastIndexOf("/")
  if (index < 0) return { name: path, dir: "" }
  return { name: path.slice(index + 1), dir: path.slice(0, index) }
}

/** 渲染文件变更摘要；点击查看展开 diff。 */
export function DiffSummary({
  summary,
  onView,
}: {
  summary: FileChangeSummary
  onView?: ((summary: FileChangeSummary) => void) | undefined
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const files = open || showAll ? summary.files : summary.files.slice(0, VISIBLE_FILES)
  const hidden = summary.files.length - files.length

  function toggle(): void {
    onView?.(summary)
    setOpen((value) => !value)
  }

  return (
    <div className={`result diff-summary${open ? " is-open" : ""}`}>
      <div className="diff-summary-head">
        <span className="diff-summary-title">
          {summary.files.length} {t("chat.diff.filesChanged")}
        </span>
        <span className="num t-ok">+{summary.additions}</span>
        <span className="num t-bad">−{summary.deletions}</span>
        <span className="grow" />
        <Button
          variant="plain"
          className="link-btn"
          type="button"
          aria-expanded={open}
          onClick={toggle}
        >
          {open ? t("chat.hide") : t("chat.view")}
        </Button>
      </div>
      <ul className="diff-summary-files">
        {files.map((file) => {
          const counts = fileCounts(file)
          const { name, dir } = splitPath(file.path)
          return (
            <li className="diff-summary-file" key={file.path} title={file.path}>
              <FileText className="ic ic-sm" aria-hidden="true" />
              <span className="diff-summary-name truncate">
                {name}
                {dir ? <span className="diff-summary-dir"> {dir}</span> : null}
              </span>
              {counts ? (
                <span className="diff-path-counts num">
                  <span className="t-ok">+{counts.additions}</span>
                  <span className="t-bad">−{counts.deletions}</span>
                </span>
              ) : null}
            </li>
          )
        })}
        {hidden > 0 ? (
          <li className="diff-summary-more">
            <Button
              variant="plain"
              className="link-btn"
              type="button"
              onClick={() => setShowAll(true)}
            >
              {t("chat.diff.showMore")} ({hidden})
            </Button>
          </li>
        ) : null}
      </ul>
      {open ? (
        <div className="result-body">
          {summary.files.map((file) => (
            <div className="diff-file" key={file.path}>
              <div className="diff-path">
                <FileText className="ic ic-sm" aria-hidden="true" />
                <span className="truncate">{file.path}</span>
              </div>
              {file.lines.length > 0 ? (
                <div className="diff">
                  {file.lines.map((line, index) => (
                    <div key={`${file.path}-${index}`} className={lineClass(line)}>
                      <span className="ln">{index + 1}</span>
                      <span className="sg">{lineMark(line)}</span>
                      <span>{line.replace(/^[+−-]/, "")}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
