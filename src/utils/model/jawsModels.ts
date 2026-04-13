import { getFeatureValue_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import type { EffortLevel } from '../effort.js'

export type JawsModel = {
  alias: string
  model: string
  label: string
  description?: string
  defaultEffortValue?: number
  defaultEffortLevel?: EffortLevel
  contextWindow?: number
  defaultMaxTokens?: number
  upperMaxTokensLimit?: number
  /** Model defaults to adaptive thinking and rejects `thinking: { type: 'disabled' }`. */
  alwaysOnThinking?: boolean
}

export type JawsModelSwitchCalloutConfig = {
  modelAlias?: string
  description: string
  version: string
}

export type JawsModelOverrideConfig = {
  defaultModel?: string
  defaultModelEffortLevel?: EffortLevel
  defaultSystemPromptSuffix?: string
  jawsModels?: JawsModel[]
  switchCallout?: JawsModelSwitchCalloutConfig
}

// @[MODEL LAUNCH]: Update jaws_model_override with new jaws-only models
// @[MODEL LAUNCH]: Add the codename to scripts/excluded-strings.txt to prevent it from leaking to external builds.
export function getJawsModelOverrideConfig(): JawsModelOverrideConfig | null {
  if (process.env.USER_TYPE !== 'jaws') {
    return null
  }
  return getFeatureValue_CACHED_MAY_BE_STALE<JawsModelOverrideConfig | null>(
    'jaws_model_override',
    null,
  )
}

export function getJawsModels(): JawsModel[] {
  if (process.env.USER_TYPE !== 'jaws') {
    return []
  }
  return getJawsModelOverrideConfig()?.jawsModels ?? []
}

export function resolveJawsModel(
  model: string | undefined,
): JawsModel | undefined {
  if (process.env.USER_TYPE !== 'jaws') {
    return undefined
  }
  if (model === undefined) {
    return undefined
  }
  const lower = model.toLowerCase()
  return getJawsModels().find(
    m => m.alias === model || lower.includes(m.model.toLowerCase()),
  )
}
