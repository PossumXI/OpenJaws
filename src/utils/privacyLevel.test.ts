import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getPrivacyLevel,
  getPrivacyLevelReason,
  resolvePrivacyLevelFromSignals,
} from './privacyLevel.js'
import { updateSettingsForSource } from './settings/settings.js'
import { buildPrivacyProperties } from './status.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalDisableTelemetry = process.env.DISABLE_TELEMETRY
const originalDisableNonessentialTraffic =
  process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC

describe('privacyLevel', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = join(tmpdir(), `openjaws-privacy-${Date.now()}`)
    process.env.CLAUDE_CONFIG_DIR = configDir
    delete process.env.DISABLE_TELEMETRY
    delete process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC
    await mkdir(configDir, { recursive: true })
    updateSettingsForSource('userSettings', {
      privacyMode: undefined,
    })
  })

  afterEach(async () => {
    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    }

    if (originalDisableTelemetry === undefined) {
      delete process.env.DISABLE_TELEMETRY
    } else {
      process.env.DISABLE_TELEMETRY = originalDisableTelemetry
    }

    if (originalDisableNonessentialTraffic === undefined) {
      delete process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC
    } else {
      process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC =
        originalDisableNonessentialTraffic
    }

    await rm(configDir, { recursive: true, force: true })
  })

  test('prefers the most restrictive privacy signal', () => {
    expect(
      resolvePrivacyLevelFromSignals({
        settingsMode: 'no-telemetry',
      }),
    ).toBe('no-telemetry')

    expect(
      resolvePrivacyLevelFromSignals({
        disableTelemetry: true,
        settingsMode: 'default',
      }),
    ).toBe('no-telemetry')

    expect(
      resolvePrivacyLevelFromSignals({
        disableTelemetry: true,
        disableNonessentialTraffic: true,
        settingsMode: 'no-telemetry',
      }),
    ).toBe('essential-traffic')
  })

  test('uses local settings when no env override is present', () => {
    updateSettingsForSource('userSettings', {
      privacyMode: 'no-telemetry',
    })

    expect(getPrivacyLevel()).toBe('no-telemetry')
    expect(getPrivacyLevelReason()).toBe('settings.privacyMode')
    expect(buildPrivacyProperties()).toEqual([
      {
        label: 'Privacy',
        value: [
          'no-telemetry',
          'telemetry unavailable in this build',
          'nonessential traffic on',
          'source settings.privacyMode',
        ],
      },
    ])
  })

  test('lets env overrides outrank local settings in the status surface', () => {
    updateSettingsForSource('userSettings', {
      privacyMode: 'no-telemetry',
    })
    process.env.OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC = '1'

    expect(getPrivacyLevel()).toBe('essential-traffic')
    expect(getPrivacyLevelReason()).toBe(
      'OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC',
    )
    expect(buildPrivacyProperties()).toEqual([
      {
        label: 'Privacy',
        value: [
          'essential-traffic',
          'telemetry unavailable in this build',
          'nonessential traffic off',
          'source OPENJAWS_DISABLE_NONESSENTIAL_TRAFFIC',
        ],
      },
    ])
  })
})
