import { SETTING_SOURCES, type SettingSource } from '../settings/constants.js'
import {
  getSettings_DEPRECATED,
  getSettingsForSource,
} from '../settings/settings.js'
import { type EnvironmentResource, fetchEnvironments } from './environments.js'

export type EnvironmentSelectionReason =
  | 'configured_default'
  | 'anthropic_cloud'
  | 'first_non_bridge'
  | 'first_available'
  | 'missing_configured_default'
  | 'none'

export type EnvironmentSelectionInfo = {
  availableEnvironments: EnvironmentResource[]
  configuredDefaultEnvironmentId: string | null
  missingConfiguredDefaultEnvironment: boolean
  selectedEnvironment: EnvironmentResource | null
  selectedEnvironmentSource: SettingSource | null
  selectedEnvironmentReason: EnvironmentSelectionReason
  suggestedEnvironment: EnvironmentResource | null
}

export type ResolveEnvironmentSelectionResult = {
  configuredDefaultEnvironmentId: string | null
  missingConfiguredDefaultEnvironment: boolean
  selectedEnvironment: EnvironmentResource | null
  selectedEnvironmentReason: EnvironmentSelectionReason
  suggestedEnvironment: EnvironmentResource | null
}

function getFallbackEnvironment(
  environments: EnvironmentResource[],
): {
  environment: EnvironmentResource | null
  reason: Exclude<
    EnvironmentSelectionReason,
    'configured_default' | 'missing_configured_default' | 'none'
  >
} {
  const cloudEnvironment =
    environments.find(env => env.kind === 'anthropic_cloud') ?? null
  if (cloudEnvironment) {
    return {
      environment: cloudEnvironment,
      reason: 'anthropic_cloud',
    }
  }

  const firstNonBridge =
    environments.find(env => env.kind !== 'bridge') ?? environments[0] ?? null
  if (firstNonBridge) {
    return {
      environment: firstNonBridge,
      reason:
        firstNonBridge.kind !== 'bridge' ? 'first_non_bridge' : 'first_available',
    }
  }

  return {
    environment: null,
    reason: 'first_available',
  }
}

export function getConfiguredDefaultEnvironmentSource(
  defaultEnvironmentId: string | null | undefined,
): SettingSource | null {
  if (!defaultEnvironmentId) {
    return null
  }

  // Iterate from lowest to highest priority, so the last match wins.
  for (let i = SETTING_SOURCES.length - 1; i >= 0; i--) {
    const source = SETTING_SOURCES[i]
    if (!source) {
      continue
    }

    const sourceSettings = getSettingsForSource(source)
    if (sourceSettings?.remote?.defaultEnvironmentId === defaultEnvironmentId) {
      return source
    }
  }

  return null
}

export function isConfiguredDefaultEnvironmentOverridable(
  source: SettingSource | null,
): boolean {
  return source !== 'policySettings' && source !== 'flagSettings'
}

export function resolveEnvironmentSelection({
  environments,
  defaultEnvironmentId,
  allowConfiguredDefaultFallback = true,
}: {
  environments: EnvironmentResource[]
  defaultEnvironmentId?: string | null
  allowConfiguredDefaultFallback?: boolean
}): ResolveEnvironmentSelectionResult {
  const configuredDefaultEnvironmentId = defaultEnvironmentId ?? null
  if (environments.length === 0) {
    return {
      configuredDefaultEnvironmentId,
      missingConfiguredDefaultEnvironment: false,
      selectedEnvironment: null,
      selectedEnvironmentReason: 'none',
      suggestedEnvironment: null,
    }
  }

  const fallback = getFallbackEnvironment(environments)

  if (configuredDefaultEnvironmentId) {
    const matchingEnvironment =
      environments.find(
        env => env.environment_id === configuredDefaultEnvironmentId,
      ) ?? null

    if (matchingEnvironment) {
      return {
        configuredDefaultEnvironmentId,
        missingConfiguredDefaultEnvironment: false,
        selectedEnvironment: matchingEnvironment,
        selectedEnvironmentReason: 'configured_default',
        suggestedEnvironment: matchingEnvironment,
      }
    }

    return {
      configuredDefaultEnvironmentId,
      missingConfiguredDefaultEnvironment: true,
      selectedEnvironment: allowConfiguredDefaultFallback
        ? fallback.environment
        : null,
      selectedEnvironmentReason: allowConfiguredDefaultFallback
        ? fallback.reason
        : 'missing_configured_default',
      suggestedEnvironment: fallback.environment,
    }
  }

  return {
    configuredDefaultEnvironmentId: null,
    missingConfiguredDefaultEnvironment: false,
    selectedEnvironment: fallback.environment,
    selectedEnvironmentReason: fallback.environment ? fallback.reason : 'none',
    suggestedEnvironment: fallback.environment,
  }
}

/**
 * Gets information about available environments and the currently selected one.
 *
 * @returns Promise<EnvironmentSelectionInfo> containing:
 *   - availableEnvironments: all environments from the API
 *   - selectedEnvironment: the environment that would be used (based on settings or first available),
 *     or null if no environments are available
 *   - selectedEnvironmentSource: the SettingSource where defaultEnvironmentId is configured,
 *     or null if using the default (first environment)
 */
export async function getEnvironmentSelectionInfo(): Promise<EnvironmentSelectionInfo> {
  // Fetch available environments
  const environments = await fetchEnvironments()
  const mergedSettings = getSettings_DEPRECATED()
  const defaultEnvironmentId = mergedSettings?.remote?.defaultEnvironmentId ?? null
  const selectedEnvironmentSource =
    getConfiguredDefaultEnvironmentSource(defaultEnvironmentId)

  if (environments.length === 0) {
    return {
      availableEnvironments: [],
      configuredDefaultEnvironmentId: defaultEnvironmentId,
      missingConfiguredDefaultEnvironment: false,
      selectedEnvironment: null,
      selectedEnvironmentSource,
      selectedEnvironmentReason: 'none',
      suggestedEnvironment: null,
    }
  }

  const resolved = resolveEnvironmentSelection({
    environments,
    defaultEnvironmentId,
    allowConfiguredDefaultFallback: true,
  })

  return {
    availableEnvironments: environments,
    configuredDefaultEnvironmentId: resolved.configuredDefaultEnvironmentId,
    missingConfiguredDefaultEnvironment:
      resolved.missingConfiguredDefaultEnvironment,
    selectedEnvironment: resolved.selectedEnvironment,
    selectedEnvironmentSource,
    selectedEnvironmentReason: resolved.selectedEnvironmentReason,
    suggestedEnvironment: resolved.suggestedEnvironment,
  }
}
