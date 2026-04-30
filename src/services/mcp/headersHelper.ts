import { getIsNonInteractiveSession } from '../../bootstrap/state.js'
import { checkHasTrustDialogAccepted } from '../../utils/config.js'
import { logAntError } from '../../utils/debug.js'
import { errorMessage } from '../../utils/errors.js'
import { execFileNoThrowWithCwd } from '../../utils/execFileNoThrow.js'
import { logError, logMCPDebug, logMCPError } from '../../utils/log.js'
import { jsonParse } from '../../utils/slowOperations.js'
import { logEvent } from '../analytics/index.js'
import type {
  McpHTTPServerConfig,
  McpSSEServerConfig,
  McpWebSocketServerConfig,
  ScopedMcpServerConfig,
} from './types.js'

const SHELL_OPERATOR_CHARS = new Set(['|', '&', ';', '<', '>', '(', ')'])
const WINDOWS_ENV_EXPANSION_PATTERN = /%[A-Za-z_][A-Za-z0-9_]*%/
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=/

function hasUnsupportedShellSyntax(command: string): boolean {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (char === '\n' || char === '\r' || char === '\0') {
      return true
    }
    if (!inSingleQuote && char === '$') {
      return true
    }
    if (!inSingleQuote && char === '`') {
      return true
    }
    if (!inSingleQuote && !inDoubleQuote && SHELL_OPERATOR_CHARS.has(char)) {
      return true
    }
  }

  return inSingleQuote || inDoubleQuote || WINDOWS_ENV_EXPANSION_PATTERN.test(command)
}

function parseLiteralArgv(command: string): string[] {
  const argv: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }
    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        argv.push(current)
        current = ''
      }
      continue
    }

    if (char === '\\' && inDoubleQuote && command[index + 1] === '"') {
      current += '"'
      index += 1
      continue
    }
    current += char
  }

  if (current) {
    argv.push(current)
  }
  return argv
}

export function parseHeadersHelperCommand(command: string): {
  file: string
  args: string[]
} {
  const trimmed = command.trim()
  if (!trimmed) {
    throw new Error('headersHelper command must not be empty')
  }
  if (hasUnsupportedShellSyntax(trimmed)) {
    throw new Error(
      'headersHelper must be a literal executable path plus arguments; shell expansion, operators, and env assignments are not supported',
    )
  }

  const argv = parseLiteralArgv(trimmed)
  if (argv.length === 0 || !argv[0]) {
    throw new Error('headersHelper command must include an executable path')
  }
  if (ENV_ASSIGNMENT_PATTERN.test(argv[0])) {
    throw new Error(
      'headersHelper must start with an executable path, not an environment assignment',
    )
  }
  return { file: argv[0], args: argv.slice(1) }
}

/**
 * Check if the MCP server config comes from project settings (projectSettings or localSettings)
 * This is important for security checks
 */
function isMcpServerFromProjectOrLocalSettings(
  config: ScopedMcpServerConfig,
): boolean {
  return config.scope === 'project' || config.scope === 'local'
}

/**
 * Get dynamic headers for an MCP server using the headersHelper script
 * @param serverName The name of the MCP server
 * @param config The MCP server configuration
 * @returns Headers object or null if not configured or failed
 */
export async function getMcpHeadersFromHelper(
  serverName: string,
  config: McpSSEServerConfig | McpHTTPServerConfig | McpWebSocketServerConfig,
): Promise<Record<string, string> | null> {
  if (!config.headersHelper) {
    return null
  }

  // Security check for project/local settings
  // Skip trust check in non-interactive mode (e.g., CI/CD, automation)
  if (
    'scope' in config &&
    isMcpServerFromProjectOrLocalSettings(config as ScopedMcpServerConfig) &&
    !getIsNonInteractiveSession()
  ) {
    // Check if trust has been established for this project
    const hasTrust = checkHasTrustDialogAccepted()
    if (!hasTrust) {
      const error = new Error(
        `Security: headersHelper for MCP server '${serverName}' executed before workspace trust is confirmed. If you see this message, post in ${MACRO.FEEDBACK_CHANNEL}.`,
      )
      logAntError('MCP headersHelper invoked before trust check', error)
      logEvent('jaws_mcp_headersHelper_missing_trust', {})
      return null
    }
  }

  try {
    logMCPDebug(serverName, 'Executing headersHelper to get dynamic headers')
    const helperCommand = parseHeadersHelperCommand(config.headersHelper)
    const execResult = await execFileNoThrowWithCwd(
      helperCommand.file,
      helperCommand.args,
      {
        timeout: 10000,
        // Pass server context so one helper script can serve multiple MCP servers
        // (git credential-helper style). See deshaw/anthropic-issues#28.
        env: {
          ...process.env,
          OPENJAWS_MCP_SERVER_NAME: serverName,
          OPENJAWS_MCP_SERVER_URL: config.url,
        },
      },
    )
    if (execResult.code !== 0 || !execResult.stdout) {
      throw new Error(
        `headersHelper for MCP server '${serverName}' did not return a valid value`,
      )
    }
    const result = execResult.stdout.trim()

    const headers = jsonParse(result)
    if (
      typeof headers !== 'object' ||
      headers === null ||
      Array.isArray(headers)
    ) {
      throw new Error(
        `headersHelper for MCP server '${serverName}' must return a JSON object with string key-value pairs`,
      )
    }

    // Validate all values are strings
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string') {
        throw new Error(
          `headersHelper for MCP server '${serverName}' returned non-string value for key "${key}": ${typeof value}`,
        )
      }
    }

    logMCPDebug(
      serverName,
      `Successfully retrieved ${Object.keys(headers).length} headers from headersHelper`,
    )
    return headers as Record<string, string>
  } catch (error) {
    logMCPError(
      serverName,
      `Error getting headers from headersHelper: ${errorMessage(error)}`,
    )
    logError(
      new Error(
        `Error getting MCP headers from headersHelper for server '${serverName}': ${errorMessage(error)}`,
      ),
    )
    // Return null instead of throwing to avoid blocking the connection
    return null
  }
}

/**
 * Get combined headers for an MCP server (static + dynamic)
 * @param serverName The name of the MCP server
 * @param config The MCP server configuration
 * @returns Combined headers object
 */
export async function getMcpServerHeaders(
  serverName: string,
  config: McpSSEServerConfig | McpHTTPServerConfig | McpWebSocketServerConfig,
): Promise<Record<string, string>> {
  const staticHeaders = config.headers || {}
  const dynamicHeaders =
    (await getMcpHeadersFromHelper(serverName, config)) || {}

  // Dynamic headers override static headers if both are present
  return {
    ...staticHeaders,
    ...dynamicHeaders,
  }
}
