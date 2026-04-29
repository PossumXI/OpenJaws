import { afterEach, describe, expect, test } from 'bun:test'
import { MCP_CLIENT_METADATA_URL, getOauthConfig } from '../../constants/oauth.js'
import { buildAuthUrl } from './client.js'

const OAUTH_ENV_VARS = [
  'USER_TYPE',
  'USE_LOCAL_OAUTH',
  'USE_STAGING_OAUTH',
  'OPENJAWS_CUSTOM_OAUTH_URL',
  'OPENJAWS_OAUTH_CLIENT_ID',
  'CLAUDE_LOCAL_OAUTH_API_BASE',
  'CLAUDE_LOCAL_OAUTH_APPS_BASE',
  'CLAUDE_LOCAL_OAUTH_CONSOLE_BASE',
] as const

const originalEnv = new Map<string, string | undefined>()

afterEach(() => {
  for (const name of OAUTH_ENV_VARS) {
    const value = originalEnv.get(name)
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
  originalEnv.clear()
})

function resetOauthEnv(): void {
  for (const name of OAUTH_ENV_VARS) {
    if (!originalEnv.has(name)) {
      originalEnv.set(name, process.env[name])
    }
    delete process.env[name]
  }
}

function getAuthOriginPath(url: string): string {
  const parsed = new URL(url)
  return `${parsed.origin}${parsed.pathname}`
}

describe('buildAuthUrl', () => {
  test('uses the production account authorize URL when loginWithOpenJawsAccount is true', () => {
    resetOauthEnv()

    const url = buildAuthUrl({
      codeChallenge: 'challenge',
      state: 'state',
      port: 4545,
      isManual: false,
      loginWithOpenJawsAccount: true,
    })

    expect(getAuthOriginPath(url)).toBe('https://qline.site/oauth/authorize')
  })

  test('uses the production console authorize URL when loginWithOpenJawsAccount is false', () => {
    resetOauthEnv()

    const url = buildAuthUrl({
      codeChallenge: 'challenge',
      state: 'state',
      port: 4545,
      isManual: false,
      loginWithOpenJawsAccount: false,
    })

    expect(getAuthOriginPath(url)).toBe('https://qline.site/oauth/authorize')
  })

  test('uses qline for production OAuth service URLs', () => {
    resetOauthEnv()

    expect(getOauthConfig().BASE_API_URL).toBe('https://qline.site')
    expect(getOauthConfig().TOKEN_URL).toBe('https://qline.site/v1/oauth/token')
    expect(getOauthConfig().MANUAL_REDIRECT_URL).toBe(
      'https://qline.site/oauth/code/callback',
    )
    expect(MCP_CLIENT_METADATA_URL).toBe(
      'https://qline.site/oauth/openjaws-client-metadata',
    )
  })

  test('uses the approved qline authorize URL when a custom OAuth base is configured', () => {
    resetOauthEnv()
    process.env.OPENJAWS_CUSTOM_OAUTH_URL = 'https://qline.site'

    const url = buildAuthUrl({
      codeChallenge: 'challenge',
      state: 'state',
      port: 4545,
      isManual: false,
      loginWithOpenJawsAccount: true,
    })

    expect(getAuthOriginPath(url)).toBe('https://qline.site/oauth/authorize')
  })

  test('uses the approved qline console authorize URL when a custom OAuth base is configured', () => {
    resetOauthEnv()
    process.env.OPENJAWS_CUSTOM_OAUTH_URL = 'https://qline.site'

    const url = buildAuthUrl({
      codeChallenge: 'challenge',
      state: 'state',
      port: 4545,
      isManual: false,
      loginWithOpenJawsAccount: false,
    })

    expect(getAuthOriginPath(url)).toBe('https://qline.site/oauth/authorize')
  })

  test('keeps the legacy loginWithOpenJawsAi input working with custom OAuth', () => {
    resetOauthEnv()
    process.env.OPENJAWS_CUSTOM_OAUTH_URL = 'https://qline.site'

    const url = buildAuthUrl({
      codeChallenge: 'challenge',
      state: 'state',
      port: 4545,
      isManual: true,
      loginWithOpenJawsAi: true,
    })

    expect(getAuthOriginPath(url)).toBe('https://qline.site/oauth/authorize')
  })
})
