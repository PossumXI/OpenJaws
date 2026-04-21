import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetSettingsCache } from '../settings/settingsCache.js'
import { getModelOptions } from './modelOptions.js'
import {
  listVisibleExternalModels,
  renderExternalModelName,
  resolveExternalModelConfig,
} from './externalProviders.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
const originalOllamaBaseUrl = process.env.OLLAMA_BASE_URL
const originalOllamaQBaseUrl = process.env.OLLAMA_Q_BASE_URL
const originalOpenJawsOllamaQBaseUrl = process.env.OPENJAWS_OLLAMA_Q_BASE_URL
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
  configDir = mkdtempSync(join(tmpdir(), 'openjaws-external-provider-'))
  process.env.CLAUDE_CONFIG_DIR = configDir
  process.env.ANTHROPIC_API_KEY = 'test-openjaws-auth'
  delete process.env.OLLAMA_BASE_URL
  delete process.env.OLLAMA_Q_BASE_URL
  delete process.env.OPENJAWS_OLLAMA_Q_BASE_URL
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
  if (originalOllamaBaseUrl === undefined) {
    delete process.env.OLLAMA_BASE_URL
  } else {
    process.env.OLLAMA_BASE_URL = originalOllamaBaseUrl
  }
  if (originalOllamaQBaseUrl === undefined) {
    delete process.env.OLLAMA_Q_BASE_URL
  } else {
    process.env.OLLAMA_Q_BASE_URL = originalOllamaQBaseUrl
  }
  if (originalOpenJawsOllamaQBaseUrl === undefined) {
    delete process.env.OPENJAWS_OLLAMA_Q_BASE_URL
  } else {
    process.env.OPENJAWS_OLLAMA_Q_BASE_URL = originalOpenJawsOllamaQBaseUrl
  }
  if (configDir) {
    rmSync(configDir, { recursive: true, force: true })
  }
  configDir = null
})

describe('externalProviders', () => {
  test('renders oci:Q as Q', () => {
    expect(renderExternalModelName('oci:Q')).toBe('Q')
  })

  test('keeps Q visible as a promoted runtime even when another provider is pinned', () => {
    writeSettingsFile({
      model: 'gemini:gemini-3-flash-preview',
      llmModelOverrides: {
        'gemini:gemini-3-flash-preview': {},
      },
    })

    const models = listVisibleExternalModels()
    expect(models.some(model => model.value === 'oci:Q' && model.label === 'Q')).toBe(
      true,
    )
    expect(
      getModelOptions().some(
        option => option.value === 'oci:Q' && option.label === 'Q',
      ),
    ).toBe(true)
  })

  test('prefers the dedicated local Q Ollama lane for ollama:q', () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
    process.env.OPENJAWS_OLLAMA_Q_BASE_URL = 'http://127.0.0.1:11435'

    const resolved = resolveExternalModelConfig('ollama:q')
    expect(resolved?.baseURL).toBe('http://127.0.0.1:11435')
    expect(resolved?.baseURLSource).toBe('OPENJAWS_OLLAMA_Q_BASE_URL')
  })

  test('keeps non-Q Ollama models on the generic Ollama lane', () => {
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
    process.env.OPENJAWS_OLLAMA_Q_BASE_URL = 'http://127.0.0.1:11435'

    const resolved = resolveExternalModelConfig('ollama:qwen3:8b')
    expect(resolved?.baseURL).toBe('http://127.0.0.1:11434')
    expect(resolved?.baseURLSource).toBe('OLLAMA_BASE_URL')
  })

  test('lets the dedicated local Q lane override generic provider settings', () => {
    process.env.OPENJAWS_OLLAMA_Q_BASE_URL = 'http://127.0.0.1:11435'
    writeSettingsFile({
      llmProviders: {
        ollama: {
          baseURL: 'http://127.0.0.1:11434',
        },
      },
    })

    const resolved = resolveExternalModelConfig('ollama:q')
    expect(resolved?.baseURL).toBe('http://127.0.0.1:11435')
    expect(resolved?.baseURLSource).toBe('OPENJAWS_OLLAMA_Q_BASE_URL')
  })

  test('keeps exact model overrides above the dedicated local Q lane', () => {
    process.env.OPENJAWS_OLLAMA_Q_BASE_URL = 'http://127.0.0.1:11435'
    writeSettingsFile({
      llmModelOverrides: {
        'ollama:q': {
          baseURL: 'http://127.0.0.1:11436',
        },
      },
    })

    const resolved = resolveExternalModelConfig('ollama:q')
    expect(resolved?.baseURL).toBe('http://127.0.0.1:11436')
    expect(resolved?.baseURLSource).toBe(
      'settings.llmModelOverrides.ollama:q.baseURL',
    )
  })
})
