import type {
  LocalJSXCommandContext,
  LocalJSXCommandOnDone,
} from '../../commands.js'
import {
  type ExternalPermissionMode,
  permissionModeTitle,
  type PermissionMode,
} from '../../utils/permissions/PermissionMode.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'

type PowerProfile = 'standard' | 'builder'

const HELP_ARGS = new Set(['help', '-h', '--help'])
const STATUS_ARGS = new Set(['', 'status', 'show'])

function getSavedDefaultPermissionMode(): ExternalPermissionMode {
  return getInitialSettings().permissions?.defaultMode ?? 'default'
}

function getSavedPowerProfile(): PowerProfile | 'custom' {
  const defaultMode = getSavedDefaultPermissionMode()
  switch (defaultMode) {
    case 'default':
      return 'standard'
    case 'acceptEdits':
      return 'builder'
    default:
      return 'custom'
  }
}

function formatHelp(): string {
  return [
    'Usage: /power [status|standard|builder]',
    '',
    'Profiles:',
    '- standard: default permission behavior',
    '- builder: defaults to Accept edits for faster building',
    '',
    'Notes:',
    '- Builder mode is opt-in. It does not disable dangerous-path, network, or provider-level checks.',
    '- Current plan mode is preserved; profile changes still apply to future launches.',
  ].join('\n')
}

function formatStatus(context: LocalJSXCommandContext): string {
  const savedProfile = getSavedPowerProfile()
  const currentMode = context.getAppState().toolPermissionContext.mode
  const savedMode = getSavedDefaultPermissionMode()

  return [
    `Power profile: ${savedProfile}`,
    `Current session mode: ${permissionModeTitle(currentMode)}`,
    `Launch default mode: ${permissionModeTitle(savedMode as PermissionMode)}`,
    '',
    'Builder profile keeps the core guard rails intact and only makes edit-heavy work less interruptive.',
  ].join('\n')
}

function persistDefaultMode(mode: ExternalPermissionMode): Error | null {
  const result = updateSettingsForSource('userSettings', {
    permissions: {
      defaultMode: mode,
    },
  })
  if (result.error) {
    return result.error
  }
  settingsChangeDetector.notifyChange('userSettings')
  return null
}

function setSessionPermissionMode(
  context: LocalJSXCommandContext,
  mode: PermissionMode,
): void {
  context.setAppState(prev => ({
    ...prev,
    toolPermissionContext: {
      ...prev.toolPermissionContext,
      mode,
    },
  }))
}

function applyProfile(
  targetProfile: PowerProfile,
  context: LocalJSXCommandContext,
): {
  message: string
  display: 'system'
} {
  const targetMode: ExternalPermissionMode =
    targetProfile === 'builder' ? 'acceptEdits' : 'default'
  const persistError = persistDefaultMode(targetMode)
  if (persistError) {
    throw persistError
  }

  const currentMode = context.getAppState().toolPermissionContext.mode
  if (currentMode !== 'plan') {
    setSessionPermissionMode(context, targetMode)
  }

  const profileLabel = targetProfile === 'builder' ? 'builder' : 'standard'
  const sessionNote =
    currentMode === 'plan'
      ? ' Current session stays in Plan mode; the new profile applies after plan mode and to future launches.'
      : ` Current session mode is now ${permissionModeTitle(targetMode)}.`
  const guardrailNote =
    targetProfile === 'builder'
      ? ' Dangerous-path, out-of-worktree, network, and provider safeguards remain on.'
      : ''

  return {
    message: `Set power profile to ${profileLabel}. Future launches default to ${permissionModeTitle(targetMode)}.${sessionNote}${guardrailNote}`,
    display: 'system',
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
  rawArgs?: string,
): Promise<null> {
  const args = rawArgs?.trim().toLowerCase() ?? ''

  if (HELP_ARGS.has(args)) {
    onDone(formatHelp(), { display: 'system' })
    return null
  }

  if (STATUS_ARGS.has(args)) {
    onDone(formatStatus(context), { display: 'system' })
    return null
  }

  if (args === 'standard') {
    const result = applyProfile('standard', context)
    onDone(result.message, { display: result.display })
    return null
  }

  if (args === 'builder') {
    const result = applyProfile('builder', context)
    onDone(result.message, { display: result.display })
    return null
  }

  onDone(formatHelp(), { display: 'system' })
  return null
}
