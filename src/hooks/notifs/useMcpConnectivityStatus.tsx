import * as React from 'react'
import { useEffect } from 'react'
import { foldNotificationLatest } from 'src/context/notificationFold.js'
import { useNotifications } from 'src/context/notifications.js'
import { getIsRemoteMode } from '../../bootstrap/state.js'
import { Text } from '../../ink.js'
import { hasClaudeAiMcpEverConnected } from '../../services/mcp/claudeai.js'
import type { MCPServerConnection } from '../../services/mcp/types.js'
import {
  getMcpConnectivityNoticeCounts,
} from './mcpConnectivityNoticeCounts.js'

export const MCP_FAILED_NOTIFICATION_KEY = 'mcp-failed'
export const MCP_CLAUDEAI_FAILED_NOTIFICATION_KEY = 'mcp-claudeai-failed'
export const MCP_NEEDS_AUTH_NOTIFICATION_KEY = 'mcp-needs-auth'
export const MCP_CLAUDEAI_NEEDS_AUTH_NOTIFICATION_KEY =
  'mcp-claudeai-needs-auth'

type Props = {
  mcpClients?: MCPServerConnection[]
}

const EMPTY_MCP_CLIENTS: MCPServerConnection[] = []

export function useMcpConnectivityStatus({
  mcpClients = EMPTY_MCP_CLIENTS,
}: Props): void {
  const { addNotification, removeNotification } = useNotifications()

  useEffect(() => {
    if (getIsRemoteMode()) {
      removeNotification(MCP_FAILED_NOTIFICATION_KEY)
      removeNotification(MCP_CLAUDEAI_FAILED_NOTIFICATION_KEY)
      removeNotification(MCP_NEEDS_AUTH_NOTIFICATION_KEY)
      removeNotification(MCP_CLAUDEAI_NEEDS_AUTH_NOTIFICATION_KEY)
      return
    }

    const {
      failedLocalClients,
      failedClaudeAiClients,
      needsAuthLocalServers,
      needsAuthClaudeAiServers,
    } = getMcpConnectivityNoticeCounts(
      mcpClients,
      hasClaudeAiMcpEverConnected,
    )

    if (failedLocalClients > 0) {
      addNotification({
        key: MCP_FAILED_NOTIFICATION_KEY,
        jsx: (
          <>
            <Text color="error">
              {failedLocalClients} MCP{' '}
              {failedLocalClients === 1 ? 'server' : 'servers'} failed
            </Text>
            <Text dimColor> · /mcp</Text>
          </>
        ),
        priority: 'medium',
        fold: foldNotificationLatest,
      })
    } else {
      removeNotification(MCP_FAILED_NOTIFICATION_KEY)
    }

    if (failedClaudeAiClients > 0) {
      addNotification({
        key: MCP_CLAUDEAI_FAILED_NOTIFICATION_KEY,
        jsx: (
          <>
            <Text color="error">
              {failedClaudeAiClients} openjaws.dev{' '}
              {failedClaudeAiClients === 1 ? 'connector' : 'connectors'}{' '}
              unavailable
            </Text>
            <Text dimColor> · /mcp</Text>
          </>
        ),
        priority: 'medium',
        fold: foldNotificationLatest,
      })
    } else {
      removeNotification(MCP_CLAUDEAI_FAILED_NOTIFICATION_KEY)
    }

    if (needsAuthLocalServers > 0) {
      addNotification({
        key: MCP_NEEDS_AUTH_NOTIFICATION_KEY,
        jsx: (
          <>
            <Text color="warning">
              {needsAuthLocalServers} MCP{' '}
              {needsAuthLocalServers === 1 ? 'server needs' : 'servers need'}{' '}
              auth
            </Text>
            <Text dimColor> · /mcp</Text>
          </>
        ),
        priority: 'medium',
        fold: foldNotificationLatest,
      })
    } else {
      removeNotification(MCP_NEEDS_AUTH_NOTIFICATION_KEY)
    }

    if (needsAuthClaudeAiServers > 0) {
      addNotification({
        key: MCP_CLAUDEAI_NEEDS_AUTH_NOTIFICATION_KEY,
        jsx: (
          <>
            <Text color="warning">
              {needsAuthClaudeAiServers} openjaws.dev{' '}
              {needsAuthClaudeAiServers === 1
                ? 'connector needs'
                : 'connectors need'}{' '}
              auth
            </Text>
            <Text dimColor> · /mcp</Text>
          </>
        ),
        priority: 'medium',
        fold: foldNotificationLatest,
      })
    } else {
      removeNotification(MCP_CLAUDEAI_NEEDS_AUTH_NOTIFICATION_KEY)
    }
  }, [addNotification, removeNotification, mcpClients])
}
