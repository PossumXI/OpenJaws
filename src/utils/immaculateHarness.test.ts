import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  createImmaculateCrewBurstBudget,
  buildImmaculateActuationReceipt,
  buildImmaculateAgentObjective,
  buildImmaculateCrewObjective,
  buildImmaculateHarnessSystemContext,
  buildImmaculateCheckpointReceipt,
  buildImmaculateToolDecisionDetail,
  createImmaculateCrewWaveState,
  buildImmaculateHarnessHeaders,
  formatImmaculateHarnessInlineStatus,
  getImmaculateHarnessConfig,
  getImmaculateHarnessGovernanceProfile,
  isImmaculateCrewBurstBudgetActive,
  isImmaculateCrewWaveActive,
  isLoopbackHarnessUrl,
  normalizeImmaculateObjective,
  normalizeImmaculateHarnessUrl,
  resolveImmaculateCrewLaunchWindow,
  resolveImmaculateCrewPressureVerdict,
  resolveImmaculateHarnessGovernance,
  resolveImmaculateRetryWindow,
  summarizeImmaculateCrewBurstBudget,
  summarizeImmaculateCrewWave,
} from './immaculateHarness.js'

const ORIGINAL_ENV = {
  IMMACULATE_HARNESS_URL: process.env.IMMACULATE_HARNESS_URL,
  IMMACULATE_API_KEY: process.env.IMMACULATE_API_KEY,
  IMMACULATE_ACTOR: process.env.IMMACULATE_ACTOR,
  IMMACULATE_ENV_FILE: process.env.IMMACULATE_ENV_FILE,
}

afterEach(() => {
  restoreEnv('IMMACULATE_HARNESS_URL', ORIGINAL_ENV.IMMACULATE_HARNESS_URL)
  restoreEnv('IMMACULATE_API_KEY', ORIGINAL_ENV.IMMACULATE_API_KEY)
  restoreEnv('IMMACULATE_ACTOR', ORIGINAL_ENV.IMMACULATE_ACTOR)
  restoreEnv('IMMACULATE_ENV_FILE', ORIGINAL_ENV.IMMACULATE_ENV_FILE)
})

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name]
    return
  }
  process.env[name] = value
}

describe('immaculate harness config', () => {
  test('normalizes default harness URL and loopback detection', () => {
    expect(normalizeImmaculateHarnessUrl()).toBe('http://127.0.0.1:8787')
    expect(normalizeImmaculateHarnessUrl('http://localhost:8787/')).toBe(
      'http://localhost:8787',
    )
    expect(isLoopbackHarnessUrl('http://127.0.0.1:8787')).toBe(true)
    expect(isLoopbackHarnessUrl('https://immaculate.example.com')).toBe(false)
  })

  test('resolves harness config from settings and environment', () => {
    process.env.IMMACULATE_HARNESS_URL = 'https://immaculate.example.com/'
    process.env.IMMACULATE_API_KEY = 'env-key'
    process.env.IMMACULATE_ACTOR = 'env-actor'

    expect(
      getImmaculateHarnessConfig({
        immaculate: {
          mode: 'strict',
          harnessUrl: 'http://ignored.local:8787',
          actor: 'settings-actor',
        },
      }),
    ).toEqual({
      enabled: true,
      mode: 'strict',
      harnessUrl: 'https://immaculate.example.com',
      apiKey: 'env-key',
      apiKeySource: 'IMMACULATE_API_KEY',
      actor: 'env-actor',
    })
  })

  test('loads the local Immaculate env file when OpenJaws env is not seeded', () => {
    delete process.env.IMMACULATE_HARNESS_URL
    delete process.env.IMMACULATE_API_KEY
    const dir = mkdtempSync(join(tmpdir(), 'openjaws-immaculate-env-'))
    const envPath = join(dir, '.env.local')
    writeFileSync(
      envPath,
      [
        'IMMACULATE_API_KEY="local-key"',
        'IMMACULATE_HOST=127.0.0.1',
        'IMMACULATE_PORT=9797',
      ].join('\n'),
      'utf8',
    )
    process.env.IMMACULATE_ENV_FILE = envPath

    expect(getImmaculateHarnessConfig()).toMatchObject({
      harnessUrl: 'http://127.0.0.1:9797',
      apiKey: 'local-key',
      apiKeySource: 'IMMACULATE_ENV_FILE',
    })
  })

  test('accepts Immaculate harness host and port env names from the local env file', () => {
    delete process.env.IMMACULATE_HARNESS_URL
    delete process.env.IMMACULATE_API_KEY
    const dir = mkdtempSync(join(tmpdir(), 'openjaws-immaculate-harness-env-'))
    const envPath = join(dir, '.env.local')
    writeFileSync(
      envPath,
      [
        'IMMACULATE_API_KEY=local-key',
        'IMMACULATE_HARNESS_HOST=0.0.0.0',
        'IMMACULATE_HARNESS_PORT=8788',
        'IMMACULATE_HOST=127.0.0.1',
        'IMMACULATE_PORT=9797',
      ].join('\n'),
      'utf8',
    )
    process.env.IMMACULATE_ENV_FILE = envPath

    expect(getImmaculateHarnessConfig()).toMatchObject({
      harnessUrl: 'http://0.0.0.0:8788',
      apiKey: 'local-key',
      apiKeySource: 'IMMACULATE_ENV_FILE',
    })
  })

  test('applies explicit governance defaults for governed actions', () => {
    expect(getImmaculateHarnessGovernanceProfile('control')).toEqual({
      action: 'operator-control',
      purpose: ['orchestration-control'],
      policyId: 'operator-control-default',
      consentScope: 'operator:openjaws',
    })

    expect(getImmaculateHarnessGovernanceProfile('workers')).toEqual({
      action: 'cognitive-trace-read',
      purpose: ['cognitive-trace-read'],
      policyId: 'cognitive-trace-read-default',
      consentScope: 'system:intelligence',
    })

    expect(getImmaculateHarnessGovernanceProfile('assign_worker')).toEqual({
      action: 'cognitive-execution',
      purpose: ['cognitive-execution'],
      policyId: 'cognitive-run-default',
      consentScope: 'system:intelligence',
    })

    expect(getImmaculateHarnessGovernanceProfile('tool_search')).toEqual({
      action: 'internet-search',
      purpose: ['internet-search'],
      policyId: 'internet-search-default',
      consentScope: 'system:research',
    })

    expect(getImmaculateHarnessGovernanceProfile('artifact_package')).toEqual({
      action: 'document-delivery',
      purpose: ['artifact-delivery'],
      policyId: 'document-delivery-default',
      consentScope: 'system:delivery',
    })

    expect(
      resolveImmaculateHarnessGovernance(
        {
          action: 'executions',
        },
        {
          enabled: true,
          mode: 'balanced',
          harnessUrl: 'http://127.0.0.1:8787',
          actor: 'openjaws',
        },
      ),
    ).toEqual({
      action: 'cognitive-trace-read',
      purpose: ['cognitive-trace-read'],
      policyId: 'cognitive-trace-read-default',
      consentScope: 'system:intelligence',
      actor: 'openjaws',
    })
  })

  test('builds governance headers without silent policy omission', () => {
    const headers = buildImmaculateHarnessHeaders(
      {
        action: 'control',
        purpose: ['operator-control'],
        consentScope: 'operator:test-user',
      },
      {
        enabled: true,
        mode: 'balanced',
        harnessUrl: 'https://immaculate.example.com',
        apiKey: 'secret',
        apiKeySource: 'settings',
        actor: 'openjaws-test',
      },
    )

    expect(headers).toEqual({
      Accept: 'application/json',
      Authorization: 'Bearer secret',
      'x-immaculate-actor': 'openjaws-test',
      'x-immaculate-purpose': 'operator-control',
      'x-immaculate-policy-id': 'operator-control-default',
      'x-immaculate-consent-scope': 'operator:test-user',
    })
  })

  test('formats inline and prompt-time harness receipts', () => {
    const status = {
      enabled: true,
      mode: 'balanced',
      harnessUrl: 'http://127.0.0.1:8787',
      actor: 'openjaws',
      loopback: true,
      reachable: true,
      service: 'immaculate-harness',
      clients: 3,
    }

    expect(formatImmaculateHarnessInlineStatus(status)).toBe(
      'immaculate online · mode balanced',
    )
    expect(
      buildImmaculateCheckpointReceipt({
        status,
        stage: 'tools 2',
        detail: 'Bash, Read',
      }),
    ).toBe(
      'Immaculate checkpoint: tools 2 · immaculate online · mode balanced · Bash, Read',
    )
    expect(
      buildImmaculateHarnessSystemContext(status, {
        profile: 'human-connectome-harness',
        cycle: 12,
        nodes: 44,
        edges: 128,
        layerCount: 4,
        executionCount: 9,
        recommendedLayerId: 'router-core',
      }),
    ).toContain('Immaculate is the default orchestration substrate')
  })

  test('normalizes actuation objectives and receipts', () => {
    expect(
      normalizeImmaculateObjective(
        '  tighten   routing around   router-core for live agent orchestration  ',
      ),
    ).toBe('tighten routing around router-core for live agent orchestration')

    expect(
      buildImmaculateAgentObjective({
        agentType: 'Explore',
        model: 'openai:gpt-5.4',
        task: 'inspect routing around router-core',
      }),
    ).toBe(
      'Explore agent · model openai:gpt-5.4 · inspect routing around router-core',
    )

    expect(
      buildImmaculateToolDecisionDetail({
        toolName: 'Bash',
        outcome: 'retry',
        reason: 'PermissionDenied hook reopened this command',
      }),
    ).toBe(
      'tool Bash · retry eligible · PermissionDenied hook reopened this command',
    )

    expect(
      buildImmaculateCrewObjective({
        teamName: 'shipyard',
        teammateName: 'deckhand-1',
        crewSize: 3,
        backendType: 'in-process',
        model: 'gemini:gemini-3.1-pro-preview',
        prompt: 'inspect routing pressure around router-core and tool retries',
      }),
    ).toBe(
      'crew shipyard · member deckhand-1 · 3 active · in-process · model gemini:gemini-3.1-pro-preview · inspect routing pressure around router-core and tool retries',
    )

    expect(
      resolveImmaculateCrewPressureVerdict({
        crewSize: 2,
        deckReceipt: {
          layerCount: 4,
          executionCount: 1,
          recommendedLayerId: 'router-core',
        },
      }),
    ).toEqual({
      action: 'boost',
      label: 'expand',
      detail: 'pressure nominal · recommend router-core',
      value: 2,
    })

    expect(
      resolveImmaculateCrewPressureVerdict({
        crewSize: 5,
        deckReceipt: {
          layerCount: 3,
          executionCount: 3,
          recommendedLayerId: 'router-core',
        },
      }),
    ).toEqual({
      action: 'reroute',
      label: 'reroute',
      detail: 'pressure high · recommend router-core',
    })

    expect(
      resolveImmaculateCrewPressureVerdict({
        crewSize: 6,
        deckReceipt: {
          layerCount: 2,
          executionCount: 5,
          recommendedLayerId: 'router-core',
        },
      }),
    ).toEqual({
      action: 'reroute',
      label: 'reroute',
      detail: 'pressure high · recommend router-core',
    })

    expect(
      resolveImmaculateCrewLaunchWindow({
        crewSize: 5,
        deckReceipt: {
          layerCount: 3,
          executionCount: 3,
          recommendedLayerId: 'router-core',
        },
      }),
    ).toEqual({
      label: 'reroute',
      delayMs: 900,
      detail: 'launch window 900ms · pressure high · recommend router-core',
    })

    expect(
      resolveImmaculateRetryWindow({
        deckReceipt: {
          layerCount: 2,
          executionCount: 2,
          recommendedLayerId: 'router-core',
        },
      }),
    ).toEqual({
      label: 'hold',
      delayMs: 250,
      detail: 'retry window 250ms · recommend router-core',
    })

    const waveState = createImmaculateCrewWaveState({
      teamName: 'shipyard',
      crewSize: 5,
      deckReceipt: {
        layerCount: 3,
        executionCount: 3,
        recommendedLayerId: 'router-core',
      },
      now: 1000,
    })

    expect(waveState).toEqual({
      teamName: 'shipyard',
      crewSize: 5,
      label: 'reroute',
      detail: 'launch window 900ms · pressure high · recommend router-core',
      delayMs: 900,
      updatedAt: 1000,
      holdUntil: 1900,
      executionCount: 3,
      recommendedLayerId: 'router-core',
    })

    expect(
      isImmaculateCrewWaveActive(waveState, {
        teamName: 'shipyard',
        now: 1500,
      }),
    ).toBe(true)

    expect(
      summarizeImmaculateCrewWave(waveState, {
        teamName: 'shipyard',
        now: 1500,
      }),
    ).toEqual({
      text: 'wave reroute · launch window 900ms · pressure high · recommend router-core',
      tone: 'error',
    })

    const burstBudget = createImmaculateCrewBurstBudget({
      teamName: 'shipyard',
      crewSize: 5,
      deckReceipt: {
        layerCount: 3,
        executionCount: 3,
        recommendedLayerId: 'router-core',
      },
      now: 1000,
    })

    expect(burstBudget).toEqual({
      teamName: 'shipyard',
      label: 'reroute',
      maxSpawns: 0,
      remainingSpawns: 0,
      detail: 'burst cap 0 · recommend router-core',
      updatedAt: 1000,
      holdUntil: 1900,
      recommendedLayerId: 'router-core',
    })

    expect(
      isImmaculateCrewBurstBudgetActive(burstBudget, {
        teamName: 'shipyard',
        now: 1500,
      }),
    ).toBe(true)

    expect(
      summarizeImmaculateCrewBurstBudget(burstBudget, {
        teamName: 'shipyard',
        now: 1500,
      }),
    ).toEqual({
      text: 'burst reroute · burst cap 0 · recommend router-core',
      tone: 'error',
    })

    expect(
      buildImmaculateActuationReceipt({
        stage: 'retry window',
        detail: 'tool Bash · retry eligible',
        result: {
          status: 200,
          route: '/api/control',
          summary: 'accepted',
          json: '{"accepted":true}',
          governance: {
            action: 'operator-control',
            purpose: ['orchestration-control'],
            policyId: 'operator-control-default',
            consentScope: 'operator:openjaws',
            actor: 'openjaws',
          },
        },
      }),
    ).toBe(
      'Immaculate actuation: retry window · accepted · tool Bash · retry eligible · operator-control · operator:openjaws',
    )
  })
})
