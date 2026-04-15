import {
  buildExternalProviderModelRef,
  getSavedOrConfiguredModelForProvider,
  normalizeExternalProvider,
} from './externalProviderSetup.js'
import {
  queryOciQViaPython,
  resolveOciBridgeModel,
  type OciQBridgeResponse,
  type OciQBridgeRuntimeOverride,
} from './ociQBridge.js'
import { resolveEffectiveOciBaseUrl, resolveOciQRuntime } from './ociQRuntime.js'
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
  method: 'GET' | 'POST'
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

type ProbeOci = (args: {
  prompt: string
  systemPrompt?: string
  maxOutputTokens?: number
  timeoutMs?: number
  runtimeOverride?: OciQBridgeRuntimeOverride
}) => Promise<OciQBridgeResponse>

type ProbeOptions = {
  timeoutMs?: number
  fetchFn?: ProbeFetch
  ociQueryFn?: ProbeOci
}

const DEFAULT_TIMEOUT_MS = 5_000

function buildModelsUrl(baseURL: string): string {
  return baseURL.endsWith('/models') ? baseURL : `${baseURL}/models`
}

function buildResponsesUrl(baseURL: string): string {
  return baseURL.endsWith('/responses') ? baseURL : `${baseURL}/responses`
}

function buildOllamaTagsUrl(baseURL: string): string {
  return baseURL.endsWith('/api/tags') ? baseURL : `${baseURL}/api/tags`
}

function buildProbeTarget(
  config: ResolvedExternalModelConfig,
): { endpoint: string; endpointLabel: string; method: 'GET' | 'POST' } {
  if (config.provider === 'ollama') {
    return {
      endpoint: buildOllamaTagsUrl(config.baseURL),
      endpointLabel: '/api/tags',
      method: 'GET',
    }
  }

  if (config.provider === 'oci') {
    return {
      endpoint: buildResponsesUrl(config.baseURL),
      endpointLabel: '/responses',
      method: 'POST',
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
  target: { endpoint: string; endpointLabel: string; method: 'GET' | 'POST' },
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

function buildOciProbeRuntimeOverride(
  config: ResolvedExternalModelConfig,
): {
  runtimeOverride: OciQBridgeRuntimeOverride | null
  authSource: string | null
  missingDetail: string | null
} {
  const runtime = resolveOciQRuntime()
  const model = resolveOciBridgeModel(config.model)

  if (config.apiKey) {
    return {
      runtimeOverride: {
        authMode: 'bearer',
        apiKey: config.apiKey,
        baseURL: config.baseURL,
        model,
        projectId: runtime.projectId,
        compartmentId: runtime.compartmentId,
      },
      authSource: config.apiKeySource,
      missingDetail: null,
    }
  }

  if (runtime.authMode === 'iam' && runtime.ready) {
    return {
      runtimeOverride: {
        authMode: 'iam',
        configFile: runtime.configFile!,
        profile: runtime.profile,
        baseURL: config.baseURL,
        projectId: runtime.projectId!,
        compartmentId: runtime.compartmentId!,
        model,
      },
      authSource: 'OCI IAM',
      missingDetail: null,
    }
  }

  return {
    runtimeOverride: null,
    authSource: null,
    missingDetail:
      'Configure Q_API_KEY / OCI_API_KEY / OCI_GENAI_API_KEY for public installs, or OCI_CONFIG_FILE / OCI_PROFILE / OCI_COMPARTMENT_ID / OCI_GENAI_PROJECT_ID for internal IAM auth.',
  }
}

function classifyOciProbeFailure(message: string): ExternalProviderProbeCode {
  const normalized = message.toLowerCase()
  if (
    normalized.includes('401') ||
    normalized.includes('403') ||
    normalized.includes('unauthor') ||
    normalized.includes('auth')
  ) {
    return 'auth_failed'
  }
  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return 'timeout'
  }
  if (normalized.includes('404') || normalized.includes('not found')) {
    return 'endpoint_unavailable'
  }
  return 'network_error'
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
  const effectiveConfig =
    config.provider === 'oci'
      ? {
          ...config,
          baseURL: resolveEffectiveOciBaseUrl({
            baseURL: config.baseURL,
            baseURLSource: config.baseURLSource,
          }),
        }
      : config
  const target = buildProbeTarget(effectiveConfig)
  try {
    new URL(target.endpoint)
  } catch {
    return buildStaticProbeResult(
      effectiveConfig,
      target,
      'invalid_base_url',
      `Configured base URL is not a valid URL: ${effectiveConfig.baseURL}`,
    )
  }

  if (effectiveConfig.provider === 'oci') {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const ociProbe = options.ociQueryFn ?? queryOciQViaPython
    const { runtimeOverride, authSource, missingDetail } =
      buildOciProbeRuntimeOverride(effectiveConfig)

    if (!runtimeOverride) {
      return buildStaticProbeResult(
        effectiveConfig,
        target,
        'missing_key',
        missingDetail ?? 'OCI auth is not configured.',
      )
    }

    try {
      await ociProbe({
        prompt: 'Reply with the single word OK.',
        systemPrompt: 'Reply briefly and operationally.',
        maxOutputTokens: 16,
        timeoutMs,
        runtimeOverride,
      })

      return buildStaticProbeResult(
        {
          ...effectiveConfig,
          apiKeySource: authSource,
        },
        target,
        'ok',
        undefined,
        200,
        null,
      )
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'Unknown OCI probe error.'
      return buildStaticProbeResult(
        {
          ...effectiveConfig,
          apiKeySource: authSource,
        },
        target,
        classifyOciProbeFailure(detail),
        detail,
      )
    }
  }

  if (effectiveConfig.provider !== 'ollama' && !effectiveConfig.apiKey) {
    return buildStaticProbeResult(
      effectiveConfig,
      target,
      'missing_key',
      `Configure ${effectiveConfig.provider} auth before probing reachability.`,
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
        ...(effectiveConfig.apiKey
          ? { Authorization: `Bearer ${effectiveConfig.apiKey}` }
          : {}),
        ...effectiveConfig.headers,
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
      const modelCount = parseModelCount(effectiveConfig.provider, body)
      return buildStaticProbeResult(
        effectiveConfig,
        target,
        'ok',
        undefined,
        response.status,
        modelCount,
      )
    }

    if (response.status === 401 || response.status === 403) {
      return buildStaticProbeResult(
        effectiveConfig,
        target,
        'auth_failed',
        'The provider rejected the configured key or auth headers.',
        response.status,
      )
    }

    if (response.status === 404) {
      return buildStaticProbeResult(
        effectiveConfig,
        target,
        'endpoint_unavailable',
        `${target.endpointLabel} did not resolve at the configured base URL.`,
        response.status,
      )
    }

    return buildStaticProbeResult(
      effectiveConfig,
      target,
      'http_error',
      'The provider returned a non-success response.',
      response.status,
    )
  } catch (error) {
    if (controller.signal.aborted) {
      return buildStaticProbeResult(
        effectiveConfig,
        target,
        'timeout',
        `Timed out after ${timeoutMs}ms.`,
      )
    }

    const detail =
      error instanceof Error ? error.message : 'Unknown network error.'
    return buildStaticProbeResult(
      effectiveConfig,
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
      endpoint:
        fallbackProvider === 'ollama'
          ? buildOllamaTagsUrl(defaults.baseURL)
          : fallbackProvider === 'oci'
            ? buildResponsesUrl(defaults.baseURL)
            : buildModelsUrl(defaults.baseURL),
      endpointLabel:
        fallbackProvider === 'ollama'
          ? '/api/tags'
          : fallbackProvider === 'oci'
            ? '/responses'
            : '/models',
      method: fallbackProvider === 'oci' ? 'POST' : 'GET',
      checkedAt: Date.now(),
      detail: 'Configure a provider model before probing connectivity.',
      summary: `Provider probe failed · configure a provider model before probing connectivity.`,
    }
  }

  return probeResolvedExternalProvider(config, options)
}
