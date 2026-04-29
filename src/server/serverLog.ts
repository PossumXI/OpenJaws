export type ServerLogger = {
  info(message: string, details?: unknown): void
  warn(message: string, details?: unknown): void
  error(message: string, details?: unknown): void
}

function writeServerLog(level: string, message: string, details?: unknown) {
  const suffix =
    details === undefined ? '' : ` ${JSON.stringify(details, null, 2)}`
  process.stderr.write(`[direct-connect:${level}] ${message}${suffix}\n`)
}

export function createServerLogger(): ServerLogger {
  return {
    info(message, details) {
      writeServerLog('info', message, details)
    },
    warn(message, details) {
      writeServerLog('warn', message, details)
    },
    error(message, details) {
      writeServerLog('error', message, details)
    },
  }
}
