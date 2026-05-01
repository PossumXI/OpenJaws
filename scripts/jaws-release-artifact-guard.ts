import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  JAWS_RELEASE_INDEX_PATH,
  readJawsReleaseIndex,
  type JawsReleaseAsset,
  type JawsReleaseIndex,
} from './jaws-release-index.ts'

type CliOptions = {
  bundleRoot: string | null
  indexPath: string
  json: boolean
}

type ArtifactCheck = {
  id: string
  ok: boolean
  summary: string
  path?: string
  expected?: string
  actual?: string | null
}

export type JawsReleaseArtifactGuardReport = {
  ok: boolean
  checkedAt: string
  bundleRoot: string
  release: {
    version: string
    tag: string
    repo: string
  }
  checks: ArtifactCheck[]
  failures: ArtifactCheck[]
}

type ManifestPlatform = {
  signature?: string
  url?: string
}

type UpdaterManifest = {
  version?: string
  platforms?: Record<string, ManifestPlatform>
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    bundleRoot: null,
    indexPath: JAWS_RELEASE_INDEX_PATH,
    json: argv.includes('--json'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (current === '--json') {
      continue
    }
    if (current === '--bundle-root' && argv[index + 1]) {
      options.bundleRoot = argv[++index]!
      continue
    }
    if (current === '--index' && argv[index + 1]) {
      options.indexPath = resolve(argv[++index]!)
      continue
    }
    throw new Error(`Unknown or incomplete argument: ${current}`)
  }

  return options
}

function walkFiles(root: string): string[] {
  const entries = readdirSync(root, { withFileTypes: true })
  return entries.flatMap(entry => {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) {
      return walkFiles(path)
    }
    return entry.isFile() ? [path] : []
  })
}

function pass(id: string, summary: string, path?: string): ArtifactCheck {
  return {
    id,
    ok: true,
    summary,
    path,
  }
}

function fail(args: {
  id: string
  summary: string
  path?: string
  expected?: string
  actual?: string | null
}): ArtifactCheck {
  return {
    id: args.id,
    ok: false,
    summary: args.summary,
    path: args.path,
    expected: args.expected,
    actual: args.actual,
  }
}

function addByName(files: string[]): Map<string, string[]> {
  const byName = new Map<string, string[]>()
  for (const file of files) {
    const name = basename(file)
    byName.set(name, [...(byName.get(name) ?? []), file])
  }
  return byName
}

function uniqueFileByName(args: {
  byName: Map<string, string[]>
  name: string
  id: string
  label: string
}): ArtifactCheck {
  const matches = args.byName.get(args.name) ?? []
  if (matches.length === 0) {
    return fail({
      id: args.id,
      summary: `${args.label} is missing from the release bundle.`,
      expected: args.name,
      actual: null,
    })
  }
  if (matches.length > 1) {
    return fail({
      id: args.id,
      summary: `${args.label} appears more than once in the release bundle.`,
      expected: args.name,
      actual: matches.join(', '),
    })
  }
  const size = statSync(matches[0]!).size
  if (size <= 0) {
    return fail({
      id: args.id,
      summary: `${args.label} is empty.`,
      path: matches[0],
      expected: 'non-empty file',
      actual: String(size),
    })
  }
  return pass(args.id, `${args.label} is present.`, matches[0])
}

function expectedAssetUrl(index: JawsReleaseIndex, asset: JawsReleaseAsset): string {
  return `${index.github.baseAssetUrl}/${asset.file}`
}

function assetById(index: JawsReleaseIndex, id: string): JawsReleaseAsset | null {
  return index.assets.find(asset => asset.id === id) ?? null
}

function parseManifest(path: string): UpdaterManifest | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as UpdaterManifest
  } catch {
    return null
  }
}

function checkUpdaterManifest(args: {
  index: JawsReleaseIndex
  manifestPath: string
}): ArtifactCheck[] {
  const manifest = parseManifest(args.manifestPath)
  if (!manifest) {
    return [
      fail({
        id: 'manifest:json',
        path: args.manifestPath,
        summary: 'latest.json could not be parsed as updater JSON.',
      }),
    ]
  }

  const checks: ArtifactCheck[] = []
  if (manifest.version === args.index.version) {
    checks.push(pass('manifest:version', `Manifest version is ${args.index.version}.`, args.manifestPath))
  } else {
    checks.push(
      fail({
        id: 'manifest:version',
        path: args.manifestPath,
        summary: 'Manifest version does not match release-index.json.',
        expected: args.index.version,
        actual: manifest.version ?? null,
      }),
    )
  }

  const expectedPlatforms = new Map(
    args.index.updaterPlatforms.map(platform => {
      const asset = assetById(args.index, platform.assetId)
      return [
        platform.platform,
        asset ? expectedAssetUrl(args.index, asset) : null,
      ] as const
    }),
  )
  const actualPlatforms = new Set(Object.keys(manifest.platforms ?? {}))

  for (const [platform, expectedUrl] of expectedPlatforms) {
    const entry = manifest.platforms?.[platform]
    if (!expectedUrl) {
      checks.push(
        fail({
          id: `manifest:platform:${platform}`,
          path: args.manifestPath,
          summary: `Release index points ${platform} at an unknown asset id.`,
        }),
      )
      continue
    }
    if (!entry?.url || !entry.signature?.trim()) {
      checks.push(
        fail({
          id: `manifest:platform:${platform}`,
          path: args.manifestPath,
          summary: `Manifest is missing URL or signature for ${platform}.`,
          expected: `${expectedUrl} with signature`,
          actual: entry?.url ?? null,
        }),
      )
      continue
    }
    if (entry.url !== expectedUrl) {
      checks.push(
        fail({
          id: `manifest:platform:${platform}`,
          path: args.manifestPath,
          summary: `Manifest ${platform} URL targets the wrong artifact.`,
          expected: expectedUrl,
          actual: entry.url,
        }),
      )
      continue
    }
    checks.push(pass(`manifest:platform:${platform}`, `Manifest includes signed ${platform}.`, args.manifestPath))
  }

  for (const platform of actualPlatforms) {
    if (!expectedPlatforms.has(platform)) {
      checks.push(
        fail({
          id: `manifest:extra-platform:${platform}`,
          path: args.manifestPath,
          summary: `Manifest exposes ${platform}, but release-index.json does not authorize it.`,
          expected: [...expectedPlatforms.keys()].join(', '),
          actual: platform,
        }),
      )
    }
  }

  return checks
}

export function verifyJawsReleaseArtifacts(args: {
  bundleRoot: string
  index?: JawsReleaseIndex
  now?: Date
}): JawsReleaseArtifactGuardReport {
  const bundleRoot = resolve(args.bundleRoot)
  const bundleStat = statSync(bundleRoot)
  if (!bundleStat.isDirectory()) {
    throw new Error(`JAWS release bundle root is not a directory: ${bundleRoot}`)
  }

  const index = args.index ?? readJawsReleaseIndex()
  const byName = addByName(walkFiles(bundleRoot))
  const checks: ArtifactCheck[] = []

  if (index.tag === `jaws-v${index.version}`) {
    checks.push(pass('index:tag', `Release tag matches ${index.version}.`))
  } else {
    checks.push(
      fail({
        id: 'index:tag',
        summary: 'Release tag does not match the JAWS version.',
        expected: `jaws-v${index.version}`,
        actual: index.tag,
      }),
    )
  }

  for (const asset of index.assets) {
    const artifactCheck = uniqueFileByName({
      byName,
      name: asset.file,
      id: `asset:${asset.id}`,
      label: asset.file,
    })
    checks.push(artifactCheck)

    if (asset.requiresSignature) {
      checks.push(
        uniqueFileByName({
          byName,
          name: `${asset.file}.sig`,
          id: `signature:${asset.id}`,
          label: `${asset.file}.sig`,
        }),
      )
    }

    if (asset.id === 'manifest' && artifactCheck.ok && artifactCheck.path) {
      checks.push(...checkUpdaterManifest({ index, manifestPath: artifactCheck.path }))
    }
  }

  const failures = checks.filter(check => !check.ok)
  return {
    ok: failures.length === 0,
    checkedAt: (args.now ?? new Date()).toISOString(),
    bundleRoot,
    release: {
      version: index.version,
      tag: index.tag,
      repo: index.repo,
    },
    checks,
    failures,
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  if (!options.bundleRoot) {
    throw new Error(
      'Usage: bun scripts/jaws-release-artifact-guard.ts --bundle-root <dir> [--index <release-index.json>] [--json]',
    )
  }

  const report = verifyJawsReleaseArtifacts({
    bundleRoot: options.bundleRoot,
    index: readJawsReleaseIndex(options.indexPath),
  })

  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else if (report.ok) {
    console.log(
      `JAWS release artifact guard passed for ${report.release.tag}: ${report.checks.length} checks.`,
    )
  } else {
    console.error(
      `JAWS release artifact guard failed for ${report.release.tag}: ${report.failures.length} failures.`,
    )
    for (const failure of report.failures) {
      const detail = failure.expected
        ? ` expected=${failure.expected} actual=${failure.actual ?? 'missing'}`
        : ''
      console.error(`- ${failure.id}: ${failure.summary}${detail}`)
    }
  }

  return report.ok ? 0 : 1
}

if (import.meta.main) {
  process.exit(await main())
}
