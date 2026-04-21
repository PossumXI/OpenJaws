import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { relative, resolve } from 'path'

const rootDir = resolve(import.meta.dir, '..')
const srcDir = resolve(rootDir, 'src')

function scanTrackedSourceFiles(): string[] {
  const result = Bun.spawnSync({
    cmd: ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '--', 'src'],
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode !== 0) {
    throw new Error(
      `git ls-files scan failed: ${Buffer.from(result.stderr).toString('utf8').trim() || `exit ${result.exitCode}`}`,
    )
  }

  const output = Buffer.from(result.stdout).toString('utf8').trim()
  if (!output) {
    return []
  }

  return output
    .split(/\r?\n/)
    .map(file => resolve(rootDir, file))
    .filter(
      file =>
        file.startsWith(srcDir) &&
        /\.[cm]?[jt]sx?$/.test(file) &&
        !/\.test\.[cm]?[jt]sx?$/.test(file) &&
        !/\.spec\.[cm]?[jt]sx?$/.test(file),
    )
}

function scanFilesWithGitGrep(): Array<{ file: string; matches: string[] }> {
  const result = Bun.spawnSync({
    cmd: [
      'git',
      'grep',
      '-n',
      '-I',
      '-E',
      `require\\((['"])src/.+?\\1\\)`,
      '--',
      'src',
    ],
    cwd: rootDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  if (result.exitCode === 1) {
    return []
  }
  if (result.exitCode !== 0) {
    throw new Error(
      `git grep scan failed: ${Buffer.from(result.stderr).toString('utf8').trim() || `exit ${result.exitCode}`}`,
    )
  }

  const output = Buffer.from(result.stdout).toString('utf8').trim()
  if (!output) {
    return []
  }

  const offenders = new Map<string, string[]>()
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(.*?):\d+:(.*)$/)
    if (!match) {
      continue
    }
    const file = relative(rootDir, resolve(match[1]!)).replace(/\\/g, '/')
    const sourceLine = match[2]!
    const matches = Array.from(
      sourceLine.matchAll(/require\((['"])src\/.+?\1\)/g),
    ).map(entry => entry[0])
    if (matches.length === 0) {
      continue
    }
    offenders.set(file, [...(offenders.get(file) ?? []), ...matches])
  }

  return Array.from(offenders.entries()).map(([file, matches]) => ({
    file,
    matches,
  }))
}

function scanOffendersWithFallback(): Array<{ file: string; matches: string[] }> {
  try {
    return scanFilesWithGitGrep()
  } catch {
    return scanTrackedSourceFiles()
      .map(file => {
        const content = readFileSync(file, 'utf8')
        const matches = Array.from(
          content.matchAll(/require\((['"])src\/.+?\1\)/g),
        ).map(match => match[0])
        return matches.length > 0
          ? {
              file: relative(rootDir, file).replace(/\\/g, '/'),
              matches,
            }
          : null
      })
      .filter(entry => entry !== null)
  }
}

describe('dead-code-eliminated lazy requires', () => {
  test(
    'does not use path-aliased src/* strings in require() expressions',
    () => {
      const offenders = scanOffendersWithFallback()

      expect(offenders).toEqual([])
    },
    30_000,
  )
})
