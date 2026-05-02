import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildApexBridgeCoherenceProbe,
  buildPersonaPlexCoherenceProbe,
  readRoundtableState,
} from './runtime-coherence.ts'

describe('runtime-coherence PersonaPlex mapping', () => {
  test('maps Apex bridge health into the shared coherence probe contract', () => {
    expect(
      buildApexBridgeCoherenceProbe('Apex browser bridge', 'http://127.0.0.1:8799', {
        status: 'healthy',
        service: 'browser-bridge',
        version: '5.0.0',
        timestamp: '2026-05-01T00:45:00.000Z',
      }),
    ).toEqual({
      label: 'Apex browser bridge',
      url: 'http://127.0.0.1:8799',
      reachable: true,
      status: 'healthy',
      detail: 'browser-bridge 5.0.0 · 2026-05-01T00:45:00.000Z',
    })
  })

  test('keeps missing Apex bridges actionable from runtime coherence', () => {
    const probe = buildApexBridgeCoherenceProbe(
      'Apex Chrono bridge',
      'http://127.0.0.1:8798',
      null,
    )

    expect(probe.reachable).toBe(false)
    expect(probe.status).toBeNull()
    expect(probe.detail).toContain('bun run apex:bridges:start')
  })

  test('explains untrusted Apex bridge listeners separately from missing bridges', () => {
    const probe = buildApexBridgeCoherenceProbe(
      'Apex browser bridge',
      'http://127.0.0.1:8799',
      null,
      {
        status: 'ok',
        service: 'browser-bridge',
        version: '5.0.0',
        timestamp: '2026-05-01T00:48:00.000Z',
      },
    )

    expect(probe.reachable).toBe(false)
    expect(probe.detail).toContain('answered locally')
    expect(probe.detail).toContain('OPENJAWS_APEX_TRUST_LOCALHOST=1')
  })

  test('maps a ready PersonaPlex probe into a reachable coherence probe', () => {
    expect(
      buildPersonaPlexCoherenceProbe({
        status: 'ok',
        ready: true,
        runtimeUrl: 'http://127.0.0.1:8998',
        websocketUrl:
          'ws://127.0.0.1:8998/api/chat?text_prompt=private&voice_prompt=NATF2.pt',
        voicePrompt: 'NATF2.pt',
        textPrompt: 'hello',
        latencyMs: 42,
        firstByte: 0,
        messageType: 'binary',
        runtimeState: null,
        runtimeUrlSource: 'default',
        ignoredStateRuntimeUrl: null,
        repair: {
          status: 'ready',
          summary: 'PersonaPlex bridge is ready; no repair action is required.',
          command: 'pwsh',
          args: ['-NoProfile'],
          bootstrapCommand: 'bun',
          bootstrapArgs: [],
          stationRoot: 'station',
          launcherPath: 'launcher',
          missing: [],
          warnings: [],
          nextActions: [],
        },
      }),
    ).toEqual({
      label: 'PersonaPlex',
      url:
        'ws://127.0.0.1:8998/api/chat?text_prompt=%5Bconfigured%5D&voice_prompt=%5Bconfigured%5D',
      reachable: true,
      status: null,
      detail: 'http://127.0.0.1:8998 hello byte 0 in 42ms',
    })
  })

  test('keeps PersonaPlex failures actionable in runtime coherence', () => {
    const probe = buildPersonaPlexCoherenceProbe({
      status: 'error',
      ready: false,
      runtimeUrl: 'http://127.0.0.1:8998',
      websocketUrl: 'ws://127.0.0.1:8998/api/chat',
      voicePrompt: 'NATF2.pt',
      textPrompt: 'hello',
      latencyMs: 10,
      firstByte: null,
      messageType: null,
      runtimeState: null,
      runtimeUrlSource: 'default',
      ignoredStateRuntimeUrl: null,
      error: 'PersonaPlex WebSocket error',
      repair: {
        status: 'start_required',
        summary:
          'PersonaPlex runtime is not answering the voice WebSocket; start it with the local voice launcher on the operator machine.',
        command: 'pwsh',
        args: ['-NoProfile'],
        bootstrapCommand: 'bun',
        bootstrapArgs: ['scripts/personaplex-launcher-bootstrap.ts', '--json'],
        stationRoot: 'station',
        launcherPath: 'launcher',
        missing: [],
        warnings: ['inline secret assignment detected in start-personaplex-wsl.sh'],
        nextActions: ['Start the local voice launcher.'],
      },
    })

    expect(probe.reachable).toBe(false)
    expect(probe.status).toBe('error')
    expect(probe.detail).toContain('PersonaPlex WebSocket error')
    expect(probe.detail).toContain('start it with the local voice launcher')
    expect(probe.detail).toContain('inline secret assignment detected')
    expect(probe.detail).toContain('next action')
  })

  test('marks active roundtable sessions unhealthy when the launch pid is dead', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-roundtable-coherence-'))
    try {
      const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
      mkdirSync(runtimeDir, { recursive: true })
      const now = new Date().toISOString()
      const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      writeFileSync(
        join(runtimeDir, 'discord-roundtable.session.json'),
        `${JSON.stringify({
          version: 1,
          status: 'running',
          updatedAt: now,
          startedAt: now,
          endsAt,
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'Roundtable bootstrapped.',
          lastError: null,
          processedCommandMessageIds: [],
        })}\n`,
        'utf8',
      )
      writeFileSync(
        join(runtimeDir, 'discord-roundtable-launch.json'),
        `${JSON.stringify({
          startedAt: '2026-05-02T00:00:01.000Z',
          pid: 999999,
        })}\n`,
        'utf8',
      )

      expect(readRoundtableState(root)).toMatchObject({
        status: 'running',
        channelName: 'dev_support',
        launchChildAlive: false,
        launchDetail:
          'Roundtable session is running, but launch pid 999999 is not running.',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('reads BOM-prefixed roundtable launch state written by PowerShell', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-roundtable-coherence-'))
    try {
      const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
      mkdirSync(runtimeDir, { recursive: true })
      const now = new Date().toISOString()
      const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      writeFileSync(
        join(runtimeDir, 'discord-roundtable.session.json'),
        `${JSON.stringify({
          version: 1,
          status: 'running',
          updatedAt: now,
          startedAt: now,
          endsAt,
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'Roundtable bootstrapped.',
          lastError: null,
          processedCommandMessageIds: [],
        })}\n`,
        'utf8',
      )
      writeFileSync(
        join(runtimeDir, 'discord-roundtable-launch.json'),
        `\uFEFF${JSON.stringify({
          startedAt: '2026-05-02T00:00:01.000Z',
          pid: process.pid,
        })}\n`,
        'utf8',
      )

      expect(readRoundtableState(root)).toMatchObject({
        status: 'running',
        channelName: 'dev_support',
        launchChildAlive: true,
        launchDetail: null,
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  test('marks active roundtable sessions unhealthy when launch state is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-roundtable-coherence-'))
    try {
      const runtimeDir = join(root, 'local-command-station', 'roundtable-runtime')
      mkdirSync(runtimeDir, { recursive: true })
      const now = new Date().toISOString()
      const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      writeFileSync(
        join(runtimeDir, 'discord-roundtable.session.json'),
        `${JSON.stringify({
          version: 1,
          status: 'queued',
          updatedAt: now,
          startedAt: now,
          endsAt,
          guildId: null,
          roundtableChannelId: null,
          roundtableChannelName: 'dev_support',
          generalChannelId: null,
          generalChannelName: null,
          violaVoiceChannelId: null,
          violaVoiceChannelName: null,
          turnCount: 0,
          nextPersona: null,
          lastSpeaker: null,
          lastSummary: 'Roundtable queued.',
          lastError: null,
          processedCommandMessageIds: [],
        })}\n`,
        'utf8',
      )

      expect(readRoundtableState(root)).toMatchObject({
        status: 'queued',
        launchChildAlive: false,
        launchDetail: 'Roundtable session is queued, but launch state is missing.',
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
