import { getInitialSettings } from '../settings/settings.js'

export const EXTERNAL_MODEL_PROVIDERS = [
  'openai',
  'groq',
  'minimax',
  'gemini',
  'codex',
  'kimi',
  'ollama',
] as const

export type ExternalModelProvider = (typeof EXTERNAL_MODEL_PROVIDERS)[number]

export type ProviderDefaults = {
  label: string
  apiKeyEnvVars: string[]
  modelEnvVars: string[]
  baseURL: string
  baseURLEnvVar: string
}

type ExternalProviderConfig = {
  apiKey?: string
  apiKeyEnv?: string
  baseURL?: string
  headers?: Record<string, string>
}

type ExternalModelOverrideConfig = ExternalProviderConfig & {
  provider?: string
}

export type ExternalModelRef = {
  rawModel: string
  provider: ExternalModelProvider
  model: string
  label: string
  source: 'prefix' | 'override'
}

export type ResolvedExternalModelConfig = ExternalModelRef & {
  apiKey: string | null
  apiKeySource: string | null
  baseURL: string
  baseURLSource: string | null
  headers: Record<string, string>
}

export type ExternalProviderStatus = {
  provider: ExternalModelProvider
  label: string
  apiKeySource: string | null
  baseURL: string
  baseURLSource: string | null
}

export type ConfiguredExternalModel = {
  value: string
  label: string
  description: string
}

const PROVIDER_DEFAULTS: Record<ExternalModelProvider, ProviderDefaults> = {
  openai: {
    label: 'OpenAI',
    apiKeyEnvVars: ['OPENAI_API_KEY'],
    modelEnvVars: ['OPENAI_MODEL'],
    baseURL: 'https://api.openai.com/v1',
    baseURLEnvVar: 'OPENAI_BASE_URL',
  },
  groq: {
    label: 'Groq',
    apiKeyEnvVars: ['GROQ_API_KEY'],
    modelEnvVars: ['GROQ_MODEL'],
    baseURL: 'https://api.groq.com/openai/v1',
    baseURLEnvVar: 'GROQ_BASE_URL',
  },
  minimax: {
    label: 'MiniMax',
    apiKeyEnvVars: ['MINI_MAX_API_KEY', 'MINIMAX_API_KEY'],
    modelEnvVars: ['MINI_MAX_MODEL', 'MINIMAX_MODEL'],
    baseURL: 'https://api.minimax.io/v1',
    baseURLEnvVar: 'MINI_MAX_BASE_URL',
  },
  gemini: {
    label: 'Gemini',
    apiKeyEnvVars: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    modelEnvVars: ['GEMINI_MODEL'],
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    baseURLEnvVar: 'GEMINI_BASE_URL',
  },
  codex: {
    label: 'Codex',
    apiKeyEnvVars: ['CODEX_API_KEY', 'OPENAI_API_KEY'],
    modelEnvVars: ['CODEX_MODEL'],
    baseURL: 'https://api.openai.com/v1',
    baseURLEnvVar: 'CODEX_BASE_URL',
  },
  kimi: {
    label: 'Kimi',
    apiKeyEnvVars: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'],
    modelEnvVars: ['KIMI_MODEL'],
    baseURL: 'https://api.moonshot.cn/v1',
    baseURLEnvVar: 'KIMI_BASE_URL',
  },
  ollama: {
    label: 'Ollama',
    apiKeyEnvVars: ['OLLAMA_API_KEY'],
    modelEnvVars: ['OLLAMA_MODEL'],
    baseURL: 'http://127.0.0.1:11434',
    baseURLEnvVar: 'OLLAMA_BASE_URL',
  },
}

export function getExternalProviderDefaults(
  provider: ExternalModelProvider,
): ProviderDefaults {
  return PROVIDER_DEFAULTS[provider]
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isExternalModelProvider(
  provider: string,
): provider is ExternalModelProvider {
  return EXTERNAL_MODEL_PROVIDERS.includes(
    provider.toLowerCase() as ExternalModelProvider,
  )
}

function getProviderSettings(): Record<string, ExternalProviderConfig> {
  const llmProviders = getInitialSettings().llmProviders
  return isObjectRecord(llmProviders)
    ? (llmProviders as Record<string, ExternalProviderConfig>)
    : {}
}

function getModelOverrideSettings(): Record<string, ExternalModelOverrideConfig> {
  const llmModelOverrides = getInitialSettings().llmModelOverrides
  return isObjectRecord(llmModelOverrides)
    ? (llmModelOverrides as Record<string, ExternalModelOverrideConfig>)
    : {}
}

function getModelOverride(
  rawModel: string,
): ExternalModelOverrideConfig | undefined {
  const overrides = getModelOverrideSettings()
  return overrides[rawModel] ?? overrides[rawModel.toLowerCase()]
}

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, '')
}

function getEnvValue(name: string | undefined): string | null {
  if (!name) {
    return null
  }
  const value = process.env[name]
  return value && value.trim() ? value.trim() : null
}

function getApiKeyFromEnvChain(
  envVarNames: string[],
): { apiKey: string | null; apiKeySource: string | null } {
  for (const envVar of envVarNames) {
    const apiKey = getEnvValue(envVar)
    if (apiKey) {
      return { apiKey, apiKeySource: envVar }
    }
  }
  return { apiKey: null, apiKeySource: null }
}

function resolveModelPrefix(rawModel: string): ExternalModelRef | null {
  const match = rawModel.match(/^([a-z0-9_-]+)([:/])(.+)$/i)
  if (!match) {
    return null
  }

  const provider = match[1]!.toLowerCase()
  const model = match[3]!.trim()
  if (!model || !isExternalModelProvider(provider)) {
    return null
  }

  return {
    rawModel,
    provider,
    model,
    label: PROVIDER_DEFAULTS[provider].label,
    source: 'prefix',
  }
}

export function resolveExternalModelRef(
  rawModel: string,
): ExternalModelRef | null {
  const trimmedModel = rawModel.trim()
  if (!trimmedModel) {
    return null
  }

  const prefixed = resolveModelPrefix(trimmedModel)
  if (prefixed) {
    return prefixed
  }

  const override = getModelOverride(trimmedModel)
  const provider = override?.provider?.toLowerCase()
  if (!provider || !isExternalModelProvider(provider)) {
    return null
  }

  return {
    rawModel: trimmedModel,
    provider,
    model: trimmedModel,
    label: PROVIDER_DEFAULTS[provider].label,
    source: 'override',
  }
}

export function resolveExternalModelConfig(
  rawModel: string,
): ResolvedExternalModelConfig | null {
  const modelRef = resolveExternalModelRef(rawModel)
  if (!modelRef) {
    return null
  }

  const providerSettings = getProviderSettings()[modelRef.provider] ?? {}
  const modelOverride = getModelOverride(modelRef.rawModel) ?? {}
  const defaults = PROVIDER_DEFAULTS[modelRef.provider]

  const directApiKey =
    modelOverride.apiKey?.trim() || providerSettings.apiKey?.trim() || null
  let apiKeySource: string | null = null
  if (modelOverride.apiKey?.trim()) {
    apiKeySource = `settings.llmModelOverrides.${modelRef.rawModel}.apiKey`
  } else if (providerSettings.apiKey?.trim()) {
    apiKeySource = `settings.llmProviders.${modelRef.provider}.apiKey`
  }

  let apiKey = directApiKey
  if (!apiKey) {
    const envChain = [
      modelOverride.apiKeyEnv,
      providerSettings.apiKeyEnv,
      ...defaults.apiKeyEnvVars,
    ].filter((value, index, array): value is string =>
      Boolean(value && array.indexOf(value) === index),
    )
    const envConfig = getApiKeyFromEnvChain(envChain)
    apiKey = envConfig.apiKey
    apiKeySource = envConfig.apiKeySource
  }

  let baseURLSource: string | null = null
  let baseURL =
    modelOverride.baseURL?.trim() || providerSettings.baseURL?.trim() || null
  if (modelOverride.baseURL?.trim()) {
    baseURLSource = `settings.llmModelOverrides.${modelRef.rawModel}.baseURL`
  } else if (providerSettings.baseURL?.trim()) {
    baseURLSource = `settings.llmProviders.${modelRef.provider}.baseURL`
  } else {
    const envBaseURL = getEnvValue(defaults.baseURLEnvVar)
    if (envBaseURL) {
      baseURL = envBaseURL
      baseURLSource = defaults.baseURLEnvVar
    }
  }

  if (!baseURL) {
    baseURL = defaults.baseURL
  }

  return {
    ...modelRef,
    apiKey,
    apiKeySource,
    baseURL: normalizeBaseURL(baseURL),
    baseURLSource,
    headers: {
      ...(providerSettings.headers ?? {}),
      ...(modelOverride.headers ?? {}),
    },
  }
}

export function renderExternalModelName(rawModel: string): string | null {
  const modelRef = resolveExternalModelRef(rawModel)
  if (!modelRef) {
    return null
  }
  return `${modelRef.model} (${modelRef.label})`
}

export function listConfiguredExternalProviders(): ExternalProviderStatus[] {
  const providerSettings = getProviderSettings()
  const modelOverrides = Object.values(getModelOverrideSettings())

  return EXTERNAL_MODEL_PROVIDERS.flatMap(provider => {
    const resolved = resolveExternalModelConfig(`${provider}:__probe__`)
    if (!resolved) {
      return []
    }

    const hasCustomProviderSettings = Boolean(providerSettings[provider])
    const hasModelOverrides = modelOverrides.some(
      override => override.provider?.toLowerCase() === provider,
    )
    if (
      !resolved.apiKeySource &&
      !hasCustomProviderSettings &&
      !hasModelOverrides &&
      provider !== 'ollama'
    ) {
      return []
    }

    return [
      {
        provider,
        label: resolved.label,
        apiKeySource: resolved.apiKeySource,
        baseURL: resolved.baseURL,
        baseURLSource: resolved.baseURLSource,
      },
    ]
  })
}

function addConfiguredExternalModel(
  models: Map<string, ConfiguredExternalModel>,
  value: string,
  description: string,
): void {
  if (models.has(value)) {
    return
  }

  models.set(value, {
    value,
    label: renderExternalModelName(value) ?? value,
    description,
  })
}

export function listConfiguredExternalModels(): ConfiguredExternalModel[] {
  const models = new Map<string, ConfiguredExternalModel>()
  const settingsModel = getInitialSettings().model

  if (typeof settingsModel === 'string') {
    const ref = resolveExternalModelRef(settingsModel)
    if (ref) {
      addConfiguredExternalModel(models, settingsModel, 'Configured in settings')
    }
  }

  for (const provider of EXTERNAL_MODEL_PROVIDERS) {
    const defaults = PROVIDER_DEFAULTS[provider]
    for (const envVar of defaults.modelEnvVars) {
      const model = getEnvValue(envVar)
      if (!model) {
        continue
      }
      addConfiguredExternalModel(
        models,
        `${provider}:${model}`,
        `Configured via ${envVar}`,
      )
    }
  }

  for (const rawModel of Object.keys(getModelOverrideSettings())) {
    const ref = resolveExternalModelRef(rawModel)
    if (!ref) {
      continue
    }
    addConfiguredExternalModel(
      models,
      rawModel,
      `Model override (${PROVIDER_DEFAULTS[ref.provider].label})`,
    )
  }

  return Array.from(models.values())
}
