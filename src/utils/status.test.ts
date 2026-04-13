import { describe, expect, test } from 'bun:test'
import {
  buildImmaculateGuidanceProperties,
  buildProviderGuidanceProperties,
} from './status.js'

describe('buildProviderGuidanceProperties', () => {
  test('always includes provider switching guidance', () => {
    expect(buildProviderGuidanceProperties(null)).toEqual([
      {
        label: 'Provider switch',
        value: [
          '/provider status',
          '/provider use <provider> <model>',
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
          'Settings > Config > Model',
        ],
      },
      {
        label: 'OpenAI setup',
        value: [
          '/provider key openai <api-key>',
          'env OPENAI_API_KEY',
          'settings.llmProviders.openai.apiKey',
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
          'Settings > Config > Model',
        ],
      },
      {
        label: 'Ollama setup',
        value: [
          '/provider use ollama <model>',
          '/provider base-url ollama <url>',
          'env OLLAMA_BASE_URL',
        ],
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
