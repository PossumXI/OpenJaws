import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { getOpenJawsConfigHomeDir } from '../utils/envUtils.js'

export type ServerLock = {
  pid: number
  port: number
  host: string
  httpUrl: string
  startedAt: number
}

export function getServerLockPath(): string {
  return join(getOpenJawsConfigHomeDir(), 'direct-connect-server.json')
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function isServerReachable(lock: ServerLock): Promise<boolean> {
  if (lock.httpUrl.startsWith('unix:')) {
    return isProcessAlive(lock.pid)
  }
  try {
    const response = await fetch(`${lock.httpUrl.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(750),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function writeServerLock(lock: ServerLock): Promise<void> {
  const lockPath = getServerLockPath()
  await mkdir(dirname(lockPath), { recursive: true })
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8')
}

export async function removeServerLock(): Promise<void> {
  await rm(getServerLockPath(), { force: true })
}

export async function probeRunningServer(): Promise<ServerLock | null> {
  const lockPath = getServerLockPath()
  if (!existsSync(lockPath)) {
    return null
  }
  let lock: ServerLock
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8')) as ServerLock
  } catch {
    await removeServerLock()
    return null
  }
  if (!Number.isInteger(lock.pid) || !isProcessAlive(lock.pid)) {
    await removeServerLock()
    return null
  }
  if (!(await isServerReachable(lock))) {
    await removeServerLock()
    return null
  }
  return lock
}
