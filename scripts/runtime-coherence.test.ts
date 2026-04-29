import { describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildPersonaPlexCoherenceProbe,
  buildDiscordProbeFallback,
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
})
