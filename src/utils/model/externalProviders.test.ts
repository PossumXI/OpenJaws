import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { resetSettingsCache } from '../settings/settingsCache.js'
import { getModelOptions } from './modelOptions.js'
import {
  listVisibleExternalModels,
  renderExternalModelName,
} from './externalProviders.js'

const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
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
})
