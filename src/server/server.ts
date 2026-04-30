import type { ServerConfig } from './types.js'
import type { DirectConnectWebSocket, SessionManager } from './sessionManager.js'
import type { ServerLogger } from './serverLog.js'
import {
  runBrowserPreviewApiAction,
  type BrowserPreviewApiAction,
  type BrowserPreviewApiInput,
} from '../utils/browserPreviewApi.js'

export type DirectConnectServerHandle = {
  port: number | null
  stop(force?: boolean): void
}

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function unauthorized(): Response {
  return jsonResponse({ error: 'unauthorized' }, 401)
}

function badRequest(message: string): Response {
  return jsonResponse({ error: 'bad_request', message }, 400)
}

function isAuthorized(request: Request, authToken: string): boolean {
  const header = request.headers.get('authorization') ?? ''
  return header === `Bearer ${authToken}`
}

function resolveRequestCwd(config: ServerConfig, body: unknown): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'cwd' in body &&
    typeof body.cwd === 'string' &&
    body.cwd.trim()
  ) {
    return body.cwd
  }
  return config.workspace ?? process.cwd()
}

function resolvePublicHost(host: string): string {
  if (host === '0.0.0.0' || host === '::') {
    return '127.0.0.1'
  }
  return host
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function readOptionalString(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key]
  return typeof value === 'string' ? value : undefined
}

function readOptionalBoolean(
  body: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = body[key]
  return typeof value === 'boolean' ? value : undefined
}

function readOptionalNumber(
  body: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = body[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readBrowserAction(pathname: string): BrowserPreviewApiAction | null {
  switch (pathname) {
    case '/browser/capabilities':
      return 'capabilities'
    case '/browser/runtime':
      return 'runtime'
    case '/browser/receipts':
      return 'receipts'
    case '/browser/open':
      return 'open'
    case '/browser/navigate':
      return 'navigate'
    case '/browser/close':
      return 'close'
    case '/browser/launch':
      return 'launch'
    case '/browser/handoff':
      return 'handoff'
    case '/browser/demo-harness':
    case '/browser/demo_harness':
      return 'demo_harness'
    case '/browser/demo-run':
    case '/browser/demo_run':
      return 'demo_run'
    case '/browser/demo-package':
    case '/browser/demo_package':
      return 'demo_package'
    default:
      return null
  }
}

async function handleBrowserPreviewRequest(
  request: Request,
  action: BrowserPreviewApiAction,
): Promise<Response> {
  const readOnly = action === 'capabilities' || action === 'runtime' || action === 'receipts'
  if (readOnly && request.method !== 'GET') {
    return badRequest(`${action} requires GET.`)
  }
  if (!readOnly && request.method !== 'POST') {
    return badRequest(`${action} requires POST.`)
  }

  const body = request.method === 'POST' ? await readJsonBody(request) : {}
  const input: BrowserPreviewApiInput = {
    action,
    url: readOptionalString(body, 'url'),
    sessionId: readOptionalString(body, 'sessionId') ?? readOptionalString(body, 'session_id'),
    intent: readOptionalString(body, 'intent') as BrowserPreviewApiInput['intent'],
    rationale: readOptionalString(body, 'rationale'),
    requestedBy: (readOptionalString(body, 'requestedBy') ??
      readOptionalString(body, 'requested_by') ??
      'agent') as BrowserPreviewApiInput['requestedBy'],
    name: readOptionalString(body, 'name'),
    outputDir: readOptionalString(body, 'outputDir') ?? readOptionalString(body, 'output_dir'),
    timeoutMs: readOptionalNumber(body, 'timeoutMs') ?? readOptionalNumber(body, 'timeout_ms'),
    headed: readOptionalBoolean(body, 'headed'),
    installBrowsers:
      readOptionalBoolean(body, 'installBrowsers') ??
      readOptionalBoolean(body, 'install_browsers'),
    dryRun: readOptionalBoolean(body, 'dryRun') ?? readOptionalBoolean(body, 'dry_run'),
  }

  try {
    const result = await runBrowserPreviewApiAction(input)
    return jsonResponse(result, result.ok ? 200 : 409)
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : String(error))
  }
}

function buildWsUrl(args: {
  request: Request
  config: ServerConfig
  port: number
  sessionId: string
}): string {
  const requestUrl = new URL(args.request.url)
  const host =
    requestUrl.hostname && requestUrl.hostname !== '0.0.0.0'
      ? requestUrl.hostname
      : resolvePublicHost(args.config.host)
  const protocol = requestUrl.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${host}:${args.port}/sessions/${args.sessionId}/ws`
}

export function startServer(
  config: ServerConfig,
  sessionManager: SessionManager,
  logger: ServerLogger,
): DirectConnectServerHandle {
  if (config.unix) {
    throw new Error(
      'Direct Connect unix socket serving is not supported by this OpenJaws build. Use --host and --port.',
    )
  }

  const adapters = new WeakMap<object, DirectConnectWebSocket>()
  const sessionIds = new WeakMap<object, string>()
  let actualPort = config.port

  const server = Bun.serve<{ sessionId: string }>({
    hostname: config.host,
    port: config.port,
    async fetch(request, bunServer) {
      const url = new URL(request.url)
      if (request.method === 'GET' && url.pathname === '/health') {
        return jsonResponse({
          status: 'ok',
          product: 'OpenJaws Direct Connect',
          website: 'https://qline.site',
          sessions: sessionManager.listSessions().length,
        })
      }

      if (!isAuthorized(request, config.authToken)) {
        return unauthorized()
      }

      const browserAction = readBrowserAction(url.pathname)
      if (browserAction) {
        return handleBrowserPreviewRequest(request, browserAction)
      }

      if (request.method === 'GET' && url.pathname === '/sessions') {
        return jsonResponse({
          sessions: sessionManager.listSessions().map(session => ({
            id: session.id,
            status: session.status,
            createdAt: session.createdAt,
            workDir: session.workDir,
          })),
        })
      }

      if (request.method === 'POST' && url.pathname === '/sessions') {
        let body: unknown = {}
        try {
          body = await request.json()
        } catch {
          body = {}
        }
        try {
          const session = await sessionManager.createSession({
            cwd: resolveRequestCwd(config, body),
            dangerouslySkipPermissions:
              typeof body === 'object' &&
              body !== null &&
              'dangerously_skip_permissions' in body &&
              body.dangerously_skip_permissions === true,
          })
          return jsonResponse(
            {
              session_id: session.id,
              ws_url: buildWsUrl({
                request,
                config,
                port: actualPort,
                sessionId: session.id,
              }),
              work_dir: session.workDir,
            },
            201,
          )
        } catch (error) {
          return jsonResponse(
            {
              error: error instanceof Error ? error.message : String(error),
            },
            500,
          )
        }
      }

      const wsMatch = url.pathname.match(/^\/sessions\/([^/]+)\/ws$/)
      if (request.method === 'GET' && wsMatch) {
        const sessionId = decodeURIComponent(wsMatch[1] ?? '')
        const upgraded = bunServer.upgrade(request, {
          data: { sessionId },
        })
        if (upgraded) {
          return undefined
        }
        return jsonResponse({ error: 'websocket upgrade failed' }, 400)
      }

      return jsonResponse({ error: 'not found' }, 404)
    },
    websocket: {
      open(ws) {
        const sessionId = ws.data.sessionId
        const adapter = ws as unknown as DirectConnectWebSocket
        adapters.set(ws, adapter)
        sessionIds.set(ws, sessionId)
        if (!sessionManager.attachWebSocket(sessionId, adapter)) {
          logger.warn('Direct Connect WebSocket rejected missing session', {
            sessionId,
          })
        }
      },
      message(ws, message) {
        const sessionId = sessionIds.get(ws)
        if (!sessionId) {
          ws.close(4001, 'session not found')
          return
        }
        const payload =
          typeof message === 'string'
            ? message
            : Buffer.from(message).toString('utf8')
        if (!sessionManager.sendToSession(sessionId, payload)) {
          ws.close(4001, 'session not found')
        }
      },
      close(ws) {
        const sessionId = sessionIds.get(ws)
        const adapter = adapters.get(ws)
        if (sessionId && adapter) {
          sessionManager.detachWebSocket(sessionId, adapter)
        }
        adapters.delete(ws)
        sessionIds.delete(ws)
      },
    },
  })

  actualPort = server.port
  logger.info('OpenJaws Direct Connect server started', {
    port: actualPort,
    website: 'https://qline.site',
  })

  return {
    port: actualPort,
    stop(force = false) {
      server.stop(force)
    },
  }
}
