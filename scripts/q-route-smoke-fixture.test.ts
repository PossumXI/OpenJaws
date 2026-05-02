import { describe, expect, test } from 'bun:test'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { ensureQRouteSmokeBundleDir } from './q-route-smoke-fixture.js'

function findRepoRoot(): string {
  const candidates = [process.cwd(), resolve(process.cwd(), '..')]
  const root = candidates.find(candidate =>
    existsSync(resolve(candidate, 'fixtures', 'sft', 'openjaws-q-sample.jsonl')),
  )
  if (!root) {
    throw new Error('Unable to locate OpenJaws repo root fixture.')
  }
  return root
}

function makeFixtureRoot(): string {
  const repoRoot = findRepoRoot()
  const root = mkdtempSync(join(tmpdir(), 'openjaws-q-route-smoke-'))
  const fixtureDir = resolve(root, 'fixtures', 'sft')
  mkdirSync(fixtureDir, { recursive: true })
  copyFileSync(
    resolve(repoRoot, 'fixtures', 'sft', 'openjaws-q-sample.jsonl'),
    resolve(fixtureDir, 'openjaws-q-sample.jsonl'),
  )
  return root
}

describe('q-route smoke fixture bundle', () => {
  test('uses the explicit root instead of the caller cwd', () => {
    const root = makeFixtureRoot()
    const originalCwd = process.cwd()
    const unrelatedCwd = mkdtempSync(join(tmpdir(), 'openjaws-unrelated-cwd-'))

    try {
      process.chdir(unrelatedCwd)
      const outDir = ensureQRouteSmokeBundleDir(root)

      expect(outDir).toBe(resolve(root, 'artifacts', 'q-route-smoke-fixture', 'audited-v2'))
      expect(existsSync(resolve(outDir, 'train.jsonl'))).toBe(true)
      expect(existsSync(resolve(outDir, 'eval.jsonl'))).toBe(true)

      const manifest = JSON.parse(
        readFileSync(resolve(outDir, 'bundle-manifest.json'), 'utf8'),
      ) as { sourcePath: string; totalSamples: number }
      expect(manifest.sourcePath).toBe(
        resolve(root, 'fixtures', 'sft', 'openjaws-q-sample.jsonl'),
      )
      expect(manifest.totalSamples).toBeGreaterThan(0)
    } finally {
      process.chdir(originalCwd)
      rmSync(root, { recursive: true, force: true })
      rmSync(unrelatedCwd, { recursive: true, force: true })
    }
  })

  test('regenerates stale cached output when fixture integrity does not match', () => {
    const root = makeFixtureRoot()

    try {
      const outDir = ensureQRouteSmokeBundleDir(root)
      const integrityPath = resolve(outDir, 'fixture-integrity.json')
      const firstIntegrity = JSON.parse(readFileSync(integrityPath, 'utf8')) as {
        sourceSha256: string
      }
      writeFileSync(
        integrityPath,
        `${JSON.stringify({ sourcePath: 'stale', sourceSha256: 'stale' })}\n`,
        'utf8',
      )

      expect(ensureQRouteSmokeBundleDir(root)).toBe(outDir)
      const repairedIntegrity = JSON.parse(
        readFileSync(integrityPath, 'utf8'),
      ) as { sourceSha256: string }
      expect(repairedIntegrity.sourceSha256).toBe(firstIntegrity.sourceSha256)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 20_000)
})
