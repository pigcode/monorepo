/** 模型目录：把各 driver 的模型条目统一成协议形状，并缓存读取结果。 */
import { reasoningEffortSchema, type ProviderModel, type ReasoningEffort } from "@pigcode/contracts"
import type { ProviderModelInfo } from "./driver"

/** 把 CLI 返回的档位名收窄为协议里的思考深度；无法识别时返回 null。 */
export function asReasoningEffort(value: unknown): ReasoningEffort | null {
  if (typeof value !== "string") return null
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
  const alias = normalized === "extrahigh" ? "xhigh" : normalized
  const parsed = reasoningEffortSchema.safeParse(alias)
  return parsed.success ? parsed.data : null
}

/** 档位从低到高的顺序；目录与界面都按这个顺序展示。 */
const EFFORT_ORDER = reasoningEffortSchema.options

/** 去重并按从低到高排序。 */
export function sortEfforts(efforts: Iterable<ReasoningEffort>): ReasoningEffort[] {
  const unique = new Set(efforts)
  return EFFORT_ORDER.filter((effort) => unique.has(effort))
}

/** 补齐可选字段、去掉重复 id；默认档位不在可选范围内时置空。 */
export function normalizeModels(models: readonly ProviderModelInfo[]): ProviderModel[] {
  const seen = new Set<string>()
  const result: ProviderModel[] = []
  for (const model of models) {
    if (!model.id || seen.has(model.id)) continue
    seen.add(model.id)
    const efforts = sortEfforts(model.efforts ?? [])
    const defaultEffort =
      model.defaultEffort && efforts.includes(model.defaultEffort) ? model.defaultEffort : null
    result.push({
      id: model.id,
      displayName: model.displayName || model.id,
      ...(model.description ? { description: model.description } : {}),
      isDefault: model.isDefault,
      efforts,
      defaultEffort,
    })
  }
  return result
}

/** 模型目录缓存的选项；测试可以注入时钟。 */
export interface ModelCatalogCacheOptions {
  ttlMs?: number
  now?: () => number
}

/** 按 provider 缓存模型目录；同一时刻的重复请求共享一次读取。 */
export interface ModelCatalogCache {
  get(providerId: string, load: () => Promise<ProviderModel[]>): Promise<ProviderModel[]>
  invalidate(providerId?: string): void
}

/**
 * 读取目录可能要启动 CLI（Codex 起一个 app-server、Claude 起一次 SDK 会话），
 * 切换线程时不能每次都重新读。空目录不缓存，CLI 稍后装好或登录后能立刻看到模型。
 */
export function createModelCatalogCache(options: ModelCatalogCacheOptions = {}): ModelCatalogCache {
  const ttlMs = options.ttlMs ?? 10 * 60_000
  const now = options.now ?? Date.now
  const entries = new Map<string, { models: ProviderModel[]; expiresAt: number }>()
  const inflight = new Map<string, Promise<ProviderModel[]>>()
  return {
    get(providerId, load) {
      const cached = entries.get(providerId)
      if (cached && cached.expiresAt > now()) return Promise.resolve(cached.models)
      const pending = inflight.get(providerId)
      if (pending) return pending
      const request = load()
        .then((models) => {
          if (inflight.get(providerId) === request && models.length > 0) {
            entries.set(providerId, { models, expiresAt: now() + ttlMs })
          }
          return models
        })
        .finally(() => {
          if (inflight.get(providerId) === request) inflight.delete(providerId)
        })
      inflight.set(providerId, request)
      return request
    },
    invalidate(providerId) {
      if (providerId === undefined) {
        entries.clear()
        inflight.clear()
        return
      }
      entries.delete(providerId)
      inflight.delete(providerId)
    },
  }
}
