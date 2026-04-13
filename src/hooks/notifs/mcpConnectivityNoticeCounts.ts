import type { MCPServerConnection } from '../../services/mcp/types.js'

export type McpConnectivityNoticeCounts = {
  failedLocalClients: number
  failedClaudeAiClients: number
  needsAuthLocalServers: number
  needsAuthClaudeAiServers: number
}

export function getMcpConnectivityNoticeCounts(
  mcpClients: readonly MCPServerConnection[],
  hasClaudeAiEverConnected: (name: string) => boolean = () => false,
): McpConnectivityNoticeCounts {
  return {
    failedLocalClients: mcpClients.filter(
      client =>
        client.type === 'failed' &&
        client.config.type !== 'sse-ide' &&
        client.config.type !== 'ws-ide' &&
        client.config.type !== 'claudeai-proxy',
    ).length,
    failedClaudeAiClients: mcpClients.filter(
      client =>
        client.type === 'failed' &&
        client.config.type === 'claudeai-proxy' &&
        hasClaudeAiEverConnected(client.name),
    ).length,
    needsAuthLocalServers: mcpClients.filter(
      client =>
        client.type === 'needs-auth' && client.config.type !== 'claudeai-proxy',
    ).length,
    needsAuthClaudeAiServers: mcpClients.filter(
      client =>
        client.type === 'needs-auth' &&
        client.config.type === 'claudeai-proxy' &&
        hasClaudeAiEverConnected(client.name),
    ).length,
  }
}
