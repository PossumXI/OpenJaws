/**
 * Privacy level controls how much nonessential network traffic and telemetry
 * OpenJaws generates.
 *
 * Levels are ordered by restrictiveness:
 *   default < no-telemetry < essential-traffic
 *
 * - default:            Everything enabled.
 * - no-telemetry:       Analytics/telemetry disabled (Datadog, 1P events, feedback survey).
 * - essential-traffic:  ALL nonessential network traffic disabled
 *                       (telemetry + auto-updates, grove, release notes, model capabilities, etc.).
 *
 * The resolved level is the most restrictive signal from:
 *   OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC  →  essential-traffic
 *   DISABLE_TELEMETRY                         →  no-telemetry
 *   settings.privacyMode                      →  user-selected local override
 */
import { getInitialSettings } from './settings/settings.js'

export type PrivacyLevel = 'default' | 'no-telemetry' | 'essential-traffic'

const PRIVACY_PRIORITY: Record<PrivacyLevel, number> = {
  default: 0,
  'no-telemetry': 1,
  'essential-traffic': 2,
}

function coercePrivacyLevel(value: unknown): PrivacyLevel | null {
  switch (value) {
    case 'default':
    case 'no-telemetry':
    case 'essential-traffic':
      return value
    default:
      return null
  }
}

function maxPrivacyLevel(left: PrivacyLevel, right: PrivacyLevel): PrivacyLevel {
  return PRIVACY_PRIORITY[left] >= PRIVACY_PRIORITY[right] ? left : right
}

function getSettingsPrivacyLevel(): PrivacyLevel {
  return coercePrivacyLevel(getInitialSettings().privacyMode) ?? 'default'
}

export function resolvePrivacyLevelFromSignals({
  disableTelemetry = false,
  disableNonessentialTraffic = false,
  settingsMode = null,
}: {
  disableTelemetry?: boolean
  disableNonessentialTraffic?: boolean
  settingsMode?: PrivacyLevel | null
}): PrivacyLevel {
  let level: PrivacyLevel = 'default'
  const coercedSettingsMode = coercePrivacyLevel(settingsMode)

  if (coercedSettingsMode) {
    level = maxPrivacyLevel(level, coercedSettingsMode)
  }
  if (disableTelemetry) {
    level = maxPrivacyLevel(level, 'no-telemetry')
  }
  if (disableNonessentialTraffic) {
    level = 'essential-traffic'
  }

  return level
}

export function getPrivacyLevel(): PrivacyLevel {
  return resolvePrivacyLevelFromSignals({
    disableTelemetry: Boolean(process.env.DISABLE_TELEMETRY),
    disableNonessentialTraffic: Boolean(
      process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC,
    ),
    settingsMode: getSettingsPrivacyLevel(),
  })
}

/**
 * True when all nonessential network traffic should be suppressed.
 * Equivalent to the old `process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC` check.
 */
export function isEssentialTrafficOnly(): boolean {
  return getPrivacyLevel() === 'essential-traffic'
}

/**
 * True when telemetry/analytics should be suppressed.
 * True at both `no-telemetry` and `essential-traffic` levels.
 */
export function isTelemetryDisabled(): boolean {
  return getPrivacyLevel() !== 'default'
}

/**
 * Returns the highest-priority source responsible for the resolved privacy
 * level. Used in user-facing status so local settings and env overrides are
 * both visible.
 */
export function getPrivacyLevelReason(): string | null {
  if (process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC) {
    return 'OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC'
  }
  if (process.env.DISABLE_TELEMETRY) {
    return 'DISABLE_TELEMETRY'
  }
  if (getSettingsPrivacyLevel() !== 'default') {
    return 'settings.privacyMode'
  }
  return null
}

/**
 * Returns the env var name responsible for the current essential-traffic restriction,
 * or null if unrestricted. Used for user-facing "unset X to re-enable" messages.
 */
export function getEssentialTrafficOnlyReason(): string | null {
  if (getPrivacyLevel() !== 'essential-traffic') {
    return null
  }
  if (process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC) {
    return 'OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC'
  }
  if (getSettingsPrivacyLevel() === 'essential-traffic') {
    return 'settings.privacyMode'
  }
  return null
}
