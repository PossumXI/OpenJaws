import { describe, expect, test } from 'bun:test'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'

describe('execFileNoThrowWithCwd', () => {
  test('runs argv commands without shell interpretation', async () => {
    const result = await execFileNoThrowWithCwd(
      process.execPath,
      ['-e', 'console.log(process.argv.slice(1).join("|"))', 'one;two'],
    )

    expect(result.code).toBe(0)
    expect(result.stdout.trim()).toBe('one;two')
  })

  test('rejects executable strings that look like shell command lines', async () => {
    const result = await execFileNoThrowWithCwd(
      `${process.execPath} & echo injected`,
      ['-e', 'console.log("should not run")'],
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('not a shell command')
    expect(result.stdout).toBe('')
  })

  test('rejects NUL bytes before spawning', async () => {
    const result = await execFileNoThrowWithCwd(
      process.execPath,
      ['-e', 'console.log("should not run")', 'bad\0arg'],
    )

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Argument 2 must not contain NUL bytes')
    expect(result.stdout).toBe('')
  })
})
