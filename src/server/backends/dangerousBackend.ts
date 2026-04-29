import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { resolve } from 'path'
import type { BackendSession, SessionBackend } from '../sessionManager.js'

function resolveCliLaunch(): { command: string; args: string[] } {
  const entrypoint = process.argv[1]
  if (entrypoint && existsSync(entrypoint) && /\.(?:m?[jt]sx?)$/i.test(entrypoint)) {
    return {
      command: process.execPath,
      args: [entrypoint],
    }
  }
  return {
    command: process.execPath,
    args: [],
  }
}

export class DangerousBackend implements SessionBackend {
  async startSession(args: {
    sessionId: string
    cwd: string
    dangerouslySkipPermissions?: boolean
  }): Promise<BackendSession> {
    const launch = resolveCliLaunch()
    const childArgs = [
      ...launch.args,
      '--print',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      '--include-partial-messages',
      '--session-id',
      args.sessionId,
    ]
    if (args.dangerouslySkipPermissions) {
      childArgs.push('--dangerously-skip-permissions')
    }

    const workDir = resolve(args.cwd)
    const child = spawn(launch.command, childArgs, {
      cwd: workDir,
      env: {
        ...process.env,
        OPENJAWS_ENTRYPOINT: 'sdk-cli',
        OPENJAWS_DIRECT_CONNECT_CHILD: '1',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })

    child.once('error', error => {
      child.stderr?.emit('data', Buffer.from(`${error.message}\n`, 'utf8'))
    })

    return {
      process: child,
      workDir,
    }
  }
}
