import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  probeResolvedExternalProvider,
  resolveProviderProbeModelRef,
} from './externalProviderProbe.js'
import type { ResolvedExternalModelConfig } from './model/externalProviders.js'

function makeConfig(
  override: Partial<ResolvedExternalModelConfig> = {},
): ResolvedExternalModelConfig {
  return {
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
    ...override,
  }
}

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

describe('externalProviderProbe', () => {
  test('blocks OCI probes when neither a key nor IAM auth is configured', async () => {
    const result = await probeResolvedExternalProvider(
      makeConfig({
        apiKey: null,
        apiKeySource: null,
      }),
    )

    expect(result.ok).toBe(false)
    expect(result.code).toBe('missing_key')
    expect(result.summary).toContain('key missing')
    expect(result.endpointLabel).toBe('/responses')
  })

  test('probes OCI through the responses bridge', async () => {
    const seen: Array<{
      prompt: string
      systemPrompt?: string
      maxOutputTokens?: number
      authMode: string
      model: string
    }> = []
    const result = await probeResolvedExternalProvider(makeConfig(), {
      ociQueryFn: async args => {
        seen.push({
          prompt: args.prompt,
          systemPrompt: args.systemPrompt,
          maxOutputTokens: args.maxOutputTokens,
          authMode: args.runtimeOverride?.authMode ?? 'unknown',
          model: args.runtimeOverride?.model ?? 'unknown',
        })
        return {
          ok: true,
          text: 'OK',
          model: 'openai.gpt-oss-120b',
          base_url: 'https://example.com/openai/v1',
          auth_mode: 'bearer',
          project_id: null,
          compartment_id: null,
          profile: null,
          config_file: null,
        }
      },
    })

    expect(seen).toEqual([
      {
        prompt: 'Reply with the single word OK.',
        systemPrompt: 'Reply briefly and operationally.',
        maxOutputTokens: 16,
        authMode: 'bearer',
        model: 'openai.gpt-oss-120b',
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.modelCount).toBeNull()
    expect(result.endpointLabel).toBe('/responses')
    expect(result.method).toBe('POST')
  })

  test('probes OpenAI-compatible providers through /models', async () => {
    const seen: Array<{ input: string; auth: string | null }> = []
    const result = await probeResolvedExternalProvider(
      makeConfig({
        rawModel: 'openai:gpt-5.4',
        provider: 'openai',
        model: 'gpt-5.4',
        label: 'OpenAI',
      }),
      {
      fetchFn: async (input, init) => {
        seen.push({
          input,
          auth:
            init?.headers &&
            typeof init.headers === 'object' &&
            'Authorization' in init.headers
              ? String(init.headers.Authorization)
              : null,
        })
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [{ id: 'Q' }, { id: 'Q-coder' }],
          }),
        }
      },
      },
    )

    expect(seen).toEqual([
      {
        input: 'https://example.com/openai/v1/models',
        auth: 'Bearer sk-test',
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.modelCount).toBe(2)
    expect(result.endpointLabel).toBe('/models')
  })

  test('probes ollama through /api/tags without requiring auth', async () => {
    const seen: string[] = []
    const result = await probeResolvedExternalProvider(
      makeConfig({
        rawModel: 'ollama:q',
        provider: 'ollama',
        model: 'q',
        label: 'Ollama',
        apiKey: null,
        apiKeySource: null,
        baseURL: 'http://127.0.0.1:11434',
      }),
      {
        fetchFn: async input => {
          seen.push(input)
          return {
            ok: true,
            status: 200,
            json: async () => ({
              models: [{ name: 'q' }],
            }),
          }
        },
      },
    )

    expect(seen).toEqual(['http://127.0.0.1:11434/api/tags'])
    expect(result.ok).toBe(true)
    expect(result.modelCount).toBe(1)
    expect(result.endpointLabel).toBe('/api/tags')
  })

  test('surfaces auth failures cleanly', async () => {
    const result = await probeResolvedExternalProvider(makeConfig(), {
      ociQueryFn: async () => {
        throw new Error('401 Unauthorized')
      },
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe('auth_failed')
    expect(result.endpointLabel).toBe('/responses')
  })
})

describe('resolveProviderProbeModelRef', () => {
  test('falls back to the current external model when no provider is given', () => {
    expect(resolveProviderProbeModelRef(null, null, 'oci:Q')).toBe('oci:Q')
  })
})
