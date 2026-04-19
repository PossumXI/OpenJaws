import { randomUUID } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { isIP } from 'net'
import { join } from 'path'
import { getOpenJawsConfigHomeDir } from './envUtils.js'
import {
  closeApexBrowserSession,
  getApexBrowserHealth,
  getApexBrowserSummary,
  getApexLaunchTarget,
  navigateApexBrowserSession,
  openApexBrowserSession,
  startApexBrowserBridge,
  summarizeApexBrowser,
  type ApexBrowserSession,
  type ApexBrowserSummary,
  type ApexWorkspaceHealth,
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

export type BrowserPreviewRuntime = {
  configured: boolean
  bridgePath: string | null
  bridgeReady: boolean
  launchReady: boolean
  health: ApexWorkspaceHealth | null
  summary: ApexBrowserSummary | null
  message: string
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
    ? record.sessions
        .filter(isBrowserPreviewSession)
        .filter(isAccountableBrowserPreviewSession)
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

function isAccountableBrowserPreviewSession(
  session: BrowserPreviewSession,
): boolean {
  return session.requestedBy === 'agent'
}

function isPrivateBrowserPreviewHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (
    normalized === 'localhost' ||
    normalized === 'host.docker.internal' ||
    normalized.endsWith('.local') ||
    normalized === '::1'
  ) {
    return true
  }
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) {
    const [a, b] = normalized.split('.').map(Number)
    return (
      a === 10 ||
      a === 127 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    )
  }
  if (ipVersion === 6) {
    return (
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80:')
    )
  }
  return false
}

export function normalizeBrowserPreviewUrl(
  url: string,
  intent: BrowserPreviewIntent = 'preview',
): string {
  const trimmed = url.trim()
  if (!trimmed) {
    throw new Error('A preview URL is required.')
  }
  if (trimmed.startsWith('localhost')) {
    return `http://${trimmed}`
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
  } catch {
    throw new Error(`Invalid preview URL: ${trimmed}`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(
      `Unsupported preview URL protocol: ${parsed.protocol}. Use http:// or https://.`,
    )
  }
  if (intent !== 'preview' && isPrivateBrowserPreviewHost(parsed.hostname)) {
    throw new Error(
      'Private-network browser targets are only allowed for preview intent. Use preview for local apps and reserve browse/watch/music for public URLs.',
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
  runtime: BrowserPreviewRuntime
}> {
  const current = await resolveBrowserPreviewRuntime()
  if (current.bridgeReady) {
    return {
      ok: true,
      runtime: current,
    }
  }

  const start = await startApexBrowserBridge()
  const next = await resolveBrowserPreviewRuntime({
    startupMessage: start.message,
  })
  return {
    ok: next.bridgeReady,
    runtime: next,
  }
}

function buildBrowserRuntimeMessage(args: {
  configured: boolean
  health: ApexWorkspaceHealth | null
  summary: ApexBrowserSummary | null
  startupMessage?: string | null
}): string {
  if (args.summary) {
    const activeSession =
      args.summary.sessions.find(session => session.id === args.summary.activeSessionId) ??
      args.summary.sessions[0] ??
      null
    return activeSession
      ? `OpenJaws browser bridge ready with ${activeSession.title} in the native TUI preview lane.`
      : 'OpenJaws browser bridge ready for native in-TUI preview rendering.'
  }
  if (args.health) {
    return 'OpenJaws browser bridge online and waiting for the first native TUI preview session.'
  }
  if (args.startupMessage?.trim()) {
    return args.startupMessage.trim()
  }
  return args.configured
    ? 'Browser bridge offline. Opening a /preview session will boot it if the Apex browser source is available.'
    : 'Browser source is unavailable. Configure OPENJAWS_APEX_ROOT / OPENJAWS_APEX_ASGARD_ROOT first.'
}

async function resolveBrowserPreviewRuntime(args?: {
  startupMessage?: string | null
}): Promise<BrowserPreviewRuntime> {
  const launchTarget = getApexLaunchTarget('browser_bridge')
  const [health, summary] = await Promise.all([
    getApexBrowserHealth(),
    getApexBrowserSummary(),
  ])
  const configured = Boolean(launchTarget)
  return {
    configured,
    bridgePath: launchTarget?.path ?? null,
    bridgeReady: Boolean(health),
    launchReady: configured,
    health,
    summary,
    message: buildBrowserRuntimeMessage({
      configured,
      health,
      summary,
      startupMessage: args?.startupMessage ?? null,
    }),
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

export async function readBrowserPreviewRuntime(): Promise<BrowserPreviewRuntime> {
  return resolveBrowserPreviewRuntime()
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
  runtime: BrowserPreviewRuntime
}> {
  const intent = coerceIntent(args.intent)
  const url = normalizeBrowserPreviewUrl(args.url, intent)
  const rationale = normalizeRationale(args.rationale)
  const requestedBy = args.requestedBy ?? 'user'
  const runtime = await ensureApexBrowserRuntime()
  if (!runtime.ok) {
    const session = createPreviewSession('open_url', {
      intent,
      rationale,
      requestedBy,
      opened: false,
      note: runtime.runtime.message,
      url,
    })
    return {
      ok: false,
      message: runtime.runtime.message,
      session,
      receipt: await readBrowserPreviewReceipt(),
      runtime: runtime.runtime,
    }
  }

  const result = await openApexBrowserSession({
    url,
    intent,
    rationale,
    requestedBy,
    recordHistory: requestedBy === 'agent',
  })
  const session = createPreviewSession('open_url', {
    intent,
    rationale,
    requestedBy,
    opened: result.ok,
    note: result.message,
    url: result.data?.session?.url ?? url,
  })
  const receipt = shouldPersistSession(requestedBy)
    ? await appendSession(session)
    : await readBrowserPreviewReceipt()
  const nextRuntime = await resolveBrowserPreviewRuntime()
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
  runtime: BrowserPreviewRuntime
}> {
  const sessionId = args.sessionId.trim()
  if (!sessionId) {
    throw new Error('A browser session id is required.')
  }
  const intent = coerceIntent(args.intent)
  const url = normalizeBrowserPreviewUrl(args.url, intent)
  const requestedBy = args.requestedBy ?? 'user'
  const rationale = normalizeRationale(
    args.rationale ?? 'Continue the active browser session in the TUI lane.',
  )
  const result = await navigateApexBrowserSession({
    sessionId,
    url,
  })
  const session = createPreviewSession('navigate_session', {
    intent,
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
    runtime: await resolveBrowserPreviewRuntime(),
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
  runtime: BrowserPreviewRuntime
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
    runtime: await resolveBrowserPreviewRuntime(),
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
  runtime: BrowserPreviewRuntime
}> {
  const rationale = normalizeRationale(args.rationale)
  const requestedBy = args.requestedBy ?? 'user'
  const runtime = await ensureApexBrowserRuntime()
  const session = createPreviewSession('launch_apex_browser', {
    intent: coerceIntent(args.intent),
    rationale,
    requestedBy,
    opened: runtime.ok,
    note: runtime.runtime.message,
  })
  const receipt = shouldPersistSession(requestedBy)
    ? await appendSession(session)
    : await readBrowserPreviewReceipt()
  return {
    ok: runtime.ok,
    message: runtime.runtime.message,
    session,
    receipt,
    runtime: runtime.runtime,
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
  runtime: BrowserPreviewRuntime | null,
): BrowserPreviewSummary {
  if (!runtime) {
    return summarizeApexBrowser(null)
  }
  if (runtime.summary) {
    const summary = summarizeApexBrowser(runtime.summary)
    return {
      headline: summary.headline,
      details: [
        runtime.message,
        ...summary.details,
      ],
    }
  }
  return {
    headline: runtime.bridgeReady
      ? 'Browser bridge online'
      : runtime.configured
        ? 'Browser bridge offline'
        : 'Browser source unavailable',
    details: [
      runtime.message,
      ...(runtime.bridgePath ? [runtime.bridgePath] : []),
      runtime.launchReady ? 'launch ready' : 'launch unavailable',
    ],
  }
}
