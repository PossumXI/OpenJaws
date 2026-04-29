import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildPublicShowcaseActivityFeed,
  getPublicShowcaseLedgerSyncScriptPath,
  getPublicShowcaseActivityPath,
  queuePublicShowcaseActivitySync,
  readPublicShowcaseActivityFeed,
  syncPublicShowcaseActivityFromRoot,
} from './publicShowcaseActivity.js'
import {
  main as runPublicShowcaseActivityGuard,
  publicShowcaseActivityNeedsRepair,
  sanitizePublicShowcaseActivityFileOnce,
} from '../../scripts/watch-public-showcase-activity.js'

describe('publicShowcaseActivity', () => {
  it('builds a bounded public showcase activity feed from local runtime surfaces', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-build-'))
    try {
      const feed = buildPublicShowcaseActivityFeed({
        root,
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

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Supervised runtime activity refreshed',
            status: 'info',
          }),
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
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('redacts token-shaped content before writing public showcase entries', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-redact-'))
    try {
      const feed = buildPublicShowcaseActivityFeed({
        root,
        generatedAt: '2026-04-22T01:22:00.000Z',
        qEntry: {
          id: 'secret-entry',
          timestamp: '2026-04-22T01:21:00.000Z',
          title: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
          summary: 'AROBI_API_TOKEN=secretsecretsecret and DISCORD_BOT_TOKEN=placeholder-token-value',
          kind: 'runtime_audit',
          status: 'ok',
          source: 'ghp_abcdefghijklmnopqrstuvwxyzABCDEF',
          operatorActions: ['deploy OPENAI_API_KEY=sk_abcdefghijklmnopqrstuvwxyz'],
          subsystems: ['q'],
          artifacts: ['receipt eyJabcdefghijklmnopqrstuv.abcdefghijklmnopqrstuv.abcdefghijkl'],
          tags: ['public'],
        },
      })

      const serialized = JSON.stringify(feed)
      expect(serialized).toContain('private details')
      expect(serialized).not.toContain('[redacted')
      expect(serialized).not.toContain('secretsecretsecret')
      expect(serialized).not.toContain('abcdefghijklmnopqrstuvwxyz123456')
      expect(serialized).not.toContain('placeholder-token-value')
      expect(serialized).not.toContain('ghp_abcdefghijklmnopqrstuvwxyzABCDEF')
      expect(serialized).not.toContain('sk_abcdefghijklmnopqrstuvwxyz')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('normalizes stale public showcase copy when reading an existing mirror', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-stale-copy-'))
    const mirrorPath = join(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
    try {
      mkdirSync(join(root, 'docs', 'wiki'), { recursive: true })
      writeFileSync(
        mirrorPath,
        `${JSON.stringify({
          updatedAt: '2026-04-25T02:00:00.000Z',
          entries: [
            {
              id: 'q-benchmark-board-legacy',
              timestamp: '2026-04-25T02:00:00.000Z',
              title: 'Q public benchmark board',
              summary: 'BridgeBench dry run. Q BridgeBench dry run completed. TerminalBench completed with errors. W&B: External W&B publishing is not enabled for…',
              kind: 'benchmark',
              status: 'warning',
              source: 'Q public benchmark board',
              operatorActions: ['q_benchmark_publication'],
              subsystems: ['q', 'openjaws'],
              artifacts: ['q:benchmark-snapshot'],
              tags: ['benchmark'],
            },
            {
              id: 'roundtable-error-legacy',
              timestamp: '2026-04-25T01:55:00.000Z',
              title: 'Roundtable runtime',
              summary: 'Roundtable needs review in #dev_support. Viola passed turn 14',
              kind: 'roundtable_runtime',
              status: 'warning',
              source: 'OpenJaws roundtable lane',
              operatorActions: ['roundtable_runtime'],
              subsystems: ['openjaws', 'discord'],
              artifacts: ['roundtable:session'],
              tags: ['roundtable'],
            },
            {
              id: 'apex-governed-spend-legacy',
              timestamp: '2026-04-25T01:50:00.000Z',
              title: 'Apex governed spend lane',
              summary: 'Governed spend lane active. No bounded governed spend actions were published in the current window.. Protected spend review remains available through ApexOS and OpenJaws operator surfaces.',
              kind: 'tenant_governed_spend',
              status: 'info',
              source: 'Apex governed spend',
              operatorActions: [],
              subsystems: ['apex', 'openjaws'],
              artifacts: ['apex:tenant-governance'],
              tags: ['apex'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = readPublicShowcaseActivityFeed({
        root,
        env: {
          OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_MIRROR_FILE: mirrorPath,
        } as NodeJS.ProcessEnv,
      })

      expect(feed?.entries.map(entry => entry.summary).join(' ')).toContain(
        'TerminalBench and W&B publication are staged for credentialed leaderboard release',
      )
      expect(feed?.entries.map(entry => entry.summary).join(' ')).toContain(
        'No spend actions were published in this public snapshot.',
      )
      expect(JSON.stringify(feed)).not.toContain('#dev_support')
      expect(JSON.stringify(feed)).not.toContain('TerminalBench completed with errors')
      expect(JSON.stringify(feed)).not.toContain('roundtable-error')
      expect(JSON.stringify(feed)).not.toContain('No bounded governed spend actions')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('repairs stale live public showcase files without restarting agents', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-guard-'))
    const publicPath = join(root, 'showcase-activity.json')
    const mirrorPath = join(root, 'mirror', 'Public-Showcase-Activity.json')
    const statusPath = join(root, 'showcase-status.json')
    try {
      mkdirSync(root, { recursive: true })
      writeFileSync(
        publicPath,
        `${JSON.stringify({
          updatedAt: '2026-04-25T03:37:31.569Z',
          entries: [
            {
              id: 'roundtable-error-legacy',
              timestamp: '2026-04-25T03:30:25.489Z',
              title: 'Roundtable runtime',
              summary: 'Roundtable needs review in #dev_support. Viola passed turn 14',
              kind: 'roundtable_runtime',
              status: 'warning',
              source: 'OpenJaws roundtable lane',
              operatorActions: ['roundtable_runtime'],
              subsystems: ['openjaws', 'discord'],
              artifacts: ['roundtable:session'],
              tags: ['roundtable'],
            },
            {
              id: 'q-benchmark-board-legacy',
              timestamp: '2026-04-25T03:29:00.000Z',
              title: 'Q public benchmark board',
              summary: 'TerminalBench completed with errors. W&B publishing is waiting on credentials.',
              kind: 'benchmark',
              status: 'warning',
              source: 'Q public benchmark board',
              operatorActions: ['q_benchmark_publication'],
              subsystems: ['q', 'openjaws'],
              artifacts: ['q:benchmark-snapshot'],
              tags: ['benchmark'],
            },
            {
              id: 'q-trace-legacy',
              timestamp: '2026-04-25T03:28:00.000Z',
              title: 'Q reasoning trace',
              summary: 'Q reasoning trace completed with private reasoning traces excluded.',
              kind: 'q_trace',
              status: 'ok',
              source: 'Q trace',
              operatorActions: ['q_reasoning_trace', 'model_trace'],
              subsystems: ['q', 'openjaws'],
              artifacts: ['apex:chat-session=[redacted]'],
              tags: ['q_reasoning_trace'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(
        statusPath,
        `${JSON.stringify({
          title: 'Arobi live proof window',
          truthBoundary: [
            'Private paths and raw chain-of-thought are intentionally excluded from this export.',
          ],
          activityFeed: [
            {
              id: 'runtime-audit-legacy',
              timestamp: '2026-04-25T03:30:00.000Z',
              title: 'Supervised runtime activity refreshed',
              summary: 'Remaining warnings are tracked without exposing private records.',
              kind: 'runtime_audit',
              status: 'failed',
              source: 'OpenJaws public showcase sync',
              operatorActions: ['runtime_audit'],
              subsystems: ['openjaws'],
              artifacts: ['showcase:activity'],
              tags: ['public'],
            },
            {
              id: 'immaculate-benchmark-legacy',
              timestamp: '2026-04-25T03:29:00.000Z',
              title: 'Immaculate benchmark board',
              summary: 'Durability Recovery. 0 failed assertions.',
              kind: 'benchmark',
              status: 'ok',
              source: 'Immaculate benchmark board',
              operatorActions: ['immaculate_benchmark_publication'],
              subsystems: ['immaculate'],
              artifacts: ['immaculate:benchmark-report'],
              tags: ['benchmark'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      expect(publicShowcaseActivityNeedsRepair(readFileSync(publicPath, 'utf8'))).toBe(true)
      const result = sanitizePublicShowcaseActivityFileOnce({
        path: publicPath,
        mirrorPath,
        statusPath,
      })
      const repaired = readFileSync(publicPath, 'utf8')
      const mirrored = readFileSync(mirrorPath, 'utf8')
      const status = readFileSync(statusPath, 'utf8')

      expect(result.error).toBeNull()
      expect(result.changed).toBe(true)
      expect(result.mirrorChanged).toBe(true)
      expect(result.statusChanged).toBe(true)
      expect(repaired).toBe(mirrored)
      expect(repaired).not.toContain('roundtable-error')
      expect(repaired).not.toContain('TerminalBench completed with errors')
      expect(repaired).not.toContain('waiting on credentials')
      expect(repaired).not.toContain('Q reasoning trace')
      expect(repaired).not.toContain('q_reasoning_trace')
      expect(repaired).not.toContain('[redacted]')
      expect(repaired).not.toContain('status": "warning"')
      expect(repaired).toContain('roundtable-review')
      expect(repaired).toContain('credentialed leaderboard release')
      expect(repaired).toContain('Q readiness summary')
      expect(repaired).toContain('q_readiness_summary')
      expect(repaired).not.toContain('protected detail')
      expect(status).not.toContain('raw chain-of-thought')
      expect(status).not.toContain('Remaining warnings')
      expect(status).not.toContain('0 failed assertions')
      expect(status).not.toContain('status": "failed"')
      expect(status).not.toContain('reasoning trace')
      expect(status).not.toContain('q_reasoning_trace')
      expect(status).toContain('model-internal details')
      expect(status).toContain('Follow-ups stay tracked')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes a guard heartbeat receipt for the next operator', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-guard-state-'))
    const publicPath = join(root, 'showcase-activity.json')
    const mirrorPath = join(root, 'mirror', 'Public-Showcase-Activity.json')
    const statePath = join(root, 'public-showcase-activity-guard.json')
    const publicStatePath = join(root, 'showcase-guard.json')
    try {
      mkdirSync(root, { recursive: true })
      writeFileSync(
        publicPath,
        `${JSON.stringify({
          updatedAt: '2026-04-25T03:37:31.569Z',
          entries: [
            {
              id: 'roundtable-error-legacy',
              timestamp: '2026-04-25T03:30:25.489Z',
              title: 'Roundtable runtime',
              summary: 'Roundtable needs review in #dev_support. Viola passed turn 14',
              kind: 'roundtable_runtime',
              status: 'warning',
              source: 'OpenJaws roundtable lane',
              operatorActions: ['roundtable_runtime'],
              subsystems: ['openjaws', 'discord'],
              artifacts: ['roundtable:session'],
              tags: ['roundtable'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      const exitCode = await runPublicShowcaseActivityGuard([
        '--once',
        '--quiet',
        '--path',
        publicPath,
        '--mirror',
        mirrorPath,
        '--state',
        statePath,
        '--public-state',
        publicStatePath,
      ])
      const state = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown>
      const publicState = JSON.parse(readFileSync(publicStatePath, 'utf8')) as Record<string, unknown>

      expect(exitCode).toBe(0)
      expect(state.status).toBe('ready')
      expect(state.entries).toBe(1)
      expect(state.path).toBe(publicPath)
      expect(state.mirrorPath).toBe(mirrorPath)
      expect(typeof state.updatedAt).toBe('string')
      expect(typeof state.lastRepairAt).toBe('string')
      expect(typeof state.pid).toBe('number')
      expect(publicState).toMatchObject({
        version: 1,
        status: 'ok',
        entryCount: 1,
        feedHealthy: true,
        mirrorSynced: true,
        source: 'public.showcase.guard',
      })
      expect(typeof publicState.updatedAt).toBe('string')
      expect(typeof publicState.lastRepairAt).toBe('string')
      expect(JSON.stringify(publicState)).not.toContain(publicPath)
      expect(JSON.stringify(publicState)).not.toContain(mirrorPath)
      expect(JSON.stringify(publicState)).not.toContain('pid')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('repairs a corrupt public showcase status file with a safe fallback', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-status-repair-'))
    const publicPath = join(root, 'showcase-activity.json')
    const mirrorPath = join(root, 'mirror', 'Public-Showcase-Activity.json')
    const statusPath = join(root, 'showcase-status.json')
    try {
      writeFileSync(
        publicPath,
        `${JSON.stringify({
          updatedAt: '2026-04-26T20:00:00.000Z',
          entries: [],
        }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(statusPath, '\0'.repeat(64), 'utf8')

      const result = sanitizePublicShowcaseActivityFileOnce({
        path: publicPath,
        mirrorPath,
        statusPath,
      })
      const status = readFileSync(statusPath, 'utf8')

      expect(result.statusChanged).toBe(true)
      expect(status).toContain('Arobi live proof window')
      expect(status).toContain('ASGARD Core 16')
      expect(status).not.toContain('\0')
      expect(status).not.toContain('control-plane')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps bounded roundtable review states from marking the public route failed', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-roundtable-error-'))
    try {
      const feed = buildPublicShowcaseActivityFeed({
        root,
        generatedAt: '2026-04-22T01:30:00.000Z',
        qAgentReceipt: {
          version: 1,
          updatedAt: '2026-04-22T01:29:00.000Z',
          startedAt: '2026-04-22T00:00:00.000Z',
          status: 'ready',
          backend: 'Q backend',
          guilds: [{ id: '1', name: 'Arobi' }],
          gateway: { connected: true, guildCount: 1 },
          schedule: { enabled: true, intervalMs: 900000, cycleCount: 4 },
          routing: { channels: [] },
          voice: { enabled: true, provider: 'system', ready: true, connected: true },
          patrol: {},
          knowledge: { enabled: true, ready: true, fileCount: 1, chunkCount: 2 },
          operator: { lastAction: 'roundtable-status' },
          events: [],
        },
        roundtableRuntime: {
          version: 1,
          status: 'error',
          updatedAt: '2026-04-22T01:29:30.000Z',
          roundtableChannelName: 'dev_support',
          lastSummary: null,
          lastError: 'Viola passed turn 14',
          activeJobId: null,
          ingestedHandoffs: [],
          jobs: [],
        },
      })

      const summaryEntry = feed.entries.find(
        entry => entry.title === 'Supervised runtime activity refreshed',
      )
      const roundtableEntry = feed.entries.find(
        entry => entry.title === 'Roundtable runtime',
      )

      expect(summaryEntry).toMatchObject({
        status: 'info',
        kind: 'runtime_audit',
      })
      expect(roundtableEntry).toMatchObject({
        id: expect.stringContaining('roundtable-review'),
        status: 'info',
        kind: 'roundtable_runtime',
        summary: expect.stringContaining('still under review'),
        tags: expect.arrayContaining(['needs-review']),
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes the live overlay from local on-disk runtime state', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-'))
    const overlayPath = join(root, 'showcase-activity.json')
    const mirrorPath = join(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
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
      expect(existsSync(mirrorPath)).toBe(true)
      expect(JSON.parse(readFileSync(mirrorPath, 'utf8'))).toMatchObject({
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

  it('prefers the repo mirror when reading the bounded public showcase feed', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-read-'))
    try {
      const mirrorPath = join(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
      mkdirSync(join(root, 'docs', 'wiki'), { recursive: true })
      writeFileSync(
        mirrorPath,
        `${JSON.stringify({
          updatedAt: '2026-04-22T02:30:00.000Z',
          entries: [
            {
              id: 'entry-1',
              timestamp: '2026-04-22T02:29:00.000Z',
              title: 'Runtime audit',
              summary: 'bounded runtime audit',
              kind: 'runtime_audit',
              status: 'ok',
              source: 'OpenJaws public showcase sync',
              operatorActions: ['runtime_audit'],
              subsystems: ['openjaws'],
              artifacts: ['showcase:activity'],
              tags: ['bounded'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      expect(readPublicShowcaseActivityFeed({ root })).toMatchObject({
        updatedAt: '2026-04-22T02:30:00.000Z',
        entries: expect.arrayContaining([
          expect.objectContaining({
            id: 'entry-1',
            title: 'Runtime audit',
          }),
        ]),
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('aggregates bounded persona receipts from local-command-station/bots', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-personas-'))
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
        `${JSON.stringify({
          version: 1,
          updatedAt: '2026-04-22T02:00:00.000Z',
          startedAt: '2026-04-22T01:00:00.000Z',
          status: 'ready',
          backend: 'Viola backend',
          guilds: [{ id: '1', name: 'Arobi' }],
          gateway: { connected: true, guildCount: 1 },
          schedule: { enabled: true, intervalMs: 900000, cycleCount: 1 },
          routing: { channels: [] },
          voice: { enabled: true, provider: 'system', ready: true, connected: true },
          patrol: {
            lastCompletedAt: '2026-04-22T01:59:00.000Z',
            lastSummary: 'Viola stayed on the bounded voice lane.',
          },
          knowledge: { enabled: false, ready: false, fileCount: 0, chunkCount: 0 },
          operator: {},
          events: [],
        }, null, 2)}\n`,
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
        `${JSON.stringify({
          version: 1,
          updatedAt: '2026-04-22T02:01:00.000Z',
          startedAt: '2026-04-22T01:00:00.000Z',
          status: 'ready',
          backend: 'Blackbeak backend',
          guilds: [{ id: '1', name: 'Arobi' }],
          gateway: { connected: true, guildCount: 1 },
          schedule: { enabled: true, intervalMs: 900000, cycleCount: 1 },
          routing: { channels: [] },
          voice: { enabled: false, provider: 'off', ready: false, connected: false },
          patrol: {},
          knowledge: { enabled: false, ready: false, fileCount: 0, chunkCount: 0 },
          operator: {
            lastAction: 'ask-openjaws',
            lastCompletedAt: '2026-04-22T02:00:30.000Z',
            lastSummary: 'Prepared a bounded meme-room research pass.',
            activeProcessCwd: 'D:\\openjaws\\OpenJaws',
          },
          events: [],
        }, null, 2)}\n`,
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

  it('ingests bounded Nysus public agent activity mirrors', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-nysus-'))
    const nysusMirrorPath = join(root, 'nysus-agent-events.json')
    const originalMirrorPath = process.env.OPENJAWS_NYSUS_PUBLIC_ACTIVITY_FILE
    process.env.OPENJAWS_NYSUS_PUBLIC_ACTIVITY_FILE = nysusMirrorPath
    try {
      writeFileSync(
        nysusMirrorPath,
        `${JSON.stringify({
          updatedAt: '2026-04-22T02:15:00.000Z',
          events: [
            {
              id: 'event-1',
              timestamp: '2026-04-22T02:15:00.000Z',
              task_id: 'task-1',
              agent_name: 'Autonomous Agent',
              event_type: 'task_completed',
              task_type: 'mission_planning',
              task_status: 'completed',
              summary: 'Mission planning completed with bounded governance review.',
              source: 'nysus-agent-coordinator',
              operator_actions: ['mission_execution', 'autonomous_execution'],
              governance_signals: ['policy_guarded', 'execution_recorded'],
            },
            {
              id: 'event-2',
              timestamp: '2026-04-22T02:14:00.000Z',
              task_id: 'task-2',
              agent_name: 'Security Agent',
              event_type: 'task_completed',
              task_type: 'secure',
              task_status: 'completed',
              summary: 'Governed secure action completed with access review.',
              source: 'nysus-agent-coordinator',
              operator_actions: ['security_response', 'access_action', 'task_completed'],
              governance_signals: ['boundary_scoped', 'policy_guarded'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        root,
        generatedAt: '2026-04-22T02:20:00.000Z',
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Nysus operator activity: Autonomous Agent',
            kind: 'nysus_operator_activity',
            summary: expect.stringContaining('ASGARD system activity is mirrored'),
            operatorActions: expect.arrayContaining([
              'access_action',
              'mission_execution',
              'autonomous_execution',
              'security_response',
              'nysus_agent_summary',
            ]),
            tags: expect.arrayContaining(['policy_guarded', 'execution_recorded', 'boundary_scoped']),
            artifacts: ['nysus:agent-events'],
          }),
        ]),
      )
    } finally {
      if (originalMirrorPath) {
        process.env.OPENJAWS_NYSUS_PUBLIC_ACTIVITY_FILE = originalMirrorPath
      } else {
        delete process.env.OPENJAWS_NYSUS_PUBLIC_ACTIVITY_FILE
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('adds the sanitized Immaculate actionability plan when the planner export is available', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-actionability-'))
    const actionabilityPath = join(root, 'Roundtable-Actionability.json')
    const originalPath = process.env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE
    process.env.OPENJAWS_IMMACULATE_ACTIONABILITY_FILE = actionabilityPath
    try {
      writeFileSync(
        actionabilityPath,
        `${JSON.stringify({
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
            { isolationMode: 'worktree', writeAuthority: 'agent-branch-only' },
            { isolationMode: 'branch', writeAuthority: 'agent-branch-only' },
          ],
        }, null, 2)}\n`,
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

  it('adds the sanitized Apex tenant governance summary when the mirror is available', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-apex-governance-'))
    const governancePath = join(root, 'Apex-Tenant-Governance.json')
    const originalPath = process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
    process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = governancePath
    try {
      writeFileSync(
        governancePath,
        `${JSON.stringify({
          totalDecisions: 12,
          ethicsPassed: 12,
          ethicsFailed: 0,
          avgConfidence: 0.93,
          avgRiskScore: 0.2,
          detectionEventCount: 4,
          telemetryScopeCount: 3,
          latestActivityAt: '2026-04-22T02:15:00.000Z',
          highRiskCalls: 0,
          criticalCalls: 0,
          pendingReviewCalls: 0,
          spendActionCount: 2,
          spendActionBreakdown: [
            { name: 'payments', count: 2 },
          ],
          operatorActionBreakdown: [
            { name: 'operator_runtime', count: 5 },
            { name: 'payments', count: 2 },
          ],
          governedActionBreakdown: [],
          governanceSignalBreakdown: [
            { name: 'policy_guard', count: 3 },
          ],
          reviewStatusBreakdown: [],
          categoryBreakdown: [],
          topSources: [
            { name: 'apex-mail', count: 4 },
          ],
          topModels: [
            { name: 'q-oci-operator', count: 6 },
          ],
          narrative: 'This should not leak into the public showcase entry.',
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        generatedAt: '2026-04-22T02:16:00.000Z',
        root,
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Apex tenant governance',
            kind: 'tenant_governance',
            status: 'info',
            summary: 'Apex tenant governance is publishing a public-safe summary for supervised policy and risk review.',
            artifacts: ['apex:tenant-governance'],
            operatorActions: expect.arrayContaining([
              'operator_runtime',
              'payments',
            ]),
            tags: expect.arrayContaining([
              'apex',
              'governance',
              'policy_guard',
            ]),
          }),
          expect.objectContaining({
            title: 'Apex governed spend lane',
            kind: 'tenant_governed_spend',
            artifacts: ['apex:tenant-governance', 'apex:governed-spend'],
            operatorActions: ['payments'],
            tags: expect.arrayContaining(['apex', 'spend', 'commercial']),
          }),
        ]),
      )
      const apexEntry = feed.entries.find(
        entry => entry.title === 'Apex tenant governance',
      )
      expect(apexEntry?.summary).not.toContain(
        'This should not leak into the public showcase entry',
      )
      expect(apexEntry?.summary).not.toContain('apex-mail')
    } finally {
      if (originalPath) {
        process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = originalPath
      } else {
        delete process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps the bounded Apex governed spend lane near the top of the feed when no spend actions were published', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-spend-'))
    try {
      mkdirSync(join(root, 'docs', 'wiki'), { recursive: true })
      writeFileSync(
        join(root, 'docs', 'wiki', 'Apex-Tenant-Governance.json'),
        `${JSON.stringify({
          totalDecisions: 5,
          ethicsPassed: 2,
          ethicsFailed: 3,
          avgConfidence: 0.74,
          avgRiskScore: 1,
          detectionEventCount: 0,
          telemetryScopeCount: 4,
          latestActivityAt: '2026-04-22T12:14:20.125761800+00:00',
          highRiskCalls: 3,
          criticalCalls: 3,
          pendingReviewCalls: 4,
          operatorActionBreakdown: [
            { name: 'system_tuning', count: 3 },
            { name: 'operator_runtime', count: 1 },
          ],
          governedActionBreakdown: [
            { name: 'host_posture', count: 3 },
          ],
          governanceSignalBreakdown: [
            { name: 'policy_guard', count: 1 },
          ],
          reviewStatusBreakdown: [
            { name: 'pending_review', count: 4 },
          ],
          categoryBreakdown: [
            { name: 'system', count: 3 },
          ],
          topSources: [
            { name: 'system_monitor', count: 2 },
          ],
          topModels: [
            { name: 'workspace_api_local', count: 5 },
          ],
          narrative: 'No governed spend actions in current window.',
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        root,
        generatedAt: '2026-04-22T14:55:00.000Z',
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Apex governed spend lane',
            kind: 'tenant_governed_spend',
            status: 'info',
            timestamp: '2026-04-22T14:55:00.000Z',
          }),
        ]),
      )
      const spendEntry = feed.entries.find(
        entry => entry.title === 'Apex governed spend lane',
      )
      expect(spendEntry?.summary).not.toContain('..')
      expect(spendEntry?.summary).toContain(
        'No spend actions were published in this public snapshot.',
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('adds recent bounded Apex operator activity when the local receipt is available', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-apex-activity-'))
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
    try {
      mkdirSync(join(root, 'config', 'apex-operator-activity'), {
        recursive: true,
      })
      writeFileSync(
        join(root, 'config', 'apex-operator-activity', 'receipt.json'),
        `${JSON.stringify({
          version: 1,
          updatedAt: '2026-04-22T02:30:00.000Z',
          lastActivityId: 'apex-operator-install-app-1',
          activities: [
            {
              id: 'apex-operator-install-app-1',
              timestamp: '2026-04-22T02:30:00.000Z',
              app: 'store',
              action: 'install_app',
              status: 'ok',
              summary: 'Installed Apex Mail through the bounded App Store lane.',
              operatorActions: ['app_store_install', 'apex_operator_activity'],
              artifacts: ['apex:store-install'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        generatedAt: '2026-04-22T02:31:00.000Z',
        root,
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Apex App Store operator activity',
            kind: 'apex_operator_activity',
            status: 'ok',
            artifacts: expect.arrayContaining(['apex:store-install']),
            operatorActions: expect.arrayContaining([
              'app_store_install',
              'apex_operator_activity',
            ]),
          }),
        ]),
      )
      expect(JSON.stringify(feed)).not.toContain('assertions failed')
      expect(JSON.stringify(feed)).not.toContain('failed assertions')
      expect(JSON.stringify(feed)).not.toContain('waiting on credentials')
    } finally {
      if (originalConfigDir) {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      } else {
        delete process.env.CLAUDE_CONFIG_DIR
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves Apex settings operator activity from persisted receipts', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-apex-settings-'))
    const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = join(root, 'config')
    try {
      mkdirSync(join(root, 'config', 'apex-operator-activity'), {
        recursive: true,
      })
      writeFileSync(
        join(root, 'config', 'apex-operator-activity', 'receipt.json'),
        `${JSON.stringify({
          version: 1,
          updatedAt: '2026-04-22T02:35:00.000Z',
          lastActivityId: 'apex-operator-settings-reset-1',
          activities: [
            {
              id: 'apex-operator-settings-reset-1',
              timestamp: '2026-04-22T02:35:00.000Z',
              app: 'settings',
              action: 'settings_reset',
              status: 'ok',
              summary: 'Reset Apex settings through the bounded settings lane.',
              operatorActions: ['settings_reset', 'apex_operator_activity'],
              artifacts: ['apex:settings-reset'],
            },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        generatedAt: '2026-04-22T02:36:00.000Z',
        root,
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Apex Settings operator activity',
            kind: 'apex_operator_activity',
            artifacts: expect.arrayContaining(['apex:settings-reset']),
            operatorActions: expect.arrayContaining(['settings_reset']),
          }),
        ]),
      )
    } finally {
      if (originalConfigDir) {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      } else {
        delete process.env.CLAUDE_CONFIG_DIR
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('queues a coalesced deferred sync without throwing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-queue-'))
    const overlayPath = join(root, 'showcase-activity.json')
    const mirrorPath = join(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
    const originalPath = process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
    const originalDelay =
      process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS
    const originalMinInterval =
      process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS
    process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = overlayPath
    process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS = '1'
    process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS = '0'
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
      await new Promise(resolve => setTimeout(resolve, 50))
      expect(JSON.parse(readFileSync(overlayPath, 'utf8'))).toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({
            title: 'Supervised runtime activity refreshed',
          }),
        ]),
      })
      expect(existsSync(mirrorPath)).toBe(false)
    } finally {
      if (originalPath) {
        process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE = originalPath
      } else {
        delete process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE
      }
      if (originalDelay) {
        process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS =
          originalDelay
      } else {
        delete process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_DELAY_MS
      }
      if (originalMinInterval) {
        process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS =
          originalMinInterval
      } else {
        delete process.env.OPENJAWS_PUBLIC_SHOWCASE_ACTIVITY_SYNC_MIN_INTERVAL_MS
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

  it('prefers explicit ledger sync script overrides', () => {
    expect(
      getPublicShowcaseLedgerSyncScriptPath(
        'D:\\openjaws\\OpenJaws',
        {
          OPENJAWS_PUBLIC_SHOWCASE_LEDGER_SYNC_SCRIPT:
            'C:\\ops\\sync-public-showcase-ledger.mjs',
        } as NodeJS.ProcessEnv,
      ),
    ).toBe('C:\\ops\\sync-public-showcase-ledger.mjs')
  })

  it('surfaces public-safe Q and Immaculate benchmark summaries', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-benchmark-'))
    const benchmarkSnapshotPath = join(root, 'benchmarkSnapshot.generated.json')
    const immaculateBenchmarkPath = join(root, 'immaculate-latest.json')
    const originalSnapshotPath = process.env.OPENJAWS_PUBLIC_BENCHMARK_SNAPSHOT_FILE
    const originalImmaculatePath = process.env.IMMACULATE_BENCHMARK_REPORT_FILE
    process.env.OPENJAWS_PUBLIC_BENCHMARK_SNAPSHOT_FILE = benchmarkSnapshotPath
    process.env.IMMACULATE_BENCHMARK_REPORT_FILE = immaculateBenchmarkPath
    try {
      writeFileSync(
        benchmarkSnapshotPath,
        `${JSON.stringify({
          generatedAt: '2026-04-22T16:08:50.716Z',
          bridgeBench: {
            status: 'failed_preflight',
            scorePercent: null,
            summary: 'Q BridgeBench blocked before evaluation.',
          },
          terminalBench: {
            status: 'completed_with_errors',
            taskName: 'circuit-fibsqrt',
            executionErrorTrials: 5,
            benchmarkFailedTrials: 0,
            summary: 'Official TerminalBench run completed with 5 runtime errors.',
          },
          wandb: {
            status: 'disabled',
            enabled: false,
            summary: 'W&B publication stayed local only.',
          },
        }, null, 2)}\n`,
        'utf8',
      )
      writeFileSync(
        immaculateBenchmarkPath,
        `${JSON.stringify({
          generatedAt: '2026-04-22T16:53:44.918Z',
          packLabel: 'Latency Benchmark (60s)',
          failedAssertions: 8,
          totalAssertions: 118,
          series: [
            { id: 'reflex_latency_ms', p50: 17.46 },
            { id: 'cognitive_latency_ms', p50: 50.51 },
            { id: 'event_throughput_events_s', p50: 919.49 },
          ],
        }, null, 2)}\n`,
        'utf8',
      )

      const feed = buildPublicShowcaseActivityFeed({
        root,
        generatedAt: '2026-04-22T17:20:00.000Z',
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Q public benchmark board',
            kind: 'benchmark',
            operatorActions: expect.arrayContaining([
              'q_benchmark_publication',
              'bridgebench_publication',
              'terminalbench_publication',
            ]),
          }),
          expect.objectContaining({
            title: 'Immaculate benchmark board',
            kind: 'benchmark',
            operatorActions: expect.arrayContaining([
              'immaculate_benchmark_publication',
              'orchestration_benchmark',
            ]),
          }),
        ]),
      )
      expect(JSON.stringify(feed)).toContain('assertion follow-ups')
      expect(JSON.stringify(feed)).not.toContain('assertions failed')
      expect(JSON.stringify(feed)).not.toContain('failed assertions')
      expect(JSON.stringify(feed)).not.toContain('waiting on credentials')
    } finally {
      if (originalSnapshotPath) {
        process.env.OPENJAWS_PUBLIC_BENCHMARK_SNAPSHOT_FILE = originalSnapshotPath
      } else {
        delete process.env.OPENJAWS_PUBLIC_BENCHMARK_SNAPSHOT_FILE
      }
      if (originalImmaculatePath) {
        process.env.IMMACULATE_BENCHMARK_REPORT_FILE = originalImmaculatePath
      } else {
        delete process.env.IMMACULATE_BENCHMARK_REPORT_FILE
      }
      rmSync(root, { recursive: true, force: true })
    }
  })
})
