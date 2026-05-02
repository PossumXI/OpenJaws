import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../commands.js'
import {
  EXTERNAL_MODEL_PROVIDERS,
  type ExternalModelProvider,
  getExternalProviderDefaults,
  resolveExternalModelConfig,
} from '../../utils/model/externalProviders.js'
import { openBrowser } from '../../utils/browser.js'
import { modelDisplayString } from '../../utils/model/model.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import {
  resolveEffectiveOciBaseUrl,
  resolveOciQRuntime,
} from '../../utils/ociQRuntime.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import {
  buildExternalProviderModelRef,
  bumpExternalProviderAuthVersion,
  getSavedOrConfiguredModelForProvider,
  normalizeExternalProvider,
  rememberExternalModel,
  rememberExternalProviderConfig,
  setExternalProviderProbe,
  setCurrentExternalModel,
} from '../../utils/externalProviderSetup.js'
import {
  probeExternalProviderModel,
  resolveProviderProbeModelRef,
  type ExternalProviderProbeResult,
} from '../../utils/externalProviderProbe.js'

const HELP_ARGS = new Set(['help', '-h', '--help'])
const STATUS_ARGS = new Set(['', 'status', 'list', 'current'])
type ProviderBrowserConnectTarget = ExternalModelProvider

function formatProviderStatus(
  provider: ExternalModelProvider,
  context: LocalJSXCommandContext,
): string {
  const defaults = getExternalProviderDefaults(provider)
  const resolved = resolveExternalModelConfig(`${provider}:__probe__`)
  const preferredModel = getSavedOrConfiguredModelForProvider(
    provider,
    context.getAppState().mainLoopModel,
  )
  const ociRuntime = provider === 'oci' ? resolveOciQRuntime() : null
  const keySource =
    resolved?.apiKeySource ??
    (provider === 'ollama'
      ? 'not required'
      : provider === 'oci' &&
          ociRuntime?.authMode === 'iam' &&
          ociRuntime.ready
        ? `OCI IAM (${ociRuntime.profile})`
        : provider === 'oci'
          ? `missing (env: ${defaults.apiKeyEnvVars.join(', ')} or OCI IAM envs)`
          : `missing (env: ${defaults.apiKeyEnvVars.join(', ')})`)
  const modelHint = preferredModel
    ? buildExternalProviderModelRef(provider, preferredModel)
    : `unset (env: ${defaults.modelEnvVars.join(', ') || 'none'})`
  const modelSource =
    provider === 'oci' && ociRuntime
      ? ` · upstream ${ociRuntime.modelSource ?? 'not configured'}`
      : ''
  const baseURL =
    provider === 'oci'
      ? resolveEffectiveOciBaseUrl({
          baseURL: resolved?.baseURL ?? defaults.baseURL,
          baseURLSource: resolved?.baseURLSource ?? null,
        })
      : resolved?.baseURL ?? defaults.baseURL
  return `- ${provider}: model ${modelHint}${modelSource} · key ${keySource} · base URL ${baseURL}`
}

function buildStatusMessage(context: LocalJSXCommandContext): string {
  const currentModel =
    context.getAppState().mainLoopModel ?? getInitialSettings().model ?? null
  const currentDisplay =
    currentModel === null
      ? 'default (public default Q on OCI · oci:Q)'
      : modelDisplayString(currentModel)
  const providerLines = EXTERNAL_MODEL_PROVIDERS.map(provider =>
    formatProviderStatus(provider, context),
  )
  return [
    `Current model: ${currentDisplay}`,
    'Public default runtime: Q on OCI (oci:Q)',
    '',
    'External providers:',
    ...providerLines,
    '',
    'Examples:',
    '- /provider use oci Q',
    '- /provider test oci Q',
    '- /provider connect oci',
    '- /provider key oci <api-key>',
    '- /provider use openai gpt-5.4',
    '- /provider connect openai',
    '- /login',
    '- /provider model gemini gemini-3-flash-preview',
    '- /provider base-url oci <url>',
    '- /provider clear-key oci',
  ].join('\n')
}

function buildHelpMessage(): string {
  return [
    'Usage: /provider [status|use|key|clear-key|model|base-url|test|connect] ...',
    '',
    'Commands:',
    '- /provider',
    '- /provider status',
    '- /provider use <provider> [model]',
    '- /provider test [provider] [model]',
    '- /provider connect <provider>',
    '- /provider key <provider> <api-key>',
    '- /provider clear-key <provider>',
    '- /provider model <provider> <model>',
    '- /provider base-url <provider> <url>',
    '',
    'Notes:',
    '- /provider use switches the active model for this session and future launches.',
    '- /provider test sends a lightweight live probe to the configured provider endpoint.',
    '- /provider connect opens the provider portal or account docs in your browser.',
    '- /provider key stores the key in user settings.json. It is convenient, but it is still plaintext on disk.',
    '- /provider model remembers a model option for the picker without switching immediately.',
    '- OCI can also use IAM for internal operator surfaces; public installs should still bring their own key or a hosted key issued separately.',
    '- OpenAI browser setup is a portal-to-key flow. OpenJaws account login stays on /login. OpenJaws does not mint third-party provider OAuth tokens for those API paths.',
  ].join('\n')
}

function resolveProviderBrowserConnectTarget(
  input: string,
): ProviderBrowserConnectTarget | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return normalizeExternalProvider(normalized)
}

function getProviderBrowserConnectInfo(
  target: ProviderBrowserConnectTarget,
): {
  label: string
  url: string | null
  nextStep: string
  summary: string
} {
  switch (target) {
    case 'oci':
      return {
        label: 'Q on OCI',
        url: 'https://qline.site',
        nextStep:
          '/provider key oci <api-key> or configure OCI IAM locally before /provider use oci Q',
        summary:
          'Q on OCI stays API-key or OCI-IAM based in OpenJaws. The browser path is for key issuance/docs, not provider OAuth.',
      }
    case 'openai':
      return {
        label: 'OpenAI',
        url: 'https://platform.openai.com/api-keys',
        nextStep: '/provider key openai <api-key> then /provider use openai gpt-5.4',
        summary:
          'OpenAI browser setup here is a provider-portal key flow. OpenJaws does not receive an OpenAI OAuth token for the API path.',
      }
    default: {
      const defaults = getExternalProviderDefaults(target)
      return {
        label: defaults.label,
        url: null,
        nextStep: `/provider key ${target} <api-key>`,
        summary:
          'This provider currently uses API-key setup in OpenJaws. No browser OAuth flow is wired for it yet.',
      }
    }
  }
}

function buildProbeMessage(probe: ExternalProviderProbeResult): string {
  const fixHints =
    probe.provider === 'ollama'
      ? [`/provider base-url ollama <url>`]
      : probe.provider === 'oci'
        ? [
            `/provider key ${probe.provider} <api-key>`,
            `/provider model ${probe.provider} <upstream-model-or-deployment-id>`,
            `/provider base-url ${probe.provider} <url>`,
            'or configure OCI_CONFIG_FILE / OCI_PROFILE / OCI_COMPARTMENT_ID / OCI_GENAI_PROJECT_ID plus Q_MODEL or OCI_MODEL',
          ]
      : [
          `/provider key ${probe.provider} <api-key>`,
          `/provider base-url ${probe.provider} <url>`,
        ]

  return [
    `Provider test: ${probe.summary}`,
    `Model: ${probe.modelRef}`,
    `Base URL: ${probe.baseURL}`,
    `Endpoint: ${probe.endpoint}`,
    `Auth: ${probe.apiKeySource ?? (probe.provider === 'ollama' ? 'not required' : 'not configured')}`,
    probe.detail ? `Detail: ${probe.detail}` : null,
    probe.ok ? null : `Fix with: ${fixHints.join(' · ')}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  rawArgs?: string,
): Promise<null> {
  const args = rawArgs?.trim() ?? ''
  if (HELP_ARGS.has(args)) {
    onDone(buildHelpMessage(), { display: 'system' })
    return null
  }

  if (STATUS_ARGS.has(args)) {
    onDone(buildStatusMessage(context), { display: 'system' })
    return null
  }

  const parts = args.split(/\s+/).filter(Boolean)
  const action = parts[0]?.toLowerCase()

  if (action === 'connect') {
    const target = resolveProviderBrowserConnectTarget(parts[1] ?? '')
    if (!target) {
      onDone('Usage: /provider connect <provider>', { display: 'system' })
      return null
    }

    const info = getProviderBrowserConnectInfo(target)
    const opened = info.url ? await openBrowser(info.url) : false
    onDone(
      [
        `${opened ? 'Opened' : 'Could not auto-open'} ${info.label} browser setup${info.url ? `: ${info.url}` : '.'}`,
        info.summary,
        `Next: ${info.nextStep}`,
      ].join('\n'),
      { display: 'system' },
    )
    return null
  }

  if (action === 'test' || action === 'validate') {
    const explicitModel = parts.slice(2).join(' ').trim()
    const modelRef = resolveProviderProbeModelRef(
      parts[1] ?? null,
      explicitModel,
      context.getAppState().mainLoopModel,
    )

    if (!modelRef) {
      onDone(
        'No provider model is configured yet. Use /provider use oci Q or /provider use <provider> <model> first.',
        { display: 'system' },
      )
      return null
    }

    const probe = await probeExternalProviderModel(modelRef)
    setExternalProviderProbe(context.setAppState, probe)
    onDone(buildProbeMessage(probe), { display: 'system' })
    return null
  }

  const provider = normalizeExternalProvider(parts[1] ?? '')

  if (!action || !provider) {
    onDone(
      provider
        ? buildHelpMessage()
        : `Unknown or missing provider. Valid providers: ${EXTERNAL_MODEL_PROVIDERS.join(', ')}`,
      { display: 'system' },
    )
    return null
  }

  if (action === 'key') {
    const apiKey = parts.slice(2).join(' ').trim()
    if (!apiKey) {
      onDone('Usage: /provider key <provider> <api-key>', {
        display: 'system',
      })
      return null
    }

    const error = rememberExternalProviderConfig(provider, {
      apiKey,
    })
    if (error) {
      onDone(`Failed to store ${provider} API key: ${error.message}`, {
        display: 'system',
      })
      return null
    }

    context.onChangeAPIKey()
    context.setMessages(stripSignatureBlocks)
    bumpExternalProviderAuthVersion(context.setAppState)
    onDone(`Stored ${provider} API key in user settings.`, {
      display: 'system',
    })
    return null
  }

  if (action === 'clear-key') {
    const error = rememberExternalProviderConfig(provider, {
      apiKey: undefined,
    })
    if (error) {
      onDone(`Failed to clear ${provider} API key: ${error.message}`, {
        display: 'system',
      })
      return null
    }

    context.onChangeAPIKey()
    context.setMessages(stripSignatureBlocks)
    bumpExternalProviderAuthVersion(context.setAppState)
    const defaults = getExternalProviderDefaults(provider)
    onDone(
      `Cleared stored ${provider} API key. Env fallback still applies if one of these is set: ${defaults.apiKeyEnvVars.join(', ')}`,
      { display: 'system' },
    )
    return null
  }

  if (action === 'base-url') {
    const baseURL = parts[2]?.trim()
    if (!baseURL) {
      onDone('Usage: /provider base-url <provider> <url>', {
        display: 'system',
      })
      return null
    }

    const error = rememberExternalProviderConfig(provider, {
      baseURL,
    })
    if (error) {
      onDone(`Failed to store ${provider} base URL: ${error.message}`, {
        display: 'system',
      })
      return null
    }

    onDone(`Set ${provider} base URL to ${baseURL}`, { display: 'system' })
    return null
  }

  if (action === 'model') {
    const model = parts.slice(2).join(' ').trim()
    if (!model) {
      onDone('Usage: /provider model <provider> <model>', {
        display: 'system',
      })
      return null
    }

    const modelRef = buildExternalProviderModelRef(provider, model)
    const error = rememberExternalModel(modelRef)
    if (error) {
      onDone(`Failed to save ${modelRef}: ${error.message}`, {
        display: 'system',
      })
      return null
    }

    onDone(`Saved model option ${modelRef} for the picker.`, {
      display: 'system',
    })
    return null
  }

  if (action === 'use') {
    const explicitModel = parts.slice(2).join(' ').trim()
    const model =
      explicitModel ||
      getSavedOrConfiguredModelForProvider(
        provider,
        context.getAppState().mainLoopModel,
      )
    if (!model) {
      onDone(
        `No default model is known for ${provider}. Use /provider use ${provider} <model> or /provider model ${provider} <model>.`,
        { display: 'system' },
      )
      return null
    }

    const modelRef = buildExternalProviderModelRef(provider, model)
    const rememberError = rememberExternalModel(modelRef)
    if (rememberError) {
      onDone(`Failed to save ${modelRef}: ${rememberError.message}`, {
        display: 'system',
      })
      return null
    }

    context.setMessages(stripSignatureBlocks)
    setCurrentExternalModel(context.setAppState, modelRef)
    const resolved = resolveExternalModelConfig(modelRef)
    const keyNote =
      provider === 'ollama'
        ? 'Ollama does not require an API key.'
        : resolved?.apiKeySource
          ? `${provider} key source: ${resolved.apiKeySource}`
          : `No ${provider} key is configured yet.`
    onDone(
      `Set active model to ${modelRef}. ${keyNote} Run /provider test ${provider} ${model} to validate reachability.`,
      {
        display: 'system',
      },
    )
    return null
  }

  onDone(buildHelpMessage(), { display: 'system' })
  return null
}
