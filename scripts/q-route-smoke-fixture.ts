import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { createHash } from 'crypto'
import { dirname, resolve } from 'path'
import {
  buildOpenJawsSftBundleManifest,
  groupPreparedSamplesByLanguage,
  groupPreparedSamplesByTag,
  summarizePreparedOpenJawsSftSamples,
} from '../src/utils/openjawsSftBundles.js'
import type { OpenJawsSftSample } from '../src/utils/openjawsSftDataset.js'
import {
  prepareOpenJawsSftDataset,
  type PreparedOpenJawsSftSample,
} from '../src/utils/openjawsSftPreparation.js'
import {
  auditOpenJawsSftSamples,
  filterCleanPreparedOpenJawsSftSamples,
} from '../src/utils/openjawsSftQuality.js'

function smokeFixturePath(root: string): string {
  return resolve(root, 'fixtures', 'sft', 'openjaws-q-sample.jsonl')
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function readExistingIntegrity(path: string): {
  sourcePath?: string
  sourceSha256?: string
} | null {
  if (!existsSync(path)) {
    return null
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      sourcePath?: unknown
      sourceSha256?: unknown
    }
    return {
      sourcePath:
        typeof parsed.sourcePath === 'string' ? parsed.sourcePath : undefined,
      sourceSha256:
        typeof parsed.sourceSha256 === 'string' ? parsed.sourceSha256 : undefined,
    }
  } catch {
    return null
  }
}

function shouldReuseExistingSmokeBundle({
  bundleManifestPath,
  integrityPath,
  trainPath,
  evalPath,
  sourcePath,
  sourceSha256,
}: {
  bundleManifestPath: string
  integrityPath: string
  trainPath: string
  evalPath: string
  sourcePath: string
  sourceSha256: string
}): boolean {
  if (
    !existsSync(bundleManifestPath) ||
    !existsSync(trainPath) ||
    !existsSync(evalPath)
  ) {
    return false
  }

  const integrity = readExistingIntegrity(integrityPath)
  return (
    integrity?.sourcePath === sourcePath &&
    integrity.sourceSha256 === sourceSha256
  )
}

function loadSamples(path: string): OpenJawsSftSample[] {
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as OpenJawsSftSample)
}

function writeJsonl(path: string, rows: PreparedOpenJawsSftSample[]): void {
  mkdirSync(dirname(path), { recursive: true })
  const payload =
    rows.length > 0 ? `${rows.map(row => JSON.stringify(row)).join('\n')}\n` : ''
  writeFileSync(path, payload, 'utf8')
}

export function ensureQRouteSmokeBundleDir(root = process.cwd()): string {
  const sourcePath = smokeFixturePath(root)
  const sourceSha256 = sha256File(sourcePath)
  const outDir = resolve(root, 'artifacts', 'q-route-smoke-fixture', 'audited-v2')
  const bundleManifestPath = resolve(outDir, 'bundle-manifest.json')
  const integrityPath = resolve(outDir, 'fixture-integrity.json')
  const trainPath = resolve(outDir, 'train.jsonl')
  const evalPath = resolve(outDir, 'eval.jsonl')

  if (
    shouldReuseExistingSmokeBundle({
      bundleManifestPath,
      integrityPath,
      trainPath,
      evalPath,
      sourcePath,
      sourceSha256,
    })
  ) {
    return outDir
  }

  const samples = loadSamples(sourcePath)
  const prepared = prepareOpenJawsSftDataset(samples, { evalRatio: 0.2 })
  const audit = auditOpenJawsSftSamples(prepared.samples)
  if (audit.summary.droppedSamples > 0) {
    throw new Error(
      `Q route smoke fixture contains ${audit.summary.droppedSamples} dropped samples.`,
    )
  }

  const cleanSamples = filterCleanPreparedOpenJawsSftSamples(prepared.samples)
  const cleanManifest = summarizePreparedOpenJawsSftSamples(cleanSamples)
  const tagGroups = groupPreparedSamplesByTag(cleanSamples)
  const languageGroups = groupPreparedSamplesByLanguage(cleanSamples)
  const train = cleanSamples.filter(sample => sample.split === 'train')
  const evalRows = cleanSamples.filter(sample => sample.split === 'eval')

  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir, { recursive: true })
  writeJsonl(resolve(outDir, 'all.jsonl'), cleanSamples)
  writeJsonl(trainPath, train)
  writeJsonl(evalPath, evalRows)

  for (const [tag, group] of Object.entries(tagGroups)) {
    writeJsonl(resolve(outDir, 'tags', tag, 'all.jsonl'), group.all)
    writeJsonl(resolve(outDir, 'tags', tag, 'train.jsonl'), group.train)
    writeJsonl(resolve(outDir, 'tags', tag, 'eval.jsonl'), group.eval)
  }

  for (const [language, group] of Object.entries(languageGroups)) {
    writeJsonl(resolve(outDir, 'languages', language, 'all.jsonl'), group.all)
    writeJsonl(resolve(outDir, 'languages', language, 'train.jsonl'), group.train)
    writeJsonl(resolve(outDir, 'languages', language, 'eval.jsonl'), group.eval)
  }

  writeFileSync(
    resolve(outDir, 'manifest.json'),
    `${JSON.stringify(cleanManifest, null, 2)}\n`,
    'utf8',
  )
  writeFileSync(
    bundleManifestPath,
    `${JSON.stringify(
      buildOpenJawsSftBundleManifest({
        bundleId: 'q-route-smoke-fixture',
        sourcePath,
        outDir,
        preparedManifest: cleanManifest,
        samples: cleanSamples,
      }),
      null,
      2,
    )}\n`,
    'utf8',
  )
  writeFileSync(
    integrityPath,
    `${JSON.stringify(
      {
        sourcePath,
        sourceSha256,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )

  return outDir
}
