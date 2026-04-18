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
  type ApexLaunchTarget,
  type ApexWorkspaceHealth,
  type ApexWorkspaceSummary,
  composeApexMail,
  getApexLaunchTarget,
  getApexLaunchTargets,
  getApexWorkspaceHealth,
  getApexWorkspaceSummary,
  installApexStoreApp,
  runApexAction,
  sendApexChatMessage,
  startApexWorkspaceApi,
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
  | ApexLaunchTarget['id']

type MailAction = 'mail-to' | 'mail-subject' | 'mail-body' | 'mail-send' | 'mail-refresh'
type ChatAction = 'chat-session' | 'chat-message' | 'chat-send' | 'chat-refresh' | `chat-use-${string}`
type StoreAction = 'store-app' | 'store-install' | 'store-refresh' | `store-use-${string}`

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
    selectedAction === 'refresh' || selectedAction === 'start-workspace-api'
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
  setMailTo,
  setMailSubject,
  setMailBody,
  onSend,
  onRefresh,
  actionMessage,
  summary,
}: {
  mailTo: string
  mailSubject: string
  mailBody: string
  setMailTo: (value: string) => void
  setMailSubject: (value: string) => void
  setMailBody: (value: string) => void
  onSend: () => void
  onRefresh: () => void
  actionMessage: string | null
  summary: ApexWorkspaceSummary | null
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()

  const options = useMemo<OptionWithDescription<MailAction>[]>(
    () => [
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
        label: 'Send through Aegis Mail',
        value: 'mail-send',
        description:
          'Queues the current draft into the Apex mail runtime over workspace_api.',
      },
      {
        label: 'Refresh mail feed',
        value: 'mail-refresh',
        description: 'Pull the latest inbound mail summary from the bridge.',
      },
    ],
    [mailBody, mailSubject, mailTo, setMailBody, setMailSubject, setMailTo],
  )

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
          visibleOptionCount={8}
          defaultFocusValue="mail-to"
          onChange={value => {
            if (value === 'mail-send') {
              onSend()
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
            'Tab into the input fields on the left to edit the draft, then choose “Send through Aegis Mail”.'}
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
  setChatSessionId,
  setChatMessage,
  onSend,
  onRefresh,
  actionMessage,
}: {
  summary: ApexWorkspaceSummary | null
  chatSessionId: string
  chatMessage: string
  setChatSessionId: (value: string) => void
  setChatMessage: (value: string) => void
  onSend: () => void
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
      ...sessionOptions,
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
  }, [chatMessage, chatSessionId, setChatMessage, setChatSessionId, summary])

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
            'Choose a conversation, draft a message, then send through the trusted Shadow Chat bridge.'}
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
  const [launchMessage, setLaunchMessage] = useState<string | null>(null)
  const [mailMessage, setMailMessage] = useState<string | null>(null)
  const [mailTo, setMailTo] = useState('')
  const [mailSubject, setMailSubject] = useState('')
  const [mailBody, setMailBody] = useState('')
  const [chatSessionId, setChatSessionId] = useState('')
  const [chatMessageDraft, setChatMessageDraft] = useState('')
  const [chatActionMessage, setChatActionMessage] = useState<string | null>(null)
  const [selectedStoreAppId, setSelectedStoreAppId] = useState('')
  const [storeActionMessage, setStoreActionMessage] = useState<string | null>(null)
  const insideModal = useIsInsideModal()
  const { rows } = useModalOrTerminalSize(useTerminalSize())
  const contentHeight = insideModal
    ? rows + 1
    : Math.max(18, Math.min(Math.floor(rows * 0.78), 34))

  const refreshWorkspace = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true)
    }
    const [nextHealth, nextSummary] = await Promise.all([
      getApexWorkspaceHealth(),
      getApexWorkspaceSummary(),
    ])
    setHealth(nextHealth)
    setSummary(nextSummary)
    setLoading(false)
    return {
      ok: nextHealth !== null,
      message:
        nextHealth !== null
          ? 'Apex workspace bridge refreshed.'
          : 'Apex workspace bridge is offline.',
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
      return
    }
    if (!chatSessionId && summary.chat.conversations.length > 0) {
      setChatSessionId(summary.chat.conversations[0]!.id)
    }
    if (!selectedStoreAppId && summary.store.apps.length > 0) {
      const preferredApp =
        summary.store.apps.find(app => !app.installed) ?? summary.store.apps[0]
      setSelectedStoreAppId(preferredApp?.id ?? '')
    }
  }, [chatSessionId, selectedStoreAppId, summary])

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
    const result = await installApexStoreApp({
      appId: selectedStoreAppId,
    })
    setStoreActionMessage(result.message)
    if (result.ok) {
      setTimeout(() => {
        void refreshWorkspace(true)
      }, 900)
    }
  }, [refreshWorkspace, selectedStoreAppId, summary])

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
      <Text dimColor>
        Guardrails: allowlisted Apex roots only · Esc closes · Workspace API
        feeds mail/chat/store/system/security into OpenJaws
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
            setMailTo={setMailTo}
            setMailSubject={setMailSubject}
            setMailBody={setMailBody}
            onSend={() => {
              void handleMailSend()
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
            setChatSessionId={setChatSessionId}
            setChatMessage={setChatMessageDraft}
            onSend={() => {
              void handleChatSend()
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
