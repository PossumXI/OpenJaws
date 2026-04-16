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
  setExternalProviderProbe,
  setCurrentExternalModel,
} from '../utils/externalProviderSetup.js'
import { getInitialSettings } from '../utils/settings/settings.js'
import {
  probeExternalProviderModel,
  type ExternalProviderProbeResult,
} from '../utils/externalProviderProbe.js'
import {
  resolveEffectiveOciBaseUrl,
  resolveOciQRuntime,
} from '../utils/ociQRuntime.js'

type RuntimeChoice = ExternalModelProvider | 'openjaws-account'
type SetupStage = 'runtime' | 'model' | 'key' | 'probe'

type ProbeState = {
  loading: boolean
  result: ExternalProviderProbeResult | null
}

type Props = {
  oauthEnabled: boolean
  onDone: (skipOAuth: boolean) => void
}

function getProviderBrowserAssistCopy(
  provider: ExternalModelProvider | null,
): string {
  switch (provider) {
    case 'oci':
      return 'Need a Q key? /provider connect oci opens qline.site in your browser.'
    case 'openai':
      return 'Need an OpenAI key? /provider connect openai opens the OpenAI API keys page in your browser.'
    case 'gemini':
      return 'Need a Gemini key? /provider connect gemini keeps the setup flow explicit and key-based.'
    default:
      return `Need help getting one? /provider connect ${provider ?? 'openai'} opens the provider setup page in your browser.`
  }
}

function getInitialRuntimeChoice(): RuntimeChoice {
  const currentModel = getInitialSettings().model
  const externalRef =
    typeof currentModel === 'string'
      ? resolveExternalModelRef(currentModel)
      : null
  if (externalRef) {
    return externalRef.provider
  }
  return 'oci'
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
  const ociRuntime = provider === 'oci' ? resolveOciQRuntime() : null
  const baseURL =
    provider === 'oci'
      ? resolveEffectiveOciBaseUrl({
          baseURL: resolved?.baseURL ?? defaults.baseURL,
          baseURLSource: resolved?.baseURLSource ?? null,
        })
      : resolved?.baseURL ?? defaults.baseURL
  if (provider === 'ollama') {
    return `${model} · local runtime · ${baseURL}`
  }
  if (provider === 'oci' && !resolved?.apiKeySource && ociRuntime?.authMode === 'iam' && ociRuntime.ready) {
    return `${model} · OCI IAM ${ociRuntime.profile} · ${baseURL}`
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
  const [probeNonce, setProbeNonce] = useState(0)
  const [probeState, setProbeState] = useState<ProbeState>({
    loading: false,
    result: null,
  })
  const initialRuntimeChoice = useMemo(
    () => getInitialRuntimeChoice(),
    [],
  )

  const runtimeOptions = useMemo<OptionWithDescription<RuntimeChoice>[]>(() => {
    const options: OptionWithDescription<RuntimeChoice>[] = []
    if (oauthEnabled) {
      options.push({
        label: 'OpenJaws account',
        value: 'openjaws-account',
        description:
          'Use built-in browser login, managed defaults, and the standard startup path.',
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

  const beginProbe = useCallback((provider: ExternalModelProvider, model: string) => {
    setError(null)
    setSelectedProvider(provider)
    setModelValue(model.trim())
    setProbeState({
      loading: true,
      result: null,
    })
    setStage('probe')
    setProbeNonce(prev => prev + 1)
  }, [])

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
      const ociRuntime =
        selectedProvider === 'oci' ? resolveOciQRuntime() : null
      const hasOciIam =
        selectedProvider === 'oci' &&
        !resolved?.apiKeySource &&
        ociRuntime?.authMode === 'iam' &&
        ociRuntime.ready
      if (selectedProvider !== 'ollama' && !resolved?.apiKeySource && !hasOciIam) {
        setStage('key')
        return
      }

      const applyError = applyExternalSelection(selectedProvider, trimmedModel)
      if (applyError) {
        setError(applyError.message)
        return
      }

      beginProbe(selectedProvider, trimmedModel)
    },
    [applyExternalSelection, beginProbe, selectedProvider],
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

      beginProbe(selectedProvider, modelValue)
    },
    [applyExternalSelection, beginProbe, modelValue, selectedProvider],
  )

  React.useEffect(() => {
    if (stage !== 'probe' || !selectedProvider || !modelValue.trim()) {
      return
    }

    let cancelled = false
    const modelRef = buildExternalProviderModelRef(
      selectedProvider,
      modelValue.trim(),
    )

    setProbeState({
      loading: true,
      result: null,
    })

    void (async () => {
      const result = await probeExternalProviderModel(modelRef)
      if (cancelled) {
        return
      }

      setExternalProviderProbe(setAppState, result)
      setProbeState({
        loading: false,
        result,
      })
    })()

    return () => {
      cancelled = true
    }
  }, [modelValue, probeNonce, selectedProvider, setAppState, stage])

  if (stage === 'runtime') {
    return (
      <Box flexDirection="column" gap={1} paddingLeft={1}>
        <Text bold>Choose your runtime path</Text>
        <Box width={76}>
          <Text dimColor>
            Pick the provider or account path you want OpenJaws to use first.
            Q on OCI is the default runtime path for fresh installs. You can
            change it later in Settings &gt; Config &gt; Model or with /provider.
            {' '}Use OpenJaws account when you want the built-in browser login
            lane. External providers stay browser-assisted and key-based.
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
              ? `Base URL: ${
                  selectedProvider === 'oci'
                    ? resolveEffectiveOciBaseUrl({
                        baseURL:
                          resolvedSelection?.baseURL ??
                          getExternalProviderDefaults(selectedProvider).baseURL,
                        baseURLSource: resolvedSelection?.baseURLSource ?? null,
                      })
                    : resolvedSelection?.baseURL ??
                      getExternalProviderDefaults(selectedProvider).baseURL
                }`
              : 'Base URL pending'}
            {selectedProvider !== 'ollama'
              ? resolvedSelection?.apiKeySource
                ? ` · key ${resolvedSelection.apiKeySource}`
                : selectedProvider === 'oci' &&
                    resolveOciQRuntime().authMode === 'iam' &&
                    resolveOciQRuntime().ready
                  ? ` · OCI IAM ${resolveOciQRuntime().profile}`
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

  if (stage === 'probe') {
    const providerLabel = selectedProvider
      ? getExternalProviderDefaults(selectedProvider).label
      : 'Provider'
    const probeOptions: OptionWithDescription<'continue' | 'retry' | 'edit'>[] = [
      {
        label:
          probeState.result?.ok === false ? 'Continue anyway' : 'Continue',
        value: 'continue',
        description:
          probeState.result?.ok === false
            ? 'Keep startup moving and fix provider wiring later from the deck.'
            : 'Provider wiring is reachable enough to continue.',
      },
      {
        label: 'Retry check',
        value: 'retry',
        description: 'Run the live provider check again.',
      },
      {
        label: 'Edit setup',
        value: 'edit',
        description: 'Go back and change the model or key before continuing.',
      },
    ]

    if (probeState.loading || !probeState.result) {
      return (
        <Box flexDirection="column" gap={1} paddingLeft={1}>
          <Text bold>Validate {providerLabel} wiring</Text>
          <Box width={78}>
            <Text dimColor>
              Running a lightweight live reachability check before OpenJaws
              enters the main deck.
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1} paddingLeft={1}>
        <Text bold>{providerLabel} reachability</Text>
        <Box width={80}>
          <Text dimColor>{probeState.result.summary}</Text>
        </Box>
        <Text dimColor>Model: {probeState.result.modelRef}</Text>
        <Text dimColor>Base URL: {probeState.result.baseURL}</Text>
        <Text dimColor>Endpoint: {probeState.result.endpoint}</Text>
        <Text dimColor>
          Auth:{' '}
          {probeState.result.apiKeySource ??
            (probeState.result.provider === 'ollama'
              ? 'not required'
              : 'not configured')}
        </Text>
        {probeState.result.detail ? (
          <Box width={80}>
            {probeState.result.ok ? (
              <Text dimColor>{probeState.result.detail}</Text>
            ) : (
              <Text color="warning">{probeState.result.detail}</Text>
            )}
          </Box>
        ) : null}
        <Box width={80}>
          <Text dimColor>
            Controls: /provider test {probeState.result.provider}{' '}
            {probeState.result.model} · /provider base-url{' '}
            {probeState.result.provider} &lt;url&gt;
          </Text>
        </Box>
        <Select
          options={probeOptions}
          defaultValue="continue"
          defaultFocusValue="continue"
          onChange={value => {
            if (value === 'retry') {
              setProbeNonce(prev => prev + 1)
              return
            }
            if (value === 'edit') {
              setStage(selectedProvider === 'ollama' ? 'model' : 'key')
              return
            }
            onDone(true)
          }}
        />
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
          {' '}if one is already set in the environment.{' '}
          {getProviderBrowserAssistCopy(selectedProvider)}
          {selectedProvider === 'oci'
            ? ' Public installs should bring their own key or a hosted key from qline.site when that issuing lane is live. Internal operator surfaces can use OCI IAM instead.'
            : ''}
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
