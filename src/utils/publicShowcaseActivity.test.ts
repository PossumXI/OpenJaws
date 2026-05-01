import { describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildPublicShowcaseActivityFeed,
  getPublicShowcaseLedgerSyncScriptPath,
  getPublicShowcaseActivityPath,
  preparePublicShowcaseActivityFeedForPublication,
  queuePublicShowcaseActivitySync,
  readPublicShowcaseActivityFeed,
  syncPublicShowcaseActivityFromRoot,
} from './publicShowcaseActivity.js'

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
            status: 'warning',
          }),
          expect.objectContaining({
            title: 'Live JAWS activity',
            kind: 'engagement_behavior',
            summary: expect.stringContaining('People are using JAWS now'),
            artifacts: expect.arrayContaining(['showcase:engagement-profile']),
            operatorActions: expect.arrayContaining(['real_world_engagement']),
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

  it('does not call stale historical activity live engagement', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-stale-engagement-'))
    try {
      const feed = buildPublicShowcaseActivityFeed({
        root,
        generatedAt: '2026-05-01T12:00:00.000Z',
        qEntry: {
          id: 'old-q-work',
          timestamp: '2026-04-22T12:00:00.000Z',
          title: 'Old Q work',
          summary: 'Old work completed successfully.',
          kind: 'q_operator_activity',
          status: 'ok',
          source: 'Q',
          operatorActions: [
            'ask_openjaws',
            'q_operator_runtime',
            'roundtable_runtime',
            'public_showcase_sync',
          ],
          subsystems: ['q', 'discord', 'openjaws', 'roundtable'],
          artifacts: [
            'discord:q-agent-receipt',
            'roundtable:session',
            'showcase:activity',
          ],
          tags: ['old'],
        },
      })

      expect(feed.entries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Live JAWS activity',
            kind: 'engagement_behavior',
            summary: expect.stringContaining('No fresh JAWS activity is showing yet'),
            status: 'info',
            tags: expect.arrayContaining(['quiet']),
          }),
        ]),
      )
      const engagement = feed.entries.find(entry => entry.kind === 'engagement_behavior')
      expect(engagement?.summary).not.toContain('People are using JAWS now')
      expect(engagement?.summary).toContain('older activity item')
      expect(engagement?.summary).toContain('in history')
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
      const overlay = JSON.parse(readFileSync(overlayPath, 'utf8')) as {
        entries: Array<{ status: string | null; title: string; summary: string | null }>
      }
      expect(
        overlay.entries.some(entry => entry.status === 'warning' || entry.status === 'failed'),
      ).toBe(false)
      expect(overlay.entries.some(entry => entry.summary?.includes('#'))).toBe(false)
      expect(
        overlay.entries.some(entry =>
          /\bbounded\b|receipt surface|operator lane/i.test(entry.summary ?? ''),
        ),
      ).toBe(false)
      expect(
        overlay.entries.some(entry =>
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
            entry.summary ?? '',
          ),
        ),
      ).toBe(false)
      expect(overlay).toMatchObject({
        entries: expect.arrayContaining([
          expect.objectContaining({
            title: 'Roundtable runtime',
          }),
        ]),
      })
      expect(existsSync(mirrorPath)).toBe(true)
      const mirror = JSON.parse(readFileSync(mirrorPath, 'utf8')) as {
        entries: Array<{ status: string | null; title: string; summary: string | null }>
      }
      expect(
        mirror.entries.some(entry => entry.status === 'warning' || entry.status === 'failed'),
      ).toBe(false)
      expect(mirror.entries.some(entry => entry.summary?.includes('#'))).toBe(false)
      expect(
        mirror.entries.some(entry =>
          /\bbounded\b|receipt surface|operator lane/i.test(entry.summary ?? ''),
        ),
      ).toBe(false)
      expect(
        mirror.entries.some(entry =>
          /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
            entry.summary ?? '',
          ),
        ),
      ).toBe(false)
      expect(mirror).toMatchObject({
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

  it('scrubs raw Discord mention syntax before publication', () => {
    const feed = preparePublicShowcaseActivityFeedForPublication({
      updatedAt: '2026-05-01T23:30:00.000Z',
      entries: [
        {
          id: 'discord-mention-fixture',
          timestamp: '2026-05-01T23:29:00.000Z',
          title: 'Roundtable live in #dev_support',
          summary:
            'Posted in <#1490000000000000000> for <@123456789012345678> and <@&987654321098765432>; @everyone should not be public.',
          kind: 'roundtable_runtime',
          status: 'failed',
          source: '#dev_support',
          artifacts: [],
          operatorActions: [],
        },
      ],
    })

    expect(feed.entries[0]).toMatchObject({
      title: 'Roundtable live in the Discord channel',
      summary:
        'Posted in the Discord channel for a Discord user and a Discord role; the Discord audience should not be public.',
      status: 'info',
      source: 'the Discord channel',
    })
    expect(JSON.stringify(feed)).not.toMatch(/<#|<@|@everyone|#dev_support|failed/)
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
            title: 'Supervised Blackbeak user activity',
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
            title: 'Supervised Blackbeak user activity',
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
            summary: expect.stringContaining('Recent governed task lanes: mission planning, secure.'),
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
            status: 'ok',
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
    } finally {
      if (originalConfigDir) {
        process.env.CLAUDE_CONFIG_DIR = originalConfigDir
      } else {
        delete process.env.CLAUDE_CONFIG_DIR
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('queues a coalesced microtask sync without throwing', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-public-showcase-queue-'))
    const overlayPath = join(root, 'showcase-activity.json')
    const mirrorPath = join(root, 'docs', 'wiki', 'Public-Showcase-Activity.json')
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
      expect(existsSync(mirrorPath)).toBe(false)
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
})
