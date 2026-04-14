import { describe, expect, test } from 'bun:test'
import {
  buildImmaculateGuidanceProperties,
  buildProviderProbeProperties,
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
          'settings.llmProviders.oci.apiKey',
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
          endpoint: 'https://example.com/openai/v1/models',
          endpointLabel: '/models',
          method: 'GET',
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
          '/models',
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
