import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Pane } from '../../components/design-system/Pane.js'
import { Tab, Tabs, useTabHeaderFocus } from '../../components/design-system/Tabs.js'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import {
  type ApexChronoSummary,
  type ApexLaunchTarget,
  type ApexWorkspaceHealth,
  type ApexWorkspaceSummary,
  cleanupApexChronoBackups,
  composeApexMail,
  createApexChatSession,
  createApexChronoJob,
  deleteApexChronoJob,
  deleteApexMailMessage,
  flagApexMailMessage,
  getApexChronoHealth,
  getApexChronoSummary,
  getApexLaunchTarget,
  getApexLaunchTargets,
  getApexWorkspaceHealth,
  getApexWorkspaceSummary,
  installApexStoreAppWithReceipt,
  moveApexMailMessage,
  restoreApexChronoJob,
  runApexAction,
  sendApexChatMessage,
  startApexChronoBridge,
  startApexChronoJob,
  startApexWorkspaceApi,
  summarizeApexChrono,
  summarizeApexWorkspace,
} from '../../utils/apexWorkspace.js'
import { formatNumber } from '../../utils/format.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { Box, Text } from '../../ink.js'
import { useIsInsideModal, useModalOrTerminalSize } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'

const REFRESH_INTERVAL_MS = 15_000

type LaunchAction =
  | 'refresh'
  | 'start-workspace-api'
  | 'start-chrono-bridge'
  | ApexLaunchTarget['id']

type MailAction =
  | 'mail-to'
  | 'mail-subject'
  | 'mail-body'
  | 'mail-selected'
  | 'mail-target-folder'
  | 'mail-send'
  | 'mail-move'
  | 'mail-delete'
  | 'mail-flag'
  | 'mail-unflag'
  | 'mail-refresh'
  | `mail-use-${string}`
type ChatAction =
  | 'chat-session'
  | 'chat-message'
  | 'chat-participants'
  | 'chat-send'
  | 'chat-create-session'
  | 'chat-refresh'
  | `chat-use-${string}`
type StoreAction = 'store-app' | 'store-install' | 'store-refresh' | `store-use-${string}`
type ChronoAction =
  | 'chrono-job-name'
  | 'chrono-source-path'
  | 'chrono-destination-path'
  | 'chrono-restore-path'
  | 'chrono-create-job'
  | 'chrono-start-job'
  | 'chrono-restore-latest'
  | 'chrono-delete-job'
  | 'chrono-cleanup'
  | 'chrono-refresh'
  | `chrono-use-${string}`

function SectionTitle({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return <Text bold>{children}</Text>
}

function DetailList({
  items,
  empty,
}: {
  items: string[]
  empty?: string
}): React.ReactNode {
  if (items.length === 0) {
    return <Text dimColor>{empty ?? 'Nothing to show yet.'}</Text>
  }

  return (
    <Box flexDirection="column">
      {items.map(item => (
        <Text key={item}>• {item}</Text>
      ))}
    </Box>
  )
}

function truncateLine(value: string, limit = 120): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function ApexLaunchTab({
  selectedAction,
  onFocusAction,
  onRunAction,
  actionMessage,
}: {
  selectedAction: LaunchAction
  onFocusAction: (value: LaunchAction) => void
  onRunAction: (value: LaunchAction) => void
  actionMessage: string | null
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const selectedTarget =
    selectedAction === 'refresh' ||
    selectedAction === 'start-workspace-api' ||
    selectedAction === 'start-chrono-bridge'
      ? null
      : getApexLaunchTarget(selectedAction)

  const options = useMemo<OptionWithDescription<LaunchAction>[]>(
    () => [
      {
        label: 'Refresh workspace bridge',
        value: 'refresh',
        description:
          'Pull the latest live workspace summary from the localhost bridge.',
      },
      {
        label: 'Start workspace bridge',
        value: 'start-workspace-api',
        description:
          'Launch apex-workspace-api as a guarded sidecar on 127.0.0.1:8797.',
      },
      {
        label: 'Start Chrono bridge',
        value: 'start-chrono-bridge',
        description:
          'Launch the guarded Chrono backup bridge on 127.0.0.1:8798.',
      },
      ...getApexLaunchTargets().map(target => ({
        label: target.label,
        value: target.id,
        description: `${target.category} · ${target.mode} · ${target.description}`,
      })),
    ],
    [],
  )

  return (
    <Box flexDirection="row" gap={3}>
      <Box width={38} flexDirection="column">
        <Select
          options={options}
          layout="compact-vertical"
          visibleOptionCount={10}
          defaultFocusValue={selectedAction}
          onFocus={value => onFocusAction(value as LaunchAction)}
          onChange={value => onRunAction(value as LaunchAction)}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        <SectionTitle>Selected target</SectionTitle>
        {selectedTarget ? (
          <Box flexDirection="column">
            <Text>{selectedTarget.label}</Text>
            <Text dimColor>{selectedTarget.description}</Text>
            <Text dimColor>Path: {selectedTarget.path}</Text>
            <Text dimColor>Hint: {selectedTarget.commandHint}</Text>
          </Box>
        ) : selectedAction === 'start-workspace-api' ? (
          <Box flexDirection="column">
            <Text>Workspace API</Text>
            <Text dimColor>
              Boots the typed localhost bridge that surfaces mail, chat, store,
              system, and security state into OpenJaws.
            </Text>
          </Box>
        ) : selectedAction === 'start-chrono-bridge' ? (
          <Box flexDirection="column">
            <Text>Chrono Bridge</Text>
            <Text dimColor>
              Boots the typed localhost bridge that surfaces Chrono backup jobs
              and bounded backup actions into OpenJaws.
            </Text>
          </Box>
        ) : (
          <Text dimColor>
            Refresh the bridge when the external Apex surface changes.
          </Text>
        )}

        <SectionTitle>Execution result</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Choose a launch action on the left. The launcher is tightly allowlisted and only opens the approved Apex roots.'}
        </Text>
      </Box>
    </Box>
  )
}

function ApexMailTab({
  mailTo,
  mailSubject,
  mailBody,
  selectedMailMessageId,
  mailTargetFolder,
  setMailTo,
  setMailSubject,
  setMailBody,
  setSelectedMailMessageId,
  setMailTargetFolder,
  onSend,
  onMove,
  onDelete,
  onFlag,
  onUnflag,
  onRefresh,
  actionMessage,
  summary,
}: {
  mailTo: string
  mailSubject: string
  mailBody: string
  selectedMailMessageId: string
  mailTargetFolder: string
  setMailTo: (value: string) => void
  setMailSubject: (value: string) => void
  setMailBody: (value: string) => void
  setSelectedMailMessageId: (value: string) => void
  setMailTargetFolder: (value: string) => void
  onSend: () => void
  onMove: () => void
  onDelete: () => void
  onFlag: () => void
  onUnflag: () => void
  onRefresh: () => void
  actionMessage: string | null
  summary: ApexWorkspaceSummary | null
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const selectedMessage =
    summary?.mail.messages.find(message => message.id === selectedMailMessageId) ?? null

  const options = useMemo<OptionWithDescription<MailAction>[]>(() => {
    const messageOptions =
      summary?.mail.messages.slice(0, 8).map(message => ({
        label: `Use ${truncateLine(message.subject || message.sender, 28)}`,
        value: `mail-use-${message.id}` as MailAction,
        description: `${message.folder} · ${message.unread ? 'unread' : 'read'} · ${truncateLine(message.preview, 60)}`,
      })) ?? []

    return [
      {
        label: 'To',
        value: 'mail-to',
        type: 'input',
        initialValue: mailTo,
        onChange: setMailTo,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Subject',
        value: 'mail-subject',
        type: 'input',
        initialValue: mailSubject,
        onChange: setMailSubject,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Body',
        value: 'mail-body',
        type: 'input',
        initialValue: mailBody,
        onChange: setMailBody,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Selected message id',
        value: 'mail-selected',
        type: 'input',
        initialValue: selectedMailMessageId,
        onChange: setSelectedMailMessageId,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Target folder',
        value: 'mail-target-folder',
        type: 'input',
        initialValue: mailTargetFolder,
        onChange: setMailTargetFolder,
        allowEmptySubmitToCancel: true,
      },
      ...messageOptions,
      {
        label: 'Send through Aegis Mail',
        value: 'mail-send',
        description:
          'Queues the current draft into the Apex mail runtime over workspace_api.',
      },
      {
        label: 'Move selected message',
        value: 'mail-move',
        description: 'Move the selected message into the chosen folder through the trusted bridge.',
      },
      {
        label: 'Delete selected message',
        value: 'mail-delete',
        description: 'Delete the selected message through the trusted bridge.',
      },
      {
        label: 'Flag selected message',
        value: 'mail-flag',
        description: 'Mark the selected message as flagged through the trusted bridge.',
      },
      {
        label: 'Unflag selected message',
        value: 'mail-unflag',
        description: 'Remove the flagged mark from the selected message.',
      },
      {
        label: 'Refresh mail feed',
        value: 'mail-refresh',
        description: 'Pull the latest inbound mail summary from the bridge.',
      },
    ]
  }, [
    mailBody,
    mailSubject,
    mailTargetFolder,
    mailTo,
    selectedMailMessageId,
    setMailBody,
    setMailSubject,
    setMailTargetFolder,
    setMailTo,
    setSelectedMailMessageId,
    summary,
  ])

  const recentMail =
    summary?.mail.messages.slice(0, 5).map(message => {
      const unread = message.unread ? 'unread' : 'read'
      return `${message.sender} · ${message.subject} · ${message.folder} · ${unread}`
    }) ?? []

  return (
    <Box flexDirection="row" gap={3}>
      <Box width={38} flexDirection="column">
        <Select
          options={options}
          layout="compact-vertical"
          visibleOptionCount={10}
          defaultFocusValue="mail-to"
          onChange={value => {
            if (value.startsWith('mail-use-')) {
              setSelectedMailMessageId(value.slice('mail-use-'.length))
              return
            }
            if (value === 'mail-send') {
              onSend()
              return
            }
            if (value === 'mail-move') {
              onMove()
              return
            }
            if (value === 'mail-delete') {
              onDelete()
              return
            }
            if (value === 'mail-flag') {
              onFlag()
              return
            }
            if (value === 'mail-unflag') {
              onUnflag()
              return
            }
            if (value === 'mail-refresh') {
              onRefresh()
            }
          }}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        <SectionTitle>Draft</SectionTitle>
        <Text wrap="wrap">To: {mailTo || 'not set'}</Text>
        <Text wrap="wrap">Subject: {mailSubject || 'not set'}</Text>
        <Text wrap="wrap">Body: {mailBody || 'not set'}</Text>

        <SectionTitle>Selected message</SectionTitle>
        {selectedMessage ? (
          <Box flexDirection="column">
            <Text wrap="wrap">
              {selectedMessage.subject} · {selectedMessage.sender} · {selectedMessage.folder}
            </Text>
            <Text dimColor wrap="wrap">
              {selectedMessage.id} · {selectedMessage.unread ? 'unread' : 'read'} · {selectedMessage.timestamp}
            </Text>
            <Text dimColor wrap="wrap">target folder: {mailTargetFolder || 'not set'}</Text>
          </Box>
        ) : (
          <Text dimColor wrap="wrap">
            Choose a bridged message on the left to move, delete, or flag it.
          </Text>
        )}

        <SectionTitle>Mail runtime</SectionTitle>
        <DetailList
          items={
            summary
              ? [
                  `${summary.mail.accountCount} account${summary.mail.accountCount === 1 ? '' : 's'}`,
                  `${summary.mail.securityAlertCount} security alert${summary.mail.securityAlertCount === 1 ? '' : 's'}`,
                  `outbox pending ${summary.mail.outbox.pending}`,
                  `outbox failed ${summary.mail.outbox.failed}`,
                  `outbox sent ${summary.mail.outbox.sent}`,
                ]
              : []
          }
          empty="No mail telemetry is available until the bridge is online."
        />

        <SectionTitle>Recent mail</SectionTitle>
        <DetailList
          items={
            summary?.mail.messages.slice(0, 5).map(message => {
              const tags = message.tags.length > 0 ? ` · ${message.tags.join(', ')}` : ''
              return `${message.sender} · ${message.subject} · ${message.folder} · ${message.timestamp}${tags} · ${message.preview}`
            }) ?? recentMail
          }
          empty="No mail is visible yet. Start the bridge and refresh the summary."
        />

        <SectionTitle>Delivery result</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Edit the draft, send mail, or select a bridged message for move/delete/flag actions.'}
        </Text>
      </Box>
    </Box>
  )
}

function ApexOverviewTab({
  loading,
  health,
  summary,
}: {
  loading: boolean
  health: ApexWorkspaceHealth | null
  summary: ApexWorkspaceSummary | null
}): React.ReactNode {
  const workspace = summarizeApexWorkspace(summary)
  const topApps =
    summary?.store.apps
      .slice(0, 5)
      .map(app => `${app.name} ${app.version} · ${app.installed ? 'installed' : 'catalog'}`) ?? []
  const topConversations =
    summary?.chat.conversations
      .slice(0, 4)
      .map(thread => `${thread.name} · ${thread.status} · ${thread.lastMessage}`) ?? []

  return (
    <Box flexDirection="column" gap={1}>
      <SectionTitle>Bridge health</SectionTitle>
      <Text>
        {loading
          ? 'Refreshing Apex workspace bridge…'
          : health
            ? `${health.service} ${health.version} · ${health.status} · ${health.timestamp}`
            : `offline · expected ${'http://127.0.0.1:8797'}`}
      </Text>

      <SectionTitle>Workspace summary</SectionTitle>
      <Text>{workspace.headline}</Text>
      <DetailList items={workspace.details} />

      <SectionTitle>Top conversations</SectionTitle>
      <DetailList
        items={topConversations}
        empty="No Shadow Chat sessions are visible through the bridge yet."
      />

      <SectionTitle>Top installed apps</SectionTitle>
      <DetailList
        items={topApps}
        empty="The app catalog is empty until the bridge is online."
      />
    </Box>
  )
}

function ApexChatTab({
  summary,
  chatSessionId,
  chatMessage,
  chatParticipants,
  setChatSessionId,
  setChatMessage,
  setChatParticipants,
  onSend,
  onCreateSession,
  onRefresh,
  actionMessage,
}: {
  summary: ApexWorkspaceSummary | null
  chatSessionId: string
  chatMessage: string
  chatParticipants: string
  setChatSessionId: (value: string) => void
  setChatMessage: (value: string) => void
  setChatParticipants: (value: string) => void
  onSend: () => void
  onCreateSession: () => void
  onRefresh: () => void
  actionMessage: string | null
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const stats = summary?.chat.statistics
  const selectedConversation =
    summary?.chat.conversations.find(conversation => conversation.id === chatSessionId) ??
    null
  const recentMessages =
    (chatSessionId ? summary?.chat.messages[chatSessionId] : undefined)?.slice(0, 6).map(
      message => {
        const sealed = message.sealed ? 'sealed' : 'plain'
        return `${message.sender} · ${message.timestamp} · ${sealed} · ${message.content}`
      },
    ) ?? []
  const conversations =
    summary?.chat.conversations.slice(0, 8).map(conversation => {
      const unread =
        conversation.unread > 0
          ? ` · ${conversation.unread} unread`
          : ''
      return `${conversation.name} · ${conversation.role} · ${conversation.status}${unread} · ${conversation.lastSeen} · ${conversation.lastMessage}`
    }) ?? []
  const options = useMemo<OptionWithDescription<ChatAction>[]>(() => {
    const sessionOptions =
      summary?.chat.conversations.slice(0, 8).map(conversation => ({
        label: `Use ${conversation.name}`,
        value: `chat-use-${conversation.id}` as ChatAction,
        description: `${conversation.role} · ${conversation.status} · ${conversation.encryption}`,
      })) ?? []

    return [
      {
        label: 'Session id',
        value: 'chat-session',
        type: 'input',
        initialValue: chatSessionId,
        onChange: setChatSessionId,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Message',
        value: 'chat-message',
        type: 'input',
        initialValue: chatMessage,
        onChange: setChatMessage,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Participants',
        value: 'chat-participants',
        type: 'input',
        initialValue: chatParticipants,
        onChange: setChatParticipants,
        allowEmptySubmitToCancel: true,
      },
      ...sessionOptions,
      {
        label: 'Create Shadow Chat session',
        value: 'chat-create-session',
        description: 'Create a new bridged Shadow Chat session from the participants list.',
      },
      {
        label: 'Send to Shadow Chat',
        value: 'chat-send',
        description: 'Seal the current draft to the selected chat session over the trusted workspace bridge.',
      },
      {
        label: 'Refresh chat feed',
        value: 'chat-refresh',
        description: 'Reload the latest Shadow Chat summary from the bridge.',
      },
    ]
  }, [chatMessage, chatParticipants, chatSessionId, setChatMessage, setChatParticipants, setChatSessionId, summary])

  return (
    <Box flexDirection="row" gap={3}>
      <Box width={38} flexDirection="column">
        <Select
          options={options}
          layout="compact-vertical"
          visibleOptionCount={10}
          defaultFocusValue="chat-session"
          onChange={value => {
            if (value.startsWith('chat-use-')) {
              setChatSessionId(value.slice('chat-use-'.length))
              return
            }
            if (value === 'chat-create-session') {
              onCreateSession()
              return
            }
            if (value === 'chat-send') {
              onSend()
              return
            }
            if (value === 'chat-refresh') {
              onRefresh()
            }
          }}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        <SectionTitle>Shadow Chat</SectionTitle>
        <DetailList
          items={
            stats
              ? [
                  `${stats.activeSessions} active session${stats.activeSessions === 1 ? '' : 's'}`,
                  `${stats.totalSessions} total session${stats.totalSessions === 1 ? '' : 's'}`,
                  `${stats.totalContacts} contact${stats.totalContacts === 1 ? '' : 's'}`,
                  `${formatNumber(stats.totalMessages)} message${stats.totalMessages === 1 ? '' : 's'}`,
                ]
              : []
          }
          empty="Chat metrics are unavailable until the workspace bridge is online."
        />

        <SectionTitle>Current draft</SectionTitle>
        <Text wrap="wrap">Session: {chatSessionId || 'not set'}</Text>
        <Text wrap="wrap">Message: {chatMessage || 'not set'}</Text>
        <Text wrap="wrap">Participants: {chatParticipants || 'not set'}</Text>
        {selectedConversation ? (
          <Text dimColor wrap="wrap">
            {selectedConversation.name} · {selectedConversation.role} · {selectedConversation.status} · {selectedConversation.encryption}
          </Text>
        ) : null}

        <SectionTitle>Recent conversations</SectionTitle>
        <DetailList
          items={conversations}
          empty="No Shadow Chat conversations are visible through the bridge yet."
        />

        <SectionTitle>Selected session transcript</SectionTitle>
        <DetailList
          items={recentMessages}
          empty="Choose a Shadow Chat session on the left to see the latest bridged messages."
        />

        <SectionTitle>Delivery result</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Choose a conversation, create a new session, or draft a message to send through the trusted Shadow Chat bridge.'}
        </Text>
      </Box>
    </Box>
  )
}

function ApexStoreTab({
  summary,
  selectedAppId,
  setSelectedAppId,
  onInstall,
  onRefresh,
  actionMessage,
}: {
  summary: ApexWorkspaceSummary | null
  selectedAppId: string
  setSelectedAppId: (value: string) => void
  onInstall: () => void
  onRefresh: () => void
  actionMessage: string | null
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const stats = summary?.store
  const selectedApp =
    summary?.store.apps.find(app => app.id === selectedAppId) ?? null
  const apps =
    summary?.store.apps.slice(0, 8).map(app => {
      const flags = [
        app.installed ? 'installed' : 'catalog',
        app.featured ? 'featured' : null,
      ]
        .filter(Boolean)
        .join(' · ')
      return `${app.name} ${app.version} · ${app.category} · ${app.developer} · rating ${app.rating.toFixed(1)} · ${flags}`
    }) ?? []
  const options = useMemo<OptionWithDescription<StoreAction>[]>(() => {
    const appOptions =
      summary?.store.apps.slice(0, 8).map(app => ({
        label: `Use ${app.name}`,
        value: `store-use-${app.id}` as StoreAction,
        description: `${app.category} · ${app.version} · ${app.installed ? 'installed' : 'catalog'}`,
      })) ?? []

    return [
      {
        label: 'App id',
        value: 'store-app',
        type: 'input',
        initialValue: selectedAppId,
        onChange: setSelectedAppId,
        allowEmptySubmitToCancel: true,
      },
      ...appOptions,
      {
        label: 'Install selected app',
        value: 'store-install',
        description: 'Install the selected catalog app through the trusted workspace bridge.',
      },
      {
        label: 'Refresh app catalog',
        value: 'store-refresh',
        description: 'Reload the latest app catalog summary from the bridge.',
      },
    ]
  }, [selectedAppId, setSelectedAppId, summary])

  return (
    <Box flexDirection="row" gap={3}>
      <Box width={38} flexDirection="column">
        <Select
          options={options}
          layout="compact-vertical"
          visibleOptionCount={10}
          defaultFocusValue="store-app"
          onChange={value => {
            if (value.startsWith('store-use-')) {
              setSelectedAppId(value.slice('store-use-'.length))
              return
            }
            if (value === 'store-install') {
              onInstall()
              return
            }
            if (value === 'store-refresh') {
              onRefresh()
            }
          }}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        <SectionTitle>Catalog summary</SectionTitle>
        <DetailList
          items={
            stats
              ? [
                  `${stats.installedCount} installed`,
                  `${stats.featuredCount} featured`,
                  `${stats.updateCount} update${stats.updateCount === 1 ? '' : 's'} pending`,
                ]
              : []
          }
          empty="Store data is unavailable until the workspace bridge is online."
        />

        <SectionTitle>Selected app</SectionTitle>
        {selectedApp ? (
          <Box flexDirection="column">
            <Text>{selectedApp.name} {selectedApp.version}</Text>
            <Text dimColor wrap="wrap">
              {selectedApp.category} · {selectedApp.developer} · rating {selectedApp.rating.toFixed(1)} · {selectedApp.installed ? 'installed' : 'catalog'}
            </Text>
            <Text dimColor wrap="wrap">{selectedApp.description}</Text>
            <Text dimColor wrap="wrap">
              Permissions: {selectedApp.permissions.join(', ') || 'not declared'}
            </Text>
          </Box>
        ) : (
          <Text dimColor>Choose an app on the left to inspect or install it.</Text>
        )}

        <SectionTitle>Top apps</SectionTitle>
        <DetailList
          items={apps}
          empty="No app catalog is visible through the bridge yet."
        />

        <SectionTitle>Install result</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Select a catalog app on the left, then install it through the trusted workspace bridge.'}
        </Text>
      </Box>
    </Box>
  )
}

function ApexSystemTab({
  summary,
}: {
  summary: ApexWorkspaceSummary | null
}): React.ReactNode {
  const metrics = summary?.system.metrics
  const services =
    summary?.system.services
      .slice(0, 8)
      .map(service => `${service.name} · ${service.status} · ${service.cpu} CPU · ${service.memory} MEM`) ?? []
  const alerts =
    summary?.system.alerts
      .slice(0, 6)
      .map(alert => `${alert.level} · ${alert.timestamp} · ${alert.message}`) ?? []

  return (
    <Box flexDirection="column" gap={1}>
      <SectionTitle>Host telemetry</SectionTitle>
      <DetailList
        items={
          metrics && summary
            ? [
                `health ${(summary.system.healthScore * 100).toFixed(0)}%`,
                `cpu ${metrics.cpuUsage.toFixed(1)}%`,
                `memory ${metrics.memoryUsage.toFixed(1)}%`,
                `${formatNumber(metrics.processCount)} processes`,
                `uptime ${formatNumber(Math.round(metrics.uptime))}s`,
                `snapshot ${metrics.timestamp}`,
              ]
            : []
        }
        empty="System metrics are unavailable until the workspace bridge is online."
      />

      <SectionTitle>Services</SectionTitle>
      <DetailList
        items={services}
        empty="No host services are visible through the bridge yet."
      />

      <SectionTitle>Alerts</SectionTitle>
      <DetailList
        items={alerts}
        empty="No system alerts are visible through the bridge."
      />
    </Box>
  )
}

function ApexChronoTab({
  summary,
  chronoJobName,
  chronoSourcePath,
  chronoDestinationPath,
  chronoRestorePath,
  selectedChronoJobId,
  setChronoJobName,
  setChronoSourcePath,
  setChronoDestinationPath,
  setChronoRestorePath,
  setSelectedChronoJobId,
  onCreateJob,
  onStartJob,
  onRestoreLatest,
  onDeleteJob,
  onCleanup,
  onRefresh,
  actionMessage,
}: {
  summary: ApexChronoSummary | null
  chronoJobName: string
  chronoSourcePath: string
  chronoDestinationPath: string
  chronoRestorePath: string
  selectedChronoJobId: string
  setChronoJobName: (value: string) => void
  setChronoSourcePath: (value: string) => void
  setChronoDestinationPath: (value: string) => void
  setChronoRestorePath: (value: string) => void
  setSelectedChronoJobId: (value: string) => void
  onCreateJob: () => void
  onStartJob: () => void
  onRestoreLatest: () => void
  onDeleteJob: () => void
  onCleanup: () => void
  onRefresh: () => void
  actionMessage: string | null
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const selectedJob =
    summary?.jobs.find(job => job.id === selectedChronoJobId) ?? null
  const latestBackup = selectedJob?.backups[0] ?? null
  const chronoSummary = summarizeApexChrono(summary)
  const options = useMemo<OptionWithDescription<ChronoAction>[]>(() => {
    const jobOptions =
      summary?.jobs.slice(0, 8).map(job => ({
        label: `Use ${job.name}`,
        value: `chrono-use-${job.id}` as ChronoAction,
        description: `${job.status} · ${job.destinationPath}`,
      })) ?? []

    return [
      {
        label: 'Job name',
        value: 'chrono-job-name',
        type: 'input',
        initialValue: chronoJobName,
        onChange: setChronoJobName,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Source path',
        value: 'chrono-source-path',
        type: 'input',
        initialValue: chronoSourcePath,
        onChange: setChronoSourcePath,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Destination path',
        value: 'chrono-destination-path',
        type: 'input',
        initialValue: chronoDestinationPath,
        onChange: setChronoDestinationPath,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Restore path',
        value: 'chrono-restore-path',
        type: 'input',
        initialValue: chronoRestorePath,
        onChange: setChronoRestorePath,
        allowEmptySubmitToCancel: true,
      },
      ...jobOptions,
      {
        label: 'Create Chrono job',
        value: 'chrono-create-job',
        description: 'Create a new backup job in the trusted Chrono bridge.',
      },
      {
        label: 'Start selected job',
        value: 'chrono-start-job',
        description: 'Run the selected backup job through the Chrono bridge.',
      },
      {
        label: 'Restore latest backup',
        value: 'chrono-restore-latest',
        description: 'Restore the latest backup for the selected job into the restore path.',
      },
      {
        label: 'Delete selected job',
        value: 'chrono-delete-job',
        description: 'Delete the selected Chrono job and its tracked backups.',
      },
      {
        label: 'Cleanup expired backups',
        value: 'chrono-cleanup',
        description: 'Apply the retention policy to the live Chrono backup set.',
      },
      {
        label: 'Refresh Chrono bridge',
        value: 'chrono-refresh',
        description: 'Reload the latest Chrono summary from the bridge.',
      },
    ]
  }, [
    chronoDestinationPath,
    chronoJobName,
    chronoRestorePath,
    chronoSourcePath,
    onCleanup,
    onCreateJob,
    onDeleteJob,
    onRefresh,
    onRestoreLatest,
    onStartJob,
    setChronoDestinationPath,
    setChronoJobName,
    setChronoRestorePath,
    setChronoSourcePath,
    summary,
  ])

  return (
    <Box flexDirection="row" gap={3}>
      <Box width={38} flexDirection="column">
        <Select
          options={options}
          layout="compact-vertical"
          visibleOptionCount={10}
          defaultFocusValue="chrono-job-name"
          onChange={value => {
            if (value.startsWith('chrono-use-')) {
              setSelectedChronoJobId(value.slice('chrono-use-'.length))
              return
            }
            if (value === 'chrono-create-job') {
              onCreateJob()
              return
            }
            if (value === 'chrono-start-job') {
              onStartJob()
              return
            }
            if (value === 'chrono-restore-latest') {
              onRestoreLatest()
              return
            }
            if (value === 'chrono-delete-job') {
              onDeleteJob()
              return
            }
            if (value === 'chrono-cleanup') {
              onCleanup()
              return
            }
            if (value === 'chrono-refresh') {
              onRefresh()
            }
          }}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        <SectionTitle>Chrono bridge</SectionTitle>
        <Text wrap="wrap">{chronoSummary.headline}</Text>
        <DetailList items={chronoSummary.details} />

        <SectionTitle>Draft</SectionTitle>
        <Text wrap="wrap">Job: {chronoJobName || 'not set'}</Text>
        <Text wrap="wrap">Source: {chronoSourcePath || 'not set'}</Text>
        <Text wrap="wrap">Destination: {chronoDestinationPath || 'not set'}</Text>
        <Text wrap="wrap">Restore path: {chronoRestorePath || 'not set'}</Text>

        <SectionTitle>Selected job</SectionTitle>
        {selectedJob ? (
          <Box flexDirection="column">
            <Text wrap="wrap">
              {selectedJob.name} · {selectedJob.status} · {selectedJob.destinationPath}
            </Text>
            <Text dimColor wrap="wrap">
              {selectedJob.id} · every {selectedJob.scheduleIntervalHours}h · retain {selectedJob.retentionDays}d
            </Text>
            <Text dimColor wrap="wrap">
              latest backup: {latestBackup ? `${latestBackup.timestamp} · ${formatNumber(latestBackup.fileCount)} files` : 'none yet'}
            </Text>
          </Box>
        ) : (
          <Text dimColor>Choose a Chrono job on the left to start, restore, or delete it.</Text>
        )}

        <SectionTitle>Recent jobs</SectionTitle>
        <DetailList
          items={
            summary?.jobs.slice(0, 6).map(job => {
              const latest = job.backups[0]
              return `${job.name} · ${job.status} · ${job.destinationPath}${latest ? ` · latest ${latest.timestamp}` : ''}`
            }) ?? []
          }
          empty="No Chrono jobs are visible until the bridge is online."
        />

        <SectionTitle>Action result</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Create a Chrono job, start the selected backup, or restore the latest backup through the trusted bridge.'}
        </Text>
      </Box>
    </Box>
  )
}

function ApexSecurityTab({
  summary,
}: {
  summary: ApexWorkspaceSummary | null
}): React.ReactNode {
  const incidents =
    summary?.security.incidents
      .slice(0, 6)
      .map(
        incident =>
          `${incident.title} · ${incident.status} · ${incident.source} · ${incident.time} · ${incident.description}`,
      ) ?? []
  const audits =
    summary?.security.auditEntries
      .slice(0, 6)
      .map(entry => `${entry.title} · ${entry.time} · ${entry.detail}`) ?? []

  return (
    <Box flexDirection="column" gap={1}>
      <SectionTitle>Security posture</SectionTitle>
      <Text>
        {summary
          ? `Health ${(summary.security.overallHealth * 100).toFixed(0)}% · ${summary.security.activeAlerts} active alerts`
          : 'Bridge offline · security posture unavailable'}
      </Text>

      <SectionTitle>Incidents</SectionTitle>
      <DetailList
        items={incidents}
        empty="No active incidents are visible through the bridge."
      />

      <SectionTitle>Recommended actions</SectionTitle>
      <DetailList
        items={summary?.security.recommendations.slice(0, 5) ?? []}
        empty="No recommendations yet."
      />

      <SectionTitle>Audit trail</SectionTitle>
      <DetailList items={audits} empty="No audit entries available." />
    </Box>
  )
}

function ApexCommandCenter({
  onDone,
}: {
  onDone: (message?: string) => void
}): React.ReactNode {
  const [selectedTab, setSelectedTab] = useState('Overview')
  const [selectedLaunchAction, setSelectedLaunchAction] =
    useState<LaunchAction>('refresh')
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<ApexWorkspaceHealth | null>(null)
  const [summary, setSummary] = useState<ApexWorkspaceSummary | null>(null)
  const [chronoHealth, setChronoHealth] = useState<ApexWorkspaceHealth | null>(null)
  const [chronoSummary, setChronoSummary] = useState<ApexChronoSummary | null>(null)
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const [mailMessage, setMailMessage] = useState<string | null>(null)
  const [mailTo, setMailTo] = useState('')
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [selectedMailMessageId, setSelectedMailMessageId] = useState('')
  const [mailTargetFolder, setMailTargetFolder] = useState('Archive')
  const [chatSessionId, setChatSessionId] = useState('')
  const [chatMessageDraft, setChatMessageDraft] = useState('')
  const [chatParticipants, setChatParticipants] = useState('')
  const [chatActionMessage, setChatActionMessage] = useState<string | null>(null)
  const [selectedStoreAppId, setSelectedStoreAppId] = useState('')
  const [storeActionMessage, setStoreActionMessage] = useState<string | null>(null)
  const [chronoJobName, setChronoJobName] = useState('Chrono Workspace Snapshot')
  const [chronoSourcePath, setChronoSourcePath] = useState('')
  const [chronoDestinationPath, setChronoDestinationPath] = useState('')
  const [chronoRestorePath, setChronoRestorePath] = useState('')
  const [selectedChronoJobId, setSelectedChronoJobId] = useState('')
  const [chronoActionMessage, setChronoActionMessage] = useState<string | null>(null)
  const insideModal = useIsInsideModal()
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const contentHeight = insideModal
    ? rows + 1
    : Math.max(18, Math.min(Math.floor(rows * 0.78), 34))

  const refreshWorkspace = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    const [nextHealth, nextSummary, nextChronoHealth, nextChronoSummary] = await Promise.all([
      getApexWorkspaceHealth(),
      getApexWorkspaceSummary(),
      getApexChronoHealth(),
      getApexChronoSummary(),
    ])
    setHealth(nextHealth)
    setSummary(nextSummary)
    setChronoHealth(nextChronoHealth)
    setChronoSummary(nextChronoSummary)
    setLoading(false)
    return {
      ok: nextHealth !== null || nextChronoHealth !== null,
      message: [
        nextHealth !== null ? 'workspace bridge ready' : 'workspace bridge offline',
        nextChronoHealth !== null ? 'chrono bridge ready' : 'chrono bridge offline',
      ].join(' · '),
    }
  }, [])

  useEffect(() => {
    void refreshWorkspace()
    const interval = setInterval(() => {
      void refreshWorkspace(true)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refreshWorkspace])

  useEffect(() => {
    if (!summary) {
      if (!chronoSummary) {
        return
      }
    }
    if (summary) {
      if (!selectedMailMessageId && summary.mail.messages.length > 0) {
        const preferredMessage = summary.mail.messages[0]
        setSelectedMailMessageId(preferredMessage?.id ?? '')
        setMailTargetFolder(
          preferredMessage?.folder === 'Sent' ? 'Archive' : 'Sent',
        )
      }
      if (!chatSessionId && summary.chat.conversations.length > 0) {
        setChatSessionId(summary.chat.conversations[0]!.id)
      }
      if (!selectedStoreAppId && summary.store.apps.length > 0) {
        const preferredApp =
          summary.store.apps.find(app => !app.installed) ?? summary.store.apps[0]
        setSelectedStoreAppId(preferredApp?.id ?? '')
      }
    }
    if (chronoSummary) {
      if (!selectedChronoJobId && chronoSummary.jobs.length > 0) {
        setSelectedChronoJobId(chronoSummary.jobs[0]!.id)
      }
      if (!chronoDestinationPath && chronoSummary.jobs.length > 0) {
        setChronoDestinationPath(chronoSummary.jobs[0]!.destinationPath)
      }
    }
  }, [
    chatSessionId,
    chronoDestinationPath,
    chronoSummary,
    selectedChronoJobId,
    selectedMailMessageId,
    selectedStoreAppId,
    summary,
  ])

  useKeybinding(
    'confirm:no',
    () => onDone('Apex command center dismissed'),
    {
      context: 'Apex',
      isActive: true,
    },
  )

  const handleLaunchAction = useCallback(
    async (value: LaunchAction) => {
      setSelectedLaunchAction(value)
      if (value === 'refresh') {
        const result = await refreshWorkspace()
        setLaunchMessage(result.message)
        return
      }
      if (value === 'start-workspace-api') {
        const result = await startApexWorkspaceApi()
        setLaunchMessage(result.message)
        if (result.ok) {
          setTimeout(() => {
            void refreshWorkspace(true)
          }, 1500)
        }
        return
      }
      if (value === 'start-chrono-bridge') {
        const result = await startApexChronoBridge()
        setLaunchMessage(result.message)
        if (result.ok) {
          setTimeout(() => {
            void refreshWorkspace(true)
          }, 1500)
        }
        return
      }
      const result = await runApexAction(value)
      setLaunchMessage(result.message)
    },
    [refreshWorkspace],
  )

  const handleMailSend = useCallback(async () => {
    const recipients = mailTo
      .split(/[;,]/)
      .map(value => value.trim())
      .filter(Boolean)
    if (recipients.length === 0) {
      setMailMessage('Add at least one recipient before sending.')
      return
    }
    if (!mailSubject.trim() || !mailBody.trim()) {
      setMailMessage('Subject and body are required before sending.')
      return
    }
    const result = await composeApexMail({
      recipients,
      subject: mailSubject.trim(),
      content: mailBody.trim(),
    })
    setMailMessage(result.message)
    if (result.ok) {
      setMailBody('')
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 750)
    }
  }, [mailBody, mailSubject, mailTo, refreshWorkspace])

  const handleMailMove = useCallback(async () => {
    const result = await moveApexMailMessage({
      folder:
        summary?.mail.messages.find(message => message.id === selectedMailMessageId)?.folder ??
        '',
      messageId: selectedMailMessageId,
      targetFolder: mailTargetFolder,
    })
    setMailMessage(result.message)
    if (result.ok) {
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 750)
    }
  }, [mailTargetFolder, refreshWorkspace, selectedMailMessageId, summary])

  const handleMailDelete = useCallback(async () => {
    const result = await deleteApexMailMessage({
      folder:
        summary?.mail.messages.find(message => message.id === selectedMailMessageId)?.folder ??
        '',
      messageId: selectedMailMessageId,
    })
    setMailMessage(result.message)
    if (result.ok) {
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 750)
    }
  }, [refreshWorkspace, selectedMailMessageId, summary])

  const handleMailFlag = useCallback(
    async (flagged: boolean) => {
      const result = await flagApexMailMessage({
        folder:
          summary?.mail.messages.find(message => message.id === selectedMailMessageId)?.folder ??
          '',
        messageId: selectedMailMessageId,
        flagged,
      })
      setMailMessage(result.message)
      if (result.ok) {
        setTimeout(() => {
          void refreshWorkspace(true)
        }, 750)
      }
    },
    [refreshWorkspace, selectedMailMessageId, summary],
  )

  const handleChatSend = useCallback(async () => {
    const result = await sendApexChatMessage({
      sessionId: chatSessionId,
      content: chatMessageDraft,
    })
    setChatActionMessage(result.message)
    if (result.ok) {
      setChatMessageDraft('')
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 750)
    }
  }, [chatMessageDraft, chatSessionId, refreshWorkspace])

  const handleChatCreateSession = useCallback(async () => {
    const participants = chatParticipants
      .split(/[;,]/)
      .map(value => value.trim())
      .filter(Boolean)
    const result = await createApexChatSession({
      participants,
    })
    setChatActionMessage(result.message)
    if (result.ok && result.data?.sessionId) {
      setChatSessionId(result.data.sessionId)
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 750)
    }
  }, [chatParticipants, refreshWorkspace])

  const handleStoreInstall = useCallback(async () => {
    const selectedApp =
      summary?.store.apps.find(app => app.id === selectedStoreAppId) ?? null
    if (!selectedStoreAppId) {
      setStoreActionMessage('Choose an app before installing it.')
      return
    }
    if (selectedApp?.installed) {
      setStoreActionMessage(`${selectedApp.name} is already installed.`)
      return
    }
    const result = await installApexStoreAppWithReceipt({
      appId: selectedStoreAppId,
    })
    setStoreActionMessage(
      result.ok && result.data
        ? `${result.message} · ${result.data.sizeBytes} bytes · ${result.data.permissions.join(', ')}`
        : result.message,
    )
    if (result.ok) {
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 900)
    }
  }, [refreshWorkspace, selectedStoreAppId, summary])

  const handleChronoCreateJob = useCallback(async () => {
    const result = await createApexChronoJob({
      name: chronoJobName,
      sourcePaths: chronoSourcePath
        .split(/[;,]/)
        .map(value => value.trim())
        .filter(Boolean),
      destinationPath: chronoDestinationPath,
    })
    setChronoActionMessage(result.message)
    if (result.ok && result.data?.jobId) {
      setSelectedChronoJobId(result.data.jobId)
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 900)
    }
  }, [chronoDestinationPath, chronoJobName, chronoSourcePath, refreshWorkspace])

  const handleChronoStart = useCallback(async () => {
    const result = await startApexChronoJob({
      jobId: selectedChronoJobId,
    })
    setChronoActionMessage(result.message)
    if (result.ok) {
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 900)
    }
  }, [refreshWorkspace, selectedChronoJobId])

  const handleChronoRestore = useCallback(async () => {
    const selectedJob =
      chronoSummary?.jobs.find(job => job.id === selectedChronoJobId) ?? null
    const latestBackup = selectedJob?.backups[0] ?? null
    if (!latestBackup) {
      setChronoActionMessage('Choose a Chrono job with at least one backup before restoring.')
      return
    }
    const result = await restoreApexChronoJob({
      jobId: selectedChronoJobId,
      backupId: latestBackup.id,
      restorePath: chronoRestorePath,
    })
    setChronoActionMessage(result.message)
  }, [chronoRestorePath, chronoSummary, selectedChronoJobId])

  const handleChronoDelete = useCallback(async () => {
    const result = await deleteApexChronoJob({
      jobId: selectedChronoJobId,
    })
    setChronoActionMessage(result.message)
    if (result.ok) {
      setSelectedChronoJobId('')
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 900)
    }
  }, [refreshWorkspace, selectedChronoJobId])

  const handleChronoCleanup = useCallback(async () => {
    const result = await cleanupApexChronoBackups()
    setChronoActionMessage(result.message)
    if (result.ok) {
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 900)
    }
  }, [refreshWorkspace])

  const banner = (
    <Box flexDirection="row" gap={2}>
      <Text>
        Bridge:{' '}
        {health ? (
          <Text color="success">{health.status}</Text>
        ) : (
          <Text color="warning">offline</Text>
        )}
      </Text>
      <Text>
        Chrono:{' '}
        {chronoHealth ? (
          <Text color="success">{chronoHealth.status}</Text>
        ) : (
          <Text color="warning">offline</Text>
        )}
      </Text>
      <Text dimColor>
        Guardrails: allowlisted Apex roots only · Esc closes · Workspace API
        feeds mail/chat/store/system/security · Chrono bridge handles backup jobs
      </Text>
    </Box>
  )

  return (
    <Pane color="openjawsOcean">
      <Tabs
        title="Apex:"
        color="openjawsOcean"
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        banner={banner}
        contentHeight={insideModal ? undefined : contentHeight}
      >
        <Tab title="Overview">
          <ApexOverviewTab loading={loading} health={health} summary={summary} />
        </Tab>
        <Tab title="Launch">
          <ApexLaunchTab
            selectedAction={selectedLaunchAction}
            onFocusAction={setSelectedLaunchAction}
            onRunAction={value => {
              void handleLaunchAction(value)
            }}
            actionMessage={launchMessage}
          />
        </Tab>
        <Tab title="Mail">
          <ApexMailTab
            mailTo={mailTo}
            mailSubject={mailSubject}
            mailBody={mailBody}
            selectedMailMessageId={selectedMailMessageId}
            mailTargetFolder={mailTargetFolder}
            setMailTo={setMailTo}
            setMailSubject={setMailSubject}
            setMailBody={setMailBody}
            setSelectedMailMessageId={setSelectedMailMessageId}
            setMailTargetFolder={setMailTargetFolder}
            onSend={() => {
              void handleMailSend()
            }}
            onMove={() => {
              void handleMailMove()
            }}
            onDelete={() => {
              void handleMailDelete()
            }}
            onFlag={() => {
              void handleMailFlag(true)
            }}
            onUnflag={() => {
              void handleMailFlag(false)
            }}
            onRefresh={() => {
              void refreshWorkspace()
            }}
            actionMessage={mailMessage}
            summary={summary}
          />
        </Tab>
        <Tab title="Chat">
          <ApexChatTab
            summary={summary}
            chatSessionId={chatSessionId}
            chatMessage={chatMessageDraft}
            chatParticipants={chatParticipants}
            setChatSessionId={setChatSessionId}
            setChatMessage={setChatMessageDraft}
            setChatParticipants={setChatParticipants}
            onSend={() => {
              void handleChatSend()
            }}
            onCreateSession={() => {
              void handleChatCreateSession()
            }}
            onRefresh={() => {
              void refreshWorkspace()
            }}
            actionMessage={chatActionMessage}
          />
        </Tab>
        <Tab title="Store">
          <ApexStoreTab
            summary={summary}
            selectedAppId={selectedStoreAppId}
            setSelectedAppId={setSelectedStoreAppId}
            onInstall={() => {
              void handleStoreInstall()
            }}
            onRefresh={() => {
              void refreshWorkspace()
            }}
            actionMessage={storeActionMessage}
          />
        </Tab>
        <Tab title="System">
          <ApexSystemTab summary={summary} />
        </Tab>
        <Tab title="Chrono">
          <ApexChronoTab
            summary={chronoSummary}
            chronoJobName={chronoJobName}
            chronoSourcePath={chronoSourcePath}
            chronoDestinationPath={chronoDestinationPath}
            chronoRestorePath={chronoRestorePath}
            selectedChronoJobId={selectedChronoJobId}
            setChronoJobName={setChronoJobName}
            setChronoSourcePath={setChronoSourcePath}
            setChronoDestinationPath={setChronoDestinationPath}
            setChronoRestorePath={setChronoRestorePath}
            setSelectedChronoJobId={setSelectedChronoJobId}
            onCreateJob={() => {
              void handleChronoCreateJob()
            }}
            onStartJob={() => {
              void handleChronoStart()
            }}
            onRestoreLatest={() => {
              void handleChronoRestore()
            }}
            onDeleteJob={() => {
              void handleChronoDelete()
            }}
            onCleanup={() => {
              void handleChronoCleanup()
            }}
            onRefresh={() => {
              void refreshWorkspace()
            }}
            actionMessage={chronoActionMessage}
          />
        </Tab>
        <Tab title="Security">
          <ApexSecurityTab summary={summary} />
        </Tab>
      </Tabs>
    </Pane>
  )
}

export const call: LocalJSXCommandCall = async onDone => {
  return <ApexCommandCenter onDone={onDone} />
}
