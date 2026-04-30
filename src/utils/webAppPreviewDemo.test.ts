import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'fs'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createWebAppPreviewDemoHarness,
  packageWebAppPreviewDemoArtifacts,
  runWebAppPreviewDemoHarness,
  type WebAppPreviewDemoCommandRunner,
} from './webAppPreviewDemo.js'

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

  test('runs a generated Playwright demo harness and records evidence receipt', async () => {
    const calls: string[] = []
    const runner: WebAppPreviewDemoCommandRunner = async (file, args, options) => {
      calls.push(`${file} ${args.join(' ')} cwd=${options.cwd}`)
      return {
        stdout: 'demo passed',
        stderr: '',
        code: 0,
      }
    }

    const run = await runWebAppPreviewDemoHarness({
      url: 'localhost:5173',
      name: 'ApexOS Product Demo',
      rationale: 'Capture launch-ready proof for the local app.',
      runner,
    })

    expect(run.ok).toBe(true)
    expect(run.command.args).toContain('test')
    expect(calls).toHaveLength(1)
    expect(existsSync(run.receiptPath)).toBe(true)
    expect(readFileSync(run.receiptPath, 'utf8')).toContain('"ok": true')
    expect(run.artifacts.some(artifact => artifact.path === run.receiptPath)).toBe(true)
  })

  test('can reuse an existing harness receipt without requiring the URL again', async () => {
    const harness = await createWebAppPreviewDemoHarness({
      url: 'https://example.com/product',
      name: 'Existing Demo',
      outputDir: join(configDir, 'existing-demo'),
    })

    const run = await runWebAppPreviewDemoHarness({
      outputDir: harness.outputDir,
      dryRun: true,
    })

    expect(run.ok).toBe(true)
    expect(run.dryRun).toBe(true)
    expect(run.harness.url).toBe('https://example.com/product')
    expect(run.stdoutTail).toContain('Dry run:')
  })

  test('packages generated demo evidence with hashes for delivery', async () => {
    const outputDir = join(configDir, 'package-demo')
    await runWebAppPreviewDemoHarness({
      url: 'localhost:5173',
      name: 'Package Demo',
      outputDir,
      runner: async () => ({
        stdout: 'demo passed',
        stderr: '',
        code: 0,
      }),
    })

    const packaged = await packageWebAppPreviewDemoArtifacts({
      outputDir,
    })

    expect(packaged.ok).toBe(true)
    expect(packaged.packageSha256).toHaveLength(64)
    expect(packaged.packageBytes).toBeGreaterThan(0)
    expect(existsSync(packaged.packagePath)).toBe(true)
    expect(existsSync(packaged.manifestPath)).toBe(true)
    expect(existsSync(packaged.receiptPath)).toBe(true)
    expect(readFileSync(packaged.manifestPath, 'utf8')).not.toContain(configDir)
    expect(
      packaged.files.some(file => file.relativePath === 'tests/demo.spec.ts'),
    ).toBe(true)
    expect(
      packaged.files.some(
        file => file.relativePath === 'openjaws-preview-demo-run.receipt.json',
      ),
    ).toBe(true)
  })
})
