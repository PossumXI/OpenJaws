import { randomUUID } from 'crypto'
import type { ChildProcess } from 'child_process'
import type { SessionInfo } from './types.js'

export type DirectConnectWebSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type BackendSession = {
  process: ChildProcess
  workDir: string
}

export type SessionBackend = {
  startSession(args: {
    sessionId: string
    cwd: string
    dangerouslySkipPermissions?: boolean
  }): Promise<BackendSession>
}

export type SessionManagerOptions = {
  idleTimeoutMs?: number
  maxSessions?: number
}

type ManagedSession = SessionInfo & {
  sockets: Set<DirectConnectWebSocket>
  outputBuffer: string[]
  bufferBytes: number
  idleTimer: ReturnType<typeof setTimeout> | null
}

const MAX_BUFFER_BYTES = 1024 * 1024

function closeSocket(
  socket: DirectConnectWebSocket,
  code = 1000,
  reason = 'session closed',
) {
  try {
    socket.close(code, reason)
  } catch {
    // Socket close is best effort during teardown.
  }
}

export class SessionManager {
  private readonly sessions = new Map<string, ManagedSession>()

  constructor(
    private readonly backend: SessionBackend,
    private readonly options: SessionManagerOptions = {},
  ) {}

  async createSession(args: {
    cwd: string
    dangerouslySkipPermissions?: boolean
  }): Promise<SessionInfo> {
    const maxSessions = this.options.maxSessions ?? 0
    if (maxSessions > 0 && this.sessions.size >= maxSessions) {
      throw new Error(`Direct Connect session limit reached (${maxSessions}).`)
    }

    const id = randomUUID()
    const backendSession = await this.backend.startSession({
      sessionId: id,
      cwd: args.cwd,
      dangerouslySkipPermissions: args.dangerouslySkipPermissions,
    })
    const session: ManagedSession = {
      id,
      status: 'running',
      createdAt: Date.now(),
      workDir: backendSession.workDir,
      process: backendSession.process,
      sockets: new Set(),
      outputBuffer: [],
      bufferBytes: 0,
      idleTimer: null,
    }

    backendSession.process.stdout?.on('data', chunk => {
      this.broadcastOutput(session, Buffer.from(chunk).toString('utf8'))
    })
    backendSession.process.stderr?.on('data', chunk => {
      this.broadcastOutput(
        session,
        JSON.stringify({
          type: 'system',
          subtype: 'stderr',
          session_id: id,
          message: Buffer.from(chunk).toString('utf8'),
        }) + '\n',
      )
    })
    backendSession.process.once('exit', () => {
      session.status = 'stopped'
      session.process = null
      for (const socket of session.sockets) {
        closeSocket(socket, 1000, 'session exited')
      }
      session.sockets.clear()
      this.scheduleIdleDestroy(session)
    })

    this.sessions.set(id, session)
    this.scheduleIdleDestroy(session)
    return session
  }

  getSession(id: string): SessionInfo | null {
    return this.sessions.get(id) ?? null
  }

  listSessions(): SessionInfo[] {
    return Array.from(this.sessions.values())
  }

  attachWebSocket(id: string, socket: DirectConnectWebSocket): boolean {
    const session = this.sessions.get(id)
    if (!session || session.status === 'stopped') {
      closeSocket(socket, 4001, 'session not found')
      return false
    }
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
      session.idleTimer = null
    }
    session.sockets.add(socket)
    for (const buffered of session.outputBuffer) {
      socket.send(buffered)
    }
    return true
  }

  detachWebSocket(id: string, socket: DirectConnectWebSocket): void {
    const session = this.sessions.get(id)
    if (!session) {
      return
    }
    session.sockets.delete(socket)
    this.scheduleIdleDestroy(session)
  }

  sendToSession(id: string, data: string): boolean {
    const session = this.sessions.get(id)
    if (!session?.process?.stdin || session.status === 'stopped') {
      return false
    }
    session.process.stdin.write(data.endsWith('\n') ? data : `${data}\n`)
    return true
  }

  async destroySession(id: string): Promise<boolean> {
    const session = this.sessions.get(id)
    if (!session) {
      return false
    }
    this.sessions.delete(id)
    if (session.idleTimer) {
      clearTimeout(session.idleTimer)
    }
    session.status = 'stopping'
    for (const socket of session.sockets) {
      closeSocket(socket)
    }
    session.sockets.clear()
    if (session.process && !session.process.killed) {
      session.process.kill()
    }
    session.status = 'stopped'
    return true
  }

  async destroyAll(): Promise<void> {
    await Promise.all(Array.from(this.sessions.keys()).map(id => this.destroySession(id)))
  }

  private broadcastOutput(session: ManagedSession, chunk: string): void {
    if (!chunk) {
      return
    }
    if (session.sockets.size === 0) {
      session.outputBuffer.push(chunk)
      session.bufferBytes += Buffer.byteLength(chunk)
      while (session.bufferBytes > MAX_BUFFER_BYTES) {
        const removed = session.outputBuffer.shift()
        if (!removed) {
          break
        }
        session.bufferBytes -= Buffer.byteLength(removed)
      }
      return
    }
    for (const socket of session.sockets) {
      try {
        socket.send(chunk)
      } catch {
        session.sockets.delete(socket)
      }
    }
  }

  private scheduleIdleDestroy(session: ManagedSession): void {
    const idleTimeoutMs = this.options.idleTimeoutMs ?? 600_000
    if (idleTimeoutMs <= 0 || session.sockets.size > 0 || session.idleTimer) {
      return
    }
    session.status = session.status === 'running' ? 'detached' : session.status
    session.idleTimer = setTimeout(() => {
      void this.destroySession(session.id)
    }, idleTimeoutMs)
    session.idleTimer.unref?.()
  }
}
