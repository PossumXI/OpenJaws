import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { signReleaseManifestPayload } from '../src/utils/releaseManifestSignature.js'
import {
  JAWS_RELEASE_API_URL,
  JAWS_RELEASE_ASSETS,
  JAWS_RELEASE_BASE_URL,
  JAWS_RELEASE_INDEX,
  JAWS_RELEASE_MIRRORS,
  JAWS_RELEASE_REPO,
  JAWS_RELEASE_TAG,
  JAWS_RELEASE_URL,
  JAWS_RELEASE_VERSION,
  type JawsReleaseAsset,
  type JawsReleaseMirror,
} from './jaws-release-index.ts'

export {
  JAWS_RELEASE_API_URL,
  JAWS_RELEASE_ASSETS,
  JAWS_RELEASE_BASE_URL,
  JAWS_RELEASE_INDEX,
  JAWS_RELEASE_INDEX_PATH,
  JAWS_RELEASE_MIRRORS,
  JAWS_RELEASE_REPO,
  JAWS_RELEASE_TAG,
  JAWS_RELEASE_URL,
  JAWS_RELEASE_VERSION,
  readJawsReleaseIndex,
  type JawsReleaseAsset,
  type JawsReleaseIndex,
  type JawsReleaseMirror,
  type JawsReleaseUpdaterPlatform,
} from './jaws-release-index.ts'

const DEFAULT_TIMEOUT_MS = 20_000
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>

export type JawsReleaseMirrorHealthCheck = {
  id: string
  ok: boolean
  status: number | null
  url: string
  summary: string
  expected?: string
  actual?: string | null
}

export type JawsReleaseMirrorHealthReport = {
  ok: boolean
  checkedAt: string
  release: {
    repo: string
    tag: string
    version: string
    releaseUrl: string
    apiUrl: string
  }
  mirrors: JawsReleaseMirror[]
  checks: JawsReleaseMirrorHealthCheck[]
  failures: JawsReleaseMirrorHealthCheck[]
  signature?: {
    algorithm: 'ed25519'
    keyId: string
    value: string
  }
}

type JawsReleaseMirrorHealthOptions = {
  fetchImpl?: FetchLike
  now?: Date
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
}

type CliOptions = {
  json: boolean
  outPath: string | null
  timeoutMs: number
}

function expectedAssetUrl(file: string): string {
  return `${JAWS_RELEASE_BASE_URL}/${file}`
}

function signatureFile(file: string): string {
  return `${file}.sig`
}

function assetById(id: string): JawsReleaseAsset | null {
  return JAWS_RELEASE_ASSETS.find(asset => asset.id === id) ?? null
}

function requiredReleaseAssetNames(): string[] {
  const names = new Set<string>()
  for (const asset of JAWS_RELEASE_ASSETS) {
    names.add(asset.file)
    if (asset.requiresSignature) {
      names.add(signatureFile(asset.file))
    }
  }
  return [...names].sort()
}

function normalizeLocation(value: string | null): string | null {
  if (!value) {
    return null
  }
  try {
    return new URL(value).toString()
  } catch {
    return value.trim()
  }
}

async function fetchWithTimeout(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'user-agent': 'openjaws-jaws-release-mirror-health/1.0',
        ...(init.headers ?? {}),
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

function passedCheck(
  id: string,
  url: string,
  status: number | null,
  summary: string,
): JawsReleaseMirrorHealthCheck {
  return {
    id,
    ok: true,
    status,
    url,
    summary,
  }
}

function failedCheck(args: {
  id: string
  url: string
  status?: number | null
  summary: string
  expected?: string
  actual?: string | null
}): JawsReleaseMirrorHealthCheck {
  return {
    id: args.id,
    ok: false,
    status: args.status ?? null,
    url: args.url,
    summary: args.summary,
    expected: args.expected,
    actual: args.actual,
  }
}

async function checkMirrorPage(args: {
  mirror: JawsReleaseMirror
  fetchImpl: FetchLike
  timeoutMs: number
}): Promise<JawsReleaseMirrorHealthCheck> {
  try {
    const response = await fetchWithTimeout(
      args.fetchImpl,
      args.mirror.pageUrl,
      {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'text/html,*/*' },
      },
      args.timeoutMs,
    )
    const text = await response.text()
    if (response.status !== 200) {
      return failedCheck({
        id: `${args.mirror.id}:page`,
        url: args.mirror.pageUrl,
        status: response.status,
        summary: `${args.mirror.label} JAWS page returned HTTP ${response.status}.`,
        expected: '200',
        actual: String(response.status),
      })
    }
    if (!/JAWS/i.test(text)) {
      return failedCheck({
        id: `${args.mirror.id}:page`,
        url: args.mirror.pageUrl,
        status: response.status,
        summary: `${args.mirror.label} JAWS page did not include a JAWS marker.`,
        expected: 'JAWS marker in HTML payload',
        actual: text.slice(0, 120),
      })
    }
    return passedCheck(
      `${args.mirror.id}:page`,
      args.mirror.pageUrl,
      response.status,
      `${args.mirror.label} JAWS page is reachable.`,
    )
  } catch (error) {
    return failedCheck({
      id: `${args.mirror.id}:page`,
      url: args.mirror.pageUrl,
      summary: `${args.mirror.label} JAWS page check failed: ${String(error)}`,
    })
  }
}

async function checkMirrorRedirect(args: {
  mirror: JawsReleaseMirror
  asset: JawsReleaseAsset
  fetchImpl: FetchLike
  timeoutMs: number
}): Promise<JawsReleaseMirrorHealthCheck> {
  const url = `${args.mirror.routeBaseUrl}/${args.asset.route}`
  const expected = expectedAssetUrl(args.asset.file)
  try {
    const response = await fetchWithTimeout(
      args.fetchImpl,
      url,
      {
        method: 'GET',
        redirect: 'manual',
      },
      args.timeoutMs,
    )
    const actual = normalizeLocation(response.headers.get('location'))
    if (!REDIRECT_STATUSES.has(response.status)) {
      return failedCheck({
        id: `${args.mirror.id}:${args.asset.id}`,
        url,
        status: response.status,
        summary: `${args.mirror.label} ${args.asset.id} route did not redirect.`,
        expected,
        actual,
      })
    }
    if (actual !== expected) {
      return failedCheck({
        id: `${args.mirror.id}:${args.asset.id}`,
        url,
        status: response.status,
        summary: `${args.mirror.label} ${args.asset.id} route targets the wrong asset.`,
        expected,
        actual,
      })
    }
    return passedCheck(
      `${args.mirror.id}:${args.asset.id}`,
      url,
      response.status,
      `${args.mirror.label} ${args.asset.id} redirects to ${args.asset.file}.`,
    )
  } catch (error) {
    return failedCheck({
      id: `${args.mirror.id}:${args.asset.id}`,
      url,
      summary: `${args.mirror.label} ${args.asset.id} redirect check failed: ${String(error)}`,
      expected,
    })
  }
}

async function checkGithubRelease(args: {
  fetchImpl: FetchLike
  timeoutMs: number
}): Promise<JawsReleaseMirrorHealthCheck[]> {
  try {
    const response = await fetchWithTimeout(
      args.fetchImpl,
      JAWS_RELEASE_API_URL,
      {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'application/vnd.github+json' },
      },
      args.timeoutMs,
    )
    if (response.status !== 200) {
      return [
        failedCheck({
          id: 'github:release',
          url: JAWS_RELEASE_API_URL,
          status: response.status,
          summary: `GitHub release API returned HTTP ${response.status}.`,
          expected: '200',
          actual: String(response.status),
        }),
      ]
    }

    const body = await response.json() as {
      tag_name?: string
      draft?: boolean
      assets?: Array<{ name?: string; size?: number }>
    }
    const checks: JawsReleaseMirrorHealthCheck[] = []
    if (body.tag_name !== JAWS_RELEASE_TAG || body.draft) {
      checks.push(
        failedCheck({
          id: 'github:release',
          url: JAWS_RELEASE_API_URL,
          status: response.status,
          summary: 'GitHub release tag or draft state is not publishable.',
          expected: `${JAWS_RELEASE_TAG} and draft=false`,
          actual: `${body.tag_name ?? 'missing'} and draft=${String(body.draft)}`,
        }),
      )
    } else {
      checks.push(
        passedCheck(
          'github:release',
          JAWS_RELEASE_API_URL,
          response.status,
          `GitHub release ${JAWS_RELEASE_TAG} is published.`,
        ),
      )
    }

    const assets = new Map(
      (body.assets ?? []).map(asset => [asset.name ?? '', asset.size ?? 0]),
    )
    for (const name of requiredReleaseAssetNames()) {
      const size = assets.get(name)
      if (!size || size <= 0) {
        checks.push(
          failedCheck({
            id: `github:asset:${name}`,
            url: JAWS_RELEASE_URL,
            status: response.status,
            summary: `GitHub release asset is missing or empty: ${name}.`,
            expected: 'asset with nonzero size',
            actual: size === undefined ? 'missing' : String(size),
          }),
        )
        continue
      }
      checks.push(
        passedCheck(
          `github:asset:${name}`,
          JAWS_RELEASE_URL,
          response.status,
          `GitHub release asset exists: ${name}.`,
        ),
      )
    }
    return checks
  } catch (error) {
    return [
      failedCheck({
        id: 'github:release',
        url: JAWS_RELEASE_API_URL,
        summary: `GitHub release check failed: ${String(error)}`,
      }),
    ]
  }
}

async function checkUpdaterManifest(args: {
  fetchImpl: FetchLike
  timeoutMs: number
}): Promise<JawsReleaseMirrorHealthCheck[]> {
  const manifestUrl = expectedAssetUrl('latest.json')
  try {
    const response = await fetchWithTimeout(
      args.fetchImpl,
      manifestUrl,
      {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'application/json,*/*' },
      },
      args.timeoutMs,
    )
    if (response.status !== 200) {
      return [
        failedCheck({
          id: 'manifest:fetch',
          url: manifestUrl,
          status: response.status,
          summary: `Updater manifest returned HTTP ${response.status}.`,
          expected: '200',
          actual: String(response.status),
        }),
      ]
    }
    const body = await response.json() as {
      version?: string
      platforms?: Record<string, { signature?: string; url?: string }>
    }
    const checks: JawsReleaseMirrorHealthCheck[] = []
    if (body.version !== JAWS_RELEASE_VERSION) {
      checks.push(
        failedCheck({
          id: 'manifest:version',
          url: manifestUrl,
          status: response.status,
          summary: 'Updater manifest version does not match the JAWS release.',
          expected: JAWS_RELEASE_VERSION,
          actual: body.version ?? null,
        }),
      )
    } else {
      checks.push(
        passedCheck(
          'manifest:version',
          manifestUrl,
          response.status,
          `Updater manifest version is ${JAWS_RELEASE_VERSION}.`,
        ),
      )
    }

    const expectedPlatforms = new Map(
      JAWS_RELEASE_INDEX.updaterPlatforms
        .map(platform => {
          const asset = assetById(platform.assetId)
          return asset ? [platform.platform, expectedAssetUrl(asset.file)] as const : null
        })
        .filter((entry): entry is readonly [string, string] => entry !== null),
    )
    for (const [platform, expectedUrl] of expectedPlatforms) {
      const entry = body.platforms?.[platform]
      if (!entry?.url || !entry.signature) {
        checks.push(
          failedCheck({
            id: `manifest:platform:${platform}`,
            url: manifestUrl,
            status: response.status,
            summary: `Updater manifest is missing URL or signature for ${platform}.`,
            expected: `${expectedUrl} with signature`,
            actual: entry?.url ?? null,
          }),
        )
        continue
      }
      if (entry.url !== expectedUrl) {
        checks.push(
          failedCheck({
            id: `manifest:platform:${platform}`,
            url: manifestUrl,
            status: response.status,
            summary: `Updater manifest ${platform} URL targets the wrong asset.`,
            expected: expectedUrl,
            actual: entry.url,
          }),
        )
        continue
      }
      checks.push(
        passedCheck(
          `manifest:platform:${platform}`,
          manifestUrl,
          response.status,
          `Updater manifest includes signed ${platform} artifact.`,
        ),
      )
    }
    return checks
  } catch (error) {
    return [
      failedCheck({
        id: 'manifest:fetch',
        url: manifestUrl,
        summary: `Updater manifest check failed: ${String(error)}`,
      }),
    ]
  }
}

function signReportIfConfigured(
  report: JawsReleaseMirrorHealthReport,
  env: NodeJS.ProcessEnv,
): JawsReleaseMirrorHealthReport {
  const privateKeyPem =
    env.OPENJAWS_RELEASE_HEALTH_PRIVATE_KEY ??
    env.OPENJAWS_RELEASE_MANIFEST_PRIVATE_KEY ??
    null
  if (!privateKeyPem) {
    return report
  }
  return {
    ...report,
    signature: signReleaseManifestPayload({
      manifest: report,
      privateKeyPem,
    }),
  }
}

export async function runJawsReleaseMirrorHealth(
  options: JawsReleaseMirrorHealthOptions = {},
): Promise<JawsReleaseMirrorHealthReport> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const checks: JawsReleaseMirrorHealthCheck[] = []

  for (const mirror of JAWS_RELEASE_MIRRORS) {
    checks.push(await checkMirrorPage({ mirror, fetchImpl, timeoutMs }))
    for (const asset of JAWS_RELEASE_ASSETS.filter(asset => asset.route)) {
      checks.push(
        await checkMirrorRedirect({
          mirror,
          asset,
          fetchImpl,
          timeoutMs,
        }),
      )
    }
  }

  checks.push(...await checkGithubRelease({ fetchImpl, timeoutMs }))
  checks.push(...await checkUpdaterManifest({ fetchImpl, timeoutMs }))

  const failures = checks.filter(check => !check.ok)
  const report: JawsReleaseMirrorHealthReport = {
    ok: failures.length === 0,
    checkedAt: (options.now ?? new Date()).toISOString(),
    release: {
      repo: JAWS_RELEASE_REPO,
      tag: JAWS_RELEASE_TAG,
      version: JAWS_RELEASE_VERSION,
      releaseUrl: JAWS_RELEASE_URL,
      apiUrl: JAWS_RELEASE_API_URL,
    },
    mirrors: JAWS_RELEASE_MIRRORS,
    checks,
    failures,
  }

  return signReportIfConfigured(report, options.env ?? process.env)
}

export function parseArgs(argv: string[]): CliOptions {
  let outPath: string | null = null
  let timeoutMs = DEFAULT_TIMEOUT_MS
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--out' && argv[i + 1]) {
      outPath = resolve(argv[++i]!)
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[++i]!, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        timeoutMs = parsed
      }
    }
  }
  return {
    json: argv.includes('--json'),
    outPath,
    timeoutMs,
  }
}

function writeReceipt(path: string, report: JawsReleaseMirrorHealthReport): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`)
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const report = await runJawsReleaseMirrorHealth({
    timeoutMs: options.timeoutMs,
  })

  if (options.outPath) {
    writeReceipt(options.outPath, report)
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else if (report.ok) {
    console.log(
      `JAWS release mirror health passed for ${report.release.tag}: ${report.checks.length} checks.`,
    )
  } else {
    console.error(
      `JAWS release mirror health failed for ${report.release.tag}: ${report.failures.length} failures.`,
    )
    for (const failure of report.failures) {
      console.error(`- ${failure.id}: ${failure.summary}`)
    }
  }

  return report.ok ? 0 : 1
}

if (import.meta.main) {
  process.exit(await main())
}
