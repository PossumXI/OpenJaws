import { describe, expect, it } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  getSessionIngressToken,
  setSessionIngressToken,
} from '../bootstrap/state.js'
import {
  APEX_PROJECT_ROOT,
  buildApexGovernanceRecommendations,
  buildWindowsApexLaunchCommand,
  getApexTenantGovernanceSummary,
  getApexTenantGovernanceMirrorPath,
  getApexSettingsSummary,
  readApexTenantGovernanceMirror,
  resetApexSettings,
  summarizeApexBrowser,
  getApexLaunchTarget,
  getApexLaunchTargets,
  resolveApexAsgardRoot,
  resolveApexProjectRoot,
  summarizeApexGovernedSpend,
  summarizePublicApexTenantGovernance,
  summarizePublicApexGovernedSpend,
  summarizeApexChrono,
  summarizeApexSettings,
  summarizeApexTenantGovernance,
  summarizeApexWorkspace,
  updateApexSettings,
} from './apexWorkspace.js'

describe('apexWorkspace', () => {
  it('prefers the active D: Asgard checkout when the desktop stub is absent', () => {
    const home = 'C:\\Users\\Knight'
    const activeAsgard = 'D:\\cheeks\\Asgard'

    expect(
      resolveApexAsgardRoot({
        env: {},
        home,
        exists: path => path === activeAsgard,
      }),
    ).toBe(resolve(activeAsgard))

    expect(
      resolveApexProjectRoot({
        env: {},
        asgardRoot: activeAsgard,
      }),
    ).toBe(resolve('D:\\cheeks\\Asgard\\ignite\\apex-os-project'))
  })

  it('honors explicit Apex root overrides before active checkout discovery', () => {
    expect(
      resolveApexAsgardRoot({
        env: {
          OPENJAWS_APEX_ASGARD_ROOT: 'E:\\Asgard',
        },
        home: 'C:\\Users\\Knight',
        exists: () => false,
      }),
    ).toBe(resolve('E:\\Asgard'))

    expect(
      resolveApexProjectRoot({
        env: {
          OPENJAWS_APEX_ROOT: 'E:\\Asgard\\ignite\\apex-os-project',
        },
      }),
    ).toBe(resolve('E:\\Asgard\\ignite\\apex-os-project'))
  })

  it('registers the guarded workspace bridge and native app targets', () => {
    const targets = getApexLaunchTargets()
    expect(targets.some(target => target.id === 'workspace_api')).toBe(true)
    expect(targets.some(target => target.id === 'chrono_bridge')).toBe(true)
    expect(targets.some(target => target.id === 'browser_bridge')).toBe(true)
    expect(targets.some(target => target.id === 'browser')).toBe(true)
    expect(targets.some(target => target.id === 'notifications')).toBe(true)
  })

  it('builds a visible Windows launch command for native cargo apps', () => {
    const target = getApexLaunchTarget('browser')
    expect(target).not.toBeNull()
    const launch = buildWindowsApexLaunchCommand(
      target!,
      'C:\\Users\\Knight\\.cargo\\bin\\cargo.exe',
    )
    expect(launch.file).toBe('cmd.exe')
    expect(launch.args).toContain('/c')
    expect(launch.args.join(' ')).toContain('powershell.exe')
    expect(launch.args.join(' ')).toContain(APEX_PROJECT_ROOT)
    expect(launch.args.join(' ')).toContain('apps\\browser\\Cargo.toml')
    expect(launch.args.join(' ')).toContain('flowspace-browser')
  })

  it('summarizes live workspace state into concise operator strings', () => {
    const summary = summarizeApexWorkspace({
      mode: 'live',
      mail: {
        accountCount: 2,
        securityAlertCount: 1,
        messages: [
          {
            id: 'm1',
            sender: 'ops@arobi.local',
            subject: 'Launch',
            preview: 'Ready to ship',
            timestamp: '2026-04-18T00:00:00Z',
            unread: true,
            folder: 'inbox',
            tags: ['verified'],
          },
        ],
        outbox: {
          pending: 0,
          failed: 0,
          sent: 1,
        },
      },
      chat: {
        conversations: [
          {
            id: 'chat-1',
            name: 'Ops',
            role: 'operator',
            status: 'active',
            unread: 1,
            tone: 'cyan',
            encryption: 'quantum',
            lastMessage: 'Keep moving',
            lastSeen: '2026-04-18T00:00:00Z',
          },
        ],
        messages: {
          'chat-1': [
            {
              id: 'msg-1',
              sender: 'ops',
              content: 'Keep moving',
              timestamp: '2026-04-18T00:00:00Z',
              sealed: true,
            },
          ],
        },
        statistics: {
          totalSessions: 2,
          totalContacts: 3,
          totalMessages: 14,
          activeSessions: 1,
        },
      },
      store: {
        featuredCount: 2,
        installedCount: 4,
        updateCount: 1,
        apps: [
          {
            id: 'store-1',
            name: 'Chrono',
            category: 'ops',
            description: 'Backup client',
            permissions: ['filesystem'],
            installed: true,
            featured: true,
            rating: 4.8,
            tone: 'amber',
            version: '1.0.0',
            developer: 'Arobi',
          },
        ],
      },
      system: {
        healthScore: 0.82,
        metrics: {
          timestamp: '2026-04-18T00:00:00Z',
          cpuUsage: 12.4,
          memoryUsage: 55.2,
          processCount: 128,
          uptime: 1000,
        },
        services: [],
        alerts: [],
      },
      security: {
        overallHealth: 0.91,
        activeAlerts: 1,
        recommendations: [],
        incidents: [],
        auditEntries: [],
      },
    })

    expect(summary.headline).toContain('Workspace mode live')
    expect(summary.details[0]).toContain('Mail 1 messages')
    expect(summary.details[3]).toContain('12.4% CPU')
  })

  it('summarizes live chrono state into concise operator strings', () => {
    const summary = summarizeApexChrono({
      mode: 'live',
      stats: {
        totalJobs: 2,
        activeJobs: 1,
        completedJobs: 1,
        failedJobs: 0,
        totalBackups: 3,
        totalBackupBytes: 3 * 1024 * 1024 * 1024,
      },
      jobs: [
        {
          id: 'job-1',
          name: 'Workspace Snapshot',
          status: 'running',
          createdAt: '2026-04-18T00:00:00Z',
          lastRun: '2026-04-18T01:00:00Z',
          sourcePaths: ['C:\\repo'],
          destinationPath: 'D:\\backups',
          encryptionEnabled: true,
          compressionEnabled: true,
          retentionDays: 14,
          scheduleIntervalHours: 12,
          maxBackupSizeGb: 100,
          backups: [
            {
              id: 'backup-1',
              timestamp: '2026-04-18T01:00:00Z',
              sizeBytes: 1024,
              fileCount: 42,
              checksum: 'abc',
              status: 'completed',
            },
          ],
        },
      ],
    })

    expect(summary.headline).toContain('Chrono 1/2 active jobs')
    expect(summary.headline).toContain('3.0 GB')
    expect(summary.details[0]).toContain('Workspace Snapshot')
    expect(summary.details[1]).toContain('every 12h')
  })

  it('summarizes browser bridge state into concise operator strings', () => {
    const summary = summarizeApexBrowser({
      mode: 'live',
      renderMode: 'tui',
      activeSessionId: 'session-1',
      sessionCount: 1,
      privacy: {
        doNotTrack: true,
        blockThirdPartyCookies: true,
        clearOnExit: true,
        userHistoryPersisted: false,
        agentHistoryPersisted: true,
      },
      sessions: [
        {
          id: 'session-1',
          intent: 'preview',
          rationale: 'Check the app',
          requestedBy: 'user',
          recordHistory: false,
          title: 'Clock Demo',
          url: 'http://127.0.0.1:3000',
          state: 'complete',
          openedAt: '2026-04-18T00:00:00Z',
          updatedAt: '2026-04-18T00:00:01Z',
          excerpt: 'A clean clock preview.',
          statusCode: 200,
          loadTimeMs: 24,
          imageCount: 0,
          metadata: {
            description: 'Clock app',
            keywords: ['clock'],
            author: null,
            contentType: 'text/html',
          },
          links: [],
        },
      ],
    })

    expect(summary.headline).toContain('Private user session')
    expect(summary.headline).toContain('native tui preview')
    expect(summary.details[0]).toContain('redacted from shared status surfaces')
    expect(summary.details[2]).toContain('200')
  })

  it('summarizes tenant governance into concise operator strings', () => {
    const summary = summarizeApexTenantGovernance({
      totalDecisions: 12,
      ethicsPassed: 12,
      ethicsFailed: 0,
      avgConfidence: 0.93,
      avgRiskScore: 0.2,
      detectionEventCount: 4,
      telemetryScopeCount: 3,
      latestActivityAt: '2026-04-21T12:31:06Z',
      highRiskCalls: 1,
      criticalCalls: 0,
      pendingReviewCalls: 2,
      spendActionCount: 2,
      spendActionBreakdown: [
        { name: 'payments', count: 2 },
      ],
      operatorActionBreakdown: [
        { name: 'operator_runtime', count: 5 },
        { name: 'payments', count: 2 },
      ],
      governedActionBreakdown: [
        { name: 'payments', count: 2 },
        { name: 'email', count: 4 },
      ],
      governanceSignalBreakdown: [
        { name: 'policy_guard', count: 3 },
      ],
      reviewStatusBreakdown: [
        { name: 'approved', count: 10 },
      ],
      categoryBreakdown: [],
      topSources: [
        { name: 'apex-mail', count: 4 },
      ],
      topModels: [
        { name: 'q-oci-operator', count: 6 },
      ],
      narrative: 'Governed payment, email, and access actions are reconstructed into one audit lane.',
    })

    expect(summary.headline).toContain('Governed tenant actions 12')
    expect(summary.details[1]).toContain('Top operator action operator runtime')
    expect(summary.details[2]).toContain('Ethics passed 12')
    expect(summary.details[3]).toContain('Latest activity 2026-04-21T12:31:06Z')
  })

  it('builds a public-safe tenant governance summary without narrative leakage', () => {
    const summary = summarizePublicApexTenantGovernance({
      totalDecisions: 12,
      ethicsPassed: 12,
      ethicsFailed: 0,
      avgConfidence: 0.93,
      avgRiskScore: 0.2,
      detectionEventCount: 4,
      telemetryScopeCount: 3,
      latestActivityAt: '2026-04-21T12:31:06Z',
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
      topModels: [],
      narrative: 'This should stay out of the public-safe summary.',
    })

    expect(summary).toMatchObject({
      headline: expect.stringContaining('Governed tenant actions 12'),
      operatorActions: ['operator_runtime', 'payments'],
      governanceSignals: ['policy_guard'],
      latestActivityAt: '2026-04-21T12:31:06Z',
      status: 'ok',
    })
    expect(summary?.details.join(' ')).not.toContain(
      'This should stay out of the public-safe summary',
    )
    expect(summary?.details.join(' ')).not.toContain('apex-mail')
  })

  it('builds dedicated governed spend summaries for protected and public operator surfaces', () => {
    const protectedSummary = summarizeApexGovernedSpend({
      totalDecisions: 12,
      ethicsPassed: 12,
      ethicsFailed: 0,
      avgConfidence: 0.93,
      avgRiskScore: 0.2,
      detectionEventCount: 4,
      telemetryScopeCount: 3,
      latestActivityAt: '2026-04-21T12:31:06Z',
      highRiskCalls: 1,
      criticalCalls: 0,
      pendingReviewCalls: 2,
      spendActionCount: 3,
      spendActionBreakdown: [
        { name: 'payment_captured', count: 2 },
        { name: 'token_purchase_paid', count: 1 },
      ],
      operatorActionBreakdown: [{ name: 'operator_runtime', count: 5 }],
      governedActionBreakdown: [{ name: 'payments', count: 2 }],
      governanceSignalBreakdown: [{ name: 'policy_guard', count: 3 }],
      reviewStatusBreakdown: [],
      categoryBreakdown: [],
      topSources: [{ name: 'apex-billing', count: 3 }],
      topModels: [],
      narrative: 'Spend narrative should stay bounded.',
    })

    const publicSummary = summarizePublicApexGovernedSpend({
      totalDecisions: 12,
      ethicsPassed: 12,
      ethicsFailed: 0,
      avgConfidence: 0.93,
      avgRiskScore: 0.2,
      detectionEventCount: 4,
      telemetryScopeCount: 3,
      latestActivityAt: '2026-04-21T12:31:06Z',
      highRiskCalls: 1,
      criticalCalls: 0,
      pendingReviewCalls: 2,
      spendActionCount: 3,
      spendActionBreakdown: [
        { name: 'payment_captured', count: 2 },
        { name: 'token_purchase_paid', count: 1 },
      ],
      operatorActionBreakdown: [{ name: 'operator_runtime', count: 5 }],
      governedActionBreakdown: [{ name: 'payments', count: 2 }],
      governanceSignalBreakdown: [{ name: 'policy_guard', count: 3 }],
      reviewStatusBreakdown: [],
      categoryBreakdown: [],
      topSources: [{ name: 'apex-billing', count: 3 }],
      topModels: [],
      narrative: 'Spend narrative should stay bounded.',
    })

    expect(protectedSummary.headline).toContain('Governed spend actions 3')
    expect(protectedSummary.details[0]).toContain('payment captured')
    expect(publicSummary).toMatchObject({
      operatorActions: ['payment_captured', 'token_purchase_paid'],
      latestActivityAt: '2026-04-21T12:31:06Z',
      status: 'warning',
    })
  })

  it('keeps a bounded public governed spend lane visible when no spend actions were published', () => {
    const publicSummary = summarizePublicApexGovernedSpend({
      totalDecisions: 5,
      ethicsPassed: 5,
      ethicsFailed: 0,
      avgConfidence: 0.88,
      avgRiskScore: 0.4,
      detectionEventCount: 1,
      telemetryScopeCount: 2,
      latestActivityAt: '2026-04-22T12:14:20Z',
      highRiskCalls: 0,
      criticalCalls: 0,
      pendingReviewCalls: 1,
      spendActionCount: 0,
      spendActionBreakdown: [],
      operatorActionBreakdown: [
        { name: 'system_tuning', count: 3 },
        { name: 'operator_runtime', count: 1 },
      ],
      governedActionBreakdown: [{ name: 'host_posture', count: 3 }],
      governanceSignalBreakdown: [{ name: 'policy_guard', count: 1 }],
      reviewStatusBreakdown: [{ name: 'pending_review', count: 1 }],
      categoryBreakdown: [{ name: 'system', count: 3 }],
      topSources: [{ name: 'system_monitor', count: 2 }],
      topModels: [{ name: 'workspace_api_local', count: 5 }],
      narrative: 'No spend actions yet.',
    })

    expect(publicSummary).toMatchObject({
      headline: 'Apex governed spend review is active',
      operatorActions: [],
      latestActivityAt: '2026-04-22T12:14:20Z',
      status: 'info',
    })
    expect(publicSummary?.details[0]).toContain('No spend actions were published')
  })

  it('builds governance-driven operator recommendations for the Apex TUI', () => {
    const recommendations = buildApexGovernanceRecommendations({
      totalDecisions: 12,
      ethicsPassed: 9,
      ethicsFailed: 3,
      avgConfidence: 0.74,
      avgRiskScore: 0.8,
      detectionEventCount: 2,
      telemetryScopeCount: 4,
      latestActivityAt: '2026-04-22T12:14:20Z',
      highRiskCalls: 3,
      criticalCalls: 1,
      pendingReviewCalls: 4,
      spendActionCount: 0,
      spendActionBreakdown: [],
      operatorActionBreakdown: [
        { name: 'security_review', count: 3 },
        { name: 'system_tuning', count: 2 },
        { name: 'mail_triage', count: 2 },
        { name: 'store_update_review', count: 1 },
      ],
      governedActionBreakdown: [],
      governanceSignalBreakdown: [{ name: 'policy_guard', count: 1 }],
      reviewStatusBreakdown: [{ name: 'pending_review', count: 4 }],
      categoryBreakdown: [],
      topSources: [
        { name: 'security_center', count: 3 },
        { name: 'app_store', count: 1 },
      ],
      topModels: [{ name: 'workspace_api_local', count: 12 }],
      narrative: 'Governed operator recommendations ready.',
    })

    expect(recommendations).toEqual([
      expect.objectContaining({ id: 'security', tab: 'Security' }),
      expect.objectContaining({ id: 'system', tab: 'System' }),
      expect.objectContaining({ id: 'mail', tab: 'Mail' }),
      expect.objectContaining({ id: 'store', tab: 'Store' }),
    ])
  })

  it('anchors the default tenant governance mirror to the OpenJaws repo root', () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

    expect(getApexTenantGovernanceMirrorPath()).toBe(
      join(repoRoot, 'docs', 'wiki', 'Apex-Tenant-Governance.json'),
    )
  })

  it('prefers explicit tenant governance mirror overrides', () => {
    expect(
      getApexTenantGovernanceMirrorPath(
        'D:\\openjaws\\OpenJaws',
        {
          OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE:
            'C:\\ops\\Apex-Tenant-Governance.json',
        } as NodeJS.ProcessEnv,
      ),
    ).toBe('C:\\ops\\Apex-Tenant-Governance.json')
  })

  it('reads a mirrored tenant governance summary when present', () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-apex-governance-mirror-'))
    const mirrorPath = join(root, 'Apex-Tenant-Governance.json')
    try {
      writeFileSync(
        mirrorPath,
        `${JSON.stringify({
          totalDecisions: 7,
          ethicsPassed: 7,
          ethicsFailed: 0,
          avgConfidence: 0.91,
          avgRiskScore: 0.3,
          detectionEventCount: 2,
          telemetryScopeCount: 2,
          latestActivityAt: '2026-04-21T21:10:00Z',
          highRiskCalls: 1,
          criticalCalls: 0,
          pendingReviewCalls: 1,
          spendActionCount: 2,
          spendActionBreakdown: [{ name: 'payments', count: 2 }],
          operatorActionBreakdown: [{ name: 'operator_runtime', count: 4 }],
          governedActionBreakdown: [{ name: 'payments', count: 2 }],
          governanceSignalBreakdown: [{ name: 'policy_guard', count: 2 }],
          reviewStatusBreakdown: [{ name: 'approved', count: 6 }],
          categoryBreakdown: [{ name: 'payments', count: 2 }],
          topSources: [{ name: 'apex-mail', count: 3 }],
          topModels: [{ name: 'q-oci-operator', count: 4 }],
          narrative: 'Mirror summary ready.',
        }, null, 2)}\n`,
        'utf8',
      )

      expect(readApexTenantGovernanceMirror(mirrorPath)).toMatchObject({
        totalDecisions: 7,
        latestActivityAt: '2026-04-21T21:10:00Z',
        operatorActionBreakdown: [{ name: 'operator_runtime', count: 4 }],
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('falls back to the mirrored tenant governance summary when live auth is unavailable', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-apex-governance-fallback-'))
    const mirrorPath = join(root, 'Apex-Tenant-Governance.json')
    const stateDir = join(tmpdir(), 'openjaws-apex')
    const statePath = join(stateDir, 'workspace-api-state.json')
    const originalMirrorPath = process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
    const originalAccessToken = process.env.OPENJAWS_SESSION_ACCESS_TOKEN
    const originalFd = process.env.OPENJAWS_WEBSOCKET_AUTH_FILE_DESCRIPTOR
    const originalTokenFile = process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE
    const originalCachedToken = getSessionIngressToken()
    const originalState = existsSync(statePath)
      ? readFileSync(statePath, 'utf8')
      : null
    try {
      writeFileSync(
        mirrorPath,
        `${JSON.stringify({
          totalDecisions: 5,
          ethicsPassed: 5,
          ethicsFailed: 0,
          avgConfidence: 0.88,
          avgRiskScore: 0.4,
          detectionEventCount: 1,
          telemetryScopeCount: 1,
          latestActivityAt: '2026-04-21T22:05:00Z',
          highRiskCalls: 0,
          criticalCalls: 0,
          pendingReviewCalls: 1,
          spendActionCount: 0,
          spendActionBreakdown: [],
          operatorActionBreakdown: [{ name: 'operator_runtime', count: 3 }],
          governedActionBreakdown: [{ name: 'email', count: 2 }],
          governanceSignalBreakdown: [{ name: 'policy_guard', count: 1 }],
          reviewStatusBreakdown: [{ name: 'approved', count: 5 }],
          categoryBreakdown: [],
          topSources: [{ name: 'apex-mail', count: 2 }],
          topModels: [{ name: 'q-oci-operator', count: 3 }],
          narrative: 'Fallback summary ready.',
        }, null, 2)}\n`,
        'utf8',
      )
      process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = mirrorPath
      process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = join(
        root,
        'missing-session-ingress-token.txt',
      )
      rmSync(statePath, { force: true })
      delete process.env.OPENJAWS_SESSION_ACCESS_TOKEN
      delete process.env.OPENJAWS_WEBSOCKET_AUTH_FILE_DESCRIPTOR
      setSessionIngressToken(null)

      await expect(getApexTenantGovernanceSummary()).resolves.toMatchObject({
        totalDecisions: 5,
        pendingReviewCalls: 1,
        latestActivityAt: '2026-04-21T22:05:00Z',
      })
    } finally {
      if (originalMirrorPath) {
        process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = originalMirrorPath
      } else {
        delete process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
      }
      if (originalTokenFile) {
        process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = originalTokenFile
      } else {
        delete process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE
      }
      if (originalAccessToken) {
        process.env.OPENJAWS_SESSION_ACCESS_TOKEN = originalAccessToken
      } else {
        delete process.env.OPENJAWS_SESSION_ACCESS_TOKEN
      }
      if (originalFd) {
        process.env.OPENJAWS_WEBSOCKET_AUTH_FILE_DESCRIPTOR = originalFd
      } else {
        delete process.env.OPENJAWS_WEBSOCKET_AUTH_FILE_DESCRIPTOR
      }
      setSessionIngressToken(originalCachedToken ?? null)
      if (originalState !== null) {
        mkdirSync(stateDir, { recursive: true })
        writeFileSync(statePath, originalState, 'utf8')
      } else {
        rmSync(statePath, { force: true })
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('prefers the workspace_api governance summary and seeds the mirror from it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'openjaws-apex-governance-local-'))
    const mirrorPath = join(root, 'Apex-Tenant-Governance.json')
    const stateDir = join(tmpdir(), 'openjaws-apex')
    const statePath = join(stateDir, 'workspace-api-state.json')
    const originalMirrorPath = process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
    const originalTokenFile = process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE
    const originalFetch = globalThis.fetch
    const originalCachedToken = getSessionIngressToken()
    const originalState = existsSync(statePath)
      ? readFileSync(statePath, 'utf8')
      : null

    try {
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(
        statePath,
        `${JSON.stringify({
          pid: process.pid,
          startedAt: '2026-04-22T00:00:00Z',
          token: 'apex-test-token',
          workspaceApiUrl: 'http://127.0.0.1:8797',
        }, null, 2)}\n`,
        'utf8',
      )
      process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = mirrorPath
      process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = join(
        root,
        'missing-session-ingress-token.txt',
      )
      delete process.env.OPENJAWS_SESSION_ACCESS_TOKEN
      delete process.env.OPENJAWS_WEBSOCKET_AUTH_FILE_DESCRIPTOR
      setSessionIngressToken(null)

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/api/v1/governance/summary')) {
          expect(init?.headers).toMatchObject({
            'x-openjaws-apex-token': 'apex-test-token',
          })
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                totalDecisions: 9,
                ethicsPassed: 9,
                ethicsFailed: 0,
                avgConfidence: 0.9,
                avgRiskScore: 0.22,
                detectionEventCount: 3,
                telemetryScopeCount: 4,
                latestActivityAt: '2026-04-22T00:05:00Z',
                highRiskCalls: 1,
                criticalCalls: 0,
                pendingReviewCalls: 2,
                spendActionCount: 0,
                spendActionBreakdown: [],
                operatorActionBreakdown: [{ name: 'security_review', count: 3 }],
                governedActionBreakdown: [{ name: 'security_controls', count: 3 }],
                governanceSignalBreakdown: [{ name: 'policy_guard', count: 1 }],
                reviewStatusBreakdown: [{ name: 'approved', count: 7 }],
                categoryBreakdown: [{ name: 'security', count: 3 }],
                topSources: [{ name: 'workspace_api_local', count: 9 }],
                topModels: [{ name: 'workspace_api_local', count: 9 }],
                narrative: 'Local bridge governance summary ready.',
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        throw new Error(`Unexpected fetch ${url}`)
      }) as typeof fetch

      await expect(getApexTenantGovernanceSummary()).resolves.toMatchObject({
        totalDecisions: 9,
        pendingReviewCalls: 2,
        latestActivityAt: '2026-04-22T00:05:00Z',
      })
      expect(readApexTenantGovernanceMirror(mirrorPath)).toMatchObject({
        totalDecisions: 9,
        narrative: 'Local bridge governance summary ready.',
      })
    } finally {
      globalThis.fetch = originalFetch
      if (originalMirrorPath) {
        process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = originalMirrorPath
      } else {
        delete process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
      }
      if (originalTokenFile) {
        process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE = originalTokenFile
      } else {
        delete process.env.CLAUDE_SESSION_INGRESS_TOKEN_FILE
      }
      if (originalState !== null) {
        writeFileSync(statePath, originalState, 'utf8')
      } else {
        rmSync(statePath, { force: true })
      }
      delete process.env.OPENJAWS_SESSION_ACCESS_TOKEN
      delete process.env.OPENJAWS_WEBSOCKET_AUTH_FILE_DESCRIPTOR
      setSessionIngressToken(originalCachedToken ?? null)
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reads and summarizes workspace_api settings through the trusted sidecar state', async () => {
    const stateDir = join(tmpdir(), 'openjaws-apex')
    const statePath = join(stateDir, 'workspace-api-state.json')
    const originalFetch = globalThis.fetch
    const originalState = existsSync(statePath)
      ? readFileSync(statePath, 'utf8')
      : null
    try {
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(
        statePath,
        `${JSON.stringify({
          pid: process.pid,
          startedAt: '2026-04-24T00:00:00Z',
          token: 'apex-settings-token',
          workspaceApiUrl: 'http://127.0.0.1:8797',
        }, null, 2)}\n`,
        'utf8',
      )

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain('/api/v1/settings/summary')
        expect(init?.headers).toMatchObject({
          'x-openjaws-apex-token': 'apex-settings-token',
        })
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              settings: {
                security: {
                  enableRealtimeMonitoring: true,
                  blockSuspiciousActivity: true,
                  requirePasswordForSettings: true,
                  autoLockTimeoutMinutes: 15,
                  enableFirewall: true,
                  enableAntivirus: true,
                },
                performance: {
                  maxCpuUsagePercent: 80,
                  maxMemoryUsageMb: 4096,
                  enableHardwareAcceleration: true,
                  vsyncEnabled: true,
                  targetFps: 60,
                },
                privacy: {
                  enablePrivacyMode: true,
                  blockTrackingCookies: true,
                  disableTelemetry: true,
                  encryptUserData: true,
                  macAddressRandomization: true,
                },
                users: {
                  currentUser: 'operator',
                  theme: 'dark',
                  language: 'en-US',
                  timezone: 'America/New_York',
                  dateFormat: 'YYYY-MM-DD',
                },
              },
              hasUnsavedChanges: false,
            },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        )
      }) as typeof fetch

      const summary = await getApexSettingsSummary()
      expect(summary).toMatchObject({
        hasUnsavedChanges: false,
        settings: {
          privacy: {
            disableTelemetry: true,
          },
          users: {
            theme: 'dark',
          },
        },
      })
      expect(summarizeApexSettings(summary).headline).toContain('telemetry off')
      expect(summarizeApexSettings(summary).details[0]).toContain('firewall on')
    } finally {
      globalThis.fetch = originalFetch
      if (originalState !== null) {
        writeFileSync(statePath, originalState, 'utf8')
      } else {
        rmSync(statePath, { force: true })
      }
    }
  })

  it('updates and resets Apex settings through the trusted workspace_api actions', async () => {
    const stateDir = join(tmpdir(), 'openjaws-apex')
    const statePath = join(stateDir, 'workspace-api-state.json')
    const originalFetch = globalThis.fetch
    const originalState = existsSync(statePath)
      ? readFileSync(statePath, 'utf8')
      : null
    const settings = {
      security: {
        enableRealtimeMonitoring: true,
        blockSuspiciousActivity: true,
        requirePasswordForSettings: true,
        autoLockTimeoutMinutes: 15,
        enableFirewall: true,
        enableAntivirus: true,
      },
      performance: {
        maxCpuUsagePercent: 80,
        maxMemoryUsageMb: 4096,
        enableHardwareAcceleration: false,
        vsyncEnabled: true,
        targetFps: 60,
      },
      privacy: {
        enablePrivacyMode: true,
        blockTrackingCookies: true,
        disableTelemetry: true,
        encryptUserData: true,
        macAddressRandomization: true,
      },
      users: {
        currentUser: 'operator',
        theme: 'dark',
        language: 'en-US',
        timezone: 'America/New_York',
        dateFormat: 'YYYY-MM-DD',
      },
    }
    const seenPaths: string[] = []

    try {
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(
        statePath,
        `${JSON.stringify({
          pid: process.pid,
          startedAt: '2026-04-24T00:00:00Z',
          token: 'apex-settings-token',
          workspaceApiUrl: 'http://127.0.0.1:8797',
        }, null, 2)}\n`,
        'utf8',
      )

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        seenPaths.push(new URL(url).pathname)
        expect(init?.headers).toMatchObject({
          'x-openjaws-apex-token': 'apex-settings-token',
        })
        if (url.includes('/api/v1/settings/update')) {
          expect(init?.method).toBe('POST')
          expect(JSON.parse(String(init?.body))).toMatchObject({
            settings: {
              privacy: {
                disableTelemetry: true,
              },
            },
          })
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                message: 'Saved Apex system settings',
                settings,
                hasUnsavedChanges: false,
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        if (url.includes('/api/v1/settings/reset')) {
          expect(init?.method).toBe('POST')
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                message: 'Reset Apex system settings to defaults',
                settings,
                hasUnsavedChanges: false,
              },
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          )
        }
        throw new Error(`Unexpected fetch ${url}`)
      }) as typeof fetch

      await expect(updateApexSettings({ settings })).resolves.toMatchObject({
        ok: true,
        message: 'Saved Apex system settings',
        data: {
          hasUnsavedChanges: false,
        },
      })
      await expect(resetApexSettings()).resolves.toMatchObject({
        ok: true,
        message: 'Reset Apex system settings to defaults',
      })
      expect(seenPaths).toEqual([
        '/api/v1/settings/update',
        '/api/v1/settings/reset',
      ])
    } finally {
      globalThis.fetch = originalFetch
      if (originalState !== null) {
        writeFileSync(statePath, originalState, 'utf8')
      } else {
        rmSync(statePath, { force: true })
      }
    }
  })
})
