import { describe, expect, test } from 'bun:test'
import { getGithubReleaseBinaryAssetName } from '../publicReleaseSource.js'
import { getBinaryName } from './installer.js'

describe('native installer identity', () => {
  test('uses openjaws as the shipped binary name on every supported platform', () => {
    expect(getBinaryName('linux-x64')).toBe('openjaws')
    expect(getBinaryName('darwin-arm64')).toBe('openjaws')
    expect(getBinaryName('win32-x64')).toBe('openjaws.exe')
  })

  test('matches public release asset naming for native binaries', () => {
    expect(getGithubReleaseBinaryAssetName('linux-x64')).toContain(
      getBinaryName('linux-x64'),
    )
    expect(getGithubReleaseBinaryAssetName('darwin-arm64')).toContain(
      getBinaryName('darwin-arm64'),
    )
    expect(getGithubReleaseBinaryAssetName('win32-x64')).toContain('openjaws')
    expect(getGithubReleaseBinaryAssetName('win32-x64')).toEndWith('.exe')
  })
})
