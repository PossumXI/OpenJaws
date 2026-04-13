import axios from 'axios'
import type { ReleaseChannel } from './config.js'
import { logForDebugging } from './debug.js'

const VERSION_PATTERN =
  /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const DEFAULT_PUBLIC_GITHUB_REPO = 'PossumXI/OpenJaws'
const DEFAULT_GITHUB_API_TIMEOUT_MS = 5000

export type PublicGithubReleaseAsset = {
  name: string
  browser_download_url: string
  size?: number
}

export type PublicGithubRelease = {
  tag_name: string
  draft: boolean
  prerelease: boolean
  assets: PublicGithubReleaseAsset[]
}

export function normalizePublicReleaseVersion(
  candidate: string | null | undefined,
): string | null {
  const trimmed = candidate?.trim()
  if (!trimmed || !VERSION_PATTERN.test(trimmed)) {
    return null
  }
  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed
}

export function getPublicGithubReleaseRepo(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return env.OPENJAWS_PUBLIC_RELEASE_REPO?.trim() || DEFAULT_PUBLIC_GITHUB_REPO
}

export function getPublicGithubReleaseApiBase(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    env.OPENJAWS_PUBLIC_RELEASE_API_BASE?.trim() ||
    `https://api.github.com/repos/${getPublicGithubReleaseRepo(env)}/releases`
  )
}

export function getGithubReleaseBinaryAssetName(platform: string): string {
  return platform.startsWith('win32')
    ? `openjaws-${platform}.exe`
    : `openjaws-${platform}`
}

export function getGithubReleaseManifestAssetName(platform: string): string {
  return `openjaws-manifest-${platform}.json`
}

export function findGithubReleaseAsset(
  release: PublicGithubRelease,
  name: string,
): PublicGithubReleaseAsset | null {
  return release.assets.find(asset => asset.name === name) ?? null
}

function getGithubReleaseHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'OpenJaws/public-release-source',
  }
}

function releaseMatchesChannel(
  release: PublicGithubRelease,
  channel: ReleaseChannel,
): boolean {
  return !release.draft && (channel === 'latest' || !release.prerelease)
}

function releaseHasPlatformAssets(
  release: PublicGithubRelease,
  platform?: string,
): boolean {
  if (!platform) {
    return true
  }
  return (
    findGithubReleaseAsset(release, getGithubReleaseBinaryAssetName(platform)) !==
      null &&
    findGithubReleaseAsset(release, getGithubReleaseManifestAssetName(platform)) !==
      null
  )
}

export function selectGithubRelease(
  releases: PublicGithubRelease[],
  channel: ReleaseChannel,
  platform?: string,
): PublicGithubRelease | null {
  for (const release of releases) {
    if (
      releaseMatchesChannel(release, channel) &&
      releaseHasPlatformAssets(release, platform) &&
      normalizePublicReleaseVersion(release.tag_name)
    ) {
      return release
    }
  }
  return null
}

export async function listGithubReleases(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicGithubRelease[]> {
  const response = await axios.get(getPublicGithubReleaseApiBase(env), {
    headers: getGithubReleaseHeaders(),
    timeout: DEFAULT_GITHUB_API_TIMEOUT_MS,
    responseType: 'json',
  })
  return Array.isArray(response.data)
    ? (response.data as PublicGithubRelease[])
    : []
}

export async function getLatestVersionFromGithubRelease(
  channel: ReleaseChannel,
  platform?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  try {
    const releases = await listGithubReleases(env)
    const release = selectGithubRelease(releases, channel, platform)
    return release ? normalizePublicReleaseVersion(release.tag_name) : null
  } catch (error) {
    logForDebugging(`Failed to fetch ${channel} from GitHub Releases: ${error}`)
    return null
  }
}

async function getGithubReleaseByTag(
  tag: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicGithubRelease | null> {
  try {
    const response = await axios.get(
      `${getPublicGithubReleaseApiBase(env)}/tags/${encodeURIComponent(tag)}`,
      {
        headers: getGithubReleaseHeaders(),
        timeout: DEFAULT_GITHUB_API_TIMEOUT_MS,
        responseType: 'json',
      },
    )
    return response.data as PublicGithubRelease
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    throw error
  }
}

export async function getGithubReleaseByVersion(
  version: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<PublicGithubRelease | null> {
  const normalized = normalizePublicReleaseVersion(version)
  if (!normalized) {
    return null
  }

  try {
    return (
      (await getGithubReleaseByTag(`v${normalized}`, env)) ||
      (await getGithubReleaseByTag(normalized, env))
    )
  } catch (error) {
    logForDebugging(
      `Failed to fetch GitHub release for version ${normalized}: ${error}`,
    )
    return null
  }
}
