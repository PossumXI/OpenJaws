import { describe, expect, it } from 'bun:test'
import {
  APEX_PROJECT_ROOT,
  buildWindowsApexLaunchCommand,
  summarizeApexBrowser,
  getApexLaunchTarget,
  getApexLaunchTargets,
  summarizeApexChrono,
  summarizeApexWorkspace,
} from './apexWorkspace.js'

describe('apexWorkspace', () => {
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

    expect(summary.headline).toContain('Clock Demo')
    expect(summary.headline).toContain('tui')
    expect(summary.details[2]).toContain('not persisted')
  })
})
