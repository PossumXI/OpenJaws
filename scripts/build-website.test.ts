import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  ensureNextBuildBinary,
  findExistingNextBin,
  getNextBinCandidates,
} from './build-website.ts'

const cleanupDirs: string[] = []

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  cleanupDirs.push(dir)
  return dir
}

function writeNextStub(path: string): void {
  mkdirSync(join(path, 'dist', 'bin'), { recursive: true })
  writeFileSync(join(path, 'dist', 'bin', 'next'), '#!/usr/bin/env node\n', 'utf8')
}

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('build-website helpers', () => {
  test('prefers the website-local next binary when present', () => {
    const root = makeTempDir('openjaws-build-website-root-')
    const websiteRoot = join(root, 'website')
    const websiteNext = join(websiteRoot, 'node_modules', 'next')
    const rootNext = join(root, 'node_modules', 'next')
    writeNextStub(websiteNext)
    writeNextStub(rootNext)

    expect(getNextBinCandidates(root, websiteRoot)[0]).toBe(
      join(websiteNext, 'dist', 'bin', 'next'),
    )
    expect(findExistingNextBin(root, websiteRoot)).toBe(
      join(websiteNext, 'dist', 'bin', 'next'),
    )
  })

  test('falls back to the root next binary when the website-local install is absent', () => {
    const root = makeTempDir('openjaws-build-website-root-')
    const websiteRoot = join(root, 'website')
    const rootNext = join(root, 'node_modules', 'next')
    writeNextStub(rootNext)

    expect(findExistingNextBin(root, websiteRoot)).toBe(
      join(rootNext, 'dist', 'bin', 'next'),
    )
  })

  test('installs website dependencies when the next binary is initially missing', async () => {
    const root = makeTempDir('openjaws-build-website-root-')
    const websiteRoot = join(root, 'website')

    const nextBin = await ensureNextBuildBinary(root, websiteRoot, async installRoot => {
      expect(installRoot).toBe(websiteRoot)
      writeNextStub(join(websiteRoot, 'node_modules', 'next'))
    })

    expect(nextBin).toBe(
      join(websiteRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
    )
  })

  test('throws when the next binary is still missing after installation', async () => {
    const root = makeTempDir('openjaws-build-website-root-')
    const websiteRoot = join(root, 'website')

    await expect(
      ensureNextBuildBinary(root, websiteRoot, async () => {}),
    ).rejects.toThrow('Next.js build binary not found.')
  })
})
