import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  aggregateDiscordAgentAuthStatus,
  buildDiscordAgentAuthReport,
  checkImmaculateToolPreflight,
  checkDiscordAgentAuthTarget,
  parseDotEnvAssignments,
  parsePowerShellEnvAssignments,
} from './discord-agent-auth-preflight.ts'

describe('discord-agent-auth-preflight', () => {
  test('parses PowerShell env assignments without exposing token values', () => {
    const env = parsePowerShellEnvAssignments([
      "$env:DISCORD_GATEWAY_ENABLED = 'true'",
      '$env:DISCORD_Q_AGENT_PORT = "8789"',
      '$env:DISCORD_BOT_TOKEN = token.value',
    ].join('\n'))

    expect(env.DISCORD_GATEWAY_ENABLED).toBe('true')
    expect(env.DISCORD_Q_AGENT_PORT).toBe('8789')
    expect(env.DISCORD_BOT_TOKEN).toBe('token.value')
  })

  test('parses Immaculate dotenv assignments without exposing key values', () => {
    const env = parseDotEnvAssignments([
      "IMMACULATE_API_KEY='local-secret'",
      'IMMACULATE_HARNESS_URL="http://127.0.0.1:8787/"',
      'IMMACULATE_SEARCH_PROVIDER=brave',
    ].join('\n'))

    expect(env.IMMACULATE_API_KEY).toBe('local-secret')
    expect(env.IMMACULATE_HARNESS_URL).toBe('http://127.0.0.1:8787/')
    expect(env.IMMACULATE_SEARCH_PROVIDER).toBe('brave')
  })

  test('warns when a gateway-enabled token is rejected by Discord', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const envFilePath = join(root, 'agent.env.ps1')
    writeFileSync(
      envFilePath,
      [
        "$env:DISCORD_GATEWAY_ENABLED = 'true'",
        "$env:DISCORD_BOT_TOKEN = 'bad-token'",
      ].join('\n'),
      'utf8',
    )

    const result = await checkDiscordAgentAuthTarget({
      target: {
        label: 'Viola',
        envFilePath,
      },
      fetchImpl: async () => new Response('unauthorized', { status: 401 }),
    })

    expect(result).toMatchObject({
      label: 'Viola',
      status: 'warning',
      gatewayEnabled: true,
      tokenPresent: true,
      httpStatus: 401,
    })
    expect(JSON.stringify(result)).not.toContain('bad-token')
  })

  test('aggregates all local agent env files into one warning report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const station = join(root, 'local-command-station')
    mkdirSync(station, { recursive: true })
    writeFileSync(
      join(station, 'discord-q-agent.env.ps1'),
      "$env:DISCORD_GATEWAY_ENABLED = 'false'\n",
      'utf8',
    )
    writeFileSync(
      join(station, 'discord-viola.env.ps1'),
      [
        "$env:DISCORD_GATEWAY_ENABLED = 'true'",
        "$env:DISCORD_BOT_TOKEN = 'bad-token'",
      ].join('\n'),
      'utf8',
    )
    writeFileSync(
      join(station, 'discord-blackbeak.env.ps1'),
      [
        "$env:DISCORD_GATEWAY_ENABLED = 'true'",
        "$env:DISCORD_APPLICATION_ID = '123'",
        "$env:DISCORD_BOT_TOKEN = 'good-token'",
      ].join('\n'),
      'utf8',
    )

    const report = await buildDiscordAgentAuthReport({
      root,
      fetchImpl: async (_url, init) => {
        const authorization = new Headers(init?.headers).get('authorization') ?? ''
        return authorization.includes('good-token')
          ? Response.json({ id: '123', username: 'Blackbeak' })
          : new Response('unauthorized', { status: 401 })
      },
    })

    expect(report.status).toBe('warning')
    expect(report.results).toHaveLength(3)
    expect(report.results.find(result => result.label === 'Blackbeak')).toMatchObject({
      status: 'ok',
      applicationMatches: true,
      username: 'Blackbeak',
    })
    expect(aggregateDiscordAgentAuthStatus(report.results)).toBe('warning')
    expect(JSON.stringify(report)).not.toContain('good-token')
    expect(JSON.stringify(report)).not.toContain('bad-token')
  })

  test('includes Immaculate tool readiness and search configuration in the report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const originalUserProfile = process.env.USERPROFILE
    process.env.USERPROFILE = root
    const station = join(root, 'local-command-station')
    mkdirSync(station, { recursive: true })
    writeFileSync(
      join(root, '.env.local'),
      [
        "IMMACULATE_API_KEY='local-secret'",
        'IMMACULATE_HARNESS_URL=http://127.0.0.1:8787',
      ].join('\n'),
      'utf8',
    )
    for (const file of [
      'discord-q-agent.env.ps1',
      'discord-viola.env.ps1',
      'discord-blackbeak.env.ps1',
    ]) {
      writeFileSync(
        join(station, file),
        "$env:DISCORD_GATEWAY_ENABLED = 'false'\n",
        'utf8',
      )
    }

    try {
      const report = await buildDiscordAgentAuthReport({
        root,
        fetchImpl: async (url, init) => {
          const requestUrl = String(url)
          const authorization = new Headers(init?.headers).get('authorization') ?? ''
          expect(authorization).toBe('Bearer local-secret')
          if (requestUrl.endsWith('/api/health')) {
            return Response.json({ status: 'ok', service: 'immaculate-harness' })
          }
          if (requestUrl.endsWith('/api/tools/capabilities')) {
            return Response.json({
              capabilities: {
                internet: {
                  fetch: { status: 'available' },
                  search: {
                    status: 'not-configured',
                    reason: 'Set IMMACULATE_SEARCH_PROVIDER and provider key.',
                  },
                },
                artifacts: { status: 'available' },
                receipts: { status: 'available' },
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
      })

      expect(report.status).toBe('warning')
      expect(report.immaculate).toMatchObject({
        status: 'warning',
        apiKeyPresent: true,
        apiKeySource: 'local-env:IMMACULATE_API_KEY',
        reachable: true,
        fetchStatus: 'available',
        searchStatus: 'not-configured',
        artifactStatus: 'available',
        receiptStatus: 'available',
      })
      expect(report.immaculate.summary).toContain('search is not-configured')
      expect(JSON.stringify(report)).not.toContain('local-secret')
    } finally {
      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE
      } else {
        process.env.USERPROFILE = originalUserProfile
      }
    }
  })

  test('runs a governed Immaculate search smoke when search is available', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const originalUserProfile = process.env.USERPROFILE
    process.env.USERPROFILE = root
    const station = join(root, 'local-command-station')
    mkdirSync(station, { recursive: true })
    writeFileSync(
      join(root, '.env.local'),
      [
        "IMMACULATE_API_KEY='local-secret'",
        'IMMACULATE_HARNESS_URL=http://127.0.0.1:8787',
      ].join('\n'),
      'utf8',
    )
    for (const file of [
      'discord-q-agent.env.ps1',
      'discord-viola.env.ps1',
      'discord-blackbeak.env.ps1',
    ]) {
      writeFileSync(
        join(station, file),
        "$env:DISCORD_GATEWAY_ENABLED = 'false'\n",
        'utf8',
      )
    }

    try {
      const report = await buildDiscordAgentAuthReport({
        root,
        fetchImpl: async (url, init) => {
          const requestUrl = String(url)
          const authorization = new Headers(init?.headers).get('authorization') ?? ''
          expect(authorization).toBe('Bearer local-secret')
          if (requestUrl.endsWith('/api/health')) {
            return Response.json({ status: 'ok', service: 'immaculate-harness' })
          }
          if (requestUrl.endsWith('/api/tools/capabilities')) {
            return Response.json({
              capabilities: {
                internet: {
                  fetch: { status: 'available' },
                  search: { status: 'available', provider: 'tavily' },
                },
                artifacts: { status: 'available' },
                receipts: { status: 'available' },
              },
            })
          }
          if (requestUrl.endsWith('/api/tools/search')) {
            expect(init?.method).toBe('POST')
            expect(await new Request(requestUrl, init).json()).toMatchObject({
              query: 'Tavily Search API documentation',
              maxResults: 2,
            })
            return Response.json({
              receipt: {
                id: 'search-fnv1a-smoke',
                resultCount: 2,
                results: [{ title: 'Tavily', url: 'https://docs.tavily.com' }],
              },
            })
          }
          return new Response('not found', { status: 404 })
        },
      })

      expect(report.status).toBe('ok')
      expect(report.immaculate).toMatchObject({
        status: 'ok',
        searchStatus: 'available',
        searchSmoke: {
          status: 'passed',
          receiptId: 'search-fnv1a-smoke',
          resultCount: 2,
        },
      })
      expect(report.immaculate.summary).toContain('Governed search smoke passed')
      expect(JSON.stringify(report)).not.toContain('local-secret')
    } finally {
      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE
      } else {
        process.env.USERPROFILE = originalUserProfile
      }
    }
  })

  test('warns when Immaculate API key is unavailable locally', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const originalUserProfile = process.env.USERPROFILE
    process.env.USERPROFILE = root

    try {
      const result = await checkImmaculateToolPreflight({
        root,
        fetchImpl: async () => {
          throw new Error('fetch should not be called without an API key')
        },
      })

      expect(result).toMatchObject({
        status: 'warning',
        apiKeyPresent: false,
        reachable: false,
      })
      expect(result.summary).toContain('IMMACULATE_API_KEY')
    } finally {
      if (originalUserProfile === undefined) {
        delete process.env.USERPROFILE
      } else {
        process.env.USERPROFILE = originalUserProfile
      }
    }
  })

  test('warns when a valid bot token belongs to a different application id', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const envFilePath = join(root, 'agent.env.ps1')
    writeFileSync(
      envFilePath,
      [
        "$env:DISCORD_GATEWAY_ENABLED = 'true'",
        "$env:DISCORD_APPLICATION_ID = 'expected-app'",
        "$env:DISCORD_BOT_TOKEN = 'wrong-token'",
      ].join('\n'),
      'utf8',
    )

    const result = await checkDiscordAgentAuthTarget({
      target: {
        label: 'Q',
        envFilePath,
      },
      fetchImpl: async () => Response.json({ id: 'other-app', username: 'OtherBot' }),
    })

    expect(result).toMatchObject({
      label: 'Q',
      status: 'warning',
      applicationId: 'expected-app',
      applicationMatches: false,
      botId: 'other-app',
      username: 'OtherBot',
    })
    expect(result.summary).toContain('does not match DISCORD_APPLICATION_ID')
    expect(JSON.stringify(result)).not.toContain('wrong-token')
  })

  test('accepts legacy DISCORD_CLIENT_ID when checking token identity', async () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-auth-preflight-'))
    const envFilePath = join(root, 'agent.env.ps1')
    writeFileSync(
      envFilePath,
      [
        "$env:DISCORD_GATEWAY_ENABLED = 'true'",
        "$env:DISCORD_CLIENT_ID = 'legacy-app'",
        "$env:DISCORD_BOT_TOKEN = 'good-token'",
      ].join('\n'),
      'utf8',
    )

    const result = await checkDiscordAgentAuthTarget({
      target: {
        label: 'Q',
        envFilePath,
      },
      fetchImpl: async () => Response.json({ id: 'legacy-app', username: 'Q' }),
    })

    expect(result).toMatchObject({
      label: 'Q',
      status: 'ok',
      applicationId: 'legacy-app',
      applicationMatches: true,
    })
    expect(JSON.stringify(result)).not.toContain('good-token')
  })
})
