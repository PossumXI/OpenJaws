import chalk from 'chalk'
import figures from 'figures'
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { Box, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { toError } from '../utils/errors.js'
import { logError } from '../utils/log.js'
import {
  getSettingSourceName,
  type SettingSource,
} from '../utils/settings/constants.js'
import { updateSettingsForSource } from '../utils/settings/settings.js'
import {
  getEnvironmentSelectionInfo,
  isConfiguredDefaultEnvironmentOverridable,
  type EnvironmentSelectionInfo,
} from '../utils/teleport/environmentSelection.js'
import type { EnvironmentResource } from '../utils/teleport/environments.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/select.js'
import { Byline } from './design-system/Byline.js'
import { Dialog } from './design-system/Dialog.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { LoadingState } from './design-system/LoadingState.js'

const DIALOG_TITLE = 'Select Remote Environment'
const SETUP_HINT = `Configure environments at: https://openjaws.dev/code`

type Props = {
  onDone: (message?: string) => void
}

type LoadingState = 'loading' | 'updating' | null

function getSourceSuffix(source: SettingSource | null): string {
  return source && source !== 'localSettings'
    ? ` (from ${getSettingSourceName(source)} settings)`
    : ''
}

function buildMismatchGuidance(
  configuredDefaultEnvironmentId: string | null,
  source: SettingSource | null,
  canPersistSelection: boolean,
  suggestedEnvironment: EnvironmentResource | null,
): string {
  const configuredId = configuredDefaultEnvironmentId ?? 'unknown'
  const sourceLabel = source ? getSettingSourceName(source) : 'active'
  const suggestion = suggestedEnvironment
    ? ` Suggested environment: ${suggestedEnvironment.name} (${suggestedEnvironment.environment_id}).`
    : ''

  if (canPersistSelection) {
    return `Configured environment ${configuredId} from ${sourceLabel} settings was not found. Choose a replacement to save in project local settings.${suggestion}`
  }

  if (source === 'flagSettings') {
    return `Configured environment ${configuredId} came from CLI flag settings and is read-only here. Restart without that flag or update the flag value.${suggestion}`
  }

  return `Configured environment ${configuredId} came from managed settings and is read-only here. Fix the managed settings source instead.${suggestion}`
}

function EnvironmentLabel({
  environment,
}: {
  environment: EnvironmentResource
}): React.ReactNode {
  return (
    <Text>
      {figures.tick} Using <Text bold>{environment.name}</Text>{' '}
      <Text dimColor>({environment.environment_id})</Text>
    </Text>
  )
}

function EnvironmentList({
  environments,
  selectedEnvironmentId,
}: {
  environments: EnvironmentResource[]
  selectedEnvironmentId: string | null
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      {environments.map(environment => {
        const selected = environment.environment_id === selectedEnvironmentId
        return (
          <Text key={environment.environment_id}>
            {selected ? figures.tick : figures.pointerSmall}{' '}
            <Text bold={selected}>{environment.name}</Text>{' '}
            <Text dimColor>({environment.environment_id})</Text>
          </Text>
        )
      })}
    </Box>
  )
}

function SingleEnvironmentContent({
  environment,
  onDone,
  repairSelection,
  guidance,
}: {
  environment: EnvironmentResource
  onDone: () => void
  repairSelection: (() => void) | null
  guidance?: string
}): React.ReactNode {
  useKeybinding('confirm:yes', repairSelection ?? onDone, {
    context: 'Confirmation',
  })

  return (
    <Dialog title={DIALOG_TITLE} subtitle={SETUP_HINT} onCancel={onDone}>
      <Box flexDirection="column">
        {guidance ? <Text color="warning">{guidance}</Text> : null}
        <EnvironmentLabel environment={environment} />
        {repairSelection ? (
          <Text dimColor>Press Enter to save this replacement.</Text>
        ) : null}
      </Box>
    </Dialog>
  )
}

function ReadOnlyEnvironmentContent({
  environments,
  selectedEnvironment,
  selectedEnvironmentSource,
  onDone,
  guidance,
}: {
  environments: EnvironmentResource[]
  selectedEnvironment: EnvironmentResource
  selectedEnvironmentSource: SettingSource | null
  onDone: () => void
  guidance: string
}): React.ReactNode {
  const subtitle = (
    <Text>
      Currently using: <Text bold>{selectedEnvironment.name}</Text>
      {getSourceSuffix(selectedEnvironmentSource)}
    </Text>
  )

  return (
    <Dialog
      title={DIALOG_TITLE}
      subtitle={subtitle}
      onCancel={onDone}
      hideInputGuide
    >
      <Box flexDirection="column">
        <Text dimColor>{SETUP_HINT}</Text>
        <Text color="warning">{guidance}</Text>
        <EnvironmentList
          environments={environments}
          selectedEnvironmentId={selectedEnvironment.environment_id}
        />
        <Text dimColor>
          <Byline>
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="close"
            />
          </Byline>
        </Text>
      </Box>
    </Dialog>
  )
}

function MultipleEnvironmentsContent({
  environments,
  selectedEnvironment,
  selectedEnvironmentSource,
  loadingState,
  onSelect,
  onCancel,
  guidance,
}: {
  environments: EnvironmentResource[]
  selectedEnvironment: EnvironmentResource
  selectedEnvironmentSource: SettingSource | null
  loadingState: LoadingState
  onSelect: (value: string) => void
  onCancel: () => void
  guidance?: string
}): React.ReactNode {
  const subtitle = (
    <Text>
      Currently using: <Text bold>{selectedEnvironment.name}</Text>
      {getSourceSuffix(selectedEnvironmentSource)}
    </Text>
  )

  return (
    <Dialog
      title={DIALOG_TITLE}
      subtitle={subtitle}
      onCancel={onCancel}
      hideInputGuide
    >
      <Box flexDirection="column">
        <Text dimColor>{SETUP_HINT}</Text>
        {guidance ? <Text color="warning">{guidance}</Text> : null}
        {loadingState === 'updating' ? (
          <LoadingState message="Updating…" />
        ) : (
          <Select
            options={environments.map(environment => ({
              label: (
                <Text>
                  {environment.name}{' '}
                  <Text dimColor>({environment.environment_id})</Text>
                </Text>
              ),
              value: environment.environment_id,
            }))}
            defaultValue={selectedEnvironment.environment_id}
            onChange={onSelect}
            onCancel={() => onSelect('cancel')}
            layout="compact-vertical"
          />
        )}
        <Text dimColor>
          <Byline>
            <KeyboardShortcutHint shortcut="Enter" action="select" />
            <ConfigurableShortcutHint
              action="confirm:no"
              context="Confirmation"
              fallback="Esc"
              description="cancel"
            />
          </Byline>
        </Text>
      </Box>
    </Dialog>
  )
}

export function RemoteEnvironmentDialog({
  onDone,
}: Props): React.ReactNode {
  const [loadingState, setLoadingState] = useState<LoadingState>('loading')
  const [selectionInfo, setSelectionInfo] =
    useState<EnvironmentSelectionInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function fetchInfo(): Promise<void> {
      try {
        const result = await getEnvironmentSelectionInfo()
        if (cancelled) return
        setSelectionInfo(result)
        setLoadingState(null)
      } catch (err) {
        if (cancelled) return
        const fetchError = toError(err)
        logError(fetchError)
        setError(fetchError.message)
        setLoadingState(null)
      }
    }

    void fetchInfo()
    return () => {
      cancelled = true
    }
  }, [])

  const environments = selectionInfo?.availableEnvironments ?? []
  const selectedEnvironment = selectionInfo?.selectedEnvironment ?? null
  const selectedEnvironmentSource = selectionInfo?.selectedEnvironmentSource ?? null
  const configuredDefaultEnvironmentId =
    selectionInfo?.configuredDefaultEnvironmentId ?? null
  const missingConfiguredDefaultEnvironment =
    selectionInfo?.missingConfiguredDefaultEnvironment ?? false
  const suggestedEnvironment = selectionInfo?.suggestedEnvironment ?? null
  const canPersistSelection = isConfiguredDefaultEnvironmentOverridable(
    selectedEnvironmentSource,
  )

  const guidance = useMemo(() => {
    if (!missingConfiguredDefaultEnvironment) {
      return undefined
    }

    return buildMismatchGuidance(
      configuredDefaultEnvironmentId,
      selectedEnvironmentSource,
      canPersistSelection,
      suggestedEnvironment,
    )
  }, [
    canPersistSelection,
    configuredDefaultEnvironmentId,
    missingConfiguredDefaultEnvironment,
    selectedEnvironmentSource,
    suggestedEnvironment,
  ])

  function persistSelection(environment: EnvironmentResource): void {
    setLoadingState('updating')
    updateSettingsForSource('localSettings', {
      remote: {
        defaultEnvironmentId: environment.environment_id,
      },
    })
    onDone(
      `Set default remote environment to ${chalk.bold(environment.name)} (${environment.environment_id})`,
    )
  }

  function handleSelect(value: string): void {
    if (value === 'cancel') {
      onDone()
      return
    }

    const environment =
      environments.find(env => env.environment_id === value) ?? null
    if (!environment) {
      onDone('Error: Selected environment not found')
      return
    }

    if (!canPersistSelection) {
      onDone(
        selectedEnvironmentSource === 'flagSettings'
          ? 'Configured remote environment came from CLI flag settings. Restart without that flag or update the flag value.'
          : 'Configured remote environment came from managed settings and cannot be changed here.',
      )
      return
    }

    persistSelection(environment)
  }

  if (loadingState === 'loading') {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={onDone} hideInputGuide>
        <LoadingState message="Loading environments…" />
      </Dialog>
    )
  }

  if (error) {
    return (
      <Dialog title={DIALOG_TITLE} onCancel={onDone}>
        <Text color="error">Error: {error}</Text>
      </Dialog>
    )
  }

  if (!selectedEnvironment) {
    return (
      <Dialog title={DIALOG_TITLE} subtitle={SETUP_HINT} onCancel={onDone}>
        <Text>No remote environments available.</Text>
      </Dialog>
    )
  }

  if (environments.length === 1) {
    const repairSelection =
      missingConfiguredDefaultEnvironment && canPersistSelection
        ? () => persistSelection(selectedEnvironment)
        : null

    return (
      <SingleEnvironmentContent
        environment={selectedEnvironment}
        onDone={onDone}
        repairSelection={repairSelection}
        guidance={guidance}
      />
    )
  }

  if (!canPersistSelection) {
    return (
      <ReadOnlyEnvironmentContent
        environments={environments}
        selectedEnvironment={selectedEnvironment}
        selectedEnvironmentSource={selectedEnvironmentSource}
        onDone={onDone}
        guidance={
          guidance ??
          'This remote environment selection is controlled by a read-only source.'
        }
      />
    )
  }

  return (
    <MultipleEnvironmentsContent
      environments={environments}
      selectedEnvironment={selectedEnvironment}
      selectedEnvironmentSource={selectedEnvironmentSource}
      loadingState={loadingState}
      onSelect={handleSelect}
      onCancel={onDone}
      guidance={guidance}
    />
  )
}
