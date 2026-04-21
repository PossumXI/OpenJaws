import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildExternalProviderModelRef,
  getSavedOrConfiguredModelForProvider,
  normalizeExternalProvider,
} from './externalProviderSetup.js'
import { resetSettingsCache } from './settings/settingsCache.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
const originalQModel = process.env.Q_MODEL
const originalOciModel = process.env.OCI_MODEL
let configDir: string | null = null

function writeSettingsFile(contents: object): void {
  if (!configDir) {
    throw new Error('Config dir is not initialized')
  }
  writeFileSync(
    join(configDir, 'settings.json'),
    `${JSON.stringify(contents, null, 2)}\n`,
    'utf8',
  )
  resetSettingsCache()
}

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), 'openjaws-external-provider-setup-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  process.env.ANTHROPIC_API_KEY = 'test-openjaws-auth'
  delete process.env.Q_MODEL
  delete process.env.OCI_MODEL
  writeSettingsFile({})
})

afterEach(() => {
  resetSettingsCache()
  if (originalConfigDir === undefined) {
    delete process.env.CLAUDE_CONFIG_DIR
  } else {
    process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  }
  if (originalAnthropicApiKey === undefined) {
    delete process.env.ANTHROPIC_API_KEY
  } else {
    process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
  }
  if (originalQModel === undefined) {
    delete process.env.Q_MODEL
  } else {
    process.env.Q_MODEL = originalQModel
  }
  if (originalOciModel === undefined) {
    delete process.env.OCI_MODEL
  } else {
    process.env.OCI_MODEL = originalOciModel
  }
  if (configDir) {
    rmSync(configDir, { recursive: true, force: true })
  }
  configDir = null
})

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

  test('ignores provider-prefixed env defaults when resolving a provider-local model', () => {
    process.env.Q_MODEL = 'oci:Q'

    expect(getSavedOrConfiguredModelForProvider('oci', null)).toBe('Q')
  })

  test('keeps an Ollama fallback when nothing else is configured', () => {
    expect(getSavedOrConfiguredModelForProvider('ollama', null)).toBeTruthy()
  })
})
