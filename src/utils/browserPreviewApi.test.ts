import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  isBrowserPreviewApiReadOnly,
  runBrowserPreviewApiAction,
} from './browserPreviewApi.js'

const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR
const originalOpenJawsConfigDir = process.env.OPENJAWS_CONFIG_DIR

describe('browserPreviewApi', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'openjaws-browser-preview-api-'))
    process.env.CLAUDE_CONFIG_DIR = configDir
    process.env.OPENJAWS_CONFIG_DIR = configDir
  })

  afterEach(async () => {
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
    if (originalOpenJawsConfigDir === undefined) {
      delete process.env.OPENJAWS_CONFIG_DIR
    } else {
      process.env.OPENJAWS_CONFIG_DIR = originalOpenJawsConfigDir
    }
    await rm(configDir, { recursive: true, force: true })
  })

  test('reports browser preview capability endpoints as read-only metadata', async () => {
    expect(isBrowserPreviewApiReadOnly('capabilities')).toBe(true)
    expect(isBrowserPreviewApiReadOnly('demo_harness')).toBe(false)
    expect(isBrowserPreviewApiReadOnly('demo_run')).toBe(false)

    const result = await runBrowserPreviewApiAction({ action: 'capabilities' })

    expect(result.ok).toBe(true)
    expect(result.summary).toContain('browser preview capabilities')
    expect(JSON.stringify(result.data)).toContain('POST /browser/demo-harness')
    expect(JSON.stringify(result.data)).toContain('POST /browser/demo-run')
  })

  test('writes a Playwright demo harness through the API facade', async () => {
    const outputDir = join(configDir, 'demo-output')
    const result = await runBrowserPreviewApiAction({
      action: 'demo_harness',
      url: 'localhost:5173',
      name: 'Browser Preview Demo',
      outputDir,
      rationale: 'Capture product demo evidence.',
    })

    expect(result.ok).toBe(true)
    expect(result.summary).toContain(outputDir)
    expect(existsSync(join(outputDir, 'playwright.config.ts'))).toBe(true)
    expect(existsSync(join(outputDir, 'tests', 'demo.spec.ts'))).toBe(true)
    expect(readFileSync(join(outputDir, 'README.md'), 'utf8')).toContain(
      '/preview http://localhost:5173',
    )
  })

  test('rejects unsupported raw HTTP intent and requester values', async () => {
    await expect(
      runBrowserPreviewApiAction({
        action: 'open',
        url: 'https://example.com',
        intent: 'sideways',
      }),
    ).rejects.toThrow('Unsupported browser preview intent "sideways"')

    await expect(
      runBrowserPreviewApiAction({
        action: 'open',
        url: 'https://example.com',
        requestedBy: 'anonymous',
      }),
    ).rejects.toThrow('Unsupported browser preview requester "anonymous"')
  })

  test('runs a Playwright demo capture through the API facade', async () => {
    const outputDir = join(configDir, 'demo-run')
    const result = await runBrowserPreviewApiAction(
      {
        action: 'demo_run',
        url: 'localhost:5173',
        name: 'Browser Preview Demo Run',
        outputDir,
        rationale: 'Capture product demo evidence.',
      },
      {
        demoRunner: async () => ({
          stdout: 'demo passed',
          stderr: '',
          code: 0,
        }),
      },
    )

    expect(result.ok).toBe(true)
    expect(result.summary).toContain('Captured Playwright demo evidence')
    expect(JSON.stringify(result.data)).toContain(
      'openjaws-preview-demo-run.receipt.json',
    )
  })
})
