import { describe, expect, test } from 'bun:test'
import {
  buildExternalProviderModelRef,
  getSavedOrConfiguredModelForProvider,
  normalizeExternalProvider,
} from './externalProviderSetup.js'

describe('externalProviderSetup', () => {
  test('normalizes provider ids case-insensitively', () => {
    expect(normalizeExternalProvider('OpenAI')).toBe('openai')
    expect(normalizeExternalProvider('Q')).toBe('oci')
    expect(normalizeExternalProvider('not-a-provider')).toBeNull()
  })

  test('builds normalized provider model refs', () => {
    expect(buildExternalProviderModelRef('openai', ' gpt-5.4 ')).toBe(
      'openai:gpt-5.4',
    )
  })

  test('prefers the current app-state model for a matching provider', () => {
    expect(
      getSavedOrConfiguredModelForProvider('openai', 'openai:gpt-5.4'),
    ).toBe('gpt-5.4')
  })

  test('keeps the Q default for OCI when nothing else is configured', () => {
    expect(getSavedOrConfiguredModelForProvider('oci', null)).toBe('Q')
  })

  test('keeps an Ollama fallback when nothing else is configured', () => {
    expect(getSavedOrConfiguredModelForProvider('ollama', null)).toBeTruthy()
  })
})
