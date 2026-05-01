import { describe, expect, test } from 'bun:test'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from './crypto.js'

describe('oauth crypto', () => {
  test('builds the RFC 7636 S256 PKCE challenge', async () => {
    const challenge = await generateCodeChallenge(
      'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    )

    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  test('generates URL-safe verifier and state values', () => {
    expect(generateCodeVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(generateState()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})
