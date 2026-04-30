import { mkdir, readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOpenJawsConfigHomeDir } from './envUtils.js'
import { normalizeBrowserPreviewUrl } from './browserPreview.js'
import { execFileNoThrowWithCwd } from './execFileNoThrow.js'

export type WebAppPreviewDemoHarnessFile = {
  kind: 'readme' | 'package' | 'config' | 'spec' | 'receipt'
  path: string
}

export type WebAppPreviewDemoHarness = {
  version: 1
  generatedAt: string
  name: string
  slug: string
  url: string
  rationale: string
  outputDir: string
  files: WebAppPreviewDemoHarnessFile[]
  commands: {
    preview: string
    installBrowsers: string
    codegen: string
    test: string
    headed: string
  }
}

export type WebAppPreviewDemoArtifact = {
  kind: 'receipt' | 'summary' | 'screenshot' | 'trace' | 'video' | 'report' | 'artifact'
  path: string
}

export type WebAppPreviewDemoCommandResult = {
  stdout: string
  stderr: string
  code: number
  error?: string
}

export type WebAppPreviewDemoCommandRunner = (
  file: string,
  args: string[],
  options: {
    cwd: string
    timeoutMs: number
  },
) => Promise<WebAppPreviewDemoCommandResult>

export type WebAppPreviewDemoRun = {
  version: 1
  generatedAt: string
  ok: boolean
  exitCode: number
  command: {
    file: string
    args: string[]
    cwd: string
  }
  harness: WebAppPreviewDemoHarness
  receiptPath: string
  artifacts: WebAppPreviewDemoArtifact[]
  stdoutTail: string
  stderrTail: string
  error?: string
  setup?: WebAppPreviewDemoCommandResult
  dryRun?: boolean
}

export type CreateWebAppPreviewDemoHarnessArgs = {
  url: string
  name?: string | null
  rationale?: string | null
  outputDir?: string | null
  generatedAt?: string | null
}

export type RunWebAppPreviewDemoHarnessArgs = {
  url?: string | null
  name?: string | null
  rationale?: string | null
  outputDir?: string | null
  timeoutMs?: number | null
  headed?: boolean | null
  installBrowsers?: boolean | null
  dryRun?: boolean | null
  runner?: WebAppPreviewDemoCommandRunner
}

const DEFAULT_DEMO_RUN_TIMEOUT_MS = 3 * 60 * 1000
const MAX_DEMO_RUN_TIMEOUT_MS = 15 * 60 * 1000
const OUTPUT_TAIL_CHARS = 16_000

function sanitizeDemoName(value: string | null | undefined): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length <= 80 ? trimmed : 'OpenJaws web app demo'
}

function sanitizeDemoSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return slug || 'openjaws-web-app-demo'
}

function quotePowerShell(value: string): string {
  return `"${value.replace(/`/g, '``').replace(/"/g, '`"')}"`
}

function buildCommands(args: {
  url: string
  configPath: string
}): WebAppPreviewDemoHarness['commands'] {
  const quotedUrl = quotePowerShell(args.url)
  const quotedConfig = quotePowerShell(args.configPath)
  return {
    preview: `/preview ${args.url}`,
    installBrowsers: 'bunx playwright install chromium',
    codegen: `bunx playwright codegen ${quotedUrl}`,
    test: `bunx playwright test -c ${quotedConfig}`,
    headed: `bunx playwright test -c ${quotedConfig} --headed`,
  }
}

function clampTimeoutMs(timeoutMs: number | null | undefined): number {
  if (!Number.isFinite(timeoutMs ?? Number.NaN)) {
    return DEFAULT_DEMO_RUN_TIMEOUT_MS
  }
  return Math.max(10_000, Math.min(Math.trunc(timeoutMs!), MAX_DEMO_RUN_TIMEOUT_MS))
}

function tail(value: string): string {
  return value.length > OUTPUT_TAIL_CHARS
    ? value.slice(value.length - OUTPUT_TAIL_CHARS)
    : value
}

function getHarnessFile(
  harness: WebAppPreviewDemoHarness,
  kind: WebAppPreviewDemoHarnessFile['kind'],
): string {
  const file = harness.files.find(candidate => candidate.kind === kind)
  if (!file) {
    throw new Error(`Playwright demo harness is missing ${kind} file metadata.`)
  }
  return file.path
}

async function defaultDemoCommandRunner(
  file: string,
  args: string[],
  options: {
    cwd: string
    timeoutMs: number
  },
): Promise<WebAppPreviewDemoCommandResult> {
  return execFileNoThrowWithCwd(file, args, {
    cwd: options.cwd,
    timeout: options.timeoutMs,
    maxBuffer: 4_000_000,
  })
}

function classifyArtifact(path: string): WebAppPreviewDemoArtifact['kind'] {
  const normalized = path.toLowerCase()
  if (normalized.endsWith('.receipt.json')) return 'receipt'
  if (normalized.endsWith('demo-summary.json')) return 'summary'
  if (normalized.endsWith('.png') || normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'screenshot'
  }
  if (normalized.endsWith('.zip') || normalized.includes('trace')) return 'trace'
  if (normalized.endsWith('.webm') || normalized.endsWith('.mp4')) return 'video'
  if (normalized.includes('playwright-report')) return 'report'
  return 'artifact'
}

async function collectDemoArtifacts(rootDir: string): Promise<WebAppPreviewDemoArtifact[]> {
  const artifacts: WebAppPreviewDemoArtifact[] = []

  async function walk(dir: string): Promise<void> {
    let entries: Awaited<ReturnType<typeof readdir>>
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(path)
        continue
      }
      artifacts.push({
        kind: classifyArtifact(path),
        path,
      })
    }
  }

  await walk(rootDir)
  return artifacts.sort((a, b) => a.path.localeCompare(b.path))
}

function parseHarnessReceipt(raw: string): WebAppPreviewDemoHarness | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WebAppPreviewDemoHarness>
    if (
      parsed.version === 1 &&
      typeof parsed.generatedAt === 'string' &&
      typeof parsed.name === 'string' &&
      typeof parsed.slug === 'string' &&
      typeof parsed.url === 'string' &&
      typeof parsed.rationale === 'string' &&
      typeof parsed.outputDir === 'string' &&
      Array.isArray(parsed.files) &&
      parsed.commands &&
      typeof parsed.commands.test === 'string'
    ) {
      return parsed as WebAppPreviewDemoHarness
    }
  } catch {
    return null
  }
  return null
}

async function readExistingHarness(
  outputDir: string | null | undefined,
): Promise<WebAppPreviewDemoHarness | null> {
  const trimmed = outputDir?.trim()
  if (!trimmed) {
    return null
  }
  try {
    const raw = await readFile(
      join(trimmed, 'openjaws-preview-demo.receipt.json'),
      'utf8',
    )
    return parseHarnessReceipt(raw)
  } catch {
    return null
  }
}

function buildPackageJson(name: string): string {
  return `${JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      scripts: {
        'install:browsers': 'playwright install chromium',
        test: 'playwright test',
        'test:headed': 'playwright test --headed',
        codegen: 'playwright codegen',
      },
      devDependencies: {
        '@playwright/test': '^1.59.1',
      },
    },
    null,
    2,
  )}\n`
}

function buildPlaywrightConfig(): string {
  return `import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  outputDir: './artifacts',
  reporter: [
    ['list'],
    ['html', { outputFolder: './playwright-report', open: 'never' }],
  ],
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 960 } },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
`
}

function buildDemoSpec(args: {
  name: string
  url: string
}): string {
  const title = JSON.stringify(args.name)
  const url = JSON.stringify(args.url)
  return `import { expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

const DEMO_NAME = ${title}
const DEMO_URL = ${url}

test.describe(DEMO_NAME, () => {
  test('loads, renders meaningful content, and captures demo evidence', async ({ page }, testInfo) => {
    const pageErrors: string[] = []
    const consoleErrors: string[] = []

    page.on('pageerror', error => {
      pageErrors.push(error.message)
    })
    page.on('console', message => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await page.goto(DEMO_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    await expect(page.locator('body')).toBeVisible()

    const bodyText = (await page.locator('body').innerText()).replace(/\\s+/g, ' ').trim()
    expect(bodyText.length, 'page should render inspectable copy').toBeGreaterThan(20)

    const title = await page.title()
    const url = page.url()
    const screenshotPath = testInfo.outputPath('demo-full-page.png')
    await page.screenshot({ path: screenshotPath, fullPage: true })

    await writeFile(
      testInfo.outputPath('demo-summary.json'),
      JSON.stringify({
        demoName: DEMO_NAME,
        requestedUrl: DEMO_URL,
        finalUrl: url,
        title,
        capturedAt: new Date().toISOString(),
        textPreview: bodyText.slice(0, 500),
        consoleErrors: consoleErrors.slice(0, 20),
        pageErrors: pageErrors.slice(0, 20),
      }, null, 2) + '\\n',
      'utf8',
    )

    expect(pageErrors, 'page runtime errors').toEqual([])
  })
})
`
}

function buildReadme(args: {
  name: string
  url: string
  rationale: string
  commands: WebAppPreviewDemoHarness['commands']
}): string {
  return [
    `# ${args.name}`,
    '',
    'This OpenJaws preview harness turns a web app, product page, service, or game URL into reusable Playwright demo evidence.',
    '',
    `- URL: ${args.url}`,
    `- Why: ${args.rationale}`,
    '',
    '## Commands',
    '',
    '```powershell',
    args.commands.installBrowsers,
    args.commands.test,
    args.commands.headed,
    args.commands.codegen,
    '```',
    '',
    '## What It Captures',
    '',
    '- desktop and mobile Chromium runs',
    '- full-page screenshot artifacts',
    '- Playwright trace/video on failure',
    '- a JSON summary with title, final URL, text preview, console errors, and page errors',
    '',
    'Use the OpenJaws preview lane while building:',
    '',
    '```text',
    args.commands.preview,
    '```',
    '',
  ].join('\n')
}

export async function createWebAppPreviewDemoHarness(
  args: CreateWebAppPreviewDemoHarnessArgs,
): Promise<WebAppPreviewDemoHarness> {
  const url = normalizeBrowserPreviewUrl(args.url, 'preview')
  const name = sanitizeDemoName(args.name)
  const slug = sanitizeDemoSlug(name)
  const rationale =
    args.rationale?.trim() ||
    'Create reusable Playwright demo evidence for a website, product, service, or game.'
  const outputDir =
    args.outputDir?.trim() ||
    join(getOpenJawsConfigHomeDir(), 'browser-preview', 'demos', slug)
  const generatedAt = args.generatedAt?.trim() || new Date().toISOString()
  const testsDir = join(outputDir, 'tests')
  const readmePath = join(outputDir, 'README.md')
  const packagePath = join(outputDir, 'package.json')
  const configPath = join(outputDir, 'playwright.config.ts')
  const specPath = join(testsDir, 'demo.spec.ts')
  const receiptPath = join(outputDir, 'openjaws-preview-demo.receipt.json')
  const commands = buildCommands({ url, configPath })

  await mkdir(testsDir, { recursive: true })
  const receipt: WebAppPreviewDemoHarness = {
    version: 1,
    generatedAt,
    name,
    slug,
    url,
    rationale,
    outputDir,
    files: [
      { kind: 'readme', path: readmePath },
      { kind: 'package', path: packagePath },
      { kind: 'config', path: configPath },
      { kind: 'spec', path: specPath },
      { kind: 'receipt', path: receiptPath },
    ],
    commands,
  }

  await Promise.all([
    writeFile(
      readmePath,
      buildReadme({
        name,
        url,
        rationale,
        commands,
      }),
      'utf8',
    ),
    writeFile(packagePath, buildPackageJson(slug), 'utf8'),
    writeFile(configPath, buildPlaywrightConfig(), 'utf8'),
    writeFile(specPath, buildDemoSpec({ name, url }), 'utf8'),
    writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8'),
  ])

  return receipt
}

export async function runWebAppPreviewDemoHarness(
  args: RunWebAppPreviewDemoHarnessArgs,
): Promise<WebAppPreviewDemoRun> {
  const existingHarness = await readExistingHarness(args.outputDir)
  const url = args.url?.trim()
  if (!existingHarness && !url) {
    throw new Error(
      'url is required when outputDir does not contain an OpenJaws Playwright demo harness receipt.',
    )
  }
  const harness =
    existingHarness ??
    (await createWebAppPreviewDemoHarness({
      url: url!,
      name: args.name,
      rationale: args.rationale,
      outputDir: args.outputDir,
    }))
  const timeoutMs = clampTimeoutMs(args.timeoutMs)
  const configPath = getHarnessFile(harness, 'config')
  const runner = args.runner ?? defaultDemoCommandRunner
  const command = {
    file: 'bunx',
    args: ['playwright', 'test', '-c', configPath, ...(args.headed ? ['--headed'] : [])],
    cwd: harness.outputDir,
  }
  const runReceiptPath = join(harness.outputDir, 'openjaws-preview-demo-run.receipt.json')
  const generatedAt = new Date().toISOString()

  let setup: WebAppPreviewDemoCommandResult | undefined
  let result: WebAppPreviewDemoCommandResult

  if (args.dryRun) {
    result = {
      stdout: `Dry run: ${command.file} ${command.args.join(' ')}`,
      stderr: '',
      code: 0,
    }
  } else {
    if (args.installBrowsers) {
      setup = await runner('bunx', ['playwright', 'install', 'chromium'], {
        cwd: harness.outputDir,
        timeoutMs,
      })
      if (setup.code !== 0) {
        result = setup
      } else {
        result = await runner(command.file, command.args, {
          cwd: command.cwd,
          timeoutMs,
        })
      }
    } else {
      result = await runner(command.file, command.args, {
        cwd: command.cwd,
        timeoutMs,
      })
    }
  }

  const artifacts = await collectDemoArtifacts(harness.outputDir)
  const run: WebAppPreviewDemoRun = {
    version: 1,
    generatedAt,
    ok: result.code === 0,
    exitCode: result.code,
    command,
    harness,
    receiptPath: runReceiptPath,
    artifacts,
    stdoutTail: tail(result.stdout),
    stderrTail: tail(result.stderr),
    error: result.error,
    setup,
    dryRun: args.dryRun ? true : undefined,
  }

  await writeFile(runReceiptPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  run.artifacts = await collectDemoArtifacts(harness.outputDir)
  await writeFile(runReceiptPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  return run
}
