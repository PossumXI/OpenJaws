type FetchLike = (
  input: string,
  init?: {
    headers?: Record<string, string>
    next?: { revalidate?: number }
  },
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

type GithubReleaseAsset = {
  name?: unknown
  browser_download_url?: unknown
}

type GithubRelease = {
  draft?: unknown
  prerelease?: unknown
  tag_name?: unknown
  assets?: unknown
}

export type JawsUpdaterPlatformManifest = {
  signature?: unknown
  url?: unknown
}

export type JawsUpdaterManifest = {
  version?: unknown
  notes?: unknown
  pub_date?: unknown
  platforms?: unknown
}

export type JawsUpdaterParams = {
  target: string
  arch: string
  current_version: string
}

export type JawsUpdaterResult =
  | {
      status: 200
      headers: Record<string, string>
      body: {
        version: string
        url: string
        signature: string
        notes?: string
        pub_date?: string
      }
    }
  | {
      status: 204
      headers: Record<string, string>
      body: null
    }
  | {
      status: 400 | 503
      headers: Record<string, string>
      body: {
        ok: false
        code: string
        message: string
      }
    }

type ParsedSemver = {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

const DEFAULT_RELEASE_REPO = 'PossumXI/OpenJaws'
const DEFAULT_RELEASE_TAG_PREFIX = 'jaws-v'
const DEFAULT_MANIFEST_ASSET_NAME = 'latest.json'
const TARGETS = new Set(['windows', 'linux', 'darwin'])
const ARCHES = new Set(['x86_64', 'aarch64', 'i686', 'armv7'])
const SEMVER_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json',
}

const updateHeaders = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
  'Content-Type': 'application/json',
}

const noUpdateHeaders = {
  'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSemver(version: string): ParsedSemver | null {
  const match = SEMVER_PATTERN.exec(version.trim())
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  }
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftNumber = /^\d+$/.test(leftPart) ? Number(leftPart) : null
    const rightNumber = /^\d+$/.test(rightPart) ? Number(rightPart) : null
    if (leftNumber !== null && rightNumber !== null) {
      return Math.sign(leftNumber - rightNumber)
    }
    if (leftNumber !== null) return -1
    if (rightNumber !== null) return 1
    return leftPart < rightPart ? -1 : 1
  }

  return 0
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateVersion = parseSemver(candidate)
  const currentVersion = parseSemver(current)
  if (!candidateVersion || !currentVersion) {
    return false
  }

  for (const field of ['major', 'minor', 'patch'] as const) {
    if (candidateVersion[field] !== currentVersion[field]) {
      return candidateVersion[field] > currentVersion[field]
    }
  }

  return comparePrerelease(candidateVersion.prerelease, currentVersion.prerelease) > 0
}

function githubApiBase(env: NodeJS.ProcessEnv): string {
  const repo = clean(env.JAWS_UPDATER_GITHUB_REPO) || DEFAULT_RELEASE_REPO
  return `https://api.github.com/repos/${repo}/releases`
}

function githubReleaseDownloadBase(env: NodeJS.ProcessEnv, tag: string): string {
  const repo = clean(env.JAWS_UPDATER_GITHUB_REPO) || DEFAULT_RELEASE_REPO
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}`
}

function releaseTagMatches(tag: string, env: NodeJS.ProcessEnv): boolean {
  const prefix = clean(env.JAWS_UPDATER_TAG_PREFIX) || DEFAULT_RELEASE_TAG_PREFIX
  return tag.startsWith(prefix)
}

function manifestAssetName(env: NodeJS.ProcessEnv): string {
  return clean(env.JAWS_UPDATER_MANIFEST_ASSET) || DEFAULT_MANIFEST_ASSET_NAME
}

async function fetchJson(url: string, fetcher: FetchLike): Promise<unknown | null> {
  const response = await fetcher(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'JAWS-Tauri-updater',
    },
    next: { revalidate: 60 },
  })
  if (!response.ok) {
    return null
  }
  return response.json()
}

function selectManifestAssetUrl(releases: unknown, env: NodeJS.ProcessEnv): string | null {
  if (!Array.isArray(releases)) {
    return null
  }

  const assetName = manifestAssetName(env)
  const allowPrerelease = clean(env.JAWS_UPDATER_ALLOW_PRERELEASES) === '1'
  for (const release of releases as GithubRelease[]) {
    const tag = clean(release.tag_name)
    if (!tag || !releaseTagMatches(tag, env) || release.draft === true) {
      continue
    }
    if (release.prerelease === true && !allowPrerelease) {
      continue
    }
    const assets = Array.isArray(release.assets) ? release.assets : []
    const asset = (assets as GithubReleaseAsset[]).find(
      candidate => clean(candidate.name) === assetName,
    )
    const url = clean(asset?.browser_download_url)
    if (url.startsWith('https://')) {
      return url
    }
  }

  return null
}

async function resolveManifestUrl(
  env: NodeJS.ProcessEnv,
  fetcher: FetchLike,
): Promise<string | null> {
  const directManifestUrl = clean(env.JAWS_UPDATER_MANIFEST_URL)
  if (directManifestUrl) {
    return directManifestUrl.startsWith('https://') ? directManifestUrl : null
  }

  const explicitTag = clean(env.JAWS_UPDATER_RELEASE_TAG)
  if (explicitTag) {
    return `${githubReleaseDownloadBase(env, explicitTag)}/${manifestAssetName(env)}`
  }

  const releases = await fetchJson(`${githubApiBase(env)}?per_page=25`, fetcher)
  return selectManifestAssetUrl(releases, env)
}

function readPlatformManifest(
  manifest: JawsUpdaterManifest,
  platformKey: string,
): JawsUpdaterPlatformManifest | null {
  if (!manifest.platforms || typeof manifest.platforms !== 'object') {
    return null
  }
  const platform = (manifest.platforms as Record<string, unknown>)[platformKey]
  return platform && typeof platform === 'object'
    ? (platform as JawsUpdaterPlatformManifest)
    : null
}

function errorResult(
  status: 400 | 503,
  code: string,
  message: string,
): JawsUpdaterResult {
  return {
    status,
    headers: jsonHeaders,
    body: {
      ok: false,
      code,
      message,
    },
  }
}

export async function resolveJawsUpdaterResult(
  params: JawsUpdaterParams,
  options?: {
    env?: NodeJS.ProcessEnv
    fetcher?: FetchLike
  },
): Promise<JawsUpdaterResult> {
  const target = clean(params.target)
  const arch = clean(params.arch)
  const currentVersion = clean(params.current_version)

  if (!TARGETS.has(target) || !ARCHES.has(arch) || !parseSemver(currentVersion)) {
    return errorResult(
      400,
      'invalid_update_request',
      'JAWS updater request target, arch, or current version is invalid.',
    )
  }

  const env = options?.env ?? process.env
  const fetcher = options?.fetcher ?? (fetch as FetchLike)
  const manifestUrl = await resolveManifestUrl(env, fetcher)
  if (!manifestUrl) {
    return errorResult(
      503,
      'manifest_unavailable',
      'JAWS updater manifest is not configured or no public JAWS release manifest is available.',
    )
  }

  const rawManifest = await fetchJson(manifestUrl, fetcher)
  if (!rawManifest || typeof rawManifest !== 'object') {
    return errorResult(
      503,
      'manifest_unavailable',
      'JAWS updater manifest could not be loaded.',
    )
  }

  const manifest = rawManifest as JawsUpdaterManifest
  const version = clean(manifest.version)
  if (!parseSemver(version)) {
    return errorResult(
      503,
      'invalid_manifest',
      'JAWS updater manifest has an invalid version.',
    )
  }

  if (!isVersionNewer(version, currentVersion)) {
    return {
      status: 204,
      headers: noUpdateHeaders,
      body: null,
    }
  }

  const platform = readPlatformManifest(manifest, `${target}-${arch}`)
  if (!platform) {
    return {
      status: 204,
      headers: noUpdateHeaders,
      body: null,
    }
  }

  const url = clean(platform.url)
  const signature = clean(platform.signature)
  if (!url.startsWith('https://') || !signature) {
    return errorResult(
      503,
      'invalid_manifest',
      'JAWS updater manifest is missing a valid HTTPS artifact URL or signature for this platform.',
    )
  }

  return {
    status: 200,
    headers: updateHeaders,
    body: {
      version,
      url,
      signature,
      ...(clean(manifest.notes) ? { notes: clean(manifest.notes) } : {}),
      ...(clean(manifest.pub_date) ? { pub_date: clean(manifest.pub_date) } : {}),
    },
  }
}
