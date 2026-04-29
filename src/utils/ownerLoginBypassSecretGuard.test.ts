import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const repoRoot = resolve(import.meta.dir, '..', '..')
const launcherText = readFileSync(resolve(repoRoot, 'openjaws.bat'), 'utf8')
const authText = readFileSync(resolve(repoRoot, 'src', 'utils', 'auth.ts'), 'utf8')

describe('owner local login bypass secret guard', () => {
  it('does not enable owner login bypass from the public launcher', () => {
    expect(launcherText).not.toContain('OPENJAWS_OWNER_LOGIN_BYPASS=1')
    expect(launcherText).not.toContain('OPENJAWS_OWNER_LOGIN_BYPASS_EMAIL=')
    expect(launcherText).not.toContain('OPENJAWS_OWNER_LOGIN_BYPASS_NAME=')
  })

  it('does not embed founder identity or personal email defaults in auth fallback', () => {
    expect(authText).not.toContain('Gaetano')
    expect(authText).not.toContain('Comparcola')
    expect(authText).not.toMatch(
      /\b[A-Z0-9._%+-]+@(?!example\.invalid\b)[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
    )
    expect(authText).toContain(
      "const OWNER_LOCAL_BYPASS_EMAIL_FALLBACK = ['owner-bypass', 'example.invalid'].join('@')",
    )
  })
})
