import { existsSync, openSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve, sep } from 'path'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { execFileNoThrow } from './execFileNoThrow.js'
import { openPath } from './browser.js'
import { which } from './which.js'

const DEFAULT_WINDOWS_HOME =
  process.env.USERPROFILE?.trim() || process.env.HOME?.trim() || process.cwd()
const DEFAULT_ASGARD_ROOT = resolve(
  process.env.OPENJAWS_APEX_ASGARD_ROOT?.trim() ||
    join(DEFAULT_WINDOWS_HOME, 'Desktop', 'cheeks', 'Asgard'),
)
export const APEX_PROJECT_ROOT = resolve(
  process.env.OPENJAWS_APEX_ROOT?.trim() ||
    join(DEFAULT_ASGARD_ROOT, 'ignite', 'apex-os-project'),
)
export const APEX_KERNEL_ROOT = resolve(join(APEX_PROJECT_ROOT, 'kernel'))
export const APEX_APPS_ROOT = resolve(join(APEX_PROJECT_ROOT, 'apps'))
export const APEX_NOTIFICATIONS_ROOT = resolve(
  process.env.OPENJAWS_APEX_NOTIFICATIONS_ROOT?.trim() ||
    join(DEFAULT_ASGARD_ROOT, 'Notifications'),
)
export const APEX_ARGUS_ROOT = resolve(
  process.env.OPENJAWS_APEX_ARGUS_ROOT?.trim() ||
    join(DEFAULT_ASGARD_ROOT, 'argus'),
)
export const APEX_WORKSPACE_API_URL =
  process.env.OPENJAWS_APEX_WORKSPACE_API_URL?.trim() ||
  'http://127.0.0.1:8797'
const APEX_RUNTIME_DIR = join(tmpdir(), 'openjaws-apex')
const APEX_WORKSPACE_API_LOG = join(APEX_RUNTIME_DIR, 'workspace-api.log')
const APEX_WORKSPACE_API_STATE = join(APEX_RUNTIME_DIR, 'workspace-api-state.json')
const APEX_TRUST_LOCALHOST =
  process.env.OPENJAWS_APEX_TRUST_LOCALHOST?.trim() === '1'
const APEX_AUTH_HEADER = 'x-openjaws-apex-token'

export type ApexLaunchMode = 'sidecar' | 'native-app' | 'source-root'

export type ApexLaunchTarget = {
  id:
    | 'workspace_api'
    | 'browser'
    | 'aegis_mail'
    | 'security_center'
    | 'shadow_chat'
    | 'system_monitor'
    | 'vault'
    | 'chrono'
    | 'kernel'
    | 'notifications'
    | 'argus'
  label: string
  mode: ApexLaunchMode
  category: 'bridge' | 'ui' | 'security' | 'comms' | 'ops' | 'source'
  description: string
  path: string
  manifestPath?: string
  commandHint: string
}

export type ApexApiEnvelope<T> = {
  success: boolean
  data: T
}

export type ApexWorkspaceHealth = {
  status: string
  service: string
  version: string
  timestamp: string
}

export type ApexWorkspaceMailMessage = {
  id: string
  sender: string
  subject: string
  preview: string
  timestamp: string
  unread: boolean
  folder: string
  tags: string[]
}

export type ApexWorkspaceConversation = {
  id: string
  name: string
  role: string
  status: string
  unread: number
  tone: string
  encryption: string
  lastMessage: string
  lastSeen: string
}

export type ApexWorkspaceStoreApp = {
  id: string
  name: string
  category: string
  description: string
  permissions: string[]
  installed: boolean
  rating: number
  tone: string
  version: string
  developer: string
  featured: boolean
}

export type ApexWorkspaceSummary = {
  mode: string
  mail: {
    accountCount: number
    securityAlertCount: number
    messages: ApexWorkspaceMailMessage[]
    outbox: {
      pending: number
      failed: number
      sent: number
    }
  }
  chat: {
    conversations: ApexWorkspaceConversation[]
    messages: Record<
      string,
      Array<{
        id: string
        sender: string
        content: string
        timestamp: string
        sealed: boolean
      }>
    >
    statistics: {
      totalSessions: number
      totalContacts: number
      totalMessages: number
      activeSessions: number
    }
  }
  store: {
    featuredCount: number
    installedCount: number
    updateCount: number
    apps: ApexWorkspaceStoreApp[]
  }
  system: {
    healthScore: number
    metrics: {
      timestamp: string
      cpuUsage: number
      memoryUsage: number
      processCount: number
      uptime: number
    }
    services: Array<{
      name: string
      status: string
      cpu: string
      memory: string
    }>
    alerts: Array<{
      level: string
      message: string
      timestamp: string
    }>
  }
  security: {
    overallHealth: number
    activeAlerts: number
    recommendations: string[]
    incidents: Array<{
      id: string
      title: string
      description: string
      status: string
      source: string
      time: string
    }>
    auditEntries: Array<{
      id: string
      title: string
      detail: string
      time: string
    }>
  }
}

export type ApexActionResult = {
  ok: boolean
  message: string
}

export type ApexWorkspaceAvailability = {
  configured: boolean
  projectRootExists: boolean
  notificationsRootExists: boolean
  argusRootExists: boolean
  availableTargetCount: number
  envHints: string[]
}

type ApexWorkspaceApiState = {
  pid: number
  startedAt: string
  token: string
  workspaceApiUrl: string
}

const APEX_TARGETS: ApexLaunchTarget[] = [
  {
    id: 'workspace_api',
    label: 'Workspace API',
    mode: 'sidecar',
    category: 'bridge',
    description:
      'Typed localhost bridge for mail, chat, store, system, and security state on 127.0.0.1:8797.',
    path: resolve(join(APEX_APPS_ROOT, 'workspace_api')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'workspace_api', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/workspace_api/Cargo.toml',
  },
  {
    id: 'browser',
    label: 'Flowspace Browser',
    mode: 'native-app',
    category: 'ui',
    description:
      'Rust desktop browser shell with WebView/WebKit bindings. Best launched out of process.',
    path: resolve(join(APEX_APPS_ROOT, 'browser')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'browser', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/browser/Cargo.toml --bin flowspace-browser',
  },
  {
    id: 'aegis_mail',
    label: 'Aegis Mail',
    mode: 'native-app',
    category: 'comms',
    description:
      'Encrypted mail client with IMAP/SMTP and threat scoring. Also reachable through the workspace bridge.',
    path: resolve(join(APEX_APPS_ROOT, 'aegis_mail')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'aegis_mail', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/aegis_mail/Cargo.toml',
  },
  {
    id: 'security_center',
    label: 'Security Center',
    mode: 'native-app',
    category: 'security',
    description:
      'Desktop security dashboard. Use the bridge for summaries; launch the full UI for deeper triage.',
    path: resolve(join(APEX_APPS_ROOT, 'security_center')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'security_center', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/security_center/Cargo.toml',
  },
  {
    id: 'shadow_chat',
    label: 'Shadow Chat',
    mode: 'native-app',
    category: 'comms',
    description:
      'Secure Rust chat runtime. The workspace bridge exposes its send/session surfaces to OpenJaws.',
    path: resolve(join(APEX_APPS_ROOT, 'shadow_chat')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'shadow_chat', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/shadow_chat/Cargo.toml',
  },
  {
    id: 'system_monitor',
    label: 'System Monitor',
    mode: 'native-app',
    category: 'ops',
    description:
      'Host telemetry and service health monitor. A good candidate for richer future status fusion.',
    path: resolve(join(APEX_APPS_ROOT, 'system_monitor')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'system_monitor', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/system_monitor/Cargo.toml',
  },
  {
    id: 'vault',
    label: 'Vault',
    mode: 'native-app',
    category: 'security',
    description:
      'Encrypted vault manager. Kept as a launcher-only surface for now because it is a sensitive secrets boundary.',
    path: resolve(join(APEX_APPS_ROOT, 'vault')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'vault', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/vault/Cargo.toml',
  },
  {
    id: 'chrono',
    label: 'Chrono Backup',
    mode: 'native-app',
    category: 'ops',
    description:
      'Backup and restore utility. Useful as an operator tool, not something to hard-embed into the OpenJaws loop.',
    path: resolve(join(APEX_APPS_ROOT, 'chrono')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'chrono', 'Cargo.toml')),
    commandHint: 'cargo run --manifest-path apps/chrono/Cargo.toml',
  },
  {
    id: 'kernel',
    label: 'Apex Kernel Source',
    mode: 'source-root',
    category: 'source',
    description:
      'Microkernel workspace source. Opened as code, not embedded in process.',
    path: APEX_KERNEL_ROOT,
    commandHint: 'open kernel source root',
  },
  {
    id: 'notifications',
    label: 'Notifications Source',
    mode: 'source-root',
    category: 'source',
    description:
      'Notifications workspace root. Opened as a source folder until a stable service seam exists.',
    path: APEX_NOTIFICATIONS_ROOT,
    commandHint: 'open Notifications source root',
  },
  {
    id: 'argus',
    label: 'Argus Source',
    mode: 'source-root',
    category: 'source',
    description:
      'Argus workspace root. Opened as source until its service contract is narrowed.',
    path: APEX_ARGUS_ROOT,
    commandHint: 'open argus source root',
  },
]

function isWithinAllowedRoot(path: string): boolean {
  const resolved = resolve(path)
  const roots = [
    APEX_PROJECT_ROOT,
    APEX_NOTIFICATIONS_ROOT,
    APEX_ARGUS_ROOT,
  ].map(root => resolve(root))
  return roots.some(root => resolved === root || resolved.startsWith(`${root}${sep}`))
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function parseApexWorkspaceApiUrl(): { host: string; port: string } | null {
  try {
    const url = new URL(APEX_WORKSPACE_API_URL)
    return {
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    }
  } catch {
    return null
  }
}

function buildApexLaunchEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const allowedKeys = [
    'PATH',
    'PATHEXT',
    'SystemRoot',
    'SYSTEMROOT',
    'ComSpec',
    'COMSPEC',
    'USERPROFILE',
    'HOME',
    'HOMEDRIVE',
    'HOMEPATH',
    'TMP',
    'TEMP',
    'TMPDIR',
    'APPDATA',
    'LOCALAPPDATA',
    'PROGRAMDATA',
    'ProgramData',
    'CARGO_HOME',
    'RUSTUP_HOME',
    'RUST_LOG',
    'NUMBER_OF_PROCESSORS',
    'OS',
  ] as const

  const env: NodeJS.ProcessEnv = {}
  for (const key of allowedKeys) {
    const value = process.env[key]
    if (value) {
      env[key] = value
    }
  }

  return {
    ...env,
    ...extra,
  }
}

function readApexWorkspaceApiState(): ApexWorkspaceApiState | null {
  try {
    if (!existsSync(APEX_WORKSPACE_API_STATE)) {
      return null
    }
    return JSON.parse(
      readFileSync(APEX_WORKSPACE_API_STATE, 'utf8'),
    ) as ApexWorkspaceApiState
  } catch {
    return null
  }
}

function writeApexWorkspaceApiState(state: ApexWorkspaceApiState): void {
  mkdirSync(APEX_RUNTIME_DIR, { recursive: true })
  writeFileSync(APEX_WORKSPACE_API_STATE, JSON.stringify(state, null, 2), 'utf8')
}

function clearApexWorkspaceApiState(): void {
  try {
    rmSync(APEX_WORKSPACE_API_STATE, { force: true })
  } catch {}
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function getTrustedApexWorkspaceApiState(): ApexWorkspaceApiState | null {
  if (APEX_TRUST_LOCALHOST) {
    return null
  }
  const state = readApexWorkspaceApiState()
  if (!state) {
    return null
  }
  if (state.workspaceApiUrl !== APEX_WORKSPACE_API_URL || !isPidAlive(state.pid)) {
    clearApexWorkspaceApiState()
    return null
  }
  return state
}

function getApexRequestHeaders(): Record<string, string> | null {
  const trustedState = getTrustedApexWorkspaceApiState()
  if (!APEX_TRUST_LOCALHOST && !trustedState) {
    return null
  }
  return trustedState
    ? {
        [APEX_AUTH_HEADER]: trustedState.token,
      }
    : {}
}

async function resolveCargoBinary(): Promise<string | null> {
  const discovered =
    (await which(process.platform === 'win32' ? 'cargo.exe' : 'cargo')) ??
    (await which('cargo'))
  if (discovered) {
    return discovered
  }
  if (process.platform === 'win32' && process.env.USERPROFILE) {
    const fallback = resolve(process.env.USERPROFILE, '.cargo', 'bin', 'cargo.exe')
    if (existsSync(fallback)) {
      return fallback
    }
  }
  return null
}

async function fetchApexJson<T>(
  pathname: string,
  timeoutMs: number,
): Promise<T | null> {
  const headers = getApexRequestHeaders()
  if (headers === null) {
    return null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(new URL(pathname, `${APEX_WORKSPACE_API_URL}/`), {
      signal: controller.signal,
      headers,
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function postApexAction(
  pathname: string,
  body: Record<string, unknown>,
  actionLabel: string,
): Promise<ApexActionResult> {
  const headers = getApexRequestHeaders()
  if (headers === null) {
    return {
      ok: false,
      message:
        'Apex Workspace API is not trusted yet. Start the bridge from /apex or set OPENJAWS_APEX_TRUST_LOCALHOST=1 before sending actions.',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(new URL(pathname, `${APEX_WORKSPACE_API_URL}/`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = (await response.json()) as
      | ApexApiEnvelope<{ message: string }>
      | { success?: false; error?: string }
    if (!response.ok || !('success' in payload) || payload.success !== true) {
      const error =
        'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Workspace API returned ${response.status}`
      return {
        ok: false,
        message: `${actionLabel} failed: ${error}`,
      }
    }
    return {
      ok: true,
      message: payload.data.message,
    }
  } catch {
    return {
      ok: false,
      message: `Apex Workspace API is offline. Start the bridge before ${actionLabel.toLowerCase()}.`,
    }
  } finally {
    clearTimeout(timer)
  }
}

export function getApexLaunchTargets(): ApexLaunchTarget[] {
  return APEX_TARGETS
}

export function getApexLaunchTarget(
  id: ApexLaunchTarget['id'],
): ApexLaunchTarget | null {
  return APEX_TARGETS.find(target => target.id === id) ?? null
}

export function getApexWorkspaceAvailability(): ApexWorkspaceAvailability {
  const projectRootExists = existsSync(APEX_PROJECT_ROOT)
  const notificationsRootExists = existsSync(APEX_NOTIFICATIONS_ROOT)
  const argusRootExists = existsSync(APEX_ARGUS_ROOT)
  const envHints = [
    'OPENJAWS_APEX_ROOT',
    'OPENJAWS_APEX_ASGARD_ROOT',
    'OPENJAWS_APEX_NOTIFICATIONS_ROOT',
    'OPENJAWS_APEX_ARGUS_ROOT',
    'OPENJAWS_APEX_WORKSPACE_API_URL',
  ]

  return {
    configured:
      projectRootExists || notificationsRootExists || argusRootExists,
    projectRootExists,
    notificationsRootExists,
    argusRootExists,
    availableTargetCount: APEX_TARGETS.filter(target => existsSync(target.path))
      .length,
    envHints,
  }
}

export async function getApexWorkspaceHealth(): Promise<ApexWorkspaceHealth | null> {
  return fetchApexJson<ApexWorkspaceHealth>('/health', 1500)
}

export async function getApexWorkspaceSummary(): Promise<ApexWorkspaceSummary | null> {
  const payload = await fetchApexJson<ApexApiEnvelope<ApexWorkspaceSummary>>(
    '/api/v1/workspace/summary',
    2500,
  )
  if (!payload?.success) {
    return null
  }
  return payload.data
}

export async function composeApexMail(input: {
  recipients: string[]
  subject: string
  content: string
}): Promise<ApexActionResult> {
  const recipients = input.recipients
    .map(recipient => recipient.trim())
    .filter(Boolean)
  const subject = input.subject.trim()
  const content = input.content.trim()
  if (recipients.length === 0) {
    return {
      ok: false,
      message: 'Aegis Mail requires at least one recipient.',
    }
  }
  if (recipients.length > 8) {
    return {
      ok: false,
      message: 'Aegis Mail compose is capped at 8 recipients per action.',
    }
  }
  if (!subject || subject.length > 200) {
    return {
      ok: false,
      message: 'Aegis Mail subjects must be between 1 and 200 characters.',
    }
  }
  if (!content || content.length > 8_000) {
    return {
      ok: false,
      message: 'Aegis Mail bodies must be between 1 and 8000 characters.',
    }
  }
  return postApexAction(
    '/api/v1/mail/compose',
    {
      recipients,
      subject,
      content,
    },
    'Aegis Mail compose',
  )
}

export async function sendApexChatMessage(input: {
  sessionId: string
  content: string
}): Promise<ApexActionResult> {
  const sessionId = input.sessionId.trim()
  const content = input.content.trim()
  if (!sessionId) {
    return {
      ok: false,
      message: 'Shadow Chat requires a session id before sending.',
    }
  }
  if (!content || content.length > 4_000) {
    return {
      ok: false,
      message: 'Shadow Chat messages must be between 1 and 4000 characters.',
    }
  }

  return postApexAction(
    '/api/v1/chat/send',
    {
      session_id: sessionId,
      content,
    },
    'Shadow Chat send',
  )
}

export async function installApexStoreApp(input: {
  appId: string
}): Promise<ApexActionResult> {
  const appId = input.appId.trim()
  if (!appId) {
    return {
      ok: false,
      message: 'App Store install requires an app id.',
    }
  }

  return postApexAction(
    '/api/v1/store/install',
    {
      app_id: appId,
    },
    'App Store install',
  )
}

export async function startApexWorkspaceApi(): Promise<ApexActionResult> {
  const target = getApexLaunchTarget('workspace_api')
  if (!target?.manifestPath) {
    return {
      ok: false,
      message: 'Workspace API target is not configured correctly.',
    }
  }
  if (!existsSync(target.path) || !existsSync(target.manifestPath)) {
    return {
      ok: false,
      message:
        'Workspace API source is unavailable. Set OPENJAWS_APEX_ROOT or OPENJAWS_APEX_ASGARD_ROOT to the Apex workspace before launching.',
    }
  }
  const trustedState = getTrustedApexWorkspaceApiState()
  if (!trustedState) {
    const existingHealth = await (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 1000)
      try {
        const response = await fetch(new URL('/health', `${APEX_WORKSPACE_API_URL}/`), {
          signal: controller.signal,
        })
        return response.ok
      } catch {
        return false
      } finally {
        clearTimeout(timer)
      }
    })()
    if (existingHealth) {
      return {
        ok: false,
        message:
          'A listener is already bound to the Apex workspace bridge URL, but it was not launched by this OpenJaws session. Stop it or set OPENJAWS_APEX_TRUST_LOCALHOST=1 to trust that listener explicitly.',
      }
    }
  }
  const health = await getApexWorkspaceHealth()
  if (health?.status === 'ok') {
    return {
      ok: true,
      message: `Workspace API already running at ${APEX_WORKSPACE_API_URL}`,
    }
  }
  const cargoPath = await resolveCargoBinary()
  if (!cargoPath) {
    return {
      ok: false,
      message: 'Cargo is not available on PATH, so Apex sidecars cannot launch.',
    }
  }
  mkdirSync(APEX_RUNTIME_DIR, { recursive: true })
  const logFd = openSync(APEX_WORKSPACE_API_LOG, 'a')
  const workspaceApiSocket = parseApexWorkspaceApiUrl()
  const token = randomUUID()
  const child = spawn(cargoPath, ['run', '--manifest-path', target.manifestPath], {
    cwd: APEX_PROJECT_ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: buildApexLaunchEnv({
      RUST_LOG: process.env.RUST_LOG ?? 'warn',
      ...(workspaceApiSocket
        ? {
            APEX_WORKSPACE_API_HOST: workspaceApiSocket.host,
            APEX_WORKSPACE_API_PORT: workspaceApiSocket.port,
          }
        : {}),
      APEX_WORKSPACE_API_TOKEN: token,
    }),
  })
  await new Promise(resolve => setTimeout(resolve, 1200))
  if (child.exitCode !== null) {
    return {
      ok: false,
      message:
        child.exitCode === 0
          ? 'Workspace API process exited before the bridge became healthy.'
          : `Workspace API exited early with code ${child.exitCode}. Check ${APEX_WORKSPACE_API_LOG}.`,
    }
  }
  writeApexWorkspaceApiState({
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    token,
    workspaceApiUrl: APEX_WORKSPACE_API_URL,
  })
  child.unref()
  return {
    ok: true,
    message: `Started Workspace API from source. Logs: ${APEX_WORKSPACE_API_LOG}`,
  }
}

export function buildWindowsApexLaunchCommand(
  target: ApexLaunchTarget,
  cargoPath: string,
): { file: string; args: string[] } {
  if (!target.manifestPath) {
    throw new Error(`Launch target ${target.id} does not have a manifest path`)
  }
  const command = [
    `Set-Location -LiteralPath ${quotePowerShellLiteral(APEX_PROJECT_ROOT)}`,
    `& ${quotePowerShellLiteral(cargoPath)} run --manifest-path ${quotePowerShellLiteral(target.manifestPath)}`,
  ].join('; ')
  return {
    file: 'cmd.exe',
    args: [
      '/d',
      '/c',
      'start',
      target.label,
      'powershell.exe',
      '-NoLogo',
      '-NoExit',
      '-Command',
      command,
    ],
  }
}

async function launchVisibleApexApp(
  target: ApexLaunchTarget,
): Promise<ApexActionResult> {
  const cargoPath = await resolveCargoBinary()
  if (!cargoPath) {
    return {
      ok: false,
      message: 'Cargo is not available on PATH, so the selected Apex app cannot launch.',
    }
  }
  if (!target.manifestPath) {
    return {
      ok: false,
      message: `${target.label} does not expose a Cargo manifest for launching.`,
    }
  }
  if (process.platform !== 'win32') {
    const child = spawn(cargoPath, ['run', '--manifest-path', target.manifestPath], {
      cwd: APEX_PROJECT_ROOT,
      detached: true,
      stdio: 'ignore',
      env: buildApexLaunchEnv({}),
    })
    child.unref()
    return {
      ok: true,
      message: `Launched ${target.label} from source in the background.`,
    }
  }
  const launch = buildWindowsApexLaunchCommand(target, cargoPath)
  const result = await execFileNoThrow(launch.file, launch.args, {
    useCwd: false,
    env: buildApexLaunchEnv({}),
  })
  return {
    ok: result.code === 0,
    message:
      result.code === 0
        ? `Launching ${target.label} in a new terminal window.`
        : `Failed to launch ${target.label}: ${result.error ?? result.stderr ?? 'unknown error'}`,
  }
}

export async function runApexAction(
  targetId: ApexLaunchTarget['id'],
): Promise<ApexActionResult> {
  const target = getApexLaunchTarget(targetId)
  if (!target) {
    return {
      ok: false,
      message: `Unknown Apex target: ${targetId}`,
    }
  }
  if (!existsSync(target.path)) {
    return {
      ok: false,
      message: `Apex target is unavailable on this machine: ${target.label}. Configure OPENJAWS_APEX_ROOT / OPENJAWS_APEX_ASGARD_ROOT first.`,
    }
  }
  if (!isWithinAllowedRoot(target.path)) {
    return {
      ok: false,
      message: `Blocked launch outside the approved Apex roots: ${target.path}`,
    }
  }
  if (target.mode === 'source-root') {
    const opened = await openPath(target.path)
    return {
      ok: opened,
      message: opened
        ? `Opened ${target.label} in the system file browser.`
        : `Could not open ${target.label} source path.`,
    }
  }
  if (target.mode === 'sidecar') {
    return startApexWorkspaceApi()
  }
  return launchVisibleApexApp(target)
}

export function summarizeApexWorkspace(summary: ApexWorkspaceSummary | null): {
  headline: string
  details: string[]
} {
  if (!summary) {
    return {
      headline: 'Workspace bridge offline',
      details: [
        'Start the Workspace API sidecar to stream mail, system, chat, store, and security state into OpenJaws.',
      ],
    }
  }
  return {
    headline: `Workspace mode ${summary.mode} · system ${(summary.system.healthScore * 100).toFixed(0)}% · security ${(summary.security.overallHealth * 100).toFixed(0)}%`,
    details: [
      `Mail ${summary.mail.messages.length} messages · ${summary.mail.accountCount} accounts · ${summary.mail.securityAlertCount} alerts`,
      `Chat ${summary.chat.statistics.activeSessions}/${summary.chat.statistics.totalSessions} active sessions · ${summary.chat.statistics.totalMessages} messages`,
      `Store ${summary.store.installedCount} installed · ${summary.store.updateCount} updates`,
      `Host ${summary.system.metrics.cpuUsage.toFixed(1)}% CPU · ${summary.system.metrics.memoryUsage.toFixed(1)}% memory · ${summary.system.metrics.processCount} processes`,
    ],
  }
}
