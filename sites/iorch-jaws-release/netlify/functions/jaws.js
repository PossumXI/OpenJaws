const DEFAULT_RELEASE_REPO = 'PossumXI/OpenJaws'
const DEFAULT_RELEASE_TAG_PREFIX = 'jaws-v'
const DEFAULT_MANIFEST_ASSET_NAME = 'latest.json'
const TARGETS = new Set(['windows', 'linux', 'darwin'])
const ARCHES = new Set(['x86_64', 'aarch64', 'i686', 'armv7'])
const SEMVER_PATTERN =
  /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

const updateHeaders = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
}

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseSemver(version) {
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

function comparePrerelease(left, right) {
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

function isVersionNewer(candidate, current) {
  const candidateVersion = parseSemver(candidate)
  const currentVersion = parseSemver(current)
  if (!candidateVersion || !currentVersion) {
    return false
  }

  for (const field of ['major', 'minor', 'patch']) {
    if (candidateVersion[field] !== currentVersion[field]) {
      return candidateVersion[field] > currentVersion[field]
    }
  }

  return comparePrerelease(candidateVersion.prerelease, currentVersion.prerelease) > 0
}

function json(statusCode, payload, headers = {}) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body: JSON.stringify(payload),
  }
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'iorch-jaws-updater/1.0',
    },
  })
  if (!response.ok) {
    return null
  }
  return response.json()
}

function releaseTagMatches(tag) {
  const prefix = clean(process.env.JAWS_UPDATER_TAG_PREFIX) || DEFAULT_RELEASE_TAG_PREFIX
  return tag.startsWith(prefix)
}

function manifestAssetName() {
  return clean(process.env.JAWS_UPDATER_MANIFEST_ASSET) || DEFAULT_MANIFEST_ASSET_NAME
}

function githubApiBase() {
  const repo = clean(process.env.JAWS_UPDATER_GITHUB_REPO) || DEFAULT_RELEASE_REPO
  return `https://api.github.com/repos/${repo}/releases`
}

function githubReleaseDownloadBase(tag) {
  const repo = clean(process.env.JAWS_UPDATER_GITHUB_REPO) || DEFAULT_RELEASE_REPO
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}`
}

async function resolveManifestUrl() {
  const directManifestUrl = clean(process.env.JAWS_UPDATER_MANIFEST_URL)
  if (directManifestUrl) {
    return directManifestUrl.startsWith('https://') ? directManifestUrl : null
  }

  const explicitTag = clean(process.env.JAWS_UPDATER_RELEASE_TAG)
  if (explicitTag) {
    return `${githubReleaseDownloadBase(explicitTag)}/${manifestAssetName()}`
  }

  const releases = await fetchJson(`${githubApiBase()}?per_page=25`)
  if (!Array.isArray(releases)) {
    return null
  }

  const allowPrerelease = clean(process.env.JAWS_UPDATER_ALLOW_PRERELEASES) === '1'
  for (const release of releases) {
    const tag = clean(release.tag_name)
    if (!tag || !releaseTagMatches(tag) || release.draft === true) {
      continue
    }
    if (release.prerelease === true && !allowPrerelease) {
      continue
    }
    const assets = Array.isArray(release.assets) ? release.assets : []
    const asset = assets.find(candidate => clean(candidate.name) === manifestAssetName())
    const url = clean(asset && asset.browser_download_url)
    if (url.startsWith('https://')) {
      return url
    }
  }

  return null
}

function readPlatformManifest(manifest, platformKey) {
  if (!manifest.platforms || typeof manifest.platforms !== 'object') {
    return null
  }
  const platform = manifest.platforms[platformKey]
  return platform && typeof platform === 'object' ? platform : null
}

function readUpdaterParams(event) {
  const query = event.queryStringParameters || {}
  const queryTarget = clean(query.target)
  const queryArch = clean(query.arch)
  const queryVersion = clean(query.current_version)
  if (queryTarget && queryArch && queryVersion && !queryTarget.startsWith(':')) {
    return {
      target: queryTarget,
      arch: queryArch,
      currentVersion: queryVersion,
    }
  }

  const rawUrl = clean(event.rawUrl)
  const candidates = [
    clean(event.path),
    rawUrl ? new URL(rawUrl).pathname : '',
  ]
  for (const path of candidates) {
    for (const marker of ['/api/jaws/', '/.netlify/functions/jaws/']) {
      const markerIndex = path.indexOf(marker)
      if (markerIndex < 0) {
        continue
      }
      const segments = path
        .slice(markerIndex + marker.length)
        .split('/')
        .map(segment => decodeURIComponent(segment))
      if (segments.length >= 3) {
        return {
          target: clean(segments[0]),
          arch: clean(segments[1]),
          currentVersion: clean(segments[2]),
        }
      }
    }
  }

  return {
    target: queryTarget,
    arch: queryArch,
    currentVersion: queryVersion,
  }
}

exports.handler = async event => {
  const { target, arch, currentVersion } = readUpdaterParams(event)

  if (!TARGETS.has(target) || !ARCHES.has(arch) || !parseSemver(currentVersion)) {
    return json(400, {
      ok: false,
      code: 'invalid_update_request',
      message: 'JAWS updater request target, arch, or current version is invalid.',
    })
  }

  const manifestUrl = await resolveManifestUrl()
  if (!manifestUrl) {
    return json(503, {
      ok: false,
      code: 'manifest_unavailable',
      message: 'JAWS updater manifest is not configured or no public JAWS manifest is available.',
    })
  }

  const manifest = await fetchJson(manifestUrl)
  if (!manifest || typeof manifest !== 'object') {
    return json(503, {
      ok: false,
      code: 'manifest_unavailable',
      message: 'JAWS updater manifest could not be loaded.',
    })
  }

  const version = clean(manifest.version)
  if (!parseSemver(version)) {
    return json(503, {
      ok: false,
      code: 'invalid_manifest',
      message: 'JAWS updater manifest has an invalid version.',
    })
  }

  if (!isVersionNewer(version, currentVersion)) {
    return {
      statusCode: 204,
      headers: updateHeaders,
      body: '',
    }
  }

  const platform = readPlatformManifest(manifest, `${target}-${arch}`)
  if (!platform) {
    return {
      statusCode: 204,
      headers: updateHeaders,
      body: '',
    }
  }

  const url = clean(platform.url)
  const signature = clean(platform.signature)
  if (!url.startsWith('https://') || !signature) {
    return json(503, {
      ok: false,
      code: 'invalid_manifest',
      message: 'JAWS updater manifest is missing a valid HTTPS artifact URL or signature.',
    })
  }

  return json(200, {
    version,
    url,
    signature,
    ...(clean(manifest.notes) ? { notes: clean(manifest.notes) } : {}),
    ...(clean(manifest.pub_date) ? { pub_date: clean(manifest.pub_date) } : {}),
  }, updateHeaders)
}
