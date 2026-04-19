import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { getOpenJawsConfigHomeDir } from './envUtils.js'
import {
  closeApexBrowserSession,
  getApexBrowserHealth,
  getApexBrowserSummary,
  navigateApexBrowserSession,
  openApexBrowserSession,
  startApexBrowserBridge,
  summarizeApexBrowser,
  type ApexBrowserSession,
  type ApexBrowserSummary,
} from './apexWorkspace.js'

export type BrowserPreviewIntent =
  | 'preview'
  | 'research'
  | 'browse'
  | 'watch'
  | 'music'

export type BrowserPreviewHandler =
  | 'openjaws-browser'
  | 'chrome'
  | 'system'
  | 'apex-browser'

export type BrowserPreviewAction =
  | 'open_url'
  | 'navigate_session'
  | 'close_session'
  | 'launch_apex_browser'

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
    (record.action === 'open_url' ||
      record.action === 'navigate_session' ||
      record.action === 'close_session' ||
      record.action === 'launch_apex_browser') &&
    typeof record.intent === 'string' &&
    typeof record.rationale === 'string' &&
    (record.requestedBy === 'user' || record.requestedBy === 'agent') &&
    typeof record.startedAt === 'string' &&
    (record.handler === 'openjaws-browser' ||
      record.handler === 'chrome' ||
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
  if (trimmed.startsWith('localhost')) {
    return `http://${trimmed}`
  }
  try {
    const parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        `Unsupported preview URL protocol: ${parsed.protocol}. Use http:// or https://.`,
      )
    }
    return parsed.toString()
  } catch {
    throw new Error(`Invalid preview URL: ${trimmed}`)
  }
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
  const target = session.url ?? 'browser session'
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

async function ensureApexBrowserRuntime(): Promise<{
  ok: boolean
  message: string
  summary: ApexBrowserSummary | null
}> {
  const health = await getApexBrowserHealth()
  if (health) {
    return {
      ok: true,
      message: `Browser bridge ready at ${health.service}.`,
      summary: await getApexBrowserSummary(),
    }
  }

  const start = await startApexBrowserBridge()
  return {
    ok: start.ok,
    message: start.message,
    summary: await getApexBrowserSummary(),
  }
}

function createPreviewSession(
  action: BrowserPreviewAction,
  input: {
    intent: BrowserPreviewIntent
    rationale: string
    requestedBy: 'user' | 'agent'
    opened: boolean
    note: string
    url?: string
  },
): BrowserPreviewSession {
  return {
    id: randomUUID(),
    action,
    intent: input.intent,
    rationale: input.rationale,
    requestedBy: input.requestedBy,
    startedAt: new Date().toISOString(),
    handler: 'openjaws-browser',
    opened: input.opened,
    note: input.note,
    url: input.url,
  }
}

function shouldPersistSession(requestedBy: 'user' | 'agent'): boolean {
  return requestedBy === 'agent'
}

function buildOpenMessage(
  requestedBy: 'user' | 'agent',
  session: ApexBrowserSession | null,
): string {
  if (!session) {
    return requestedBy === 'agent'
      ? 'Opened a Q-directed browser session.'
      : 'Opened an in-TUI browser session.'
  }
  return requestedBy === 'agent'
    ? `Opened ${session.url} in the OpenJaws browser and recorded the accountable handoff.`
    : `Opened ${session.url} in the OpenJaws browser. User browsing history is not persisted.`
}

export async function readBrowserPreviewRuntime(): Promise<ApexBrowserSummary | null> {
  return getApexBrowserSummary()
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
  runtime: ApexBrowserSummary | null
}> {
  const url = normalizeBrowserPreviewUrl(args.url)
  const rationale = normalizeRationale(args.rationale)
  const requestedBy = args.requestedBy ?? 'user'
  const runtime = await ensureApexBrowserRuntime()
  if (!runtime.ok) {
    const session = createPreviewSession('open_url', {
      intent: coerceIntent(args.intent),
      rationale,
      requestedBy,
      opened: false,
      note: runtime.message,
      url,
    })
    return {
      ok: false,
      message: runtime.message,
      session,
      receipt: await readBrowserPreviewReceipt(),
      runtime: runtime.summary,
    }
  }

  const result = await openApexBrowserSession({
    url,
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    recordHistory: requestedBy === 'agent',
  })
  const session = createPreviewSession('open_url', {
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    opened: result.ok,
    note: result.message,
    url: result.data?.session?.url ?? url,
  })
  const receipt = shouldPersistSession(requestedBy)
    ? await appendSession(session)
    : await readBrowserPreviewReceipt()
  const nextRuntime = await getApexBrowserSummary()
  return {
    ok: result.ok,
    message:
      result.ok && result.data?.session
        ? buildOpenMessage(requestedBy, result.data.session)
        : result.message,
    session,
    receipt,
    runtime: nextRuntime,
  }
}

export async function navigateBrowserPreviewSession(args: {
  sessionId: string
  url: string
  requestedBy?: 'user' | 'agent'
  intent?: BrowserPreviewIntent
  rationale?: string
}): Promise<{
  ok: boolean
  message: string
  session: BrowserPreviewSession
  receipt: BrowserPreviewReceipt
  runtime: ApexBrowserSummary | null
}> {
  const sessionId = args.sessionId.trim()
  if (!sessionId) {
    throw new Error('A browser session id is required.')
  }
  const url = normalizeBrowserPreviewUrl(args.url)
  const requestedBy = args.requestedBy ?? 'user'
  const rationale = normalizeRationale(
    args.rationale ?? 'Continue the active browser session in the TUI lane.',
  )
  const result = await navigateApexBrowserSession({
    sessionId,
    url,
  })
  const session = createPreviewSession('navigate_session', {
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    opened: result.ok,
    note: result.message,
    url: result.data?.session?.url ?? url,
  })
  const receipt = shouldPersistSession(requestedBy)
    ? await appendSession(session)
    : await readBrowserPreviewReceipt()
  return {
    ok: result.ok,
    message: result.message,
    session,
    receipt,
    runtime: await getApexBrowserSummary(),
  }
}

export async function closeBrowserPreviewSession(args: {
  sessionId: string
  requestedBy?: 'user' | 'agent'
}): Promise<{
  ok: boolean
  message: string
  session: BrowserPreviewSession
  receipt: BrowserPreviewReceipt
  runtime: ApexBrowserSummary | null
}> {
  const sessionId = args.sessionId.trim()
  if (!sessionId) {
    throw new Error('A browser session id is required.')
  }
  const requestedBy = args.requestedBy ?? 'user'
  const result = await closeApexBrowserSession({ sessionId })
  const session = createPreviewSession('close_session', {
    intent: 'preview',
    rationale: 'Close the in-TUI browser session.',
    requestedBy,
    opened: result.ok,
    note: result.message,
  })
  const receipt = shouldPersistSession(requestedBy)
    ? await appendSession(session)
    : await readBrowserPreviewReceipt()
  return {
    ok: result.ok,
    message: result.message,
    session,
    receipt,
    runtime: await getApexBrowserSummary(),
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
  runtime: ApexBrowserSummary | null
}> {
  const rationale = normalizeRationale(args.rationale)
  const requestedBy = args.requestedBy ?? 'user'
  const runtime = await ensureApexBrowserRuntime()
  const session = createPreviewSession('launch_apex_browser', {
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    opened: runtime.ok,
    note: runtime.message,
  })
  const receipt = shouldPersistSession(requestedBy)
    ? await appendSession(session)
    : await readBrowserPreviewReceipt()
  return {
    ok: runtime.ok,
    message: runtime.message,
    session,
    receipt,
    runtime: runtime.summary,
  }
}

export function summarizeBrowserPreviewReceipt(
  receipt: BrowserPreviewReceipt | null,
): BrowserPreviewSummary {
  if (!receipt || receipt.sessions.length === 0) {
    return {
      headline: 'No accountable browser handoffs recorded yet.',
      details: [
        'User browser sessions stay inside the TUI and do not persist browsing history by default.',
        'Q or agent-led browsing on the user’s behalf is the only lane that lands in accountable receipts.',
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

export function summarizeBrowserPreviewRuntime(
  summary: ApexBrowserSummary | null,
): BrowserPreviewSummary {
  return summarizeApexBrowser(summary)
}
