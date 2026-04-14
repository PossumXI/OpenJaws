import type { AppState } from '../state/AppStateStore.js'
import type { ExternalProviderProbeResult } from './externalProviderProbe.js'
import { settingsChangeDetector } from './settings/changeDetector.js'
import {
  type ExternalModelProvider,
  getExternalProviderDefaults,
  isExternalModelProvider,
  resolveExternalModelConfig,
  resolveExternalModelRef,
} from './model/externalProviders.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from './settings/settings.js'

export const BUILTIN_PROVIDER_DEFAULT_MODELS: Partial<
  Record<ExternalModelProvider, string>
> = {
  oci: 'Q',
  openai: 'gpt-5.4',
  gemini: 'gemini-3-flash-preview',
  codex: 'gpt-5.4',
  minimax: 'MiniMax-M2.7',
  ollama: 'q',
}

export type AppStateUpdater = (updater: (prev: AppState) => AppState) => void

export function normalizeExternalProvider(
  input: string,
): ExternalModelProvider | null {
  const provider = input.trim().toLowerCase()
  if (provider === 'q') {
    return 'oci'
  }
  return isExternalModelProvider(provider) ? provider : null
}

export function buildExternalProviderModelRef(
  provider: ExternalModelProvider,
  model: string,
): string {
  return `${provider}:${model.trim()}`
}

export function notifyUserSettingsChanged(): void {
  settingsChangeDetector.notifyChange('userSettings')
}

export function rememberExternalModel(modelRef: string): Error | null {
  const result = updateSettingsForSource('userSettings', {
    llmModelOverrides: {
      [modelRef]: {},
    },
  })
  if (result.error) {
    return result.error
  }
  notifyUserSettingsChanged()
  return null
}

export function rememberExternalProviderConfig(
  provider: ExternalModelProvider,
  patch: Record<string, string | undefined>,
): Error | null {
  const result = updateSettingsForSource('userSettings', {
    llmProviders: {
      [provider]: patch,
    },
  })
  if (result.error) {
    return result.error
  }
  notifyUserSettingsChanged()
  return null
}

export function setCurrentExternalModel(
  setAppState: AppStateUpdater,
  modelRef: string,
): void {
  setAppState(prev => ({
    ...prev,
    externalProviderProbe: null,
    mainLoopModel: modelRef,
    mainLoopModelForSession: null,
  }))
}

export function setExternalProviderProbe(
  setAppState: AppStateUpdater,
  probe: ExternalProviderProbeResult | null,
): void {
  setAppState(prev => ({
    ...prev,
    externalProviderProbe: probe,
  }))
}

export function bumpExternalProviderAuthVersion(
  setAppState: AppStateUpdater,
): void {
  setAppState(prev => ({
    ...prev,
    authVersion: prev.authVersion + 1,
  }))
}

export function getSavedOrConfiguredModelForProvider(
  provider: ExternalModelProvider,
  currentMainLoopModel?: string | null,
): string | null {
  const appRef =
    typeof currentMainLoopModel === 'string'
      ? resolveExternalModelRef(currentMainLoopModel)
      : null
  if (appRef?.provider === provider) {
    return appRef.model
  }

  const settings = getInitialSettings()
  const settingsModel =
    typeof settings.model === 'string'
      ? resolveExternalModelRef(settings.model)
      : null
  if (settingsModel?.provider === provider) {
    return settingsModel.model
  }

  const defaults = getExternalProviderDefaults(provider)
  for (const envVar of defaults.modelEnvVars) {
    const model = process.env[envVar]?.trim()
    if (model) {
      return model
    }
  }

  for (const rawModel of Object.keys(settings.llmModelOverrides ?? {})) {
    const ref = resolveExternalModelRef(rawModel)
    if (ref?.provider === provider) {
      return ref.model
    }
  }

  return BUILTIN_PROVIDER_DEFAULT_MODELS[provider] ?? null
}

export function resolveProviderApiKeySource(
  provider: ExternalModelProvider,
  model: string,
): string | null {
  return resolveExternalModelConfig(buildExternalProviderModelRef(provider, model))
    ?.apiKeySource
    ?? null
}
