import { describe, expect, test } from 'bun:test'
import {
  BLACKBEAK_MEME_RECENT_SIGNATURE_LIMIT,
  buildOperatorPromptFooter,
  describeDiscordGatewayClose,
  resolveDiscordAgentHealthStatus,
  resolveDiscordVoiceRenderPlan,
  selectBlackbeakFallbackText,
  selectPersonaPlexRuntimeEndpoint,
  shouldReconnectDiscordGatewayClose,
  summarizePersonaPlexRuntimeIssueFromText,
} from './discord-q-agent.ts'
import {
  buildDiscordRuntimeFreshnessPromptLines,
  resolveDiscordWebSearchQuery,
  shouldAttemptDiscordWebSearch,
} from '../src/utils/discordQAgent.ts'

describe('summarizePersonaPlexRuntimeIssueFromText', () => {
  test('classifies the moshi opus bridge mismatch clearly', () => {
    const issue = summarizePersonaPlexRuntimeIssueFromText(`
AttributeError: 'builtins.OpusStreamWriter' object has no attribute 'read_bytes'
Traceback (most recent call last):
  File "/mnt/c/Users/Knight/personaplex/moshi/moshi/server.py", line 239, in opus_loop
    pcm = opus_reader.read_pcm()
AttributeError: 'builtins.OpusStreamReader' object has no attribute 'read_pcm'
`)

    expect(issue).toContain('Opus bridge')
    expect(issue).toContain('live Discord turn-taking cannot complete')
  })

  test('returns null for unrelated stderr text', () => {
    expect(summarizePersonaPlexRuntimeIssueFromText('all good')).toBeNull()
  })
})

describe('selectPersonaPlexRuntimeEndpoint', () => {
  test('ignores stale runtime state when no listener is present', () => {
    const endpoint = selectPersonaPlexRuntimeEndpoint({
      env: {},
      state: {
        host: '127.0.0.1',
        port: 8999,
        protocol: 'http',
        runtimeUrl: 'http://127.0.0.1:8999',
      },
      hasListener: () => false,
    })

    expect(endpoint.runtimeUrl).toBe('http://127.0.0.1:8998')
    expect(endpoint.websocketUrl).toBe('ws://127.0.0.1:8998/api/chat')
    expect(endpoint.ignoredStateRuntimeUrl).toBe(true)
  })

  test('keeps live runtime state when its port is listening', () => {
    const endpoint = selectPersonaPlexRuntimeEndpoint({
      env: {},
      state: {
        host: '127.0.0.1',
        port: 8999,
        protocol: 'http',
        runtimeUrl: 'http://127.0.0.1:8999',
      },
      hasListener: port => port === '8999',
    })

    expect(endpoint.runtimeUrl).toBe('http://127.0.0.1:8999')
    expect(endpoint.websocketUrl).toBe('ws://127.0.0.1:8999/api/chat')
    expect(endpoint.ignoredStateRuntimeUrl).toBe(false)
  })

  test('preserves explicit environment overrides', () => {
    const endpoint = selectPersonaPlexRuntimeEndpoint({
      env: {
        PERSONAPLEX_URL: 'https://voice.local:9443',
        PERSONAPLEX_PORT: '9555',
      },
      state: {
        host: '127.0.0.1',
        port: 8999,
        protocol: 'http',
        runtimeUrl: 'http://127.0.0.1:8999',
      },
      hasListener: () => false,
    })

    expect(endpoint.runtimeUrl).toBe('https://voice.local:9443')
    expect(endpoint.websocketUrl).toBe('wss://voice.local:9443/api/chat')
    expect(endpoint.ignoredStateRuntimeUrl).toBe(false)
  })
})

describe('resolveDiscordVoiceRenderPlan', () => {
  test('keeps PersonaPlex live bridge separate from outbound playback fallback', () => {
    const plan = resolveDiscordVoiceRenderPlan({
      voiceProvider: 'personaplex',
      systemVoiceName: 'Microsoft Zira Desktop',
      systemVoiceModelId: 'system.sapi',
    })

    expect(plan.renderProvider).toBe('system')
    expect(plan.renderSummary).toContain('fallback for PersonaPlex live bridge')
    expect(plan.renderSummary).toContain('Microsoft Zira Desktop')
  })
})

describe('discord Q runtime freshness grounding', () => {
  test('tells Q the live runtime date and knowledge freshness boundary', () => {
    const prompt = buildDiscordRuntimeFreshnessPromptLines().join('\n')

    expect(prompt).toContain('Current runtime date/time:')
    expect(prompt).toContain('June 2024')
    expect(prompt).toContain('No live web research output or browser tool is available')
    expect(prompt).toContain('unverified')
    expect(prompt).toContain('answer date questions from this runtime clock')
  })

  test('marks web research available when Discord attached governed web context', () => {
    const prompt = buildDiscordRuntimeFreshnessPromptLines({
      webResearchAvailable: true,
    }).join('\n')

    expect(prompt).toContain('Live web verification is available')
    expect(prompt).toContain('attached governed web context')
    expect(prompt).toContain('do not guess')
  })

  test('routes current-fact Discord requests to governed web research', () => {
    expect(
      resolveDiscordWebSearchQuery('Q what is the newest TerminalBench leaderboard in 2026?'),
    ).toBe('what is the newest TerminalBench leaderboard in 2026?')

    expect(
      shouldAttemptDiscordWebSearch('what changed in OpenJaws today?'),
    ).toBe(true)
    expect(
      shouldAttemptDiscordWebSearch('what changed in OpenJaws today?', 'voice_live'),
    ).toBe(false)
    expect(
      shouldAttemptDiscordWebSearch('look up current BridgeBench docs', 'voice_live'),
    ).toBe(true)
  })

  test('passes current-date and governed-web grounding into scripted OpenJaws jobs', () => {
    const footer = buildOperatorPromptFooter({
      requestedWorkspace: 'apex-apps',
      workspacePath: 'C:\\Users\\Knight\\Desktop\\cheeks\\Asgard\\ignite\\apex-os-project\\apps',
      gitRoot: 'C:\\Users\\Knight\\Desktop\\cheeks\\Asgard',
      gitRelativePath: 'ignite\\apex-os-project\\apps',
      worktreePath: 'C:\\Users\\Knight\\Desktop\\cheeks\\Asgard\\.git\\worktrees\\discord-test',
    })

    expect(footer).toContain('Current runtime date/time:')
    expect(footer).toContain('June 2024')
    expect(footer).toContain('governed web research')
    expect(footer).toContain('ImmaculateHarness tool_fetch')
    expect(footer).toContain('requested workspace: apex-apps')
    expect(footer).toContain('isolated worktree:')
  })
})

describe('Blackbeak meme fallback diversity', () => {
  test('keeps a wider recent-signature window than the focus bucket count', () => {
    expect(BLACKBEAK_MEME_RECENT_SIGNATURE_LIMIT).toBeGreaterThan(20)
  })

  test('selects a non-recent fallback text when alternatives remain', () => {
    const recentText = [
      'AI accountability update: everyone brought a dashboard and nobody brought consequences.',
      'The model said it was aligned.',
      'The logs asked for a lawyer.',
    ].join('\n')
    const recentSignature = `text:AI accountability:${recentText}`
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 240)

    const selected = selectBlackbeakFallbackText('AI accountability', [
      recentSignature,
    ])

    expect(selected.toLowerCase()).not.toContain('logs asked for a lawyer')
  })

  test('avoids near-duplicate fallback text when exact signatures differ', () => {
    const nearDuplicateSignature = [
      'text:AI accountability:accountability without receipts is theater with a nicer font',
      'blackbeak has seen puppets with stronger governance',
    ].join(' ')

    const selected = selectBlackbeakFallbackText('AI accountability', [
      nearDuplicateSignature,
    ])

    expect(selected.toLowerCase()).not.toContain('accountability without receipts')
  })

  test('blocks repeated meme copy even when the focus bucket changed', () => {
    const crossFocusSignature = [
      'text:robotics:ai accountability update everyone brought a dashboard',
      'and nobody brought consequences the model said it was aligned',
      'the logs asked for a lawyer',
    ].join(' ')

    const selected = selectBlackbeakFallbackText('AI accountability', [
      crossFocusSignature,
    ])

    expect(selected.toLowerCase()).not.toContain('everyone brought a dashboard')
    expect(selected.toLowerCase()).not.toContain('logs asked for a lawyer')
  })
})

describe('discord gateway close handling', () => {
  test('does not reconnect on Discord authentication failure', () => {
    expect(shouldReconnectDiscordGatewayClose(4004)).toBe(false)
    expect(describeDiscordGatewayClose(4004, 'Authentication failed.')).toContain(
      'DISCORD_BOT_TOKEN',
    )
    expect(
      resolveDiscordAgentHealthStatus({
        status: 'error',
        gateway: {
          connected: false,
          guildCount: 0,
          lastCloseCode: 4004,
          lastError: 'Authentication failed.',
        },
      }),
    ).toBe('blocked')
  })

  test('does not restart-storm on local TLS gateway failures', () => {
    expect(shouldReconnectDiscordGatewayClose(1015)).toBe(false)
    expect(describeDiscordGatewayClose(1015, 'TLS handshake failed')).toContain(
      'TLS handshake failed',
    )
    expect(
      resolveDiscordAgentHealthStatus({
        status: 'error',
        gateway: {
          connected: false,
          guildCount: 0,
          lastCloseCode: 1015,
          lastError: 'TLS handshake failed',
        },
      }),
    ).toBe('blocked')
  })

  test('keeps transient gateway closes reconnectable', () => {
    expect(shouldReconnectDiscordGatewayClose(1006)).toBe(true)
    expect(describeDiscordGatewayClose(1006, 'network interrupted')).toContain(
      'network interrupted',
    )
  })
})
