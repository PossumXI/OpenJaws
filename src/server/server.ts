import type { ServerConfig } from './types.js'
import type { DirectConnectWebSocket, SessionManager } from './sessionManager.js'
import type { ServerLogger } from './serverLog.js'

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
