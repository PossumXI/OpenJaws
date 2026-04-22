import { describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildPublicShowcaseActivityFeed,
  getPublicShowcaseActivityPath,
  queuePublicShowcaseActivitySync,
  syncPublicShowcaseActivityFromRoot,
} from './publicShowcaseActivity.js'

describe('publicShowcaseActivity', () => {
  it('builds a bounded public showcase activity feed from local runtime surfaces', () => {
    const feed = buildPublicShowcaseActivityFeed({
      generatedAt: '2026-04-22T01:20:00.000Z',
      qAgentReceipt: {
        version: 1,
        updatedAt: '2026-04-22T01:19:00.000Z',
        startedAt: '2026-04-22T00:00:00.000Z',
        status: 'ready',
        backend: 'Q backend',
        guilds: [{ id: '1', name: 'Arobi' }],
        gateway: {
          connected: true,
          guildCount: 1,
        },
        schedule: {
          enabled: true,
          intervalMs: 900000,
          cycleCount: 4,
          lastCompletedAt: '2026-04-22T01:18:00.000Z',
          lastSummary: 'Patrol completed with bounded status output.',
        },
        routing: {
          lastDecision: 'updates',
          lastPostedChannelName: 'openjaws-updates',
          lastPostedReason: 'patrol summary',
          channels: [],
        },
        voice: {
          enabled: true,
          provider: 'system',
          ready: true,
          connected: true,
        },
        patrol: {
          lastCompletedAt: '2026-04-22T01:18:00.000Z',
          lastSummary: 'Observed the live bounded runtime lane.',
        },
        knowledge: {
          enabled: true,
          ready: true,
          fileCount: 1,
          chunkCount: 2,
        },
        operator: {
          lastAction: 'ask-openjaws',
          lastCompletedAt: '2026-04-22T01:18:30.000Z',
          lastSummary: 'Prepared a bounded patch through OpenJaws.',
          activeProcessCwd: 'D:\\openjaws\\OpenJaws',
        },
        events: [],
      },
      roundtableSession: {
        version: 1,
        status: 'awaiting_approval',
        updatedAt: '2026-04-22T01:19:30.000Z',
        startedAt: '2026-04-22T01:00:00.000Z',
        endsAt: '2026-04-22T05:00:00.000Z',
        guildId: null,
        roundtableChannelId: null,
        roundtableChannelName: 'q-roundtable-live',
        generalChannelId: null,
        generalChannelName: null,
        violaVoiceChannelId: null,
        violaVoiceChannelName: null,
        turnCount: 2,
        nextPersona: null,
        lastSpeaker: null,
        lastSummary: 'Queued action is awaiting supervised approval.',
        lastError: null,
        processedCommandMessageIds: [],
      },
    })

    expect(feed.entries[0]).toMatchObject({
      title: 'Supervised runtime activity refreshed',
      status: 'warning',
    })
    expect(feed.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Supervised Q operator activity',
          artifacts: ['discord:q-agent-receipt'],
        }),
        expect.objectContaining({
          title: 'Roundtable runtime',
          artifacts: ['roundtable:session'],
        }),
      ]),
    )
  })

  it('writes the live overlay from local on-disk runtime state', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-'))
    const overlayPath = join(root, 'showcase-activity.json')
    const originalPath = process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
    process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = overlayPath
    try {
      mkdirSync(join(root, 'local-command-station', 'roundtable-runtime'), {
        recursive: true,
      })
      writeFileSync(
        join(root, 'local-command-station', 'discord-q-agent-receipt.json'),
        `${JSON.stringify({
          version: 1,
          updatedAt: '2026-04-22T01:19:00.000Z',
          startedAt: '2026-04-22T00:00:00.000Z',
          status: 'ready',
          backend: 'Q backend',
          guilds: [{ id: '1', name: 'Arobi' }],
          gateway: { connected: true, guildCount: 1 },
          schedule: { enabled: true, intervalMs: 900000, cycleCount: 1 },
          routing: { channels: [] },
          voice: { enabled: false, provider: 'off', ready: false },
          patrol: {},
          knowledge: { enabled: false, ready: false, fileCount: 0, chunkCount: 0 },
          operator: { lastAction: 'roundtable-status' },
          events: [],
        }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(
        join(root, 'local-command-station', 'roundtable-runtime', 'discord-roundtable.session.json'),
        `${JSON.stringify({
          version: 1,
          status: 'running',
          updatedAt: '2026-04-22T01:19:30.000Z',
          startedAt: '2026-04-22T01:00:00.000Z',
          endsAt: '2026-04-22T05:00:00.000Z',
          roundtableChannelName: 'q-roundtable-live',
          turnCount: 1,
          processedCommandMessageIds: [],
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = syncPublicShowcaseActivityFromRoot({ root })
      expect(feed.entries.length).toBeGreaterThan(1)
      expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({
            title: 'Roundtable runtime',
          }),
        ]),
      })
    } finally {
      if (originalPath) {
        process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = originalPath
      } else {
        delete process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('queues a coalesced microtask sync without throwing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-queue-'))
    const overlayPath = join(root, 'showcase-activity.json')
    const originalPath = process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
    process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = overlayPath
    try {
      queuePublicShowcaseActivitySync({
        root,
        qAgentReceipt: {
          version: 1,
          updatedAt: '2026-04-22T01:19:00.000Z',
          startedAt: '2026-04-22T00:00:00.000Z',
          status: 'ready',
          backend: 'Q backend',
          guilds: [],
          gateway: { connected: true, guildCount: 0 },
          schedule: { enabled: true, intervalMs: 900000, cycleCount: 1 },
          routing: { channels: [] },
          voice: { enabled: false, provider: 'off', ready: false },
          patrol: {},
          knowledge: { enabled: false, ready: false, fileCount: 0, chunkCount: 0 },
          operator: {},
          events: [],
        },
      })
      await new Promise(resolve => setTimeout(resolve, 0))
      expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({
            title: 'Supervised runtime activity refreshed',
          }),
        ]),
      })
    } finally {
      if (originalPath) {
        process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = originalPath
      } else {
        delete process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('prefers explicit activity file overrides', () => {
    expect(
      getPublicShowcaseActivityPath({
        ASGARD_PUBLIC_SHOWCASE_ACTIVITY_FILE: 'C:\\temp\\showcase-activity.json',
      } as NodeJS.ProcessEnv),
    ).toBe('C:\\temp\\showcase-activity.json')
  })
})
