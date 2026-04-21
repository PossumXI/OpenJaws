import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { getGitBashStatus } from './windowsPaths.js'

const originalGitBashPath = process.env.OPENJAWS_GIT_BASH_PATH
let tempDir: string | null = null

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'openjaws-windows-paths-'))
  getGitBashStatus.cache.clear?.()
})

afterEach(() => {
  if (originalGitBashPath === undefined) {
    delete process.env.OPENJAWS_GIT_BASH_PATH
  } else {
    process.env.OPENJAWS_GIT_BASH_PATH = originalGitBashPath
  }
  getGitBashStatus.cache.clear?.()
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
  tempDir = null
})

describe('windowsPaths', () => {
  test('accepts an existing OPENJAWS_GIT_BASH_PATH override without shelling out', () => {
    if (!tempDir) {
      throw new Error('tempDir was not created')
    }

    const bashPath = join(tempDir, 'bash.exe')
    writeFileSync(bashPath, 'echo off\n', 'utf8')
    process.env.OPENJAWS_GIT_BASH_PATH = bashPath

    expect(getGitBashStatus()).toEqual({
      path: bashPath,
      source: 'OPENJAWS_GIT_BASH_PATH',
      error: null,
    })
  })
})
