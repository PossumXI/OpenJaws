import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'fs'

const launcherText = readFileSync('openjaws.bat', 'utf8')
const authText = readFileSync('src/utils/auth.ts', 'utf8')

describe('owner local login bypass secret guard', () => {
  it('does not enable owner login bypass from the public launcher', () => {
    expect(launcherText).not.toContain('OPENJAWS_OWNER_LOGIN_BYPASS=1')
    expect(launcherText).not.toContain('OPENJAWS_OWNER_LOGIN_BYPASS_EMAIL=')
    expect(launcherText).not.toContain('OPENJAWS_OWNER_LOGIN_BYPASS_NAME=')
  })

  it('does not embed founder email or personal name defaults in auth fallback', () => {
    expect(authText).not.toContain('founder@qline.site')
    expect(authText).not.toContain('Gaetano Comparcola')
    expect(authText).toContain('openjaws-local-owner@example.invalid')
  })
})
