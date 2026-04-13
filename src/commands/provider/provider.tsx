import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../commands.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  EXTERNAL_MODEL_PROVIDERS,
  type ExternalModelProvider,
  getExternalProviderDefaults,
  isExternalModelProvider,
  resolveExternalModelConfig,
  resolveExternalModelRef,
} from '../../utils/model/externalProviders.js'
import { modelDisplayString } from '../../utils/model/model.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

const HELP_ARGS = new Set(['help', '-h', '--help'])
const STATUS_ARGS = new Set(['', 'status', 'list', 'current'])

const BUILTIN_PROVIDER_DEFAULT_MODELS: Partial<
  Record<ExternalModelProvider, string>
> = {
  openai: 'gpt-5.4',
  gemini: 'gemini-3-flash-preview',
  codex: 'gpt-5.4',
  minimax: 'MiniMax-M2.7',
  ollama: 'gemma4:e4b',
}

function normalizeProvider(input: string): ExternalModelProvider | null {
  const provider = input.trim().toLowerCase()
  return isExternalModelProvider(provider) ? provider : null
}

function buildModelRef(
  provider: ExternalModelProvider,
  model: string,
): string {
  return `${provider}:${model.trim()}`
}

function notifyUserSettingsChanged(): void {
  settingsChangeDetector.notifyChange('userSettings')
}

function rememberModel(modelRef: string): Error | null {
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

function rememberProviderConfig(
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

function getSavedOrConfiguredModelForProvider(
  provider: ExternalModelProvider,
  context: LocalJSXCommandContext,
): string | null {
  const appStateModel = context.getAppState().mainLoopModel
  const appRef =
    typeof appStateModel === 'string'
      ? resolveExternalModelRef(appStateModel)
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

function formatProviderStatus(
  provider: ExternalModelProvider,
  context: LocalJSXCommandContext,
): string {
  const defaults = getExternalProviderDefaults(provider)
  const resolved = resolveExternalModelConfig(`${provider}:__probe__`)
  const preferredModel = getSavedOrConfiguredModelForProvider(provider, context)
  const keySource =
    resolved?.apiKeySource ??
    (provider === 'ollama'
      ? 'not required'
      : `missing (env: ${defaults.apiKeyEnvVars.join(', ')})`)
  const modelHint = preferredModel
    ? buildModelRef(provider, preferredModel)
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
    '- /provider use openai gpt-5.4',
    '- /provider key openai <api-key>',
    '- /provider use ollama gemma4:e4b',
    '- /provider model gemini gemini-3.1-pro-preview',
    '- /provider base-url ollama http://127.0.0.1:11434',
    '- /provider clear-key openai',
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

function setCurrentModel(
  context: LocalJSXCommandContext,
  modelRef: string,
): void {
  context.setMessages(stripSignatureBlocks)
  context.setAppState(prev => ({
    ...prev,
    mainLoopModel: modelRef,
    mainLoopModelForSession: null,
  }))
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
  const provider = normalizeProvider(parts[1] ?? '')

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

    const error = rememberProviderConfig(provider, {
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
    context.setAppState(prev => ({
      ...prev,
      authVersion: prev.authVersion + 1,
    }))
    onDone(`Stored ${provider} API key in user settings.`, {
      display: 'system',
    })
    return null
  }

  if (action === 'clear-key') {
    const error = rememberProviderConfig(provider, {
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
    context.setAppState(prev => ({
      ...prev,
      authVersion: prev.authVersion + 1,
    }))
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

    const error = rememberProviderConfig(provider, {
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

    const modelRef = buildModelRef(provider, model)
    const error = rememberModel(modelRef)
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
      explicitModel || getSavedOrConfiguredModelForProvider(provider, context)
    if (!model) {
      onDone(
        `No default model is known for ${provider}. Use /provider use ${provider} <model> or /provider model ${provider} <model>.`,
        { display: 'system' },
      )
      return null
    }

    const modelRef = buildModelRef(provider, model)
    const rememberError = rememberModel(modelRef)
    if (rememberError) {
      onDone(`Failed to save ${modelRef}: ${rememberError.message}`, {
        display: 'system',
      })
      return null
    }

    setCurrentModel(context, modelRef)
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
