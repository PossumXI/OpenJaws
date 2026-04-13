import { createRequire } from 'module'

const CHROME_MCP_PACKAGE = '@ant/claude-for-chrome-mcp'
const require = createRequire(import.meta.url)

export type ChromePermissionMode =
  | 'ask'
  | 'skip_all_permission_checks'
  | 'follow_a_plan'

export type ChromeLogger = {
  silly(message: string, ...args: unknown[]): void
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export type ChromeContext = Record<string, unknown>

type ChromeMcpModule = {
  createClaudeForChromeMcpServer(context: ChromeContext): unknown
}

export function isChromeMcpPackageAvailableSync(): boolean {
  try {
    require.resolve(CHROME_MCP_PACKAGE)
    return true
  } catch {
    return false
  }
}

export function ensureChromeMcpPackageAvailableSync(): void {
  if (!isChromeMcpPackageAvailableSync()) {
    throw new Error(
      'OpenJaws in Chrome requires the optional Chrome MCP bridge package in this environment. Install the bridge package before enabling Chrome integration.',
    )
  }
}

async function loadChromeMcpModule(): Promise<ChromeMcpModule> {
  const mod = (await import(CHROME_MCP_PACKAGE)) as Partial<ChromeMcpModule>
  if (typeof mod.createClaudeForChromeMcpServer !== 'function') {
    throw new Error(
      'OpenJaws in Chrome package loaded, but the Chrome MCP server export is missing.',
    )
  }
  return mod as ChromeMcpModule
}

export async function createChromeMcpServer(
  context: ChromeContext,
): Promise<unknown> {
  const mod = await loadChromeMcpModule()
  return mod.createClaudeForChromeMcpServer(context)
}
