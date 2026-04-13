import { describe, expect, test } from 'bun:test'
import {
  findGithubReleaseAsset,
  getGithubReleaseBinaryAssetName,
  getGithubReleaseManifestAssetName,
  normalizePublicReleaseVersion,
  selectGithubRelease,
  type PublicGithubRelease,
} from './publicReleaseSource.js'

const releases: PublicGithubRelease[] = [
  {
    tag_name: 'v2.1.90-beta.1',
    draft: false,
    prerelease: true,
    assets: [
      {
        name: 'openjaws-win32-x64.exe',
        browser_download_url: 'https://example.com/beta.exe',
      },
      {
        name: 'openjaws-manifest-win32-x64.json',
        browser_download_url: 'https://example.com/beta-manifest.json',
      },
    ],
  },
  {
    tag_name: 'v2.1.89',
    draft: false,
    prerelease: false,
    assets: [
      {
        name: 'openjaws-win32-x64.exe',
        browser_download_url: 'https://example.com/stable.exe',
      },
      {
        name: 'openjaws-manifest-win32-x64.json',
        browser_download_url: 'https://example.com/stable-manifest.json',
      },
    ],
  },
]

describe('public release source helpers', () => {
  test('normalizes valid release versions', () => {
    expect(normalizePublicReleaseVersion('v2.1.89')).toBe('2.1.89')
    expect(normalizePublicReleaseVersion('2.1.89+sha.abc1234')).toBe(
      '2.1.89+sha.abc1234',
    )
    expect(normalizePublicReleaseVersion('release-2.1.89')).toBeNull()
  })

  test('builds platform-specific asset names', () => {
    expect(getGithubReleaseBinaryAssetName('win32-x64')).toBe(
      'openjaws-win32-x64.exe',
    )
    expect(getGithubReleaseBinaryAssetName('linux-x64')).toBe(
      'openjaws-linux-x64',
    )
    expect(getGithubReleaseManifestAssetName('linux-arm64')).toBe(
      'openjaws-manifest-linux-arm64.json',
    )
  })

  test('selects stable and latest releases with required platform assets', () => {
    expect(selectGithubRelease(releases, 'stable', 'win32-x64')?.tag_name).toBe(
      'v2.1.89',
    )
    expect(selectGithubRelease(releases, 'latest', 'win32-x64')?.tag_name).toBe(
      'v2.1.90-beta.1',
    )
  })

  test('rejects releases that are missing required platform assets', () => {
    expect(selectGithubRelease(releases, 'stable', 'linux-x64')).toBeNull()
  })

  test('finds matching assets by exact name', () => {
    expect(
      findGithubReleaseAsset(releases[1]!, 'openjaws-manifest-win32-x64.json')
        ?.browser_download_url,
    ).toBe('https://example.com/stable-manifest.json')
  })
})
