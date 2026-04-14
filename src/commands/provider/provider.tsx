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
import { modelDisplayString } from '../../utils/model/model.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import { getInitialSettings } from '../../utils/settings/settings.js'
import {
  buildExternalProviderModelRef,
  bumpExternalProviderAuthVersion,
  getSavedOrConfiguredModelForProvider,
  normalizeExternalProvider,
  rememberExternalModel,
  rememberExternalProviderConfig,
  setCurrentExternalModel,
} from '../../utils/externalProviderSetup.js'

const HELP_ARGS = new Set(['help', '-h', '--help'])
const STATUS_ARGS = new Set(['', 'status', 'list', 'current'])

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
  const keySource =
    resolved?.apiKeySource ??
    (provider === 'ollama'
      ? 'not required'
      : `missing (env: ${defaults.apiKeyEnvVars.join(', ')})`)
  const modelHint = preferredModel
    ? buildExternalProviderModelRef(provider, preferredModel)
    : `unset (env: ${defaults.modelEnvVars.join(', ') || 'none'})`
  return `- ${provider}: model ${modelHint} · key ${keySource} · base URL ${resolved?.baseURL ?? defaults.baseURL}`
}

function buildStatusMessage(context: LocalJSXCommandContext): string {
  const currentModel =
    context.getAppState().mainLoopModel ?? getInitialSettings().model ?? null
  const currentDisplay =
    currentModel === null ? 'default' : modelDisplayString(currentModel)
  const providerLines = EXTERNAL_MODEL_PROVIDERS.map(provider =>
    formatProviderStatus(provider, context),
  )
  return [
    `Current model: ${currentDisplay}`,
    '',
    'External providers:',
    ...providerLines,
    '',
    'Examples:',
    '- /provider use oci Q',
    '- /provider key oci <api-key>',
    '- /provider use openai gpt-5.4',
    '- /provider model gemini gemini-3.1-pro-preview',
    '- /provider base-url oci <url>',
    '- /provider clear-key oci',
  ].join('\n')
}

function buildHelpMessage(): string {
  return [
    'Usage: /provider [status|use|key|clear-key|model|base-url] ...',
    '',
    'Commands:',
    '- /provider',
    '- /provider status',
    '- /provider use <provider> [model]',
    '- /provider key <provider> <api-key>',
    '- /provider clear-key <provider>',
    '- /provider model <provider> <model>',
    '- /provider base-url <provider> <url>',
    '',
    'Notes:',
    '- /provider use switches the active model for this session and future launches.',
    '- /provider key stores the key in user settings.json. It is convenient, but it is still plaintext on disk.',
    '- /provider model remembers a model option for the picker without switching immediately.',
  ].join('\n')
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
    onDone(`Set active model to ${modelRef}. ${keyNote}`, {
      display: 'system',
    })
    return null
  }

  onDone(buildHelpMessage(), { display: 'system' })
  return null
}
