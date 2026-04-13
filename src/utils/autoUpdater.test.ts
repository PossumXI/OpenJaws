import { describe, expect, test } from 'bun:test'
import { shouldInstallTargetVersion } from './autoUpdater.js'

describe('shouldInstallTargetVersion', () => {
  test('installs when the target semver is newer', () => {
    expect(shouldInstallTargetVersion('2.1.86', '2.1.87')).toBe(true)
  })

  test('does not churn on build-metadata-only differences', () => {
    expect(
      shouldInstallTargetVersion('2.1.86+sha.abc1234', '2.1.86+sha.def5678'),
    ).toBe(false)
    expect(shouldInstallTargetVersion('2.1.86+sha.abc1234', '2.1.86')).toBe(
      false,
    )
  })

  test('does not install the same or an older target', () => {
    expect(shouldInstallTargetVersion('2.1.86', '2.1.86')).toBe(false)
    expect(shouldInstallTargetVersion('2.1.87', '2.1.86')).toBe(false)
  })
})
