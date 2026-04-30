import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createWebAppPreviewDemoHarness } from './webAppPreviewDemo.js'

const originalConfigDir = process.env.OPENJAWS_CONFIG_DIR

describe('webAppPreviewDemo', () => {
  let configDir: string

  beforeEach(async () => {
    configDir = await mkdtemp(join(tmpdir(), 'openjaws-web-demo-'))
    process.env.OPENJAWS_CONFIG_DIR = configDir
  })

  afterEach(async () => {
    if (originalConfigDir === undefined) {
      delete process.env.OPENJAWS_CONFIG_DIR
    } else {
      process.env.OPENJAWS_CONFIG_DIR = originalConfigDir
    }
    await rm(configDir, { recursive: true, force: true })
  })

  test('writes a reusable Playwright demo harness for a local preview URL', async () => {
    const harness = await createWebAppPreviewDemoHarness({
      url: 'localhost:5173',
      name: 'ApexOS Product Demo',
      rationale: 'Capture launch-ready proof for the local app.',
      generatedAt: '2026-04-30T00:00:00.000Z',
    })

    expect(harness.url).toBe('http://localhost:5173')
    expect(harness.slug).toBe('apexos-product-demo')
    expect(harness.outputDir).toContain(join('browser-preview', 'demos'))
    expect(harness.commands.preview).toBe('/preview http://localhost:5173')
    expect(harness.commands.test).toContain('playwright.config.ts')
    for (const file of harness.files) {
      expect(existsSync(file.path)).toBe(true)
    }

    const spec = readFileSync(
      harness.files.find(file => file.kind === 'spec')!.path,
      'utf8',
    )
    expect(spec).toContain("page.screenshot")
    expect(spec).toContain("demo-summary.json")
    expect(spec).toContain("http://localhost:5173")
  })

  test('sanitizes harness names into stable package-safe slugs', async () => {
    const harness = await createWebAppPreviewDemoHarness({
      url: 'https://example.com/product',
      name: '../../Launch!!! Demo   2026',
      outputDir: join(configDir, 'custom-output'),
    })

    expect(harness.slug).toBe('launch-demo-2026')
    expect(readFileSync(join(harness.outputDir, 'package.json'), 'utf8')).toContain(
      '"name": "launch-demo-2026"',
    )
  })

  test('rejects unsupported URL protocols before writing files', async () => {
    await expect(
      createWebAppPreviewDemoHarness({
        url: 'file:///C:/Users/Knight/Desktop/index.html',
      }),
    ).rejects.toThrow('Unsupported preview URL protocol')
  })
})
