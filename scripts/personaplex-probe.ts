import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

export type PersonaPlexProbeOptions = {
  json: boolean
  timeoutMs: number
  runtimeUrl: string | null
  textPrompt: string
  voicePrompt: string
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
const LOCAL_COMMAND_STATION_ROOT = join(REPO_ROOT, 'local-command-station')
const PERSONAPLEX_LAUNCHER_PATH = join(
  LOCAL_COMMAND_STATION_ROOT,
  'start-personaplex-voice.ps1',
)
const RUNTIME_STATE_PATH = join(
  LOCAL_COMMAND_STATION_ROOT,
  'personaplex-runtime',
  'runtime.json',
)
const DEFAULT_PERSONAPLEX_RUNTIME_URL = 'http://127.0.0.1:8998'
const RUNTIME_STATE_STALE_MS = 30 * 60 * 1000

export function parseArgs(argv: string[]): PersonaPlexProbeOptions {
  const options: PersonaPlexProbeOptions = {
    json: false,
    timeoutMs: 90_000,
    runtimeUrl: process.env.PERSONAPLEX_URL?.trim() || null,
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
      case '--url':
      case '--runtime-url':
        options.runtimeUrl = argv[index + 1]?.trim() || null
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

function readRuntimeState(
  path = RUNTIME_STATE_PATH,
): PersonaPlexRuntimeState | null {
  if (!existsSync(path)) {
    return null
  }
  return JSON.parse(readFileSync(path, 'utf8')) as PersonaPlexRuntimeState
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

export function buildPersonaPlexRepairHint(args: {
  state: PersonaPlexRuntimeState | null
  ready: boolean
  root?: string
}): PersonaPlexRepairHint {
  const root = resolve(args.root ?? REPO_ROOT)
  const stationRoot = join(root, 'local-command-station')
  const launcherPath = join(stationRoot, 'start-personaplex-voice.ps1')
  const missing = [
    !existsSync(launcherPath) ? launcherPath : null,
  ].filter((item): item is string => Boolean(item))
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
  if (url.pathname === '/' || !url.pathname) {
    url.pathname = '/api/chat'
  }
  url.searchParams.set('text_prompt', args.textPrompt)
  url.searchParams.set('voice_prompt', args.voicePrompt)
  return url.toString()
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
  const state = readRuntimeState()
  const selectedRuntime = selectPersonaPlexProbeRuntimeUrl({
    runtimeUrl: options.runtimeUrl,
    state,
  })
  const runtimeUrl = selectedRuntime.runtimeUrl
  const websocketUrl = buildPersonaPlexProbeWebSocketUrl({
    runtimeUrl,
    textPrompt: options.textPrompt,
    voicePrompt: options.voicePrompt,
  })
  const startedAt = Date.now()

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
          repair: buildPersonaPlexRepairHint({
            state,
            ready: result.ready,
          }),
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
    console.log(JSON.stringify(result, null, 2))
  } else if (result.ready) {
    console.log(
      `PersonaPlex ready at ${result.runtimeUrl} (${result.latencyMs}ms, ${result.voicePrompt})`,
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
