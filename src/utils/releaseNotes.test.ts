import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import pkg from '../../package.json' with { type: 'json' }
import { getAllReleaseNotes, parseChangelog } from './releaseNotes.js'

describe('releaseNotes', () => {
  test('parses the checked-in changelog and includes the current package version', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const changelogPath = resolve(repoRoot, 'CHANGELOG.md')
    const changelog = readFileSync(changelogPath, 'utf8')
    const parsed = parseChangelog(changelog)
    const allNotes = getAllReleaseNotes(changelog)

    expect(Object.keys(parsed)).toContain(pkg.version)
    expect(parsed[pkg.version]?.length ?? 0).toBeGreaterThan(0)
    expect(allNotes.some(([version]) => version === pkg.version)).toBe(true)
  })
})
