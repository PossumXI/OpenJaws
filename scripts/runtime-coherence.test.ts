import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildPersonaPlexCoherenceProbe,
  buildDiscordProbeFallback,
  readRoundtableState,
  resolveDiscordProbeTarget,
} from './runtime-coherence.ts'

describe('runtime-coherence discord probe targets', () => {
  test('resolves port and receipt path from the agent env file', () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-coherence-'))
    const stationRoot = join(root, 'local-command-station')
    mkdirSync(stationRoot, { recursive: true })
    writeFileSync(
      join(stationRoot, 'discord-viola.env.ps1'),
      [
        "$env:DISCORD_Q_AGENT_PORT = '9799'",
        "$env:DISCORD_AGENT_RECEIPT_PATH = 'D:\\custom\\viola-receipt.json'",
      ].join('\n'),
      'utf8',
    )

    expect(resolveDiscordProbeTarget(root, 'Viola')).toEqual({
      label: 'Viola',
      url: 'http://127.0.0.1:9799/health',
      receiptPath: 'D:\\custom\\viola-receipt.json',
    })
  })

  test('falls back to the fresh ready receipt when the HTTP probe is unavailable', () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-coherence-'))
    const stationRoot = join(root, 'local-command-station', 'bots', 'blackbeak')
    mkdirSync(stationRoot, { recursive: true })
    const receiptPath = join(stationRoot, 'discord-agent-receipt.json')
    writeFileSync(
      receiptPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          status: 'ready',
          gateway: {
            connected: true,
            guildCount: 2,
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const fallback = buildDiscordProbeFallback({
      label: 'Blackbeak',
      url: 'http://127.0.0.1:8790/health',
      receiptPath,
    })

    expect(fallback).toMatchObject({
      label: 'Blackbeak',
      url: receiptPath,
      reachable: true,
      status: 'receipt_ready:2',
    })
  })

  test('keeps a ready Discord receipt fresh from gateway heartbeat', () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-coherence-'))
    const stationRoot = join(root, 'local-command-station', 'bots', 'blackbeak')
    mkdirSync(stationRoot, { recursive: true })
    const receiptPath = join(stationRoot, 'discord-agent-receipt.json')
    writeFileSync(
      receiptPath,
      JSON.stringify(
        {
          updatedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          status: 'ready',
          gateway: {
            connected: true,
            guildCount: 1,
            lastHeartbeatAt: new Date().toISOString(),
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const fallback = buildDiscordProbeFallback({
      label: 'Blackbeak',
      url: 'http://127.0.0.1:8790/health',
      receiptPath,
    })

    expect(fallback).toMatchObject({
      label: 'Blackbeak',
      reachable: true,
      status: 'receipt_ready:1',
    })
  })

  test('falls back to a fresh blocked receipt when an agent stopped before binding health', () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-coherence-'))
    const stationRoot = join(root, 'local-command-station', 'bots', 'viola')
    mkdirSync(stationRoot, { recursive: true })
    const receiptPath = join(stationRoot, 'discord-agent-receipt.json')
    writeFileSync(
      receiptPath,
      JSON.stringify(
        {
          updatedAt: new Date().toISOString(),
          status: 'error',
          gateway: {
            connected: false,
            guildCount: 0,
            lastCloseCode: 4004,
            lastError: 'Discord gateway authentication failed.',
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const fallback = buildDiscordProbeFallback({
      label: 'Viola',
      url: 'http://127.0.0.1:8789/health',
      receiptPath,
    })

    expect(fallback).toMatchObject({
      label: 'Viola',
      url: receiptPath,
      reachable: true,
      status: 'error',
    })
    expect(fallback?.detail).toContain('Discord gateway authentication failed.')
    expect(fallback?.detail).toContain('gateway close 4004')
  })

  test('keeps recent non-retryable blocked receipts diagnosable after freshness expires', () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-coherence-'))
    const stationRoot = join(root, 'local-command-station', 'bots', 'viola')
    mkdirSync(stationRoot, { recursive: true })
    const receiptPath = join(stationRoot, 'discord-agent-receipt.json')
    writeFileSync(
      receiptPath,
      JSON.stringify(
        {
          updatedAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
          status: 'error',
          gateway: {
            connected: false,
            guildCount: 0,
            lastCloseCode: 4004,
            lastError: 'Discord gateway authentication failed.',
          },
        },
        null,
        2,
      ),
      'utf8',
    )

    const fallback = buildDiscordProbeFallback({
      label: 'Viola',
      url: 'http://127.0.0.1:8789/health',
      receiptPath,
    })

    expect(fallback).toMatchObject({
      label: 'Viola',
      url: receiptPath,
      reachable: true,
      status: 'blocked',
    })
    expect(fallback?.detail).toContain('stale non-retryable receipt')
  })

  test('maps a ready PersonaPlex probe into a runtime coherence probe', () => {
    expect(
      buildPersonaPlexCoherenceProbe({
        status: 'ok',
        ready: true,
        runtimeUrl: 'http://127.0.0.1:8998',
        websocketUrl:
          'ws://127.0.0.1:8998/api/chat?text_prompt=hello&voice_prompt=NATF2.pt',
        voicePrompt: 'NATF2.pt',
        textPrompt: 'hello',
        latencyMs: 26,
        firstByte: 0,
        messageType: 'binary',
      }),
    ).toMatchObject({
      label: 'PersonaPlex',
      reachable: true,
      status: null,
      detail: 'http://127.0.0.1:8998 hello byte 0 in 26ms',
    })
  })

  test('prefers a live roundtable session over an idle governed queue', () => {
    const root = mkdtempSync(join(tmpdir(), 'runtime-coherence-roundtable-'))
    const runtimeRoot = join(root, 'local-command-station', 'roundtable-runtime')
    mkdirSync(runtimeRoot, { recursive: true })
    writeFileSync(
      join(runtimeRoot, 'discord-roundtable.state.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'idle',
          updatedAt: '2026-04-29T20:58:00.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: 'OpenJaws roundtable action was held back: no code changes detected.',
          lastError: null,
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [],
        },
        null,
        2,
      ),
      'utf8',
    )
    writeFileSync(
      join(runtimeRoot, 'discord-roundtable.session.json'),
      JSON.stringify(
        {
          version: 1,
          status: 'running',
          updatedAt: '2026-04-29T20:59:00.000Z',
          startedAt: '2026-04-29T20:55:00.000Z',
          endsAt: '2026-04-30T00:55:00.000Z',
          guildId: 'guild',
          roundtableChannelId: 'channel',
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 1,
          nextPersona: 'viola',
          lastSpeaker: 'q',
          lastSummary: 'Q action completed.',
          lastError: null,
          processedCommandMessageIds: [],
        },
        null,
        2,
      ),
      'utf8',
    )

    expect(readRoundtableState(root)).toMatchObject({
      status: 'running',
      channelName: 'dev_support',
      lastSummary: expect.stringContaining('governed queue is idle'),
    })
  })
})
