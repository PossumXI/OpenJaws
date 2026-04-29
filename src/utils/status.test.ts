import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  buildAgentCoworkProperties,
  buildApexWorkspaceProperties,
  buildBrowserPreviewProperties,
  buildDiscordQAgentProperties,
  buildImmaculateGuidanceProperties,
  buildImmaculateTraceProperties,
  buildQTraceProperties,
  buildProviderProbeProperties,
  buildProviderGuidanceProperties,
} from './status.js'
import type { ApexOperatorActivityReceipt } from './apexOperatorActivity.js'

const OCI_ENV_VARS = [
  'OCI_CONFIG_FILE',
  'OCI_PROFILE',
  'OCI_COMPARTMENT_ID',
  'OCI_GENAI_PROJECT_ID',
  'OCI_REGION',
  'Q_MODEL',
  'OCI_MODEL',
  'Q_API_KEY',
  'OCI_API_KEY',
  'OCI_GENAI_API_KEY',
] as const

const originalEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of OCI_ENV_VARS) {
    originalEnv.set(name, process.env[name])
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of OCI_ENV_VARS) {
    const value = originalEnv.get(name)
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
  originalEnv.clear()
})

describe('buildProviderGuidanceProperties', () => {
  test('always includes provider switching guidance', () => {
    expect(buildProviderGuidanceProperties(null)).toEqual([
      {
        label: 'Provider switch',
        value: [
          '/provider status',
          '/provider use <provider> <model>',
          '/provider test [provider] [model]',
          'Settings > Config > Model',
        ],
      },
    ])
  })

  test('adds missing-key guidance for active external providers', () => {
    expect(
      buildProviderGuidanceProperties({
        provider: 'openai',
        label: 'OpenAI',
        apiKeySource: null,
      }),
    ).toEqual([
      {
        label: 'Provider switch',
        value: [
          '/provider status',
          '/provider use <provider> <model>',
          '/provider test [provider] [model]',
          'Settings > Config > Model',
        ],
      },
      {
        label: 'OpenAI setup',
        value: [
          '/provider key openai <api-key>',
          '/provider test openai <model>',
          '/provider base-url openai <url>',
          'env OPENAI_API_KEY',
          'settings.llmProviders.openai.apiKey',
        ],
      },
    ])
  })

  test('adds OCI setup guidance for Q on OCI', () => {
    expect(
      buildProviderGuidanceProperties({
        provider: 'oci',
        label: 'OCI',
        apiKeySource: null,
      }),
    ).toEqual([
      {
        label: 'Provider switch',
        value: [
          '/provider status',
          '/provider use <provider> <model>',
          '/provider test [provider] [model]',
          'Settings > Config > Model',
        ],
      },
      {
        label: 'OCI setup',
        value: [
          '/provider key oci <api-key>',
          '/provider test oci <model>',
          '/provider base-url oci <url>',
          'env Q_API_KEY / OCI_API_KEY / OCI_GENAI_API_KEY',
          'OCI IAM: OCI_CONFIG_FILE / OCI_PROFILE / OCI_COMPARTMENT_ID / OCI_GENAI_PROJECT_ID',
        ],
      },
    ])
  })

  test('adds ollama setup guidance without requiring an api key', () => {
    expect(
      buildProviderGuidanceProperties({
        provider: 'ollama',
        label: 'Ollama',
        apiKeySource: null,
      }),
    ).toEqual([
      {
        label: 'Provider switch',
        value: [
          '/provider status',
          '/provider use <provider> <model>',
          '/provider test [provider] [model]',
          'Settings > Config > Model',
        ],
      },
      {
        label: 'Ollama setup',
        value: [
          '/provider use ollama <model>',
          '/provider test ollama <model>',
          '/provider base-url ollama <url>',
          'env OLLAMA_BASE_URL',
          'env OPENJAWS_OLLAMA_Q_BASE_URL / OLLAMA_Q_BASE_URL for ollama:q',
          'settings override: llmModelOverrides.ollama:q.baseURL wins over env',
        ],
      },
    ])
  })
})

describe('buildProviderProbeProperties', () => {
  test('returns no probe properties when the active model does not match the probe', () => {
    expect(
      buildProviderProbeProperties(
        {
          rawModel: 'oci:Q',
          provider: 'oci',
          model: 'Q',
          label: 'OCI',
          source: 'prefix',
          apiKey: 'sk-test',
          apiKeySource: 'settings.llmProviders.oci.apiKey',
          baseURL: 'https://example.com/openai/v1',
          baseURLSource: null,
          headers: {},
        },
        {
          ok: true,
          code: 'ok',
          provider: 'openai',
          label: 'OpenAI',
          model: 'gpt-5.4',
          modelRef: 'openai:gpt-5.4',
          baseURL: 'https://api.openai.com/v1',
          baseURLSource: null,
          apiKeySource: 'OPENAI_API_KEY',
          endpoint: 'https://api.openai.com/v1/models',
          endpointLabel: '/models',
          method: 'GET',
          checkedAt: 1,
          httpStatus: 200,
          modelCount: 10,
          summary: 'OpenAI:gpt-5.4 reachable · /models · 200 · 10 models',
        },
      ),
    ).toEqual([])
  })

  test('surfaces the latest matching reachability receipt', () => {
    expect(
      buildProviderProbeProperties(
        {
          rawModel: 'oci:Q',
          provider: 'oci',
          model: 'Q',
          label: 'OCI',
          source: 'prefix',
          apiKey: 'sk-test',
          apiKeySource: 'settings.llmProviders.oci.apiKey',
          baseURL: 'https://example.com/openai/v1',
          baseURLSource: null,
          headers: {},
        },
        {
          ok: false,
          code: 'auth_failed',
          provider: 'oci',
          label: 'OCI',
          model: 'Q',
          modelRef: 'oci:Q',
          baseURL: 'https://example.com/openai/v1',
          baseURLSource: null,
          apiKeySource: 'settings.llmProviders.oci.apiKey',
          endpoint: 'https://example.com/openai/v1/responses',
          endpointLabel: '/responses',
          method: 'POST',
          checkedAt: 1,
          httpStatus: 401,
          detail: 'The provider rejected the configured key or auth headers.',
          summary: 'OCI:Q failed · auth rejected (401)',
        },
      ),
    ).toEqual([
      {
        label: 'OCI reachability',
        value: [
          'failed',
          '/responses',
          'HTTP 401',
          'settings.llmProviders.oci.apiKey',
        ],
      },
      {
        label: 'OCI probe detail',
        value: 'The provider rejected the configured key or auth headers.',
      },
    ])
  })
})

describe('buildImmaculateGuidanceProperties', () => {
  test('returns no guidance when immaculate is disabled', () => {
    expect(buildImmaculateGuidanceProperties(null, false)).toEqual([])
  })

  test('adds recovery guidance when harness is offline', () => {
    expect(
      buildImmaculateGuidanceProperties(
        {
          enabled: true,
          reachable: false,
          harnessUrl: 'https://immaculate.example.com',
          loopback: false,
          apiKeySource: undefined,
        },
        true,
      ),
    ).toEqual([
      {
        label: 'Immaculate control',
        value: [
          '/immaculate status',
          '/immaculate topology',
          'IMMACULATE_HARNESS_URL / immaculate.harnessUrl',
        ],
      },
      {
        label: 'Immaculate recovery',
        value: [
          'start harness or update URL',
          'https://immaculate.example.com',
          'configure immaculate.apiKeyEnv or immaculate.apiKey',
        ],
      },
    ])
  })
})

describe('buildDiscordQAgentProperties', () => {
  test('surfaces patrol, routing, and voice receipts from the shared Q_agent state file', () => {
    expect(
      buildDiscordQAgentProperties({
        version: 1,
        updatedAt: '2026-04-15T10:00:00.000Z',
        startedAt: '2026-04-15T09:00:00.000Z',
        status: 'ready',
        backend: 'Q backend: oci:Q via OCI bearer auth',
        guilds: [{ id: 'guild-1', name: 'Arobi' }],
        gateway: {
          connected: true,
          userId: 'bot-user-1',
          readyAt: '2026-04-15T09:00:10.000Z',
          lastHeartbeatAt: '2026-04-15T10:00:00.000Z',
          lastSequence: 42,
          guildCount: 1,
          lastMessageAt: '2026-04-15T09:59:00.000Z',
          lastReplyAt: '2026-04-15T09:59:01.000Z',
        },
        schedule: {
          enabled: true,
          intervalMs: 900_000,
          cycleCount: 5,
          lastStartedAt: '2026-04-15T09:55:00.000Z',
          lastCompletedAt: '2026-04-15T09:55:02.000Z',
          nextRunAt: '2026-04-15T10:10:00.000Z',
          lastSummary: '1 patrol post sent',
          lastError: null,
        },
        routing: {
          lastDecision: 'posted patrol digest -> #q-command-station',
          lastPostedChannelName: 'q-command-station',
          lastPostedReason: 'patrol digest after state change',
          channels: [
            {
              id: 'command_station',
              label: 'Q command station',
              channelNames: ['q-command-station'],
              purpose: 'operator patrols',
              cooldownMs: 1_800_000,
              voiceEnabled: true,
              lastPostedAt: '2026-04-15T09:55:02.000Z',
              lastVoicePostedAt: '2026-04-15T09:55:02.000Z',
              lastReason: 'patrol digest after state change',
              lastSummary: 'Blackbeak checking in',
            },
            {
              id: 'updates',
              label: 'OpenJaws updates',
              channelNames: ['openjaws-updates'],
              purpose: 'updates',
              cooldownMs: 1_200_000,
              voiceEnabled: false,
            },
            {
              id: 'training',
              label: 'Q training lab',
              channelNames: ['q-training-lab'],
              purpose: 'training',
              cooldownMs: 600_000,
              voiceEnabled: false,
            },
          ],
        },
        voice: {
          enabled: true,
          provider: 'elevenlabs',
          ready: true,
          connected: true,
          voiceId: 'voice-1',
          voiceIdSource: 'ELEVENLABS_VOICE_ID',
          modelId: 'eleven_flash_v2_5',
          channelName: 'viola-lounge',
          lastRenderedAt: '2026-04-15T09:55:02.000Z',
          lastSpokenText: 'Blackbeak checking in',
          lastChannelName: 'q-command-station',
          lastError: null,
        },
        patrol: {
          lastStartedAt: '2026-04-15T09:55:00.000Z',
          lastCompletedAt: '2026-04-15T09:55:02.000Z',
          lastSummary: '1 patrol post sent',
          lastError: null,
          snapshot: {
            harnessReachable: true,
            harnessSummary: 'Immaculate online',
            deckSummary: 'cycle 12 · 6 nodes',
            workerSummary: '2 workers · 2 healthy',
            trainingSummary: 'run-1 · running · hybrid',
            hybridSummary: 'session-1 · running',
            routeQueueSummary: 'queued',
            queueLength: 1,
            recommendedLayerId: 'layer-1',
          },
        },
        knowledge: {
          enabled: true,
          ready: true,
          rootLabel: 'Asgard',
          generatedAt: '2026-04-15T09:54:00.000Z',
          fileCount: 412,
          chunkCount: 412,
          lastQueryAt: '2026-04-15T09:56:00.000Z',
          lastQuerySummary: 'queried 4 ranked snippets',
          lastError: null,
        },
        operator: {
          operatorLabel: 'PossumX',
          lastAction: 'start-openjaws',
          lastCompletedAt: '2026-04-15T09:57:00.000Z',
          lastSummary: 'OpenJaws launched in D:\\repo',
          lastError: null,
          activeProcessPid: 4242,
          activeProcessCwd: 'D:\\repo',
          activeProcessStartedAt: '2026-04-15T09:57:00.000Z',
        },
        events: [],
      }),
    ).toEqual([
      {
        label: 'Q_agent',
        value: [
          'ready',
          'Q backend: oci:Q via OCI bearer auth',
          'gateway online',
          '1 guild',
        ],
      },
      {
        label: 'Q gateway',
        value: [
          'user bot-user-1',
          'ready 2026-04-15T09:00:10.000Z',
          'heartbeat 2026-04-15T10:00:00.000Z',
          'reply 2026-04-15T09:59:01.000Z',
        ],
      },
      {
        label: 'Q patrol',
        value: ['every 15m', '1 patrol post sent', 'next 2026-04-15T10:10:00.000Z'],
      },
      {
        label: 'Q routing',
        value: [
          'posted patrol digest -> #q-command-station',
          'Q command station 2026-04-15T09:55:02.000Z',
          'OpenJaws updates idle',
          'Q training lab idle',
        ],
      },
      {
        label: 'Q voice',
        value: [
          'enabled',
          'provider elevenlabs',
          'ready',
          'connected',
          'voice-1',
          'eleven_flash_v2_5',
          'live viola-lounge',
        ],
      },
      {
        label: 'Q knowledge',
        value: ['enabled', 'ready', 'Asgard', '412 files', 'queried 4 ranked snippets'],
      },
      {
        label: 'Q operator',
        value: [
          'PossumX',
          'start-openjaws',
          'Q is opening a bounded OpenJaws workspace in repo through the supervised OCI-backed Discord operator lane.',
          'pid 4.2k',
          'D:\\repo',
        ],
      },
    ])
  })
})

describe('buildApexWorkspaceProperties', () => {
  test('surfaces Apex bridge health, ready roots, and workspace summary', () => {
    expect(
      buildApexWorkspaceProperties(
        {
          configured: true,
          projectRootExists: true,
          notificationsRootExists: true,
          argusRootExists: false,
          availableTargetCount: 9,
          envHints: [
            'OPENJAWS_APEX_ROOT',
            'OPENJAWS_APEX_ASGARD_ROOT',
          ],
        },
        {
          status: 'ok',
          service: 'apex-workspace-api',
          version: '0.2.0',
          timestamp: '2026-04-18T20:00:00.000Z',
        },
        {
          mode: 'live',
          mail: {
            accountCount: 2,
            securityAlertCount: 1,
            messages: [],
            outbox: { pending: 0, failed: 0, sent: 2 },
          },
          chat: {
            conversations: [],
            statistics: {
              totalSessions: 2,
              totalContacts: 4,
              totalMessages: 16,
              activeSessions: 1,
            },
          },
          store: {
            featuredCount: 2,
            installedCount: 5,
            updateCount: 1,
            apps: [],
          },
          system: {
            healthScore: 0.83,
            metrics: {
              timestamp: '2026-04-18T20:00:00.000Z',
              cpuUsage: 11.2,
              memoryUsage: 44.4,
              processCount: 121,
              uptime: 10_000,
            },
            services: [],
            alerts: [],
          },
          security: {
            overallHealth: 0.92,
            activeAlerts: 1,
            recommendations: [],
            incidents: [],
            auditEntries: [],
          },
        },
        null,
        null,
        {
          status: 'ok',
          service: 'chrono-bridge',
          version: '0.2.0',
          timestamp: '2026-04-18T20:00:00.000Z',
        },
        {
          mode: 'live',
          stats: {
            totalJobs: 3,
            activeJobs: 1,
            completedJobs: 2,
            failedJobs: 0,
            totalBackups: 5,
            totalBackupBytes: 2 * 1024 * 1024 * 1024,
          },
          jobs: [
            {
              id: 'job-1',
              name: 'Workspace Snapshot',
              status: 'running',
              createdAt: '2026-04-18T19:00:00.000Z',
              lastRun: '2026-04-18T20:00:00.000Z',
              sourcePaths: ['D:\\openjaws\\OpenJaws'],
              destinationPath: 'D:\\backups',
              encryptionEnabled: true,
              compressionEnabled: true,
              retentionDays: 30,
              scheduleIntervalHours: 24,
              maxBackupSizeGb: 100,
              backups: [
                {
                  id: 'backup-1',
                  timestamp: '2026-04-18T20:00:00.000Z',
                  sizeBytes: 1024,
                  fileCount: 12,
                  checksum: 'abc',
                  status: 'completed',
                },
              ],
            },
          ],
        },
      ),
    ).toEqual([
      {
        label: 'Apex workspace',
        value: [
          'bridge online',
          '9 targets',
          'kernel/apps ready',
          'notifications ready',
          'argus missing',
        ],
      },
      {
        label: 'Apex summary',
        value: [
          'Workspace mode live · system 83% · security 92%',
          'security 1 active alert',
          'Mail 0 messages · 2 accounts · 1 alerts',
          'Chat 1/2 active sessions · 16 messages',
          'Store 5 installed · 1 updates',
        ],
      },
      {
        label: 'Apex posture',
        value: [
          'system 83%',
          'security 92%',
          '0 host alerts · 1 security alert',
          '0 degraded services · 0 incidents',
          '0 recommendations',
        ],
      },
      {
        label: 'Apex chrono',
        value: [
          'bridge online',
          'Chrono 1/3 active jobs · 2.0 GB across 5 backups',
          'Workspace Snapshot · running · D:\\backups',
          '1 backup · every 24h · retain 30d',
        ],
      },
      {
        label: 'Apex browser',
        value: [
          'bridge offline',
          'Browser bridge offline',
          'Start the browser bridge to keep native web previews inside the OpenJaws TUI instead of launching an external browser.',
        ],
      },
    ])
  })

  test('surfaces governed operator actions when tenant governance is available', () => {
    expect(
      buildApexWorkspaceProperties(
        {
          configured: true,
          projectRootExists: true,
          notificationsRootExists: true,
          argusRootExists: true,
          availableTargetCount: 9,
          envHints: [],
        },
        {
          status: 'ok',
          service: 'apex-workspace-api',
          version: '0.2.0',
          timestamp: '2026-04-21T20:00:00.000Z',
        },
        {
          mode: 'live',
          mail: {
            accountCount: 1,
            securityAlertCount: 0,
            messages: [],
            outbox: { pending: 0, failed: 0, sent: 1 },
          },
          chat: {
            conversations: [],
            statistics: {
              totalSessions: 1,
              totalContacts: 2,
              totalMessages: 8,
              activeSessions: 1,
            },
          },
          store: {
            featuredCount: 1,
            installedCount: 2,
            updateCount: 0,
            apps: [],
          },
          system: {
            healthScore: 0.9,
            metrics: {
              timestamp: '2026-04-21T20:00:00.000Z',
              cpuUsage: 9,
              memoryUsage: 40,
              processCount: 100,
              uptime: 1000,
            },
            services: [],
            alerts: [],
          },
          security: {
            overallHealth: 0.95,
            activeAlerts: 0,
            recommendations: [],
            incidents: [],
            auditEntries: [],
          },
        },
        {
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
          ],
          governedActionBreakdown: [
            { name: 'payments', count: 2 },
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
          narrative: 'Governed operator actions are live.',
        },
        {
          version: 1,
          updatedAt: '2026-04-21T12:32:00.000Z',
          lastActivityId: 'activity-1',
          activities: [
            {
              id: 'activity-1',
              timestamp: '2026-04-21T12:32:00.000Z',
              app: 'store',
              action: 'install_app',
              status: 'ok',
              summary: 'Installed the bounded Apex mail client package.',
              operatorActions: ['app_store_install'],
              artifacts: ['apex:store-install'],
            },
          ],
        } satisfies ApexOperatorActivityReceipt,
      ),
    ).toEqual([
      {
        label: 'Apex workspace',
        value: [
          'bridge online',
          '9 targets',
          'kernel/apps ready',
          'notifications ready',
          'argus ready',
        ],
      },
      {
        label: 'Apex summary',
        value: [
          'Workspace mode live · system 90% · security 95%',
          'security 0 active alerts',
          'Mail 0 messages · 1 accounts · 0 alerts',
          'Chat 1/1 active sessions · 8 messages',
          'Store 2 installed · 0 updates',
        ],
      },
      {
        label: 'Apex governance',
        value: [
          'Governed tenant actions 12 · pending 2 · high risk 1',
          'Confidence 0.93 · avg risk 0.2 · detections 4',
          'Top operator action operator runtime · top signal policy guard · review approved',
          'Ethics passed 12 · failed 0 · telemetry scopes 3',
        ],
      },
      {
        label: 'Apex spend lane',
        value: [
          'Governed spend actions 2 · pending 2 · high risk 1',
          'Top spend action payments · tracked labels 1',
          'Signals policy guard',
        ],
      },
      {
        label: 'Apex governance recommendations',
        value: [
          'Inspect System posture · 1 high-pressure signal · source apex-mail',
          'Triage governed Mail pressure · 4 mail-side signals · detections 4',
        ],
      },
      {
        label: 'Apex recent actions',
        value: [
          'App Store install app · ok',
          'Installed the bounded Apex mail client package.',
          '2026-04-21T12:32:00.000Z',
        ],
      },
      {
        label: 'Apex posture',
        value: [
          'system 90%',
          'security 95%',
          '0 host alerts · 0 security alerts',
          '0 degraded services · 0 incidents',
          '0 recommendations',
        ],
      },
      {
        label: 'Apex chrono',
        value: [
          'bridge offline',
          'Chrono bridge offline',
          'Start the Chrono bridge sidecar to stream backup jobs and run bounded backup actions into OpenJaws.',
        ],
      },
      {
        label: 'Apex browser',
        value: [
          'bridge offline',
          'Browser bridge offline',
          'Start the browser bridge to keep native web previews inside the OpenJaws TUI instead of launching an external browser.',
        ],
      },
    ])
  })
})

describe('buildBrowserPreviewProperties', () => {
  test('surfaces the latest accountable browser session', () => {
    expect(
      buildBrowserPreviewProperties({
        version: 1,
        updatedAt: '2026-04-18T22:00:00.000Z',
        lastSessionId: 'session-1',
        sessions: [
          {
            id: 'session-1',
            action: 'open_url',
            intent: 'preview',
            rationale: 'Verify the local dev app in a real browser.',
            requestedBy: 'user',
            startedAt: '2026-04-18T22:00:00.000Z',
            handler: 'openjaws-browser',
            opened: true,
            note: 'Opened in the OpenJaws browser lane.',
            url: 'http://127.0.0.1:3000/',
          },
        ],
      }),
    ).toEqual([
      {
        label: 'Browser preview',
        value: [
          'preview · openjaws-browser · http://127.0.0.1:3000/ · opened',
          'requested by user · 2026-04-18T22:00:00.000Z',
          'why Verify the local dev app in a real browser.',
        ],
      },
    ])
  })

  test('surfaces private-history defaults when the native browser lane is idle', () => {
    expect(
      buildBrowserPreviewProperties(null, {
        configured: true,
        bridgePath: 'C:\\Apex\\browser',
        bridgeReady: true,
        launchReady: true,
        health: {
          status: 'ok',
          service: 'browser-bridge',
          version: '0.2.0',
          timestamp: '2026-04-18T22:05:03.000Z',
        },
        message:
          'OpenJaws browser bridge ready for local in-TUI previews.',
        summary: {
          mode: 'live',
          renderMode: 'tui',
          activeSessionId: null,
          sessionCount: 0,
          privacy: {
            doNotTrack: true,
            blockThirdPartyCookies: true,
            clearOnExit: true,
            userHistoryPersisted: false,
            agentHistoryPersisted: true,
          },
          sessions: [],
        },
      }),
    ).toEqual([
      {
        label: 'Browser runtime',
        value: [
          'Browser bridge online · native TUI preview ready',
          'OpenJaws browser bridge ready for local in-TUI previews.',
          'User browsing history stays out of persistent receipts by default.',
        ],
      },
    ])
  })

  test('surfaces when browser history persistence is enabled in the native lane', () => {
    expect(
      buildBrowserPreviewProperties(null, {
        configured: true,
        bridgePath: 'C:\\Apex\\browser',
        bridgeReady: true,
        launchReady: true,
        health: {
          status: 'ok',
          service: 'browser-bridge',
          version: '0.2.0',
          timestamp: '2026-04-18T22:05:03.000Z',
        },
        message:
          'OpenJaws browser bridge ready, but browser history persistence is enabled.',
        summary: {
          mode: 'live',
          renderMode: 'tui',
          activeSessionId: null,
          sessionCount: 0,
          privacy: {
            doNotTrack: true,
            blockThirdPartyCookies: true,
            clearOnExit: true,
            userHistoryPersisted: true,
            agentHistoryPersisted: true,
          },
          sessions: [],
        },
      }),
    ).toEqual([
      {
        label: 'Browser runtime',
        value: [
          'Browser bridge online · native TUI preview ready',
          'OpenJaws browser bridge ready, but browser history persistence is enabled.',
          'User browsing history is currently persisted.',
        ],
      },
    ])
  })

  test('surfaces the live in-TUI browser runtime separately from accountable receipts', () => {
    expect(
      buildBrowserPreviewProperties(null, {
        configured: true,
        bridgePath: 'C:\\Apex\\browser',
        bridgeReady: true,
        launchReady: true,
        health: {
          status: 'ok',
          service: 'browser-bridge',
          version: '0.2.0',
          timestamp: '2026-04-18T22:05:03.000Z',
        },
        message:
          'OpenJaws browser bridge ready with SEALED demo in the native TUI preview lane.',
        summary: {
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
              rationale: 'Check the local app in the native browser lane.',
              requestedBy: 'user',
              recordHistory: false,
              title: 'SEALED demo',
              url: 'http://127.0.0.1:3000/',
              state: 'ready',
              openedAt: '2026-04-18T22:05:00.000Z',
              updatedAt: '2026-04-18T22:05:03.000Z',
              excerpt: 'Digital clock preview',
              statusCode: 200,
              loadTimeMs: 92,
              imageCount: 3,
              metadata: {
                description: 'Clock preview',
                keywords: ['clock', 'preview'],
                author: null,
                contentType: 'text/html',
              },
              links: [],
            },
          ],
        },
      }),
    ).toEqual([
      {
        label: 'Browser runtime',
        value: [
          'Private user session · ready · native tui preview',
          'OpenJaws browser bridge ready with SEALED demo in the native TUI preview lane.',
          'Private user browsing stays inside the TUI and is redacted from shared status surfaces.',
          'preview · private user session',
        ],
      },
    ])
  })
})

describe('buildImmaculateTraceProperties', () => {
  test('surfaces latest typed trace latency and flow data', () => {
    expect(
      buildImmaculateTraceProperties({
        path: 'D:/openjaws/OpenJaws/artifacts/immaculate/session-traces/session.jsonl',
        sessionId: 'session-1',
        eventCount: 12,
        startedAt: '2026-04-16T00:00:00.000Z',
        endedAt: '2026-04-16T00:05:00.000Z',
        lastTimestamp: '2026-04-16T00:05:00.000Z',
        runState: 'completed',
        countsByType: {
          'route.dispatched': 2,
          'worker.assigned': 1,
        },
        routeDispatchCount: 2,
        routeLeaseCount: 1,
        workerAssignmentCount: 1,
        latestRouteId: 'route-2',
        latestWorkerId: 'worker-1',
        interactionLatency: {
          count: 3,
          p50Ms: 120,
          p95Ms: 450,
          maxMs: 450,
        },
        llmLatency: {
          count: 2,
          p50Ms: 200,
          p95Ms: 300,
          maxMs: 300,
        },
        reflexLatency: {
          count: 1,
          p50Ms: 80,
          p95Ms: 80,
          maxMs: 80,
        },
        cognitiveLatency: {
          count: 1,
          p50Ms: 140,
          p95Ms: 140,
          maxMs: 140,
        },
      }),
    ).toEqual([
      {
        label: 'Immaculate trace',
        value: [
          'session-1',
          'completed',
          '12 events',
          'started 2026-04-16T00:00:00.000Z',
          'ended 2026-04-16T00:05:00.000Z',
        ],
      },
      {
        label: 'Immaculate trace flow',
        value: ['2 dispatched', '1 leased', '1 assigned', 'route route-2', 'worker worker-1'],
      },
      {
        label: 'Immaculate trace latency',
        value: [
          '3 spans',
          'p50 120ms',
          'p95 450ms',
          '2 spans',
          'p50 200ms',
          'p95 300ms',
          '1 reflex',
          '1 cognitive',
          'reflex p95 80ms',
          'cognitive p95 140ms',
        ],
      },
      {
        label: 'Immaculate trace path',
        value: 'D:/openjaws/OpenJaws/artifacts/immaculate/session-traces/session.jsonl',
      },
    ])
  })
})

describe('buildQTraceProperties', () => {
  test('surfaces the latest Q benchmark trace flow and latency data', () => {
    expect(
      buildQTraceProperties({
        kind: 'benchmark',
        path: '/tmp/q-trace.jsonl',
        sessionId: 'q-soak-1',
        eventCount: 6,
        startedAt: '2026-04-17T00:00:00.000Z',
        endedAt: '2026-04-17T00:00:05.000Z',
        lastTimestamp: '2026-04-17T00:00:05.000Z',
        runState: 'completed',
        countsByType: {
          'session.started': 1,
          'route.dispatched': 1,
          'turn.complete': 1,
          'session.ended': 1,
        },
        routeDispatchCount: 1,
        routeLeaseCount: 0,
        workerAssignmentCount: 1,
        latestRouteId: 'route-1',
        latestWorkerId: 'worker-1',
        interactionLatency: {
          count: 1,
          p50Ms: 120,
          p95Ms: 120,
          maxMs: 120,
        },
        llmLatency: {
          count: 1,
          p50Ms: 420,
          p95Ms: 420,
          maxMs: 420,
        },
        reflexLatency: {
          count: 1,
          p50Ms: 80,
          p95Ms: 80,
          maxMs: 80,
        },
        cognitiveLatency: {
          count: 1,
          p50Ms: 160,
          p95Ms: 160,
          maxMs: 160,
        },
      }),
    ).toEqual([
      {
        label: 'Q trace',
        value: [
          'q-soak-1',
          'benchmark',
          'completed',
          '6 events',
          'started 2026-04-17T00:00:00.000Z',
          'ended 2026-04-17T00:00:05.000Z',
        ],
      },
      {
        label: 'Q trace flow',
        value: [
          '1 dispatched',
          '0 leased',
          '1 assigned',
          'route route-1',
          'worker worker-1',
        ],
      },
      {
        label: 'Q trace latency',
        value: [
          '1 spans',
          'interaction p95 120ms',
          'llm p95 420ms',
          'reflex p95 80ms',
          'cognitive p95 160ms',
        ],
      },
      {
        label: 'Q trace path',
        value: '/tmp/q-trace.jsonl',
      },
    ])
  })
})

describe('buildAgentCoworkProperties', () => {
  test('surfaces the shared terminal registry for the active team', () => {
    expect(
      buildAgentCoworkProperties(
        {
          teamName: 'bridge-crew',
        },
        {
          name: 'bridge-crew',
          createdAt: 1,
          leadAgentId: 'team-lead@bridge-crew',
          leadTerminalContextId: 'term-lead01',
          members: [
            {
              agentId: 'team-lead@bridge-crew',
              name: 'team-lead',
              joinedAt: 1,
              tmuxPaneId: '',
              cwd: 'D:\\openjaws\\OpenJaws',
              subscriptions: [],
            },
            {
              agentId: 'scout@bridge-crew',
              name: 'scout',
              joinedAt: 2,
              tmuxPaneId: '%2',
              cwd: 'D:\\openjaws\\OpenJaws',
              terminalContextId: 'term-scout02',
              subscriptions: [],
            },
          ],
          terminalContexts: [
            {
              terminalContextId: 'term-lead01',
              agentId: 'team-lead@bridge-crew',
              agentName: 'team-lead',
              cwd: 'D:\\openjaws\\OpenJaws',
              projectRoot: 'D:\\openjaws\\OpenJaws',
              createdAt: 1,
              updatedAt: 1,
            },
            {
              terminalContextId: 'term-scout02',
              agentId: 'scout@bridge-crew',
              agentName: 'scout',
              cwd: 'D:\\openjaws\\OpenJaws',
              projectRoot: 'D:\\openjaws\\OpenJaws',
              provider: 'oci',
              activePhaseId: 'phase-scout01',
              createdAt: 2,
              updatedAt: 3,
            },
          ],
          phaseReceipts: [
            {
              phaseId: 'phase-scout01',
              label: 'scout initial assignment',
              status: 'delivered',
              createdAt: 2,
              updatedAt: 4,
              sourceAgentId: 'team-lead@bridge-crew',
              sourceAgentName: 'team-lead',
              sourceTerminalContextId: 'term-lead01',
              targetAgentIds: ['scout@bridge-crew'],
              targetAgentNames: ['scout'],
              targetTerminalContextIds: ['term-scout02'],
              collaboratorAgentIds: ['scout@bridge-crew'],
              projectRoots: ['D:\\openjaws\\OpenJaws'],
              requestSummary: 'Compare the OCI path and patch the shared bridge.',
              lastDeliverableSummary:
                'Patched the shared bridge and aligned the OCI route.',
              lastDeliveredAt: 4,
              deliveries: [
                {
                  kind: 'request',
                  timestamp: '2026-04-15T10:00:00.000Z',
                  fromAgentId: 'team-lead@bridge-crew',
                  fromAgentName: 'team-lead',
                  toAgentIds: ['scout@bridge-crew'],
                  toAgentNames: ['scout'],
                  summary: 'Compare the OCI path and patch the shared bridge.',
                },
                {
                  kind: 'deliverable',
                  timestamp: '2026-04-15T10:05:00.000Z',
                  fromAgentId: 'scout@bridge-crew',
                  fromAgentName: 'scout',
                  toAgentIds: ['team-lead@bridge-crew'],
                  toAgentNames: ['team-lead'],
                  summary: 'Patched the shared bridge and aligned the OCI route.',
                },
              ],
            },
          ],
        },
        'C:\\Users\\Knight\\.openjaws\\team-mem\\bridge-crew-TERMINALS.md',
        'C:\\Users\\Knight\\.openjaws\\team-mem\\bridge-crew-PHASES.md',
      ),
    ).toEqual([
      {
        label: 'Agent Co-Work',
        value: [
          'bridge-crew',
          '2 terminals',
          '1 teammate',
          'lead term-lead01',
        ],
      },
      {
        label: 'Agent Co-Work registry',
        value: [
          'C:\\Users\\Knight\\.openjaws\\team-mem\\bridge-crew-TERMINALS.md',
          'team-lead term-lead01 D:\\openjaws\\OpenJaws',
          'scout term-scout02 oci phase-scout01 D:\\openjaws\\OpenJaws',
        ],
      },
      {
        label: 'Agent Co-Work memory',
        value: [
          'C:\\Users\\Knight\\.openjaws\\team-mem\\bridge-crew-PHASES.md',
          '1 phase',
          '1 delivered',
          '1 pinned',
          'scout initial assignment Patched the shared bridge and aligned the OCI route.',
        ],
      },
    ])
  })
})
