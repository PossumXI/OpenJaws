import { describe, expect, test } from 'bun:test'
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

describe('externalProviderProbe', () => {
  test('blocks probes that need a key when auth is missing', async () => {
    const result = await probeResolvedExternalProvider(
      makeConfig({
        apiKey: null,
        apiKeySource: null,
      }),
    )

    expect(result.ok).toBe(false)
    expect(result.code).toBe('missing_key')
    expect(result.summary).toContain('key missing')
  })

  test('probes OpenAI-compatible providers through /models', async () => {
    const seen: Array<{ input: string; auth: string | null }> = []
    const result = await probeResolvedExternalProvider(makeConfig(), {
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
    })

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
      fetchFn: async () => ({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      }),
    })

    expect(result.ok).toBe(false)
    expect(result.code).toBe('auth_failed')
    expect(result.httpStatus).toBe(401)
  })
})

describe('resolveProviderProbeModelRef', () => {
  test('falls back to the current external model when no provider is given', () => {
    expect(resolveProviderProbeModelRef(null, null, 'oci:Q')).toBe('oci:Q')
  })
})
