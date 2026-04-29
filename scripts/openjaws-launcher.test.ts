import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const launcherPath = resolve(import.meta.dir, '..', 'openjaws.bat')

describe('openjaws Windows launcher', () => {
  test('does not block interactive startup on silent version probes', () => {
    const launcher = readFileSync(launcherPath, 'utf8')

    expect(launcher).not.toContain('--version >nul')
    expect(launcher).not.toContain("powershell -NoProfile -Command \"& '%TARGET%'")
    expect(launcher).toContain('"%TARGET%" --version')
    expect(launcher).toContain('"%TARGET%" --help')
  })
})
