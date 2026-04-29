import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  buildDiscordQAgentPublicShowcaseActivityEntry,
  buildDiscordQAgentPublicOperatorLine,
  createDiscordQAgentReceipt,
  getDiscordQAgentReceiptPath,
  getDiscordQAgentRoutePolicies,
  readDiscordQAgentReceipt,
  recordDiscordQAgentEvent,
  resolveDiscordQAgentPublicShowcaseStatusMetadata,
  upsertDiscordQAgentRouteState,
} from './discordQAgentRuntime.js'

const OPENJAWS_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('discordQAgentRuntime', () => {
  it('creates a receipt with the expanded gateway and voice defaults', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend: oci:Q via OCI IAM',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: true,
      voiceReady: false,
      voiceProvider: 'system',
      voiceId: 'zira',
      voiceIdSource: 'DISCORD_SYSTEM_VOICE_NAME',
      voiceModelId: 'system',
    })

    expect(receipt.status).toBe('starting')
    expect(receipt.gateway).toEqual({
      connected: false,
      userId: null,
      guildCount: 0,
      lastSequence: null,
      lastClosedAt: null,
      lastCloseCode: null,
      lastError: null,
    })
    expect(receipt.voice).toMatchObject({
      enabled: true,
      provider: 'system',
      ready: false,
      stagedProvider: null,
      stagedReady: false,
      stagedSummary: null,
      runtimeUrl: null,
      renderProvider: null,
      renderSummary: null,
      connected: false,
      voiceId: 'zira',
      voiceIdSource: 'DISCORD_SYSTEM_VOICE_NAME',
      modelId: 'system',
      guildId: null,
      channelId: null,
      channelName: null,
      joinedAt: null,
      lastRenderProvider: null,
      lastRenderSummary: null,
      lastChannelName: null,
      lastHeardUserId: null,
      lastHeardAt: null,
      lastTranscriptSummary: null,
      lastError: null,
    })
    expect(receipt.routing.channels).toEqual(
      getDiscordQAgentRoutePolicies().map(policy => ({ ...policy })),
    )
  })

  it('caps recorded events at the newest 25 items', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })

    for (let index = 0; index < 30; index += 1) {
      recordDiscordQAgentEvent(receipt, {
        at: `2026-04-20T00:00:${index.toString().padStart(2, '0')}.000Z`,
        status: `event-${index}`,
        summary: `summary-${index}`,
      })
    }

    expect(receipt.events).toHaveLength(25)
    expect(receipt.events[0]).toMatchObject({
      status: 'event-29',
      summary: 'summary-29',
    })
    expect(receipt.events.at(-1)).toMatchObject({
      status: 'event-5',
      summary: 'summary-5',
    })
    expect(receipt.updatedAt).toBe('2026-04-20T00:00:29.000Z')
  })

  it('updates only the targeted route state', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: true,
      voiceReady: true,
    })

    upsertDiscordQAgentRouteState(receipt, 'command_station', {
      lastSummary: 'posted a digest',
      lastPostedAt: '2026-04-20T00:10:00.000Z',
    })

    const commandStation = receipt.routing.channels.find(
      route => route.id === 'command_station',
    )
    const updates = receipt.routing.channels.find(route => route.id === 'updates')

    expect(commandStation).toMatchObject({
      id: 'command_station',
      lastSummary: 'posted a digest',
      lastPostedAt: '2026-04-20T00:10:00.000Z',
    })
    expect(updates?.id).toBe('updates')
    expect(updates?.lastSummary).toBeUndefined()
    expect(updates?.lastPostedAt).toBeUndefined()
  })

  it('builds a sanitized public operator line without leaking raw paths', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })
    receipt.gateway.connected = true
    receipt.operator.lastAction = 'ask-openjaws'
    receipt.operator.activeProcessCwd = 'C:\\Users\\Knight\\Desktop\\cheeks\\Asgard\\ignite\\apex-os-project\\apps\\browser'

    expect(buildDiscordQAgentPublicOperatorLine(receipt)).toBe(
      'Q is executing a bounded OpenJaws task in Apex apps through the supervised OCI-backed Discord operator lane.',
    )
    expect(buildDiscordQAgentPublicShowcaseActivityEntry(receipt)).toMatchObject({
      title: 'Supervised Q operator activity',
      kind: 'operator',
      source: 'OpenJaws Discord lane',
      tags: ['q', 'discord', 'openjaws', 'bounded', 'apex-apps'],
    })
  })

  it('falls back to a bounded patrol activity when no operator task is active', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })
    receipt.gateway.connected = true
    receipt.routing.lastDecision = 'posted patrol digest -> #q-command-station'
    receipt.schedule.lastCompletedAt = '2026-04-22T01:02:26.562Z'

    expect(buildDiscordQAgentPublicShowcaseActivityEntry(receipt)).toMatchObject({
      id: 'discord-q-patrol-2026-04-22T01:02:26.562Z',
      title: 'Supervised Q patrol update',
      kind: 'patrol',
      tags: ['q', 'discord', 'status', 'bounded'],
    })
  })

  it('preserves a richer controlled public operator line when q is idle', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })
    receipt.gateway.connected = true
    receipt.updatedAt = '2026-04-22T12:19:17.128Z'

    expect(
      resolveDiscordQAgentPublicShowcaseStatusMetadata({
        receipt,
        currentShowcase: {
          operatorLine:
            'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
          operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
        },
      }),
    ).toEqual({
      operatorLine:
        'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
      operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
    })
  })

  it('recovers the richer controlled headline from showcase summary when operator line drifted', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })
    receipt.gateway.connected = true
    receipt.updatedAt = '2026-04-22T12:23:16.628Z'

    expect(
      resolveDiscordQAgentPublicShowcaseStatusMetadata({
        receipt,
        currentShowcase: {
          operatorLine:
            'Q is online through the supervised OCI-backed Discord operator lane and posts only when a high-value public update is ready.',
          summary:
            'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
          operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
        },
      }),
    ).toEqual({
      operatorLine:
        'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
      operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
    })
  })

  it('rewrites stale controlled public operator copy before preserving it', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })
    receipt.gateway.connected = true
    receipt.updatedAt = '2026-04-22T12:23:16.628Z'

    expect(
      resolveDiscordQAgentPublicShowcaseStatusMetadata({
        receipt,
        currentShowcase: {
          operatorLine:
            'Q patrol is ready; roundtable is ready on #dev_support; 21 bounded action receipts are present; 2/3 bot receipts are ready; operator state is ready; OCI-backed Q is ready; Discord transport is ready.',
          operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
        },
      }),
    ).toEqual({
      operatorLine:
        'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
      operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
    })
  })

  it('allows active bounded q work to replace the idle aggregate headline', () => {
    const receipt = createDiscordQAgentReceipt({
      backend: 'Q backend',
      scheduleEnabled: true,
      scheduleIntervalMs: 900_000,
      voiceEnabled: false,
      voiceReady: false,
    })
    receipt.gateway.connected = true
    receipt.updatedAt = '2026-04-22T12:20:17.128Z'
    receipt.operator.lastAction = 'ask-openjaws'
    receipt.operator.activeProcessCwd = 'D:\\openjaws\\OpenJaws'

    expect(
      resolveDiscordQAgentPublicShowcaseStatusMetadata({
        receipt,
        currentShowcase: {
          operatorLine:
            'The public view shows what happened, when it happened, and which systems participated, while sensitive actions and protected records stay private.',
          operatorUpdatedAt: '2026-04-22T12:08:37.852Z',
        },
      }).operatorLine,
    ).toBe(
      'Q is executing a bounded OpenJaws task in OpenJaws through the supervised OCI-backed Discord operator lane.',
    )
  })

  it('normalizes older receipt payloads when reading from disk', () => {
    const root = mkdtempSync(join(tmpdir(), 'discord-q-agent-runtime-'))
    try {
      const receiptPath = join(
        root,
        'local-command-station',
        'discord-q-agent-receipt.json',
      )
      mkdirSync(join(root, 'local-command-station'), { recursive: true })
      writeFileSync(
        receiptPath,
        JSON.stringify({
          version: 1,
          updatedAt: '2026-04-20T00:00:00.000Z',
          startedAt: '2026-04-20T00:00:00.000Z',
          status: 'ready',
          backend: 'Q backend',
          guilds: [],
          gateway: {
            connected: true,
            guildCount: 0,
            lastSequence: 2,
          },
          schedule: {
            enabled: true,
            intervalMs: 900_000,
            cycleCount: 1,
          },
          routing: {
            channels: [],
          },
          voice: {
            enabled: true,
            provider: 'system',
            ready: true,
          },
          patrol: {},
          knowledge: {
            enabled: false,
            ready: false,
            fileCount: 0,
            chunkCount: 0,
          },
          operator: {},
          events: [],
        }) + '\n',
      )

      const receipt = readDiscordQAgentReceipt(root)

      expect(receipt?.gateway.userId).toBeNull()
      expect(receipt?.voice.connected).toBe(false)
      expect(receipt?.voice.stagedProvider).toBeNull()
      expect(receipt?.voice.runtimeUrl).toBeNull()
      expect(receipt?.voice.channelName).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('anchors the default receipt path to the repo root instead of process cwd', () => {
    expect(getDiscordQAgentReceiptPath()).toBe(
      join(
        OPENJAWS_REPO_ROOT,
        'local-command-station',
        'discord-q-agent-receipt.json',
      ),
    )
  })
})
