import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import {
  JAWS_RELEASE_BASE_URL,
  JAWS_RELEASE_INDEX,
  type JawsReleaseIndex,
} from './jaws-release-index.ts'
import { verifyJawsReleaseArtifacts } from './jaws-release-artifact-guard.ts'

function withBundleRoot(run: (root: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'jaws-release-artifacts-'))
  try {
    run(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

function writeArtifact(root: string, name: string, body = 'artifact') {
  writeFileSync(join(root, name), body)
}

function releaseAssetFile(index: JawsReleaseIndex, id: string): string {
  const asset = index.assets.find(candidate => candidate.id === id)
  if (!asset) {
    throw new Error(`Missing release asset in fixture: ${id}`)
  }
  return asset.file
}

function manifestFor(index: JawsReleaseIndex) {
  return {
    version: index.version,
    platforms: Object.fromEntries(
      index.updaterPlatforms.map(platform => [
        platform.platform,
        {
          signature: `signed-${platform.platform}`,
          url: `${JAWS_RELEASE_BASE_URL}/${releaseAssetFile(index, platform.assetId)}`,
        },
      ]),
    ),
  }
}

function seedCompleteBundle(root: string, index: JawsReleaseIndex = JAWS_RELEASE_INDEX) {
  mkdirSync(join(root, 'nested'), { recursive: true })
  for (const asset of index.assets) {
    const targetRoot = asset.id === 'windows' ? join(root, 'nested') : root
    writeArtifact(
      targetRoot,
      asset.file,
      asset.id === 'manifest'
        ? `${JSON.stringify(manifestFor(index), null, 2)}\n`
        : `${asset.id}-payload`,
    )
    if (asset.requiresSignature) {
      writeArtifact(targetRoot, `${asset.file}.sig`, `signature-${asset.id}`)
    }
  }
}

describe('jaws release artifact guard', () => {
  test('passes when every indexed artifact, signature, and updater platform is present', () => {
    withBundleRoot(root => {
      seedCompleteBundle(root)
      const report = verifyJawsReleaseArtifacts({
        bundleRoot: root,
        now: new Date('2026-05-01T00:00:00.000Z'),
      })

      expect(report.ok).toBe(true)
      expect(report.failures).toEqual([])
      expect(report.release.tag).toBe(JAWS_RELEASE_INDEX.tag)
      expect(report.checks).toContainEqual(
        expect.objectContaining({
          id: 'manifest:version',
          ok: true,
        }),
      )
    })
  })

  test('fails closed when a required signature is missing', () => {
    withBundleRoot(root => {
      seedCompleteBundle(root)
      rmSync(join(root, `${releaseAssetFile(JAWS_RELEASE_INDEX, 'linux-deb')}.sig`))

      const report = verifyJawsReleaseArtifacts({ bundleRoot: root })

      expect(report.ok).toBe(false)
      expect(report.failures).toContainEqual(
        expect.objectContaining({
          id: 'signature:linux-deb',
          summary: expect.stringContaining('missing'),
        }),
      )
    })
  })

  test('fails closed when latest.json points an updater platform at the wrong asset', () => {
    withBundleRoot(root => {
      seedCompleteBundle(root)
      writeArtifact(
        root,
        'latest.json',
        `${JSON.stringify(
          {
            ...manifestFor(JAWS_RELEASE_INDEX),
            platforms: {
              ...manifestFor(JAWS_RELEASE_INDEX).platforms,
              'windows-x86_64': {
                signature: 'signed-windows',
                url: `${JAWS_RELEASE_BASE_URL}/wrong.exe`,
              },
            },
          },
          null,
          2,
        )}\n`,
      )

      const report = verifyJawsReleaseArtifacts({ bundleRoot: root })

      expect(report.ok).toBe(false)
      expect(report.failures).toContainEqual(
        expect.objectContaining({
          id: 'manifest:platform:windows-x86_64',
          summary: expect.stringContaining('wrong artifact'),
          expected: `${JAWS_RELEASE_BASE_URL}/${releaseAssetFile(JAWS_RELEASE_INDEX, 'windows')}`,
          actual: `${JAWS_RELEASE_BASE_URL}/wrong.exe`,
        }),
      )
    })
  })
})
