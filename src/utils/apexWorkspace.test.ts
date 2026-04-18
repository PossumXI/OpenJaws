import { describe, expect, it } from 'bun:test'
import {
  APEX_PROJECT_ROOT,
  buildWindowsApexLaunchCommand,
  getApexLaunchTarget,
  getApexLaunchTargets,
  summarizeApexWorkspace,
} from './apexWorkspace.js'

describe('apexWorkspace', () => {
  it('registers the guarded workspace bridge and native app targets', () => {
    const targets = getApexLaunchTargets()
    expect(targets.some(target => target.id === 'workspace_api')).toBe(true)
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
})
