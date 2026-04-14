import {
  buildExternalProviderModelRef,
  getSavedOrConfiguredModelForProvider,
  normalizeExternalProvider,
} from './externalProviderSetup.js'
import {
  getExternalProviderDefaults,
  resolveExternalModelConfig,
  resolveExternalModelRef,
  type ExternalModelProvider,
  type ResolvedExternalModelConfig,
} from './model/externalProviders.js'

export type ExternalProviderProbeCode =
  | 'ok'
  | 'invalid_model'
  | 'invalid_base_url'
  | 'missing_key'
  | 'auth_failed'
  | 'endpoint_unavailable'
  | 'http_error'
  | 'network_error'
  | 'timeout'

export type ExternalProviderProbeResult = {
  ok: boolean
  code: ExternalProviderProbeCode
  provider: ExternalModelProvider
  label: string
  model: string
  modelRef: string
  baseURL: string
  baseURLSource: string | null
  apiKeySource: string | null
  endpoint: string
  endpointLabel: string
  method: 'GET'
  checkedAt: number
  httpStatus?: number
  modelCount?: number | null
  detail?: string
  summary: string
}

type ProbeFetch = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean
  status: number
  json(): Promise<unknown>
}>

type ProbeOptions = {
  timeoutMs?: number
  fetchFn?: ProbeFetch
}

const DEFAULT_TIMEOUT_MS = 5_000

function buildModelsUrl(baseURL: string): string {
  return baseURL.endsWith('/models') ? baseURL : `${baseURL}/models`
}

function buildOllamaTagsUrl(baseURL: string): string {
  return baseURL.endsWith('/api/tags') ? baseURL : `${baseURL}/api/tags`
}

function buildProbeTarget(
  config: ResolvedExternalModelConfig,
): { endpoint: string; endpointLabel: string; method: 'GET' } {
  if (config.provider === 'ollama') {
    return {
      endpoint: buildOllamaTagsUrl(config.baseURL),
      endpointLabel: '/api/tags',
      method: 'GET',
    }
  }

  return {
    endpoint: buildModelsUrl(config.baseURL),
    endpointLabel: '/models',
    method: 'GET',
  }
}

function formatProbeSummary(
  config: ResolvedExternalModelConfig,
  code: ExternalProviderProbeCode,
  endpointLabel: string,
  detail?: string,
  httpStatus?: number,
  modelCount?: number | null,
): string {
  const prefix = `${config.label}:${config.model}`
  switch (code) {
    case 'ok':
      return `${prefix} reachable · ${endpointLabel} · ${httpStatus ?? 200}${modelCount !== null && modelCount !== undefined ? ` · ${modelCount} models` : ''}`
    case 'missing_key':
      return `${prefix} blocked · key missing`
    case 'invalid_base_url':
      return `${prefix} blocked · invalid base URL`
    case 'auth_failed':
      return `${prefix} failed · auth rejected${httpStatus ? ` (${httpStatus})` : ''}`
    case 'endpoint_unavailable':
      return `${prefix} failed · ${endpointLabel} unavailable${httpStatus ? ` (${httpStatus})` : ''}`
    case 'timeout':
      return `${prefix} failed · timeout`
    case 'network_error':
      return `${prefix} failed · network error${detail ? ` · ${detail}` : ''}`
    case 'http_error':
      return `${prefix} failed · HTTP ${httpStatus ?? '?'}${detail ? ` · ${detail}` : ''}`
    case 'invalid_model':
      return detail ?? 'Provider probe failed'
  }
}

function parseModelCount(
  provider: ExternalModelProvider,
  body: unknown,
): number | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  if (
    provider === 'ollama' &&
    'models' in body &&
    Array.isArray((body as { models?: unknown[] }).models)
  ) {
    return (body as { models: unknown[] }).models.length
  }

  if ('data' in body && Array.isArray((body as { data?: unknown[] }).data)) {
    return (body as { data: unknown[] }).data.length
  }

  if (
    'models' in body &&
    Array.isArray((body as { models?: unknown[] }).models)
  ) {
    return (body as { models: unknown[] }).models.length
  }

  return null
}

function buildStaticProbeResult(
  config: ResolvedExternalModelConfig,
  target: { endpoint: string; endpointLabel: string; method: 'GET' },
  code: ExternalProviderProbeCode,
  detail?: string,
  httpStatus?: number,
  modelCount?: number | null,
): ExternalProviderProbeResult {
  return {
    ok: code === 'ok',
    code,
    provider: config.provider,
    label: config.label,
    model: config.model,
    modelRef: config.rawModel,
    baseURL: config.baseURL,
    baseURLSource: config.baseURLSource,
    apiKeySource: config.apiKeySource,
    endpoint: target.endpoint,
    endpointLabel: target.endpointLabel,
    method: target.method,
    checkedAt: Date.now(),
    httpStatus,
    modelCount,
    detail,
    summary: formatProbeSummary(
      config,
      code,
      target.endpointLabel,
      detail,
      httpStatus,
      modelCount,
    ),
  }
}

export function resolveProviderProbeModelRef(
  providerInput?: string | null,
  modelInput?: string | null,
  currentModel?: string | null,
): string | null {
  const explicitProvider = normalizeExternalProvider(providerInput ?? '')
  const explicitModel = modelInput?.trim() ?? ''

  if (explicitProvider) {
    const providerModel =
      explicitModel ||
      getSavedOrConfiguredModelForProvider(explicitProvider, currentModel)
    return providerModel
      ? buildExternalProviderModelRef(explicitProvider, providerModel)
      : null
  }

  if (currentModel) {
    const currentRef = resolveExternalModelRef(currentModel)
    if (currentRef) {
      return currentModel
    }
  }

  const defaultProvider: ExternalModelProvider = 'oci'
  const defaultModel =
    explicitModel ||
    getSavedOrConfiguredModelForProvider(defaultProvider, currentModel)
  return defaultModel
    ? buildExternalProviderModelRef(defaultProvider, defaultModel)
    : null
}

export async function probeResolvedExternalProvider(
  config: ResolvedExternalModelConfig,
  options: ProbeOptions = {},
): Promise<ExternalProviderProbeResult> {
  const target = buildProbeTarget(config)
  try {
    new URL(target.endpoint)
  } catch {
    return buildStaticProbeResult(
      config,
      target,
      'invalid_base_url',
      `Configured base URL is not a valid URL: ${config.baseURL}`,
    )
  }

  if (config.provider !== 'ollama' && !config.apiKey) {
    return buildStaticProbeResult(
      config,
      target,
      'missing_key',
      `Configure ${config.provider} auth before probing reachability.`,
    )
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchFn = options.fetchFn ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchFn(target.endpoint, {
      method: target.method,
      headers: {
        Accept: 'application/json',
        ...(config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {}),
        ...config.headers,
      },
      signal: controller.signal,
    })

    let body: unknown = null
    try {
      body = await response.json()
    } catch {
      body = null
    }

    if (response.ok) {
      const modelCount = parseModelCount(config.provider, body)
      return buildStaticProbeResult(
        config,
        target,
        'ok',
        undefined,
        response.status,
        modelCount,
      )
    }

    if (response.status === 401 || response.status === 403) {
      return buildStaticProbeResult(
        config,
        target,
        'auth_failed',
        'The provider rejected the configured key or auth headers.',
        response.status,
      )
    }

    if (response.status === 404) {
      return buildStaticProbeResult(
        config,
        target,
        'endpoint_unavailable',
        `${target.endpointLabel} did not resolve at the configured base URL.`,
        response.status,
      )
    }

    return buildStaticProbeResult(
      config,
      target,
      'http_error',
      'The provider returned a non-success response.',
      response.status,
    )
  } catch (error) {
    if (controller.signal.aborted) {
      return buildStaticProbeResult(
        config,
        target,
        'timeout',
        `Timed out after ${timeoutMs}ms.`,
      )
    }

    const detail =
      error instanceof Error ? error.message : 'Unknown network error.'
    return buildStaticProbeResult(
      config,
      target,
      'network_error',
      detail,
    )
  } finally {
    clearTimeout(timer)
  }
}

export async function probeExternalProviderModel(
  rawModel: string,
  options: ProbeOptions = {},
): Promise<ExternalProviderProbeResult> {
  const config = resolveExternalModelConfig(rawModel)
  if (!config) {
    const fallbackProvider = normalizeExternalProvider(
      rawModel.split(/[:/]/, 1)[0] ?? 'oci',
    ) ?? 'oci'
    const defaults = getExternalProviderDefaults(fallbackProvider)
    return {
      ok: false,
      code: 'invalid_model',
      provider: fallbackProvider,
      label: defaults.label,
      model: rawModel,
      modelRef: rawModel,
      baseURL: defaults.baseURL,
      baseURLSource: null,
      apiKeySource: null,
      endpoint: buildModelsUrl(defaults.baseURL),
      endpointLabel: fallbackProvider === 'ollama' ? '/api/tags' : '/models',
      method: 'GET',
      checkedAt: Date.now(),
      detail: 'Configure a provider model before probing connectivity.',
      summary: `Provider probe failed · configure a provider model before probing connectivity.`,
    }
  }

  return probeResolvedExternalProvider(config, options)
}
