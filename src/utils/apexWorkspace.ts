import {
  existsSync,
  openSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'fs'
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
export const APEX_CHRONO_API_URL =
  process.env.OPENJAWS_APEX_CHRONO_API_URL?.trim() ||
  'http://127.0.0.1:8798'
export const APEX_BROWSER_API_URL =
  process.env.OPENJAWS_APEX_BROWSER_API_URL?.trim() ||
  'http://127.0.0.1:8799'
const APEX_RUNTIME_DIR = join(tmpdir(), 'openjaws-apex')
const APEX_WORKSPACE_API_LOG = join(APEX_RUNTIME_DIR, 'workspace-api.log')
const APEX_WORKSPACE_API_STATE = join(APEX_RUNTIME_DIR, 'workspace-api-state.json')
const APEX_CHRONO_API_LOG = join(APEX_RUNTIME_DIR, 'chrono-bridge.log')
const APEX_CHRONO_API_STATE = join(APEX_RUNTIME_DIR, 'chrono-bridge-state.json')
const APEX_BROWSER_API_LOG = join(APEX_RUNTIME_DIR, 'browser-bridge.log')
const APEX_BROWSER_API_STATE = join(APEX_RUNTIME_DIR, 'browser-bridge-state.json')
const APEX_BROWSER_BOOT_TIMEOUT_MS = 60_000
const APEX_TRUST_LOCALHOST =
  process.env.OPENJAWS_APEX_TRUST_LOCALHOST?.trim() === '1'
const APEX_AUTH_HEADER = 'x-openjaws-apex-token'

export type ApexLaunchMode = 'sidecar' | 'native-app' | 'source-root'

export type ApexLaunchTarget = {
  id:
    | 'workspace_api'
    | 'chrono_bridge'
    | 'browser_bridge'
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
  binName?: string
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

export type ApexChronoBackup = {
  id: string
  timestamp: string
  sizeBytes: number
  fileCount: number
  checksum: string
  status: string
}

export type ApexChronoJob = {
  id: string
  name: string
  status: string
  createdAt: string
  lastRun: string | null
  sourcePaths: string[]
  destinationPath: string
  encryptionEnabled: boolean
  compressionEnabled: boolean
  retentionDays: number
  scheduleIntervalHours: number
  maxBackupSizeGb: number
  backups: ApexChronoBackup[]
}

export type ApexChronoSummary = {
  mode: string
  stats: {
    totalJobs: number
    activeJobs: number
    completedJobs: number
    failedJobs: number
    totalBackups: number
    totalBackupBytes: number
  }
  jobs: ApexChronoJob[]
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

export type ApexBrowserLink = {
  url: string
  text: string
  rel: string | null
  linkType: string
}

export type ApexBrowserSession = {
  id: string
  intent: string
  rationale: string
  requestedBy: 'user' | 'agent'
  recordHistory: boolean
  title: string
  url: string
  state: string
  openedAt: string
  updatedAt: string
  excerpt: string
  statusCode: number
  loadTimeMs: number
  imageCount: number
  metadata: {
    description: string | null
    keywords: string[]
    author: string | null
    contentType: string | null
  }
  links: ApexBrowserLink[]
}

export type ApexBrowserSummary = {
  mode: string
  renderMode: string
  activeSessionId: string | null
  sessionCount: number
  privacy: {
    doNotTrack: boolean
    blockThirdPartyCookies: boolean
    clearOnExit: boolean
    userHistoryPersisted: boolean
    agentHistoryPersisted: boolean
  }
  sessions: ApexBrowserSession[]
}

export type ApexActionResult = {
  ok: boolean
  message: string
}

export type ApexStructuredActionResult<T extends object = Record<string, unknown>> = {
  ok: boolean
  message: string
  data: T | null
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
    id: 'chrono_bridge',
    label: 'Chrono Bridge',
    mode: 'sidecar',
    category: 'bridge',
    description:
      'Typed localhost bridge for Chrono backup jobs on 127.0.0.1:8798.',
    path: resolve(join(APEX_APPS_ROOT, 'chrono')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'chrono', 'Cargo.toml')),
    binName: 'chrono-bridge',
    commandHint: 'cargo run --manifest-path apps/chrono/Cargo.toml --bin chrono-bridge',
  },
  {
    id: 'browser_bridge',
    label: 'Browser Bridge',
    mode: 'sidecar',
    category: 'bridge',
    description:
      'Typed localhost bridge for the native Flowspace browser engine on 127.0.0.1:8799.',
    path: resolve(join(APEX_APPS_ROOT, 'browser')),
    manifestPath: resolve(join(APEX_APPS_ROOT, 'browser', 'Cargo.toml')),
    binName: 'browser-bridge',
    commandHint: 'cargo run --manifest-path apps/browser/Cargo.toml --bin browser-bridge',
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
    binName: 'flowspace-browser',
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

function parseApexSocketUrl(baseUrl: string): { host: string; port: string } | null {
  try {
    const url = new URL(baseUrl)
    return {
      host: url.hostname,
      port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    }
  } catch {
    return null
  }
}

function buildCargoRunArgs(target: ApexLaunchTarget): string[] {
  if (!target.manifestPath) {
    throw new Error(`Launch target ${target.id} does not have a manifest path`)
  }
  return [
    'run',
    '--manifest-path',
    target.manifestPath,
    ...(target.binName ? ['--bin', target.binName] : []),
  ]
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
    'LIBCLANG_PATH',
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

function readApexSidecarState(statePath: string): ApexWorkspaceApiState | null {
  try {
    if (!existsSync(statePath)) {
      return null
    }
    return JSON.parse(readFileSync(statePath, 'utf8')) as ApexWorkspaceApiState
  } catch {
    return null
  }
}

function writeApexSidecarState(statePath: string, state: ApexWorkspaceApiState): void {
  mkdirSync(APEX_RUNTIME_DIR, { recursive: true })
  writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8')
}

function clearApexSidecarState(statePath: string): void {
  try {
    rmSync(statePath, { force: true })
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

function getTrustedApexSidecarState(
  statePath: string,
  baseUrl: string,
): ApexWorkspaceApiState | null {
  if (APEX_TRUST_LOCALHOST) {
    return null
  }
  const state = readApexSidecarState(statePath)
  if (!state) {
    return null
  }
  if (state.workspaceApiUrl !== baseUrl || !isPidAlive(state.pid)) {
    clearApexSidecarState(statePath)
    return null
  }
  return state
}

function getApexRequestHeaders(
  statePath: string,
  baseUrl: string,
): Record<string, string> | null {
  const trustedState = getTrustedApexSidecarState(statePath, baseUrl)
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

function hasLibclangBinary(directory: string): boolean {
  return existsSync(resolve(directory, 'libclang.dll'))
}

function resolvePythonSitePackagesLibclang(): string | null {
  const userRoot =
    process.env.USERPROFILE?.trim() || process.env.HOME?.trim() || null
  if (!userRoot) {
    return null
  }

  const versionDirs = ['Python313', 'Python312', 'Python311']
  const candidates = [
    ...versionDirs.flatMap(version => [
      resolve(
        userRoot,
        'AppData',
        'Roaming',
        'Python',
        version,
        'site-packages',
        'clang',
        'native',
      ),
      resolve(
        userRoot,
        'AppData',
        'Local',
        'Packages',
        'PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0',
        'LocalCache',
        'local-packages',
        version,
        'site-packages',
        'clang',
        'native',
      ),
    ]),
  ]

  const packagesRoot = resolve(userRoot, 'AppData', 'Local', 'Packages')
  if (existsSync(packagesRoot)) {
    try {
      for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          entry.name.startsWith('PythonSoftwareFoundation.Python.')
        ) {
          for (const version of versionDirs) {
            candidates.push(
              resolve(
                packagesRoot,
                entry.name,
                'LocalCache',
                'local-packages',
                version,
                'site-packages',
                'clang',
                'native',
              ),
            )
          }
        }
      }
    } catch {}
  }

  for (const candidate of candidates) {
    if (hasLibclangBinary(candidate)) {
      return candidate
    }
  }

  return null
}

function resolveLibclangPath(): string | null {
  const configured = process.env.LIBCLANG_PATH?.trim()
  if (configured && hasLibclangBinary(configured)) {
    return configured
  }

  return resolvePythonSitePackagesLibclang()
}

async function fetchApexJson<T>(
  baseUrl: string,
  statePath: string,
  pathname: string,
  timeoutMs: number,
): Promise<T | null> {
  const headers = getApexRequestHeaders(statePath, baseUrl)
  if (headers === null) {
    return null
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(new URL(pathname, `${baseUrl}/`), {
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

async function isApexSidecarHealthy(baseUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1000)
  try {
    const response = await fetch(new URL('/health', `${baseUrl}/`), {
      signal: controller.signal,
    })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function waitForApexSidecarReady(
  baseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await isApexSidecarHealthy(baseUrl)) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  return false
}

async function postApexAction(
  baseUrl: string,
  statePath: string,
  pathname: string,
  body: Record<string, unknown>,
  actionLabel: string,
): Promise<ApexActionResult> {
  const headers = getApexRequestHeaders(statePath, baseUrl)
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
    const response = await fetch(new URL(pathname, `${baseUrl}/`), {
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
  return fetchApexJson<ApexWorkspaceHealth>(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/health',
    1500,
  )
}

export async function getApexWorkspaceSummary(): Promise<ApexWorkspaceSummary | null> {
  const payload = await fetchApexJson<ApexApiEnvelope<ApexWorkspaceSummary>>(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
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
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
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
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
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
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/api/v1/store/install',
    {
      app_id: appId,
    },
    'App Store install',
  )
}

async function postApexStructuredAction<T extends { message?: string }>(
  baseUrl: string,
  statePath: string,
  pathname: string,
  body: Record<string, unknown>,
  actionLabel: string,
): Promise<ApexStructuredActionResult<T>> {
  const headers = getApexRequestHeaders(statePath, baseUrl)
  if (headers === null) {
    return {
      ok: false,
      message:
        'Apex bridge is not trusted yet. Start the bridge from /apex or set OPENJAWS_APEX_TRUST_LOCALHOST=1 before sending actions.',
      data: null,
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const response = await fetch(new URL(pathname, `${baseUrl}/`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = (await response.json()) as
      | ApexApiEnvelope<T>
      | { success?: false; error?: string }
    if (!response.ok || !('success' in payload) || payload.success !== true) {
      const error =
        'error' in payload && typeof payload.error === 'string'
          ? payload.error
          : `Bridge returned ${response.status}`
      return {
        ok: false,
        message: `${actionLabel} failed: ${error}`,
        data: null,
      }
    }
    return {
      ok: true,
      message:
        typeof payload.data.message === 'string'
          ? payload.data.message
          : `${actionLabel} complete`,
      data: payload.data,
    }
  } catch {
    return {
      ok: false,
      message: `Bridge is offline. Start it before ${actionLabel.toLowerCase()}.`,
      data: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function moveApexMailMessage(input: {
  folder: string
  messageId: string
  targetFolder: string
}): Promise<ApexActionResult> {
  const folder = input.folder.trim()
  const messageId = input.messageId.trim()
  const targetFolder = input.targetFolder.trim()
  if (!folder || !messageId || !targetFolder) {
    return {
      ok: false,
      message: 'Mail move requires folder, message id, and target folder.',
    }
  }

  return postApexAction(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/api/v1/mail/move',
    {
      folder,
      message_id: messageId,
      target_folder: targetFolder,
    },
    'Aegis Mail move',
  )
}

export async function deleteApexMailMessage(input: {
  folder: string
  messageId: string
}): Promise<ApexActionResult> {
  const folder = input.folder.trim()
  const messageId = input.messageId.trim()
  if (!folder || !messageId) {
    return {
      ok: false,
      message: 'Mail delete requires folder and message id.',
    }
  }

  return postApexAction(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/api/v1/mail/delete',
    {
      folder,
      message_id: messageId,
    },
    'Aegis Mail delete',
  )
}

export async function flagApexMailMessage(input: {
  folder: string
  messageId: string
  flagged: boolean
}): Promise<ApexActionResult> {
  const folder = input.folder.trim()
  const messageId = input.messageId.trim()
  if (!folder || !messageId) {
    return {
      ok: false,
      message: 'Mail flag requires folder and message id.',
    }
  }

  return postApexAction(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/api/v1/mail/flag',
    {
      folder,
      message_id: messageId,
      flagged: input.flagged,
    },
    'Aegis Mail flag',
  )
}

export async function createApexChatSession(input: {
  participants: string[]
}): Promise<ApexStructuredActionResult<{ message: string; sessionId: string }>> {
  const participants = input.participants
    .map(value => value.trim())
    .filter(Boolean)
  if (participants.length === 0) {
    return {
      ok: false,
      message: 'Shadow Chat session creation requires at least one participant.',
      data: null,
    }
  }

  return postApexStructuredAction<{ message: string; sessionId: string }>(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/api/v1/chat/session/create',
    {
      participants,
    },
    'Shadow Chat session create',
  )
}

export async function installApexStoreAppWithReceipt(input: {
  appId: string
}): Promise<
  ApexStructuredActionResult<{
    message: string
    appId: string
    name: string
    version: string
    installedAt: string
    sizeBytes: number
    source: string
    permissions: string[]
  }>
> {
  const appId = input.appId.trim()
  if (!appId) {
    return {
      ok: false,
      message: 'App Store install requires an app id.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_WORKSPACE_API_URL,
    APEX_WORKSPACE_API_STATE,
    '/api/v1/store/install',
    {
      app_id: appId,
    },
    'App Store install',
  )
}

export async function getApexChronoHealth(): Promise<ApexWorkspaceHealth | null> {
  return fetchApexJson<ApexWorkspaceHealth>(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/health',
    1500,
  )
}

export async function getApexChronoSummary(): Promise<ApexChronoSummary | null> {
  const payload = await fetchApexJson<ApexApiEnvelope<ApexChronoSummary>>(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/api/v1/chrono/summary',
    2500,
  )
  if (!payload?.success) {
    return null
  }
  return payload.data
}

export async function getApexBrowserHealth(): Promise<ApexWorkspaceHealth | null> {
  return fetchApexJson<ApexWorkspaceHealth>(
    APEX_BROWSER_API_URL,
    APEX_BROWSER_API_STATE,
    '/health',
    1500,
  )
}

export async function getApexBrowserSummary(): Promise<ApexBrowserSummary | null> {
  const payload = await fetchApexJson<ApexApiEnvelope<ApexBrowserSummary>>(
    APEX_BROWSER_API_URL,
    APEX_BROWSER_API_STATE,
    '/api/v1/browser/summary',
    2500,
  )
  if (!payload?.success) {
    return null
  }
  return payload.data
}

export async function openApexBrowserSession(input: {
  url: string
  intent: string
  rationale: string
  requestedBy?: 'user' | 'agent'
  recordHistory?: boolean
}): Promise<
  ApexStructuredActionResult<{
    message: string
    sessionId: string | null
    session: ApexBrowserSession | null
  }>
> {
  const url = input.url.trim()
  const intent = input.intent.trim()
  const rationale = input.rationale.trim()
  if (!url || !intent || !rationale) {
    return {
      ok: false,
      message:
        'Browser open requires a URL, intent, and rationale.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_BROWSER_API_URL,
    APEX_BROWSER_API_STATE,
    '/api/v1/browser/session/open',
    {
      url,
      intent,
      rationale,
      requestedBy: input.requestedBy ?? 'user',
      recordHistory:
        input.recordHistory ?? (input.requestedBy ?? 'user') === 'agent',
    },
    'Browser session open',
  )
}

export async function navigateApexBrowserSession(input: {
  sessionId: string
  url: string
}): Promise<
  ApexStructuredActionResult<{
    message: string
    sessionId: string | null
    session: ApexBrowserSession | null
  }>
> {
  const sessionId = input.sessionId.trim()
  const url = input.url.trim()
  if (!sessionId || !url) {
    return {
      ok: false,
      message: 'Browser navigate requires a session id and URL.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_BROWSER_API_URL,
    APEX_BROWSER_API_STATE,
    '/api/v1/browser/session/navigate',
    {
      sessionId,
      url,
    },
    'Browser session navigate',
  )
}

export async function closeApexBrowserSession(input: {
  sessionId: string
}): Promise<
  ApexStructuredActionResult<{
    message: string
    sessionId: string | null
    session: ApexBrowserSession | null
  }>
> {
  const sessionId = input.sessionId.trim()
  if (!sessionId) {
    return {
      ok: false,
      message: 'Browser close requires a session id.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_BROWSER_API_URL,
    APEX_BROWSER_API_STATE,
    '/api/v1/browser/session/close',
    {
      sessionId,
    },
    'Browser session close',
  )
}

export async function createApexChronoJob(input: {
  name: string
  sourcePaths: string[]
  destinationPath: string
  encryptionEnabled?: boolean
  compressionEnabled?: boolean
  retentionDays?: number
  scheduleIntervalHours?: number
  maxBackupSizeGb?: number
}): Promise<ApexStructuredActionResult<{ message: string; jobId: string | null }>> {
  const name = input.name.trim()
  const sourcePaths = input.sourcePaths.map(value => value.trim()).filter(Boolean)
  const destinationPath = input.destinationPath.trim()
  if (!name || sourcePaths.length === 0 || !destinationPath) {
    return {
      ok: false,
      message: 'Chrono job creation requires a name, source path, and destination path.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/api/v1/chrono/job/create',
    {
      name,
      sourcePaths,
      destinationPath,
      encryptionEnabled: input.encryptionEnabled ?? true,
      compressionEnabled: input.compressionEnabled ?? true,
      retentionDays: input.retentionDays ?? 30,
      scheduleIntervalHours: input.scheduleIntervalHours ?? 24,
      maxBackupSizeGb: input.maxBackupSizeGb ?? 100,
    },
    'Chrono job create',
  )
}

export async function startApexChronoJob(input: {
  jobId: string
}): Promise<ApexStructuredActionResult<{ message: string; jobId: string | null }>> {
  const jobId = input.jobId.trim()
  if (!jobId) {
    return {
      ok: false,
      message: 'Chrono start requires a job id.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/api/v1/chrono/job/start',
    {
      jobId,
    },
    'Chrono job start',
  )
}

export async function restoreApexChronoJob(input: {
  jobId: string
  backupId: string
  restorePath: string
}): Promise<
  ApexStructuredActionResult<{ message: string; jobId: string | null; backupId: string | null }>
> {
  const jobId = input.jobId.trim()
  const backupId = input.backupId.trim()
  const restorePath = input.restorePath.trim()
  if (!jobId || !backupId || !restorePath) {
    return {
      ok: false,
      message: 'Chrono restore requires a job id, backup id, and restore path.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/api/v1/chrono/job/restore',
    {
      jobId,
      backupId,
      restorePath,
    },
    'Chrono restore',
  )
}

export async function deleteApexChronoJob(input: {
  jobId: string
}): Promise<ApexStructuredActionResult<{ message: string; jobId: string | null }>> {
  const jobId = input.jobId.trim()
  if (!jobId) {
    return {
      ok: false,
      message: 'Chrono delete requires a job id.',
      data: null,
    }
  }

  return postApexStructuredAction(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/api/v1/chrono/job/delete',
    {
      jobId,
    },
    'Chrono delete',
  )
}

export async function cleanupApexChronoBackups(): Promise<ApexActionResult> {
  return postApexAction(
    APEX_CHRONO_API_URL,
    APEX_CHRONO_API_STATE,
    '/api/v1/chrono/cleanup',
    {},
    'Chrono cleanup',
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
  const trustedState = getTrustedApexSidecarState(
    APEX_WORKSPACE_API_STATE,
    APEX_WORKSPACE_API_URL,
  )
  if (!trustedState) {
    const existingHealth = await isApexSidecarHealthy(APEX_WORKSPACE_API_URL)
    if (existingHealth) {
      return {
        ok: false,
        message:
          'A listener is already bound to the Apex workspace bridge URL, but it was not launched by this OpenJaws session. Stop it or set OPENJAWS_APEX_TRUST_LOCALHOST=1 to trust that listener explicitly.',
      }
    }
  }
  if (await isApexSidecarHealthy(APEX_WORKSPACE_API_URL)) {
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
  const workspaceApiSocket = parseApexSocketUrl(APEX_WORKSPACE_API_URL)
  const libclangPath = resolveLibclangPath()
  const token = randomUUID()
  const child = spawn(cargoPath, buildCargoRunArgs(target), {
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
      ...(libclangPath ? { LIBCLANG_PATH: libclangPath } : {}),
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
  writeApexSidecarState(APEX_WORKSPACE_API_STATE, {
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    token,
    workspaceApiUrl: APEX_WORKSPACE_API_URL,
  })
  child.unref()
  const ready = await waitForApexSidecarReady(APEX_WORKSPACE_API_URL, 15_000)
  return {
    ok: true,
    message: ready
      ? `Started Workspace API from source${libclangPath ? ` with libclang ${libclangPath}` : ''}. Logs: ${APEX_WORKSPACE_API_LOG}`
      : `Workspace API launch started${libclangPath ? ` with libclang ${libclangPath}` : ''} and is still booting or compiling. Logs: ${APEX_WORKSPACE_API_LOG}`,
  }
}

export async function startApexChronoBridge(): Promise<ApexActionResult> {
  const target = getApexLaunchTarget('chrono_bridge')
  if (!target?.manifestPath) {
    return {
      ok: false,
      message: 'Chrono bridge target is not configured correctly.',
    }
  }
  if (!existsSync(target.path) || !existsSync(target.manifestPath)) {
    return {
      ok: false,
      message:
        'Chrono source is unavailable. Set OPENJAWS_APEX_ROOT or OPENJAWS_APEX_ASGARD_ROOT to the Apex workspace before launching.',
    }
  }
  const trustedState = getTrustedApexSidecarState(
    APEX_CHRONO_API_STATE,
    APEX_CHRONO_API_URL,
  )
  if (!trustedState) {
    const existingHealth = await isApexSidecarHealthy(APEX_CHRONO_API_URL)
    if (existingHealth) {
      return {
        ok: false,
        message:
          'A listener is already bound to the Chrono bridge URL, but it was not launched by this OpenJaws session. Stop it or set OPENJAWS_APEX_TRUST_LOCALHOST=1 to trust that listener explicitly.',
      }
    }
  }
  if (await isApexSidecarHealthy(APEX_CHRONO_API_URL)) {
    return {
      ok: true,
      message: `Chrono bridge already running at ${APEX_CHRONO_API_URL}`,
    }
  }
  const cargoPath = await resolveCargoBinary()
  if (!cargoPath) {
    return {
      ok: false,
      message: 'Cargo is not available on PATH, so Chrono sidecars cannot launch.',
    }
  }
  mkdirSync(APEX_RUNTIME_DIR, { recursive: true })
  const logFd = openSync(APEX_CHRONO_API_LOG, 'a')
  const chronoSocket = parseApexSocketUrl(APEX_CHRONO_API_URL)
  const token = randomUUID()
  const child = spawn(cargoPath, buildCargoRunArgs(target), {
    cwd: APEX_PROJECT_ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: buildApexLaunchEnv({
      RUST_LOG: process.env.RUST_LOG ?? 'warn',
      ...(chronoSocket
        ? {
            APEX_CHRONO_API_HOST: chronoSocket.host,
            APEX_CHRONO_API_PORT: chronoSocket.port,
          }
        : {}),
      APEX_CHRONO_API_TOKEN: token,
    }),
  })
  await new Promise(resolve => setTimeout(resolve, 1200))
  if (child.exitCode !== null) {
    return {
      ok: false,
      message:
        child.exitCode === 0
          ? 'Chrono bridge process exited before the bridge became healthy.'
          : `Chrono bridge exited early with code ${child.exitCode}. Check ${APEX_CHRONO_API_LOG}.`,
    }
  }
  writeApexSidecarState(APEX_CHRONO_API_STATE, {
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    token,
    workspaceApiUrl: APEX_CHRONO_API_URL,
  })
  child.unref()
  const ready = await waitForApexSidecarReady(APEX_CHRONO_API_URL, 15_000)
  return {
    ok: true,
    message: ready
      ? `Started Chrono bridge from source. Logs: ${APEX_CHRONO_API_LOG}`
      : `Chrono bridge launch started and is still booting or compiling. Logs: ${APEX_CHRONO_API_LOG}`,
  }
}

export async function startApexBrowserBridge(): Promise<ApexActionResult> {
  const target = getApexLaunchTarget('browser_bridge')
  if (!target?.manifestPath) {
    return {
      ok: false,
      message: 'Browser bridge target is not configured correctly.',
    }
  }
  if (!existsSync(target.path) || !existsSync(target.manifestPath)) {
    return {
      ok: false,
      message:
        'Browser source is unavailable. Set OPENJAWS_APEX_ROOT or OPENJAWS_APEX_ASGARD_ROOT to the Apex workspace before launching.',
    }
  }
  const trustedState = getTrustedApexSidecarState(
    APEX_BROWSER_API_STATE,
    APEX_BROWSER_API_URL,
  )
  if (!trustedState) {
    const existingHealth = await isApexSidecarHealthy(APEX_BROWSER_API_URL)
    if (existingHealth) {
      return {
        ok: false,
        message:
          'A listener is already bound to the browser bridge URL, but it was not launched by this OpenJaws session. Stop it or set OPENJAWS_APEX_TRUST_LOCALHOST=1 to trust that listener explicitly.',
      }
    }
  }
  if (await isApexSidecarHealthy(APEX_BROWSER_API_URL)) {
    return {
      ok: true,
      message: `Browser bridge already running at ${APEX_BROWSER_API_URL}`,
    }
  }
  const cargoPath = await resolveCargoBinary()
  if (!cargoPath) {
    return {
      ok: false,
      message: 'Cargo is not available on PATH, so browser sidecars cannot launch.',
    }
  }
  mkdirSync(APEX_RUNTIME_DIR, { recursive: true })
  const logFd = openSync(APEX_BROWSER_API_LOG, 'a')
  const browserSocket = parseApexSocketUrl(APEX_BROWSER_API_URL)
  const libclangPath = resolveLibclangPath()
  const token = randomUUID()
  const child = spawn(cargoPath, buildCargoRunArgs(target), {
    cwd: APEX_PROJECT_ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', logFd, logFd],
    env: buildApexLaunchEnv({
      RUST_LOG: process.env.RUST_LOG ?? 'warn',
      ...(browserSocket
        ? {
            APEX_BROWSER_API_HOST: browserSocket.host,
            APEX_BROWSER_API_PORT: browserSocket.port,
          }
        : {}),
      ...(libclangPath ? { LIBCLANG_PATH: libclangPath } : {}),
      APEX_BROWSER_API_TOKEN: token,
    }),
  })
  await new Promise(resolve => setTimeout(resolve, 1200))
  if (child.exitCode !== null) {
    return {
      ok: false,
      message:
        child.exitCode === 0
          ? 'Browser bridge process exited before the bridge became healthy.'
          : `Browser bridge exited early with code ${child.exitCode}. Check ${APEX_BROWSER_API_LOG}.`,
    }
  }
  writeApexSidecarState(APEX_BROWSER_API_STATE, {
    pid: child.pid ?? 0,
    startedAt: new Date().toISOString(),
    token,
    workspaceApiUrl: APEX_BROWSER_API_URL,
  })
  child.unref()
  const ready = await waitForApexSidecarReady(
    APEX_BROWSER_API_URL,
    APEX_BROWSER_BOOT_TIMEOUT_MS,
  )
  return {
    ok: true,
    message: ready
      ? `Started browser bridge from source${libclangPath ? ` with libclang ${libclangPath}` : ''}. Logs: ${APEX_BROWSER_API_LOG}`
      : `Browser bridge launch started${libclangPath ? ` with libclang ${libclangPath}` : ''} and is still compiling or booting. Logs: ${APEX_BROWSER_API_LOG}`,
  }
}

export function buildWindowsApexLaunchCommand(
  target: ApexLaunchTarget,
  cargoPath: string,
): { file: string; args: string[] } {
  if (!target.manifestPath) {
    throw new Error(`Launch target ${target.id} does not have a manifest path`)
  }
  const cargoArgs = buildCargoRunArgs(target)
    .map(arg => quotePowerShellLiteral(arg))
    .join(' ')
  const command = [
    `Set-Location -LiteralPath ${quotePowerShellLiteral(APEX_PROJECT_ROOT)}`,
    `& ${quotePowerShellLiteral(cargoPath)} ${cargoArgs}`,
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
    const child = spawn(cargoPath, buildCargoRunArgs(target), {
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
    if (target.id === 'workspace_api') {
      return startApexWorkspaceApi()
    }
    if (target.id === 'chrono_bridge') {
      return startApexChronoBridge()
    }
    if (target.id === 'browser_bridge') {
      return startApexBrowserBridge()
    }
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

export function summarizeApexChrono(summary: ApexChronoSummary | null): {
  headline: string
  details: string[]
} {
  if (!summary) {
    return {
      headline: 'Chrono bridge offline',
      details: [
        'Start the Chrono bridge sidecar to stream backup jobs and run bounded backup actions into OpenJaws.',
      ],
    }
  }

  const latestJob = summary.jobs[0]
  return {
    headline: `Chrono ${summary.stats.activeJobs}/${summary.stats.totalJobs} active jobs · ${formatBytes(summary.stats.totalBackupBytes)} across ${summary.stats.totalBackups} backups`,
    details: latestJob
      ? [
          `${latestJob.name} · ${latestJob.status} · ${latestJob.destinationPath}`,
          `${latestJob.backups.length} backup${latestJob.backups.length === 1 ? '' : 's'} · every ${latestJob.scheduleIntervalHours}h · retain ${latestJob.retentionDays}d`,
          `${latestJob.sourcePaths[0] ?? 'no source path'}${latestJob.sourcePaths.length > 1 ? ` +${latestJob.sourcePaths.length - 1} more` : ''}`,
        ]
      : ['No Chrono jobs are defined yet.'],
  }
}

export function summarizeApexBrowser(summary: ApexBrowserSummary | null): {
  headline: string
  details: string[]
} {
  if (!summary) {
    return {
      headline: 'Browser bridge offline',
      details: [
        'Start the browser bridge to keep web previews inside the OpenJaws TUI instead of launching an external browser.',
      ],
    }
  }

  const activeSession =
    summary.sessions.find(session => session.id === summary.activeSessionId) ??
    summary.sessions[0]
  if (!activeSession) {
    return {
      headline: 'Browser bridge online · no active sessions',
      details: [
        summary.privacy.userHistoryPersisted
          ? 'User browsing history is currently persisted.'
          : 'User browsing history stays out of persistent receipts by default.',
      ],
    }
  }

  return {
    headline: `${activeSession.title} · ${activeSession.state} · ${summary.renderMode}`,
    details: [
      `${activeSession.intent} · ${activeSession.requestedBy} · ${activeSession.url}`,
      `${activeSession.statusCode} · ${activeSession.loadTimeMs}ms · ${activeSession.imageCount} images · ${activeSession.links.length} links`,
      summary.privacy.userHistoryPersisted
        ? 'User browsing history is currently persisted.'
        : 'User browsing history is not persisted; agent-led browsing stays accountable.',
    ],
  }
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) {
    return '0 B'
  }
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
