import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOpenJawsConfigHomeDir } from './envUtils.js'
import { normalizeBrowserPreviewUrl } from './browserPreview.js'

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

export type CreateWebAppPreviewDemoHarnessArgs = {
  url: string
  name?: string | null
  rationale?: string | null
  outputDir?: string | null
  generatedAt?: string | null
}

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
