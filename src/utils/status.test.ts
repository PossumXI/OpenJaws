import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  buildAgentCoworkProperties,
  buildDiscordQAgentProperties,
  buildImmaculateGuidanceProperties,
  buildProviderProbeProperties,
  buildProviderGuidanceProperties,
} from './status.js'

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
          voiceId: 'voice-1',
          voiceIdSource: 'ELEVENLABS_VOICE_ID',
          modelId: 'eleven_flash_v2_5',
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
          'ready',
          'voice-1',
          'eleven_flash_v2_5',
          'last q-command-station',
        ],
      },
      {
        label: 'Q knowledge',
        value: ['enabled', 'ready', 'Asgard', '412 files', 'queried 4 ranked snippets'],
      },
      {
        label: 'Q operator',
        value: ['PossumX', 'start-openjaws', 'pid 4.2k', 'D:\\repo'],
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
          'scout term-scout02 oci D:\\openjaws\\OpenJaws',
        ],
      },
      {
        label: 'Agent Co-Work memory',
        value: [
          'C:\\Users\\Knight\\.openjaws\\team-mem\\bridge-crew-PHASES.md',
          '1 phase',
          '1 delivered',
          'scout initial assignment Patched the shared bridge and aligned the OCI route.',
        ],
      },
    ])
  })
})
