import { describe, expect, test } from 'bun:test'
import {
  evaluateStartupHarness,
  summarizeStartupHarness,
  type StartupHarnessInput,
} from './startupHarness.js'

function makeInput(
  overrides: Partial<StartupHarnessInput> = {},
): StartupHarnessInput {
  return {
    platform: 'linux',
    remoteControlAtStartup: false,
    remoteControlStartupIssue: null,
    externalModel: null,
    gitBashStatus: null,
    ripgrepStatus: {
      mode: 'system',
      path: 'rg',
      working: true,
    },
    configuredDefaultEnvironmentId: null,
    missingConfiguredDefaultEnvironment: false,
    suggestedEnvironmentLabel: null,
    ...overrides,
  }
}

describe('evaluateStartupHarness', () => {
  test('returns ready when no blocking or degraded issues are present', () => {
    const evaluation = evaluateStartupHarness(makeInput())

    expect(evaluation.status).toBe('ready')
    expect(evaluation.issues).toHaveLength(0)
    expect(summarizeStartupHarness(evaluation)).toBe('Ready')
  })

  test('blocks startup when remote control startup preflight failed', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        remoteControlAtStartup: true,
        remoteControlStartupIssue:
          'Remote Control requires a full-scope login token.',
      }),
    )

    expect(evaluation.status).toBe('blocked')
    expect(evaluation.issues[0]?.code).toBe('remote_control_startup')
  })

  test('blocks startup when an external cloud model has no API key', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        externalModel: {
          provider: 'openai',
          label: 'OpenAI',
          apiKeySource: null,
        },
      }),
    )

    expect(evaluation.status).toBe('blocked')
    expect(evaluation.issues.some(issue => issue.code === 'provider_auth')).toBe(
      true,
    )
  })

  test('does not require auth for ollama', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        externalModel: {
          provider: 'ollama',
          label: 'Ollama',
          apiKeySource: null,
        },
      }),
    )

    expect(evaluation.status).toBe('ready')
  })

  test('blocks startup on Windows when git-bash is missing', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        platform: 'windows',
        gitBashStatus: {
          path: null,
          error: 'OpenJaws on Windows requires git-bash.',
        },
      }),
    )

    expect(evaluation.status).toBe('blocked')
    expect(evaluation.issues.some(issue => issue.code === 'git_bash')).toBe(
      true,
    )
  })

  test('degrades when configured remote environment is stale but startup remote is off', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        configuredDefaultEnvironmentId: 'env_123',
        missingConfiguredDefaultEnvironment: true,
        suggestedEnvironmentLabel: 'anthropic-cloud (env_live)',
      }),
    )

    expect(evaluation.status).toBe('degraded')
    expect(evaluation.issues[0]?.code).toBe('remote_environment')
  })

  test('blocks when configured remote environment is stale and startup remote is on', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        remoteControlAtStartup: true,
        configuredDefaultEnvironmentId: 'env_123',
        missingConfiguredDefaultEnvironment: true,
      }),
    )

    expect(evaluation.status).toBe('blocked')
  })

  test('degrades when ripgrep verification failed', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        ripgrepStatus: {
          mode: 'system',
          path: 'rg',
          working: false,
        },
      }),
    )

    expect(evaluation.status).toBe('degraded')
    expect(evaluation.issues[0]?.code).toBe('ripgrep')
  })

  test('summarizes multiple issues compactly', () => {
    const evaluation = evaluateStartupHarness(
      makeInput({
        platform: 'windows',
        gitBashStatus: {
          path: null,
          error: 'OpenJaws on Windows requires git-bash.',
        },
        externalModel: {
          provider: 'openai',
          label: 'OpenAI',
          apiKeySource: null,
        },
        ripgrepStatus: {
          mode: 'system',
          path: 'rg',
          working: false,
        },
      }),
    )

    expect(summarizeStartupHarness(evaluation)).toBe(
      'Blocked · model auth, git-bash +1 more',
    )
  })
})
