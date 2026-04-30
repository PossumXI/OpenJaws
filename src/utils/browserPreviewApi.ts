import {
  closeBrowserPreviewSession,
  handoffBrowserPreviewSession,
  launchApexBrowserShell,
  openAccountableBrowserPreview,
  readBrowserPreviewReceipt,
  readBrowserPreviewRuntime,
  summarizeBrowserPreviewReceipt,
  summarizeBrowserPreviewRuntime,
  navigateBrowserPreviewSession,
  type BrowserPreviewIntent,
  type BrowserPreviewRequester,
} from './browserPreview.js'
import {
  createWebAppPreviewDemoHarness,
  runWebAppPreviewDemoHarness,
  type WebAppPreviewDemoCommandRunner,
} from './webAppPreviewDemo.js'

export const BROWSER_PREVIEW_API_ACTIONS = [
  'capabilities',
  'runtime',
  'receipts',
  'open',
  'navigate',
  'close',
  'launch',
  'handoff',
  'demo_harness',
  'demo_run',
] as const

export const BROWSER_PREVIEW_API_INTENTS = [
  'preview',
  'research',
  'browse',
  'watch',
  'music',
] as const

export const BROWSER_PREVIEW_API_REQUESTERS = [
  'user',
  'agent',
  'operator',
] as const

export type BrowserPreviewApiAction =
  (typeof BROWSER_PREVIEW_API_ACTIONS)[number]

export type BrowserPreviewApiInput = {
  action: BrowserPreviewApiAction
  url?: string
  sessionId?: string
  intent?: string
  rationale?: string
  requestedBy?: string
  name?: string
  outputDir?: string
  timeoutMs?: number
  headed?: boolean
  installBrowsers?: boolean
  dryRun?: boolean
}

export type BrowserPreviewApiOutput = {
  ok: boolean
  action: BrowserPreviewApiAction
  summary: string
  message: string
  data: unknown
}

const MUTATING_ACTIONS = new Set<BrowserPreviewApiAction>([
  'open',
  'navigate',
  'close',
  'launch',
  'handoff',
  'demo_harness',
  'demo_run',
])

export type BrowserPreviewApiDependencies = {
  demoRunner?: WebAppPreviewDemoCommandRunner
}

export function isBrowserPreviewApiReadOnly(
  action: BrowserPreviewApiAction,
): boolean {
  return !MUTATING_ACTIONS.has(action)
}

function normalizeIntent(intent: string | undefined): BrowserPreviewIntent {
  if (!intent) {
    return 'preview'
  }
  if (BROWSER_PREVIEW_API_INTENTS.includes(intent as BrowserPreviewIntent)) {
    return intent as BrowserPreviewIntent
  }
  throw new Error(
    `Unsupported browser preview intent "${intent}". Use one of: ${BROWSER_PREVIEW_API_INTENTS.join(', ')}.`,
  )
}

function normalizeRequester(
  requestedBy: string | undefined,
): BrowserPreviewRequester {
  if (!requestedBy) {
    return 'agent'
  }
  if (BROWSER_PREVIEW_API_REQUESTERS.includes(requestedBy as BrowserPreviewRequester)) {
    return requestedBy as BrowserPreviewRequester
  }
  throw new Error(
    `Unsupported browser preview requester "${requestedBy}". Use one of: ${BROWSER_PREVIEW_API_REQUESTERS.join(', ')}.`,
  )
}

function requireString(value: string | undefined, field: string): string {
  const trimmed = value?.trim()
  if (!trimmed) {
    throw new Error(`${field} is required.`)
  }
  return trimmed
}

function defaultRationale(action: BrowserPreviewApiAction): string {
  switch (action) {
    case 'open':
      return 'Open an accountable browser preview for the requested URL.'
    case 'navigate':
      return 'Navigate an accountable browser session to the requested URL.'
    case 'handoff':
      return 'Hand off a browser session into the accountable preview lane.'
    case 'demo_harness':
      return 'Create reusable Playwright demo evidence for this web surface.'
    case 'demo_run':
      return 'Run Playwright demo evidence capture for this web surface.'
    case 'launch':
    case 'close':
    case 'capabilities':
    case 'runtime':
    case 'receipts':
      return 'Inspect or manage the OpenJaws browser preview lane.'
  }
}

function summarizeRuntime(): Promise<{
  runtime: Awaited<ReturnType<typeof readBrowserPreviewRuntime>>
  runtimeSummary: ReturnType<typeof summarizeBrowserPreviewRuntime>
}> {
  return readBrowserPreviewRuntime().then(runtime => ({
    runtime,
    runtimeSummary: summarizeBrowserPreviewRuntime(runtime),
  }))
}

export async function runBrowserPreviewApiAction(
  input: BrowserPreviewApiInput,
  dependencies: BrowserPreviewApiDependencies = {},
): Promise<BrowserPreviewApiOutput> {
  switch (input.action) {
    case 'capabilities': {
      return {
        ok: true,
        action: input.action,
        summary: 'OpenJaws browser preview capabilities are available.',
        message:
          'Direct Connect can inspect the browser runtime, open/navigate/close accountable preview sessions, hand off sessions, and write or run Playwright demo harnesses.',
        data: {
          actions: BROWSER_PREVIEW_API_ACTIONS,
          intents: BROWSER_PREVIEW_API_INTENTS,
          requesters: BROWSER_PREVIEW_API_REQUESTERS,
          endpoints: {
            capabilities: 'GET /browser/capabilities',
            runtime: 'GET /browser/runtime',
            receipts: 'GET /browser/receipts',
            open: 'POST /browser/open',
            navigate: 'POST /browser/navigate',
            close: 'POST /browser/close',
            launch: 'POST /browser/launch',
            handoff: 'POST /browser/handoff',
            demoHarness: 'POST /browser/demo-harness',
            demoRun: 'POST /browser/demo-run',
          },
        },
      }
    }
    case 'runtime': {
      const { runtime, runtimeSummary } = await summarizeRuntime()
      return {
        ok: true,
        action: input.action,
        summary: runtimeSummary.headline,
        message: runtime.message,
        data: {
          runtime,
          summary: runtimeSummary,
        },
      }
    }
    case 'receipts': {
      const receipt = await readBrowserPreviewReceipt()
      const receiptSummary = summarizeBrowserPreviewReceipt(receipt)
      return {
        ok: true,
        action: input.action,
        summary: receiptSummary.headline,
        message: receiptSummary.details.join('\n'),
        data: {
          receipt,
          summary: receiptSummary,
        },
      }
    }
    case 'open': {
      const result = await openAccountableBrowserPreview({
        url: requireString(input.url, 'url'),
        intent: normalizeIntent(input.intent),
        rationale: input.rationale?.trim() || defaultRationale(input.action),
        requestedBy: normalizeRequester(input.requestedBy),
      })
      return {
        ok: result.ok,
        action: input.action,
        summary: result.message,
        message: result.message,
        data: result,
      }
    }
    case 'navigate': {
      const result = await navigateBrowserPreviewSession({
        sessionId: requireString(input.sessionId, 'sessionId'),
        url: requireString(input.url, 'url'),
        requestedBy: normalizeRequester(input.requestedBy),
        intent: normalizeIntent(input.intent),
        rationale: input.rationale?.trim() || defaultRationale(input.action),
      })
      return {
        ok: result.ok,
        action: input.action,
        summary: result.message,
        message: result.message,
        data: result,
      }
    }
    case 'close': {
      const result = await closeBrowserPreviewSession({
        sessionId: requireString(input.sessionId, 'sessionId'),
        requestedBy: normalizeRequester(input.requestedBy),
      })
      return {
        ok: result.ok,
        action: input.action,
        summary: result.message,
        message: result.message,
        data: result,
      }
    }
    case 'launch': {
      const result = await launchApexBrowserShell({
        intent: normalizeIntent(input.intent),
        rationale: input.rationale?.trim() || defaultRationale(input.action),
        requestedBy: normalizeRequester(input.requestedBy),
      })
      return {
        ok: result.ok,
        action: input.action,
        summary: result.message,
        message: result.message,
        data: result,
      }
    }
    case 'handoff': {
      const requester = normalizeRequester(input.requestedBy)
      const result = await handoffBrowserPreviewSession({
        sessionId: requireString(input.sessionId, 'sessionId'),
        rationale: input.rationale?.trim() || defaultRationale(input.action),
        intent: normalizeIntent(input.intent),
        requestedBy: requester === 'user' ? 'operator' : requester,
      })
      return {
        ok: result.ok,
        action: input.action,
        summary: result.message,
        message: result.message,
        data: result,
      }
    }
    case 'demo_harness': {
      const harness = await createWebAppPreviewDemoHarness({
        url: requireString(input.url, 'url'),
        name: input.name,
        rationale: input.rationale?.trim() || defaultRationale(input.action),
        outputDir: input.outputDir,
      })
      return {
        ok: true,
        action: input.action,
        summary: `Wrote Playwright demo harness to ${harness.outputDir}`,
        message:
          `Wrote Playwright demo harness for ${harness.url}. ` +
          `Run "${harness.commands.test}" to capture desktop/mobile evidence.`,
        data: {
          harness,
        },
      }
    }
    case 'demo_run': {
      const run = await runWebAppPreviewDemoHarness({
        url: input.url,
        name: input.name,
        rationale: input.rationale?.trim() || defaultRationale(input.action),
        outputDir: input.outputDir,
        timeoutMs: input.timeoutMs,
        headed: input.headed,
        installBrowsers: input.installBrowsers,
        dryRun: input.dryRun,
        runner: dependencies.demoRunner,
      })
      return {
        ok: run.ok,
        action: input.action,
        summary: run.ok
          ? `Captured Playwright demo evidence in ${run.harness.outputDir}`
          : `Playwright demo capture failed with exit code ${run.exitCode}`,
        message:
          `Ran "${run.command.file} ${run.command.args.join(' ')}" in ` +
          `${run.command.cwd}. Receipt: ${run.receiptPath}`,
        data: {
          run,
        },
      }
    }
  }
}
