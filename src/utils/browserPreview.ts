import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOpenJawsConfigHomeDir } from './envUtils.js'
import { openBrowser } from './browser.js'
import { runApexAction } from './apexWorkspace.js'
import {
  detectAvailableBrowser,
  openInChrome,
} from './openjawsInChrome/common.js'

export type BrowserPreviewIntent =
  | 'preview'
  | 'research'
  | 'browse'
  | 'watch'
  | 'music'

export type BrowserPreviewHandler = 'chrome' | 'system' | 'apex-browser'

export type BrowserPreviewAction = 'open_url' | 'launch_apex_browser'

export type BrowserPreviewSession = {
  id: string
  action: BrowserPreviewAction
  intent: BrowserPreviewIntent
  rationale: string
  requestedBy: 'user' | 'agent'
  startedAt: string
  handler: BrowserPreviewHandler
  opened: boolean
  note: string
  url?: string
}

export type BrowserPreviewReceipt = {
  version: 1
  updatedAt: string
  lastSessionId: string | null
  sessions: BrowserPreviewSession[]
}

export type BrowserPreviewSummary = {
  headline: string
  details: string[]
}

const BROWSER_PREVIEW_DIR = 'browser-preview'
const BROWSER_PREVIEW_RECEIPT = 'receipt.json'
const MAX_BROWSER_PREVIEW_SESSIONS = 30

function createEmptyReceipt(): BrowserPreviewReceipt {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    lastSessionId: null,
    sessions: [],
  }
}

function coerceIntent(value: string | undefined): BrowserPreviewIntent {
  switch ((value ?? '').trim().toLowerCase()) {
    case 'research':
    case 'browse':
    case 'watch':
    case 'music':
      return value!.trim().toLowerCase() as BrowserPreviewIntent
    default:
      return 'preview'
  }
}

function parseReceipt(raw: string): BrowserPreviewReceipt {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return createEmptyReceipt()
  }

  if (!parsed || typeof parsed !== 'object') {
    return createEmptyReceipt()
  }

  const record = parsed as Partial<BrowserPreviewReceipt>
  const sessions = Array.isArray(record.sessions)
    ? record.sessions.filter(isBrowserPreviewSession)
    : []

  return {
    version: 1,
    updatedAt:
      typeof record.updatedAt === 'string'
        ? record.updatedAt
        : createEmptyReceipt().updatedAt,
    lastSessionId:
      typeof record.lastSessionId === 'string' ? record.lastSessionId : null,
    sessions,
  }
}

function isBrowserPreviewSession(value: unknown): value is BrowserPreviewSession {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Partial<BrowserPreviewSession>
  return (
    typeof record.id === 'string' &&
    (record.action === 'open_url' || record.action === 'launch_apex_browser') &&
    typeof record.intent === 'string' &&
    typeof record.rationale === 'string' &&
    (record.requestedBy === 'user' || record.requestedBy === 'agent') &&
    typeof record.startedAt === 'string' &&
    (record.handler === 'chrome' ||
      record.handler === 'system' ||
      record.handler === 'apex-browser') &&
    typeof record.opened === 'boolean' &&
    typeof record.note === 'string' &&
    (record.url === undefined || typeof record.url === 'string')
  )
}

function normalizeBrowserPreviewUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('A preview URL is required.')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`Invalid preview URL: ${trimmed}`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported preview URL protocol: ${parsed.protocol}. Use http:// or https://.`,
    )
  }

  return parsed.toString()
}

function normalizeRationale(rationale: string): string {
  const trimmed = rationale.trim()
  if (trimmed.length < 6) {
    throw new Error('Add a short rationale so the preview lane stays accountable.')
  }
  if (trimmed.length > 280) {
    throw new Error('Keep the browser rationale under 280 characters.')
  }
  return trimmed
}

function summarizeSession(session: BrowserPreviewSession): string {
  const target =
    session.action === 'launch_apex_browser'
      ? 'Apex browser shell'
      : session.url ?? 'browser session'
  return `${session.intent} · ${session.handler} · ${target}`
}

async function writeReceipt(receipt: BrowserPreviewReceipt): Promise<void> {
  const dir = join(getOpenJawsConfigHomeDir(), BROWSER_PREVIEW_DIR)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, BROWSER_PREVIEW_RECEIPT),
    JSON.stringify(receipt, null, 2) + '\n',
    'utf8',
  )
}

async function appendSession(
  session: BrowserPreviewSession,
): Promise<BrowserPreviewReceipt> {
  const receipt = await readBrowserPreviewReceipt()
  const nextSessions = [session, ...receipt.sessions].slice(
    0,
    MAX_BROWSER_PREVIEW_SESSIONS,
  )
  const next: BrowserPreviewReceipt = {
    version: 1,
    updatedAt: new Date().toISOString(),
    lastSessionId: session.id,
    sessions: nextSessions,
  }
  await writeReceipt(next)
  return next
}

export function getBrowserPreviewReceiptPath(): string {
  return join(
    getOpenJawsConfigHomeDir(),
    BROWSER_PREVIEW_DIR,
    BROWSER_PREVIEW_RECEIPT,
  )
}

export async function readBrowserPreviewReceipt(): Promise<BrowserPreviewReceipt> {
  try {
    const raw = await readFile(getBrowserPreviewReceiptPath(), 'utf8')
    return parseReceipt(raw)
  } catch {
    return createEmptyReceipt()
  }
}

export async function openAccountableBrowserPreview(args: {
  url: string
  intent: BrowserPreviewIntent
  rationale: string
  requestedBy?: 'user' | 'agent'
}): Promise<{
  ok: boolean
  message: string
  session: BrowserPreviewSession
  receipt: BrowserPreviewReceipt
}> {
  const url = normalizeBrowserPreviewUrl(args.url)
  const rationale = normalizeRationale(args.rationale)
  const requestedBy = args.requestedBy ?? 'user'

  let handler: BrowserPreviewHandler = 'system'
  let opened = false
  const detectedBrowser = await detectAvailableBrowser().catch(() => null)

  if (detectedBrowser) {
    handler = 'chrome'
    opened = await openInChrome(url)
  }

  if (!opened) {
    handler = 'system'
    opened = await openBrowser(url)
  }

  const note = opened
    ? `Opened in ${handler === 'chrome' ? 'Chrome-compatible preview lane' : 'the system browser'}.`
    : 'Failed to open the preview URL.'

  const session: BrowserPreviewSession = {
    id: randomUUID(),
    action: 'open_url',
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    startedAt: new Date().toISOString(),
    handler,
    opened,
    note,
    url,
  }

  const receipt = await appendSession(session)
  return {
    ok: opened,
    message: opened
      ? `Opened ${url} for ${session.intent} via ${handler}.`
      : `Failed to open ${url}.`,
    session,
    receipt,
  }
}

export async function launchApexBrowserShell(args: {
  intent: BrowserPreviewIntent
  rationale: string
  requestedBy?: 'user' | 'agent'
}): Promise<{
  ok: boolean
  message: string
  session: BrowserPreviewSession
  receipt: BrowserPreviewReceipt
}> {
  const rationale = normalizeRationale(args.rationale)
  const requestedBy = args.requestedBy ?? 'user'
  const result = await runApexAction('browser')

  const session: BrowserPreviewSession = {
    id: randomUUID(),
    action: 'launch_apex_browser',
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    startedAt: new Date().toISOString(),
    handler: 'apex-browser',
    opened: result.ok,
    note: result.message,
  }

  const receipt = await appendSession(session)
  return {
    ok: result.ok,
    message: result.message,
    session,
    receipt,
  }
}

export function summarizeBrowserPreviewReceipt(
  receipt: BrowserPreviewReceipt | null,
): BrowserPreviewSummary {
  if (!receipt || receipt.sessions.length === 0) {
    return {
      headline: 'No accountable browser sessions recorded yet.',
      details: [
        'Use /preview to open a local app, research URL, or chill/watch lane with an explicit rationale.',
      ],
    }
  }

  const [latest, ...rest] = receipt.sessions
  return {
    headline: `${summarizeSession(latest)} · ${latest.opened ? 'opened' : 'failed'}`,
    details: [
      `requested by ${latest.requestedBy} · ${latest.startedAt}`,
      `why ${latest.rationale}`,
      ...rest.slice(0, 4).map(summarizeSession),
    ],
  }
}
