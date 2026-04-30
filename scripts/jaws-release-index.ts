import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export type JawsReleaseAsset = {
  id: string
  route: string
  file: string
  requiresSignature: boolean
}

export type JawsReleaseMirror = {
  id: string
  label: string
  pageUrl: string
  routeBaseUrl: string
}

export type JawsReleaseUpdaterPlatform = {
  platform: string
  assetId: string
}

export type JawsReleaseIndex = {
  schemaVersion: number
  product: string
  version: string
  tag: string
  repo: string
  github: {
    releaseUrl: string
    apiUrl: string
    baseAssetUrl: string
  }
  mirrors: JawsReleaseMirror[]
  assets: JawsReleaseAsset[]
  updaterPlatforms: JawsReleaseUpdaterPlatform[]
}

export const JAWS_RELEASE_INDEX_PATH = resolve(
  import.meta.dir,
  '..',
  'apps',
  'jaws-desktop',
  'src',
  'release-index.json',
)

export function readJawsReleaseIndex(path = JAWS_RELEASE_INDEX_PATH): JawsReleaseIndex {
  return JSON.parse(readFileSync(path, 'utf8')) as JawsReleaseIndex
}

export function previousJawsPatchVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version)
  if (!match) {
    throw new Error(`Cannot derive previous JAWS patch probe from version: ${version}`)
  }
  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  return `${major}.${minor}.${Math.max(0, patch - 1)}`
}

export const JAWS_RELEASE_INDEX = readJawsReleaseIndex()
export const JAWS_RELEASE_REPO = JAWS_RELEASE_INDEX.repo
export const JAWS_RELEASE_TAG = JAWS_RELEASE_INDEX.tag
export const JAWS_RELEASE_VERSION = JAWS_RELEASE_INDEX.version
export const JAWS_RELEASE_BASE_URL = JAWS_RELEASE_INDEX.github.baseAssetUrl
export const JAWS_RELEASE_URL = JAWS_RELEASE_INDEX.github.releaseUrl
export const JAWS_RELEASE_API_URL = JAWS_RELEASE_INDEX.github.apiUrl
export const JAWS_RELEASE_ASSETS: JawsReleaseAsset[] = JAWS_RELEASE_INDEX.assets
export const JAWS_RELEASE_MIRRORS: JawsReleaseMirror[] = JAWS_RELEASE_INDEX.mirrors
export const JAWS_RELEASE_PREVIOUS_PATCH_VERSION = previousJawsPatchVersion(
  JAWS_RELEASE_VERSION,
)
