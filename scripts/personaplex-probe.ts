import { existsSync, readFileSync, statSync } from 'fs'
import { basename, dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

export type PersonaPlexProbeOptions = {
  json: boolean
  allowRemote: boolean
  timeoutMs: number
  runtimeUrl: string | null
  textPrompt: string
  voicePrompt: string
  stationRoot?: string | null
  runtimeStatePath?: string | null
  launcherPath?: string | null
}

export type PersonaPlexRuntimeState = {
  startedAt?: string | null
  runtimeUrl?: string | null
  host?: string | null
  port?: string | number | null
  protocol?: string | null
  healthyAt?: string | null
  runtimeMode?: string | null
  processId?: string | number | null
  wslPid?: string | number | null
  failedAt?: string | null
  error?: string | null
  lastError?: string | null
  status?: string | null
}

export type PersonaPlexRepairHint = {
  status: 'ready' | 'start_required' | 'runtime_failed'
  summary: string
  command: string
  args: string[]
  stationRoot: string
  launcherPath: string
  missing: string[]
  warnings: string[]
}

export type PersonaPlexProbeResult = {
  status: 'ok' | 'error'
  ready: boolean
  runtimeUrl: string
  websocketUrl: string
  voicePrompt: string
  textPrompt: string
  latencyMs: number
  firstByte: number | null
  messageType: string | null
  runtimeState?: PersonaPlexRuntimeState | null
  runtimeUrlSource?: 'explicit' | 'state' | 'default'
  ignoredStateRuntimeUrl?: string | null
  repair: PersonaPlexRepairHint
  error?: string | null
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_PERSONAPLEX_RUNTIME_URL = 'http://127.0.0.1:8998'
const RUNTIME_STATE_STALE_MS = 30 * 60 * 1000
const REDACTED = '[redacted]'
const CONFIGURED = '[configured]'
const MAX_SCRIPT_SCAN_BYTES = 64 * 1024
const INLINE_SECRET_ASSIGNMENT_PATTERN =
  /^\s*(?:export\s+)?(?:HF_TOKEN|HUGGINGFACE(?:HUB)?_[A-Z0-9_]*(?:TOKEN|KEY|SECRET)|PERSONAPLEX_[A-Z0-9_]*(?:TOKEN|KEY|SECRET)|ELEVENLABS_API_KEY|DISCORD_TOKEN)\s*=\s*['"]?(?!\$|%|\[redacted\]|<redacted>|<[^>]+>)[^'"\s#]{12,}/im

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function coerceString(value: unknown): string | null {
  return typeof value === 'string' ? value.trim() || null : null
}

function coerceRuntimeId(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    return value.trim() || null
  }
  return null
}

function trimToNull(value: string | null | undefined): string | null {
  return value?.trim() || null
}

export function resolvePersonaPlexStationRoot(args: {
  root?: string
  stationRoot?: string | null
} = {}): string {
  const explicit =
    trimToNull(args.stationRoot) ??
    trimToNull(process.env.PERSONAPLEX_STATION_ROOT) ??
    trimToNull(process.env.OPENJAWS_LOCAL_COMMAND_STATION_ROOT)
  return explicit
    ? resolve(explicit)
    : join(resolve(args.root ?? REPO_ROOT), 'local-command-station')
}

export function resolvePersonaPlexLauncherPath(args: {
  root?: string
  stationRoot?: string | null
  launcherPath?: string | null
} = {}): string {
  const explicit =
    trimToNull(args.launcherPath) ??
    trimToNull(process.env.PERSONAPLEX_LAUNCHER_PATH)
  return explicit
    ? resolve(explicit)
    : join(resolvePersonaPlexStationRoot(args), 'start-personaplex-voice.ps1')
}

export function resolvePersonaPlexRuntimeStatePath(args: {
  root?: string
  stationRoot?: string | null
  runtimeStatePath?: string | null
} = {}): string {
  const explicit =
    trimToNull(args.runtimeStatePath) ??
    trimToNull(process.env.PERSONAPLEX_RUNTIME_STATE_PATH)
  return explicit
    ? resolve(explicit)
    : join(
        resolvePersonaPlexStationRoot(args),
        'personaplex-runtime',
        'runtime.json',
      )
}

function redactUrlForDiagnostics(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.username || parsed.password) {
      parsed.username = REDACTED
      parsed.password = REDACTED
    }
    for (const [key] of parsed.searchParams) {
      parsed.searchParams.set(
        key,
        key === 'text_prompt' || key === 'voice_prompt' ? CONFIGURED : REDACTED,
      )
    }
    return parsed.toString()
  } catch {
    return value
  }
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/\bBearer\s+[^\s,;]+/gi, `Bearer ${REDACTED}`)
    .replace(
      /\b(credential|key|password|secret|token)(\s*[:=]\s*)([^\s,;]+)/gi,
      (_match, key: string, separator: string) => `${key}${separator}${REDACTED}`,
    )
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, url =>
      redactUrlForDiagnostics(url),
    )
}

export function sanitizePersonaPlexRuntimeState(
  value: unknown,
): PersonaPlexRuntimeState | null {
  if (!isObjectRecord(value)) {
    return value === null || value === undefined
      ? null
      : { status: 'unreadable', error: 'runtime_state_unreadable' }
  }

  const sanitized: PersonaPlexRuntimeState = {}
  const directStringKeys = [
    'startedAt',
    'runtimeUrl',
    'host',
    'protocol',
    'healthyAt',
    'runtimeMode',
    'failedAt',
    'status',
  ] as const

  for (const key of directStringKeys) {
    const raw = coerceString(value[key])
    if (raw) {
      sanitized[key] = redactSensitiveText(raw)
    }
  }

  const port = coerceRuntimeId(value.port)
  if (port !== null) {
    sanitized.port = port
  }
  const processId = coerceRuntimeId(value.processId)
  if (processId !== null) {
    sanitized.processId = processId
  }
  const wslPid = coerceRuntimeId(value.wslPid)
  if (wslPid !== null) {
    sanitized.wslPid = wslPid
  }

  const error = coerceString(value.error)
  if (error) {
    sanitized.error = redactSensitiveText(error)
  }
  const lastError = coerceString(value.lastError)
  if (lastError) {
    sanitized.lastError = redactSensitiveText(lastError)
  }

  return sanitized
}

export function parseArgs(argv: string[]): PersonaPlexProbeOptions {
  const options: PersonaPlexProbeOptions = {
    json: false,
    allowRemote:
      process.env.PERSONAPLEX_ALLOW_REMOTE?.trim() === '1' ||
      process.env.PERSONAPLEX_ALLOW_REMOTE?.trim().toLowerCase() === 'true',
    timeoutMs: 90_000,
    runtimeUrl: process.env.PERSONAPLEX_URL?.trim() || null,
    stationRoot:
      process.env.PERSONAPLEX_STATION_ROOT?.trim() ||
      process.env.OPENJAWS_LOCAL_COMMAND_STATION_ROOT?.trim() ||
      null,
    runtimeStatePath: process.env.PERSONAPLEX_RUNTIME_STATE_PATH?.trim() || null,
    launcherPath: process.env.PERSONAPLEX_LAUNCHER_PATH?.trim() || null,
    textPrompt:
      process.env.PERSONAPLEX_TEXT_PROMPT?.trim() ||
      process.env.PERSONAPLEX_PREWARM_TEXT_PROMPT?.trim() ||
      'You enjoy having a good conversation.',
    voicePrompt:
      process.env.PERSONAPLEX_VOICE_PROMPT?.trim() ||
      process.env.PERSONAPLEX_PREWARM_VOICE_PROMPT?.trim() ||
      'NATF2.pt',
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--json':
        options.json = true
        break
      case '--allow-remote':
      case '--allow-remote-personaplex':
        options.allowRemote = true
        break
      case '--url':
      case '--runtime-url':
        options.runtimeUrl = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--station-root':
        options.stationRoot = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--runtime-state-path':
        options.runtimeStatePath = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--launcher-path':
        options.launcherPath = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--timeout-ms':
        options.timeoutMs = Math.max(
          1_000,
          Number.parseInt(argv[index + 1] ?? '', 10) || options.timeoutMs,
        )
        index += 1
        break
      case '--text-prompt':
        options.textPrompt = argv[index + 1]?.trim() || options.textPrompt
        index += 1
        break
      case '--voice-prompt':
        options.voicePrompt = argv[index + 1]?.trim() || options.voicePrompt
        index += 1
        break
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }
  return options
}

export function readRuntimeState(
  path = resolvePersonaPlexRuntimeStatePath(),
): PersonaPlexRuntimeState | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    return sanitizePersonaPlexRuntimeState(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    return {
      status: 'unreadable',
      error: `runtime_state_unreadable: ${redactSensitiveText(
        error instanceof Error ? error.message : String(error),
      )}`,
    }
  }
}

function runtimeUrlFromState(state: PersonaPlexRuntimeState | null): string {
  const direct = state?.runtimeUrl?.trim()
  if (direct) {
    return direct
  }
  const host = state?.host?.trim() || '127.0.0.1'
  const port = String(state?.port ?? '8998').trim() || '8998'
  const protocol = state?.protocol?.trim() || 'http'
  return `${protocol}://${host}:${port}`
}

function hasFailedWithoutHealthyRuntime(
  state: PersonaPlexRuntimeState | null,
): boolean {
  if (!state?.failedAt) {
    return false
  }
  if (!state.healthyAt) {
    return true
  }
  const failedAt = Date.parse(state.failedAt)
  const healthyAt = Date.parse(state.healthyAt)
  return Number.isFinite(failedAt) && Number.isFinite(healthyAt) && failedAt > healthyAt
}

export function selectPersonaPlexProbeRuntimeUrl(args: {
  runtimeUrl: string | null
  state: PersonaPlexRuntimeState | null
}): {
  runtimeUrl: string
  runtimeUrlSource: PersonaPlexProbeResult['runtimeUrlSource']
  ignoredStateRuntimeUrl: string | null
} {
  if (args.runtimeUrl?.trim()) {
    return {
      runtimeUrl: args.runtimeUrl.trim(),
      runtimeUrlSource: 'explicit',
      ignoredStateRuntimeUrl: null,
    }
  }

  const stateRuntimeUrl = runtimeUrlFromState(args.state)
  if (args.state && !hasFailedWithoutHealthyRuntime(args.state)) {
    return {
      runtimeUrl: stateRuntimeUrl,
      runtimeUrlSource: 'state',
      ignoredStateRuntimeUrl: null,
    }
  }

  return {
    runtimeUrl: DEFAULT_PERSONAPLEX_RUNTIME_URL,
    runtimeUrlSource: 'default',
    ignoredStateRuntimeUrl:
      args.state && stateRuntimeUrl !== DEFAULT_PERSONAPLEX_RUNTIME_URL
        ? stateRuntimeUrl
        : null,
  }
}

function formatRuntimeAge(ageMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(ageMs / 1000))
  if (totalSeconds < 60) {
    return `${totalSeconds}s`
  }
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 48) {
    return `${totalHours}h`
  }
  return `${Math.floor(totalHours / 24)}d`
}

export function buildPersonaPlexRuntimeStateDiagnostic(
  state: PersonaPlexRuntimeState | null,
  now = Date.now(),
): string | null {
  if (!state) {
    return null
  }
  const detailParts = [
    state.runtimeMode ? `mode ${state.runtimeMode}` : null,
    state.processId ?? state.wslPid
      ? `pid ${state.processId ?? state.wslPid}`
      : null,
    state.status ? `status ${state.status}` : null,
  ].filter((part): part is string => Boolean(part))

  const healthyAt = typeof state.healthyAt === 'string'
    ? Date.parse(state.healthyAt)
    : Number.NaN
  if (Number.isFinite(healthyAt)) {
    const ageMs = now - healthyAt
    detailParts.push(
      ageMs > RUNTIME_STATE_STALE_MS
        ? `last healthy ${formatRuntimeAge(ageMs)} ago`
        : `healthy ${formatRuntimeAge(ageMs)} ago`,
    )
  } else if (state.startedAt) {
    detailParts.push(`started ${state.startedAt}`)
  }

  const failedAt = typeof state.failedAt === 'string'
    ? Date.parse(state.failedAt)
    : Number.NaN
  if (Number.isFinite(failedAt)) {
    detailParts.push(`failed ${formatRuntimeAge(now - failedAt)} ago`)
  }

  const lastError = state.lastError ?? state.error
  if (lastError) {
    detailParts.push(`last error ${lastError}`)
  }

  return detailParts.length > 0 ? detailParts.join(', ') : null
}

function withRuntimeStateDiagnostic(
  message: string,
  state: PersonaPlexRuntimeState | null,
): string {
  const diagnostic = buildPersonaPlexRuntimeStateDiagnostic(state)
  return diagnostic ? `${message} (${diagnostic})` : message
}

function readSmallScriptForInspection(path: string): string | null {
  if (!existsSync(path)) {
    return null
  }
  try {
    const stat = statSync(path)
    if (!stat.isFile() || stat.size > MAX_SCRIPT_SCAN_BYTES) {
      return null
    }
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

export function buildPersonaPlexLauncherWarnings(args: {
  stationRoot: string
  launcherPath: string
}): string[] {
  const candidates = [
    args.launcherPath,
    join(args.stationRoot, 'personaplex-runtime', 'start-personaplex-wsl.sh'),
  ]
  const warnings: string[] = []
  const seen = new Set<string>()

  for (const path of candidates) {
    const resolved = resolve(path)
    if (seen.has(resolved)) {
      continue
    }
    seen.add(resolved)
    const content = readSmallScriptForInspection(resolved)
    if (!content || !INLINE_SECRET_ASSIGNMENT_PATTERN.test(content)) {
      continue
    }
    warnings.push(
      `inline secret assignment detected in ${basename(resolved)}; rotate the affected credential and regenerate the launcher from environment only`,
    )
  }

  return warnings
}

export function buildPersonaPlexRepairHint(args: {
  state: PersonaPlexRuntimeState | null
  ready: boolean
  root?: string
  stationRoot?: string | null
  launcherPath?: string | null
}): PersonaPlexRepairHint {
  const stationRoot = resolvePersonaPlexStationRoot({
    root: args.root,
    stationRoot: args.stationRoot,
  })
  const launcherPath = resolvePersonaPlexLauncherPath({
    root: args.root,
    stationRoot,
    launcherPath: args.launcherPath,
  })
  const missing = [
    !existsSync(launcherPath) ? launcherPath : null,
  ].filter((item): item is string => Boolean(item))
  const warnings = buildPersonaPlexLauncherWarnings({
    stationRoot,
    launcherPath,
  })
  const failedWithoutHealthyRuntime = hasFailedWithoutHealthyRuntime(args.state)
  const status = args.ready
    ? 'ready'
    : failedWithoutHealthyRuntime
      ? 'runtime_failed'
      : 'start_required'
  const summary = args.ready
    ? 'PersonaPlex bridge is ready; no repair action is required.'
    : failedWithoutHealthyRuntime
      ? 'PersonaPlex runtime failed after launch; restart it with the local voice launcher and inspect personaplex-runtime logs if it fails again.'
      : 'PersonaPlex runtime is not answering the voice WebSocket; start it with the local voice launcher on the operator machine.'

  return {
    status,
    summary,
    command: 'pwsh',
    args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', launcherPath],
    stationRoot,
    launcherPath,
    missing,
    warnings,
  }
}

export function buildPersonaPlexProbeWebSocketUrl(args: {
  runtimeUrl: string
  textPrompt: string
  voicePrompt: string
}): string {
  const url = new URL(args.runtimeUrl)
  if (url.protocol === 'https:') {
    url.protocol = 'wss:'
  } else if (url.protocol === 'http:') {
    url.protocol = 'ws:'
  }
  url.username = ''
  url.password = ''
  url.search = ''
  if (url.pathname === '/' || !url.pathname) {
    url.pathname = '/api/chat'
  }
  url.searchParams.set('text_prompt', args.textPrompt)
  url.searchParams.set('voice_prompt', args.voicePrompt)
  return url.toString()
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    normalized === '0.0.0.0' ||
    normalized === '127.0.0.1' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)
  )
}

export function validatePersonaPlexRuntimeUrl(args: {
  runtimeUrl: string
  allowRemote: boolean
}): string | null {
  let parsed: URL
  try {
    parsed = new URL(args.runtimeUrl)
  } catch (error) {
    return `Invalid PersonaPlex runtime URL: ${
      error instanceof Error ? error.message : String(error)
    }`
  }

  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    return `Unsupported PersonaPlex runtime URL protocol: ${parsed.protocol}`
  }
  if (parsed.username || parsed.password) {
    return 'PersonaPlex runtime URLs must not include credentials.'
  }
  if (!args.allowRemote && !isLoopbackHost(parsed.hostname)) {
    return 'PersonaPlex runtime URL must be loopback unless --allow-remote-personaplex is set.'
  }
  return null
}

export function redactPersonaPlexProbeWebSocketUrl(url: string): string {
  return redactUrlForDiagnostics(url)
}

export function sanitizePersonaPlexProbeResultForOutput(
  result: PersonaPlexProbeResult,
): PersonaPlexProbeResult {
  return {
    ...result,
    runtimeUrl: redactUrlForDiagnostics(result.runtimeUrl),
    websocketUrl: redactPersonaPlexProbeWebSocketUrl(result.websocketUrl),
    textPrompt: result.textPrompt ? CONFIGURED : result.textPrompt,
    voicePrompt: result.voicePrompt ? CONFIGURED : result.voicePrompt,
    runtimeState: sanitizePersonaPlexRuntimeState(result.runtimeState ?? null),
    ignoredStateRuntimeUrl: result.ignoredStateRuntimeUrl
      ? redactUrlForDiagnostics(result.ignoredStateRuntimeUrl)
      : result.ignoredStateRuntimeUrl,
    error: result.error ? redactSensitiveText(result.error) : result.error,
  }
}

async function messageDataToUint8Array(data: unknown): Promise<Uint8Array> {
  if (data instanceof Uint8Array) {
    return data
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer())
  }
  if (typeof data === 'string') {
    return new TextEncoder().encode(data)
  }
  return new Uint8Array()
}

function closeWebSocketGracefully(
  ws: WebSocket | null,
  graceMs = 250,
): Promise<void> {
  if (!ws || ws.readyState === WebSocket.CLOSED) {
    return Promise.resolve()
  }
  return new Promise(resolveClose => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolveClose()
    }
    const timer = setTimeout(finish, graceMs)
    try {
      ws.addEventListener('close', finish, { once: true })
      ws.close()
    } catch {
      finish()
    }
  })
}

export async function probePersonaPlexRuntime(
  options: PersonaPlexProbeOptions,
): Promise<PersonaPlexProbeResult> {
  const stationRoot = resolvePersonaPlexStationRoot({
    stationRoot: options.stationRoot,
  })
  const runtimeStatePath = resolvePersonaPlexRuntimeStatePath({
    stationRoot,
    runtimeStatePath: options.runtimeStatePath,
  })
  const launcherPath = resolvePersonaPlexLauncherPath({
    stationRoot,
    launcherPath: options.launcherPath,
  })
  const state = readRuntimeState(runtimeStatePath)
  const buildRepair = (ready: boolean) =>
    buildPersonaPlexRepairHint({
      state,
      ready,
      stationRoot,
      launcherPath,
    })
  const selectedRuntime = selectPersonaPlexProbeRuntimeUrl({
    runtimeUrl: options.runtimeUrl,
    state,
  })
  const runtimeUrl = selectedRuntime.runtimeUrl
  const startedAt = Date.now()
  let websocketUrl: string
  const validationError = validatePersonaPlexRuntimeUrl({
    runtimeUrl,
    allowRemote: options.allowRemote,
  })

  if (validationError) {
    return {
      status: 'error',
      ready: false,
      runtimeUrl,
      websocketUrl: runtimeUrl,
      voicePrompt: options.voicePrompt,
      textPrompt: options.textPrompt,
      latencyMs: Date.now() - startedAt,
      firstByte: null,
      messageType: null,
      runtimeState: state,
      runtimeUrlSource: selectedRuntime.runtimeUrlSource,
      ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
      repair: buildRepair(false),
      error: withRuntimeStateDiagnostic(validationError, state),
    }
  }

  try {
    websocketUrl = buildPersonaPlexProbeWebSocketUrl({
      runtimeUrl,
      textPrompt: options.textPrompt,
      voicePrompt: options.voicePrompt,
    })
  } catch (error) {
    return {
      status: 'error',
      ready: false,
      runtimeUrl,
      websocketUrl: runtimeUrl,
      voicePrompt: options.voicePrompt,
      textPrompt: options.textPrompt,
      latencyMs: Date.now() - startedAt,
      firstByte: null,
      messageType: null,
      runtimeState: state,
      runtimeUrlSource: selectedRuntime.runtimeUrlSource,
      ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
      repair: buildRepair(false),
      error: withRuntimeStateDiagnostic(
        `Invalid PersonaPlex runtime URL: ${
          error instanceof Error ? error.message : String(error)
        }`,
        state,
      ),
    }
  }

  return await new Promise<PersonaPlexProbeResult>(resolveProbe => {
    let settled = false
    let ws: WebSocket | null = null
    const finish = (
      result: Omit<PersonaPlexProbeResult, 'latencyMs' | 'repair'>,
    ) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      void (async () => {
        await closeWebSocketGracefully(ws)
        resolveProbe({
          ...result,
          latencyMs: Date.now() - startedAt,
          repair: buildRepair(result.ready),
        })
      })()
    }
    const timeout = setTimeout(() => {
      finish({
        status: 'error',
        ready: false,
        runtimeUrl,
        websocketUrl,
        voicePrompt: options.voicePrompt,
        textPrompt: options.textPrompt,
        firstByte: null,
        messageType: null,
        runtimeState: state,
        runtimeUrlSource: selectedRuntime.runtimeUrlSource,
        ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
        error: withRuntimeStateDiagnostic(
          `PersonaPlex probe timed out after ${options.timeoutMs}ms`,
          state,
        ),
      })
    }, options.timeoutMs)

    try {
      ws = new WebSocket(websocketUrl)
      ws.binaryType = 'arraybuffer'
      ws.addEventListener('message', event => {
        void (async () => {
          const payload = await messageDataToUint8Array(event.data)
          const firstByte = payload[0] ?? null
          finish({
            status: firstByte === 0 ? 'ok' : 'error',
            ready: firstByte === 0,
            runtimeUrl,
            websocketUrl,
            voicePrompt: options.voicePrompt,
            textPrompt: options.textPrompt,
            firstByte,
            messageType:
              typeof event.data === 'string'
                ? 'text'
                : payload.length > 0
                  ? 'binary'
                  : 'empty',
            runtimeState: state,
            runtimeUrlSource: selectedRuntime.runtimeUrlSource,
            ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
            error:
              firstByte === 0
                ? null
                : withRuntimeStateDiagnostic(
                    `Expected PersonaPlex hello byte 0, received ${
                      firstByte ?? 'empty payload'
                    }`,
                    state,
                  ),
          })
        })()
      })
      ws.addEventListener('error', () => {
        finish({
          status: 'error',
          ready: false,
          runtimeUrl,
          websocketUrl,
          voicePrompt: options.voicePrompt,
          textPrompt: options.textPrompt,
          firstByte: null,
          messageType: null,
          runtimeState: state,
          runtimeUrlSource: selectedRuntime.runtimeUrlSource,
          ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
          error: withRuntimeStateDiagnostic('PersonaPlex WebSocket error', state),
        })
      })
      ws.addEventListener('close', event => {
        if (!settled) {
          finish({
            status: 'error',
            ready: false,
            runtimeUrl,
            websocketUrl,
            voicePrompt: options.voicePrompt,
            textPrompt: options.textPrompt,
            firstByte: null,
            messageType: null,
            runtimeState: state,
            runtimeUrlSource: selectedRuntime.runtimeUrlSource,
            ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
            error: withRuntimeStateDiagnostic(
              `PersonaPlex WebSocket closed before hello: ${event.code}`,
              state,
            ),
          })
        }
      })
    } catch (error) {
      finish({
        status: 'error',
        ready: false,
        runtimeUrl,
        websocketUrl,
        voicePrompt: options.voicePrompt,
        textPrompt: options.textPrompt,
        firstByte: null,
        messageType: null,
        runtimeState: state,
        runtimeUrlSource: selectedRuntime.runtimeUrlSource,
        ignoredStateRuntimeUrl: selectedRuntime.ignoredStateRuntimeUrl,
        error: withRuntimeStateDiagnostic(
          error instanceof Error ? error.message : String(error),
          state,
        ),
      })
    }
  })
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const result = await probePersonaPlexRuntime(options)
  if (options.json) {
    console.log(
      JSON.stringify(sanitizePersonaPlexProbeResultForOutput(result), null, 2),
    )
  } else if (result.ready) {
    console.log(
      `PersonaPlex ready at ${result.runtimeUrl} (${result.latencyMs}ms)`,
    )
  } else {
    console.error(result.error ?? 'PersonaPlex probe failed')
    console.error(`Repair command argv: ${JSON.stringify([
      result.repair.command,
      ...result.repair.args,
    ])}`)
  }
  return result.ready ? 0 : 1
}

if (import.meta.main) {
  process.exitCode = await main()
}
