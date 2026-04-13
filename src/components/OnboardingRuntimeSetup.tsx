import React, { useCallback, useMemo, useState } from 'react'
import { useAppState, useSetAppState } from '../state/AppState.js'
import { Box, Newline, Text } from '../ink.js'
import { Select, type OptionWithDescription } from './CustomSelect/index.js'
import TextInput from './TextInput.js'
import {
  EXTERNAL_MODEL_PROVIDERS,
  getExternalProviderDefaults,
  resolveExternalModelConfig,
  resolveExternalModelRef,
  type ExternalModelProvider,
} from '../utils/model/externalProviders.js'
import {
  buildExternalProviderModelRef,
  bumpExternalProviderAuthVersion,
  getSavedOrConfiguredModelForProvider,
  rememberExternalModel,
  rememberExternalProviderConfig,
  setCurrentExternalModel,
} from '../utils/externalProviderSetup.js'
import { getInitialSettings } from '../utils/settings/settings.js'

type RuntimeChoice = ExternalModelProvider | 'openjaws-account'
type SetupStage = 'runtime' | 'model' | 'key'

type Props = {
  oauthEnabled: boolean
  onDone: (skipOAuth: boolean) => void
}

function getInitialRuntimeChoice(oauthEnabled: boolean): RuntimeChoice {
  const currentModel = getInitialSettings().model
  const externalRef =
    typeof currentModel === 'string'
      ? resolveExternalModelRef(currentModel)
      : null
  if (externalRef) {
    return externalRef.provider
  }
  if (oauthEnabled) {
    return 'openjaws-account'
  }
  return 'openai'
}

function buildRuntimeOptionDescription(
  provider: ExternalModelProvider,
  currentMainLoopModel: string | null,
): string {
  const defaults = getExternalProviderDefaults(provider)
  const model =
    getSavedOrConfiguredModelForProvider(provider, currentMainLoopModel) ??
    'model not set'
  const resolved = resolveExternalModelConfig(
    buildExternalProviderModelRef(provider, model),
  )
  if (provider === 'ollama') {
    return `${model} · local runtime · ${resolved?.baseURL ?? defaults.baseURL}`
  }
  return `${model} · ${resolved?.apiKeySource ? `key ${resolved.apiKeySource}` : `needs ${defaults.apiKeyEnvVars[0]}`}`
}

export function OnboardingRuntimeSetup({
  oauthEnabled,
  onDone,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const currentMainLoopModel = useAppState(state => state.mainLoopModel)
  const [stage, setStage] = useState<SetupStage>('runtime')
  const [selectedProvider, setSelectedProvider] =
    useState<ExternalModelProvider | null>(null)
  const [modelValue, setModelValue] = useState('')
  const [modelCursorOffset, setModelCursorOffset] = useState(0)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [apiKeyCursorOffset, setApiKeyCursorOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const initialRuntimeChoice = useMemo(
    () => getInitialRuntimeChoice(oauthEnabled),
    [oauthEnabled],
  )

  const runtimeOptions = useMemo<OptionWithDescription<RuntimeChoice>[]>(() => {
    const options: OptionWithDescription<RuntimeChoice>[] = []
    if (oauthEnabled) {
      options.push({
        label: 'OpenJaws account',
        value: 'openjaws-account',
        description: 'Use built-in login, managed defaults, and the standard startup path.',
      })
    }

    for (const provider of EXTERNAL_MODEL_PROVIDERS) {
      const defaults = getExternalProviderDefaults(provider)
      options.push({
        label: defaults.label,
        value: provider,
        description: buildRuntimeOptionDescription(
          provider,
          currentMainLoopModel,
        ),
      })
    }

    return options
  }, [currentMainLoopModel, oauthEnabled])

  const resolvedSelection =
    selectedProvider && modelValue.trim()
      ? resolveExternalModelConfig(
          buildExternalProviderModelRef(selectedProvider, modelValue.trim()),
        )
      : null

  const applyExternalSelection = useCallback(
    (provider: ExternalModelProvider, model: string, apiKey?: string): Error | null => {
      const trimmedModel = model.trim()
      if (apiKey?.trim()) {
        const keyError = rememberExternalProviderConfig(provider, {
          apiKey: apiKey.trim(),
        })
        if (keyError) {
          return keyError
        }
        bumpExternalProviderAuthVersion(setAppState)
      }

      const modelRef = buildExternalProviderModelRef(provider, trimmedModel)
      const modelError = rememberExternalModel(modelRef)
      if (modelError) {
        return modelError
      }

      setCurrentExternalModel(setAppState, modelRef)
      return null
    },
    [setAppState],
  )

  const handleRuntimeChoice = useCallback(
    (choice: RuntimeChoice) => {
      setError(null)
      if (choice === 'openjaws-account') {
        onDone(false)
        return
      }

      const suggestedModel =
        getSavedOrConfiguredModelForProvider(choice, currentMainLoopModel) ?? ''
      setSelectedProvider(choice)
      setModelValue(suggestedModel)
      setModelCursorOffset(suggestedModel.length)
      setApiKeyValue('')
      setApiKeyCursorOffset(0)
      setStage('model')
    },
    [currentMainLoopModel, onDone],
  )

  const handleModelSubmit = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        setError('Choose a provider first.')
        return
      }

      const trimmedModel = value.trim()
      if (!trimmedModel) {
        setError('Enter a model name.')
        return
      }

      setError(null)
      setModelValue(trimmedModel)
      setModelCursorOffset(trimmedModel.length)

      const resolved = resolveExternalModelConfig(
        buildExternalProviderModelRef(selectedProvider, trimmedModel),
      )
      if (selectedProvider !== 'ollama' && !resolved?.apiKeySource) {
        setStage('key')
        return
      }

      const applyError = applyExternalSelection(selectedProvider, trimmedModel)
      if (applyError) {
        setError(applyError.message)
        return
      }

      onDone(true)
    },
    [applyExternalSelection, onDone, selectedProvider],
  )

  const handleApiKeySubmit = useCallback(
    (value: string) => {
      if (!selectedProvider) {
        setError('Choose a provider first.')
        return
      }

      const applyError = applyExternalSelection(
        selectedProvider,
        modelValue,
        value.trim() || undefined,
      )
      if (applyError) {
        setError(applyError.message)
        return
      }

      onDone(true)
    },
    [applyExternalSelection, modelValue, onDone, selectedProvider],
  )

  if (stage === 'runtime') {
    return (
      <Box flexDirection="column" gap={1} paddingLeft={1}>
        <Text bold>Choose your runtime path</Text>
        <Box width={76}>
          <Text dimColor>
            Pick the provider or account path you want OpenJaws to use first.
            You can change it later in Settings &gt; Config &gt; Model or with
            /provider.
          </Text>
        </Box>
        <Select
          options={runtimeOptions}
          defaultValue={initialRuntimeChoice}
          defaultFocusValue={initialRuntimeChoice}
          onChange={handleRuntimeChoice}
        />
      </Box>
    )
  }

  if (stage === 'model') {
    const providerLabel = selectedProvider
      ? getExternalProviderDefaults(selectedProvider).label
      : 'Provider'
    return (
      <Box flexDirection="column" gap={1} paddingLeft={1}>
        <Text bold>{providerLabel} model</Text>
        <Box width={78}>
          <Text dimColor>
            Use the suggested model or replace it with any model id OpenJaws
            should start with.
            <Newline />
            {selectedProvider
              ? `Base URL: ${resolvedSelection?.baseURL ?? getExternalProviderDefaults(selectedProvider).baseURL}`
              : 'Base URL pending'}
            {selectedProvider !== 'ollama'
              ? resolvedSelection?.apiKeySource
                ? ` · key ${resolvedSelection.apiKeySource}`
                : ` · key next`
              : ' · no key required'}
          </Text>
        </Box>
        <Box borderStyle="round" borderColor="border" paddingLeft={1}>
          <TextInput
            value={modelValue}
            onChange={setModelValue}
            onSubmit={handleModelSubmit}
            columns={72}
            cursorOffset={modelCursorOffset}
            onChangeCursorOffset={setModelCursorOffset}
            placeholder="Enter model id…"
            focus
            showCursor
          />
        </Box>
        <Text dimColor>Enter to continue with this model.</Text>
        {error ? <Text color="error">{error}</Text> : null}
      </Box>
    )
  }

  const providerDefaults = selectedProvider
    ? getExternalProviderDefaults(selectedProvider)
    : null
  const providerLabel = providerDefaults?.label ?? 'Provider'

  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>{providerLabel} API key</Text>
      <Box width={78}>
        <Text dimColor>
          Store a key now or leave this blank and press Enter to continue.
          OpenJaws will also use {providerDefaults?.apiKeyEnvVars.join(' / ')}
          {' '}if one is already set in the environment.
        </Text>
      </Box>
      <Box borderStyle="round" borderColor="border" paddingLeft={1}>
        <TextInput
          value={apiKeyValue}
          onChange={setApiKeyValue}
          onSubmit={handleApiKeySubmit}
          columns={72}
          cursorOffset={apiKeyCursorOffset}
          onChangeCursorOffset={setApiKeyCursorOffset}
          placeholder="Paste API key…"
          mask="*"
          focus
          showCursor
        />
      </Box>
      <Text dimColor>Enter saves the key. Blank Enter skips for now.</Text>
      {error ? <Text color="error">{error}</Text> : null}
    </Box>
  )
}
