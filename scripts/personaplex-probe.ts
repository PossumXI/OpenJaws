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

type PersonaPlexRuntimeState = {
  runtimeUrl?: string | null
  host?: string | null
  port?: string | number | null
  protocol?: string | null
  healthyAt?: string | null
  runtimeMode?: string | null
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
  error?: string | null
}

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RUNTIME_STATE_PATH = join(
  REPO_ROOT,
  'local-command-station',
  'personaplex-runtime',
  'runtime.json',
)

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

function runtimeUrlFromState(
  state: PersonaPlexRuntimeState | null,
): string {
  const direct = state?.runtimeUrl?.trim()
  if (direct) {
    return direct
  }
  const host = state?.host?.trim() || '127.0.0.1'
  const port = String(state?.port ?? '8998').trim() || '8998'
  const protocol = state?.protocol?.trim() || 'http'
  return `${protocol}://${host}:${port}`
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
  return new Promise(resolve => {
    let settled = false
    const finish = () => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve()
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
  const runtimeUrl = options.runtimeUrl ?? runtimeUrlFromState(state)
  const websocketUrl = buildPersonaPlexProbeWebSocketUrl({
    runtimeUrl,
    textPrompt: options.textPrompt,
    voicePrompt: options.voicePrompt,
  })
  const startedAt = Date.now()

  return await new Promise<PersonaPlexProbeResult>(resolveProbe => {
    let settled = false
    let ws: WebSocket | null = null
    const finish = (result: Omit<PersonaPlexProbeResult, 'latencyMs'>) => {
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
        error: `PersonaPlex probe timed out after ${options.timeoutMs}ms`,
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
            error:
              firstByte === 0
                ? null
                : `Expected PersonaPlex hello byte 0, received ${firstByte ?? 'empty payload'}`,
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
          error: 'PersonaPlex WebSocket error',
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
            error: `PersonaPlex WebSocket closed before hello: ${event.code}`,
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
        error: error instanceof Error ? error.message : String(error),
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
  }
  return result.ready ? 0 : 1
}

if (import.meta.main) {
  process.exitCode = await main()
}
