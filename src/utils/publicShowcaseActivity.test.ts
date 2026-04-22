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
          operatorActions: expect.arrayContaining([
            'ask_openjaws',
            'q_operator_runtime',
          ]),
        }),
        expect.objectContaining({
          title: 'Roundtable runtime',
          artifacts: ['roundtable:session'],
          operatorActions: expect.arrayContaining([
            'roundtable_runtime',
            'immaculate_handoff',
          ]),
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

  it('aggregates bounded persona receipts from local-command-station/bots', () => {
    const root = mkdtempSync(
      join(tmpdir(), 'openjaws-public-showcase-personas-'),
    )
    const overlayPath = join(root, 'showcase-activity.json')
    const originalPath = process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
    process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = overlayPath
    try {
      mkdirSync(join(root, 'local-command-station', 'bots', 'viola'), {
        recursive: true,
      })
      mkdirSync(join(root, 'local-command-station', 'bots', 'blackbeak'), {
        recursive: true,
      })
      writeFileSync(
        join(
          root,
          'local-command-station',
          'bots',
          'viola',
          'discord-agent-receipt.json',
        ),
        `${JSON.stringify(
          {
            version: 1,
            updatedAt: '2026-04-22T02:00:00.000Z',
            startedAt: '2026-04-22T01:00:00.000Z',
            status: 'ready',
            backend: 'Viola backend',
            guilds: [{ id: '1', name: 'Arobi' }],
            gateway: { connected: true, guildCount: 1 },
            schedule: { enabled: true, intervalMs: 900000, cycleCount: 1 },
            routing: { channels: [] },
            voice: {
              enabled: true,
              provider: 'system',
              ready: true,
              connected: true,
            },
            patrol: {
              lastCompletedAt: '2026-04-22T01:59:00.000Z',
              lastSummary: 'Viola stayed on the bounded voice lane.',
            },
            knowledge: {
              enabled: false,
              ready: false,
              fileCount: 0,
              chunkCount: 0,
            },
            operator: {},
            events: [],
          },
          null,
          2,
        )}\n`,
        'utf8',
      )
      writeFileSync(
        join(
          root,
          'local-command-station',
          'bots',
          'blackbeak',
          'discord-agent-receipt.json',
        ),
        `${JSON.stringify(
          {
            version: 1,
            updatedAt: '2026-04-22T02:01:00.000Z',
            startedAt: '2026-04-22T01:00:00.000Z',
            status: 'ready',
            backend: 'Blackbeak backend',
            guilds: [{ id: '1', name: 'Arobi' }],
            gateway: { connected: true, guildCount: 1 },
            schedule: { enabled: true, intervalMs: 900000, cycleCount: 1 },
            routing: { channels: [] },
            voice: {
              enabled: false,
              provider: 'off',
              ready: false,
              connected: false,
            },
            patrol: {},
            knowledge: {
              enabled: false,
              ready: false,
              fileCount: 0,
              chunkCount: 0,
            },
            operator: {
              lastAction: 'ask-openjaws',
              lastCompletedAt: '2026-04-22T02:00:30.000Z',
              lastSummary: 'Prepared a bounded meme-room research pass.',
              activeProcessCwd: 'D:\\openjaws\\OpenJaws',
            },
            events: [],
          },
          null,
          2,
        )}\n`,
        'utf8',
      )

      const feed = syncPublicShowcaseActivityFromRoot({ root })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Supervised Viola patrol update',
            artifacts: ['discord:viola-agent-receipt'],
            subsystems: expect.arrayContaining(['viola', 'discord']),
          }),
          expect.objectContaining({
            title: 'Supervised Blackbeak operator activity',
            artifacts: ['discord:blackbeak-agent-receipt'],
            operatorActions: expect.arrayContaining([
              'ask_openjaws',
              'blackbeak_operator_runtime',
            ]),
          }),
        ]),
      )
      expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({
            title: 'Supervised Viola patrol update',
          }),
          expect.objectContaining({
            title: 'Supervised Blackbeak operator activity',
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

  it('adds the sanitized Immaculate actionability plan when the planner export is available', () => {
    const root = mkdtempSync(
      join(tmpdir(), 'openjaws-public-showcase-actionability-'),
    )
    const actionabilityPath = join(root, 'Roundtable-Actionability.json')
    const originalPath = process.env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE
    process.env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE = actionabilityPath
    try {
      writeFileSync(
        actionabilityPath,
        `${JSON.stringify(
          {
            generatedAt: '2026-04-22T01:25:00.000Z',
            planner: {
              repoCount: 3,
              actionCount: 3,
              readyCount: 3,
              parallelFormationMode: 'hybrid-quorum',
              parallelFormationSummary:
                'Roundtable hybrid-quorum plan across 3 repo(s) with 3 isolated agent action(s); 3 ready for immediate worktree materialization',
            },
            repositories: [
              { repoLabel: 'Immaculate' },
              { repoLabel: 'OpenJaws' },
              { repoLabel: 'Asgard' },
            ],
            actions: [
              {
                isolationMode: 'worktree',
                writeAuthority: 'agent-branch-only',
              },
              { isolationMode: 'branch', writeAuthority: 'agent-branch-only' },
            ],
          },
          null,
          2,
        )}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        generatedAt: '2026-04-22T01:26:00.000Z',
        root,
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Immaculate roundtable actionability plan',
            kind: 'roundtable_actionability',
            artifacts: ['roundtable:actionability'],
            subsystems: expect.arrayContaining([
              'immaculate',
              'OpenJaws',
              'Asgard',
            ]),
          }),
        ]),
      )
    } finally {
      if (originalPath) {
        process.env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE = originalPath
      } else {
        delete process.env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE
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
