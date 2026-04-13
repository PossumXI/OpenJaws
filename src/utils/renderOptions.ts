import { openSync } from 'fs'
import { ReadStream } from 'tty'
import type { RenderOptions } from '../ink.js'
import { isEnvTruthy } from './envUtils.js'
import { logError } from './log.js'

// Cached stdin override - computed once per process
let cachedStdinOverride: ReadStream | undefined | null = null

type StdinWithRawMode = NodeJS.ReadStream & {
  isTTY?: boolean
  setRawMode?: (mode: boolean) => void
}

type TtyLikeStream = NodeJS.WriteStream & {
  isTTY?: boolean
}

function isPrintLikeMode(): boolean {
  return (
    process.argv.includes('-p') ||
    process.argv.includes('--print') ||
    process.argv.includes('--init-only')
  )
}

function isForcedWindowsInteractive(): boolean {
  return (
    process.platform === 'win32' &&
    isEnvTruthy(process.env.OPENJAWS_FORCE_INTERACTIVE) &&
    !isPrintLikeMode()
  )
}

function canUseWindowsConsoleInput(): boolean {
  const stdin = process.stdin as StdinWithRawMode
  return (
    process.platform === 'win32' &&
    Boolean(process.stdout.isTTY || process.stderr.isTTY) &&
    typeof stdin.setRawMode === 'function'
  )
}

function promoteTTY(stream: { isTTY?: boolean }): void {
  if (stream.isTTY) {
    return
  }

  try {
    Object.defineProperty(stream, 'isTTY', {
      value: true,
      configurable: true,
    })
  } catch {
    stream.isTTY = true
  }
}

export function normalizeInteractiveStdioForWindows(): void {
  if (!canUseWindowsConsoleInput() && !isForcedWindowsInteractive()) {
    return
  }

  const stdin = process.stdin as StdinWithRawMode
  // Bun-compiled Windows binaries can report stdin.isTTY=false even in a real
  // console. Promote stdin to interactive so the REPL and Ink don't take the
  // headless path and immediately exit back to PowerShell/cmd.
  if (!stdin.isTTY) {
    promoteTTY(stdin)
  }

  if (isForcedWindowsInteractive()) {
    promoteTTY(process.stdout as TtyLikeStream)
    promoteTTY(process.stderr as TtyLikeStream)
  }
}

export function getInteractiveOutput(): NodeJS.WriteStream | undefined {
  if (isForcedWindowsInteractive()) {
    normalizeInteractiveStdioForWindows()
    return process.stdout
  }

  if (process.stdout.isTTY) {
    return process.stdout
  }

  // Bun on Windows can misreport stdout while stderr is still attached to the
  // same interactive console. Fall back so the TUI still renders in PowerShell/cmd.
  if (process.stderr.isTTY) {
    return process.stderr
  }

  return undefined
}

export function hasInteractiveTerminal(): boolean {
  normalizeInteractiveStdioForWindows()
  if (isForcedWindowsInteractive()) {
    return Boolean(getInteractiveOutput()?.isTTY)
  }
  return process.stdin.isTTY && Boolean(getInteractiveOutput()?.isTTY)
}

/**
 * Gets a ReadStream for /dev/tty when stdin is piped.
 * This allows interactive Ink rendering even when stdin is a pipe.
 * Result is cached for the lifetime of the process.
 */
function getStdinOverride(): ReadStream | undefined {
  normalizeInteractiveStdioForWindows()

  // Return cached result if already computed
  if (cachedStdinOverride !== null) {
    return cachedStdinOverride
  }

  // No override needed if stdin is already a TTY
  if (process.stdin.isTTY) {
    cachedStdinOverride = undefined
    return undefined
  }

  // Skip in CI environments
  if (isEnvTruthy(process.env.CI)) {
    cachedStdinOverride = undefined
    return undefined
  }

  // Skip if running MCP (input hijacking breaks MCP)
  if (process.argv.includes('mcp')) {
    cachedStdinOverride = undefined
    return undefined
  }

  // No /dev/tty on Windows
  if (process.platform === 'win32') {
    cachedStdinOverride = undefined
    return undefined
  }

  // Try to open /dev/tty as an alternative input source
  try {
    const ttyFd = openSync('/dev/tty', 'r')
    const ttyStream = new ReadStream(ttyFd)
    // Explicitly set isTTY to true since we know /dev/tty is a TTY.
    // This is needed because some runtimes (like Bun's compiled binaries)
    // may not correctly detect isTTY on ReadStream created from a file descriptor.
    ttyStream.isTTY = true
    cachedStdinOverride = ttyStream
    return cachedStdinOverride
  } catch (err) {
    logError(err as Error)
    cachedStdinOverride = undefined
    return undefined
  }
}

/**
 * Returns base render options for Ink, including stdin override when needed.
 * Use this for all render() calls to ensure piped input works correctly.
 *
 * @param exitOnCtrlC - Whether to exit on Ctrl+C (usually false for dialogs)
 */
export function getBaseRenderOptions(
  exitOnCtrlC: boolean = false,
): RenderOptions {
  const stdin = getStdinOverride()
  const options: RenderOptions = { exitOnCtrlC }
  if (stdin) {
    options.stdin = stdin
  }
  const interactiveOutput = getInteractiveOutput()
  if (interactiveOutput && interactiveOutput !== process.stdout) {
    options.stdout = interactiveOutput
  } else if (isForcedWindowsInteractive()) {
    options.stdout = process.stdout
  }
  return options
}
