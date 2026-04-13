import type { MCPServerConnection } from '../../services/mcp/types.js'

export type McpConnectivityNoticeCounts = {
  failedLocalClients: number
  failedOpenJawsAccountClients: number
  needsAuthLocalServers: number
  needsAuthOpenJawsAccountServers: number
}

export function getMcpConnectivityNoticeCounts(
  mcpClients: readonly MCPServerConnection[],
  hasOpenJawsAccountEverConnected: (name: string) => boolean = () => false,
): McpConnectivityNoticeCounts {
  return {
    failedLocalClients: mcpClients.filter(
      client =>
        client.type === 'failed' &&
        client.config.type !== 'sse-ide' &&
        client.config.type !== 'ws-ide' &&
        client.config.type !== 'claudeai-proxy',
    ).length,
    failedOpenJawsAccountClients: mcpClients.filter(
      client =>
        client.type === 'failed' &&
        client.config.type === 'claudeai-proxy' &&
        hasOpenJawsAccountEverConnected(client.name),
    ).length,
    needsAuthLocalServers: mcpClients.filter(
      client =>
        client.type === 'needs-auth' && client.config.type !== 'claudeai-proxy',
    ).length,
    needsAuthOpenJawsAccountServers: mcpClients.filter(
      client =>
        client.type === 'needs-auth' &&
        client.config.type === 'claudeai-proxy' &&
        hasOpenJawsAccountEverConnected(client.name),
    ).length,
  }
}
