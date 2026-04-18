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
  runApexAction,
  startApexWorkspaceApi,
  summarizeApexWorkspace,
} from '../../utils/apexWorkspace.js'
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

        <SectionTitle>Recent mail</SectionTitle>
        <DetailList
          items={recentMail}
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
          `${incident.title} · ${incident.status} · ${incident.source}`,
      ) ?? []
  const audits =
    summary?.security.auditEntries
      .slice(0, 6)
      .map(entry => `${entry.title} · ${entry.detail}`) ?? []
  const hostServices =
    summary?.system.services
      .slice(0, 5)
      .map(service => `${service.name} · ${service.status} · ${service.cpu} CPU`) ?? []

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

      <SectionTitle>Host services</SectionTitle>
      <DetailList
        items={hostServices}
        empty="System monitor data is not available until the bridge is online."
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
        feeds mail/system/security into OpenJaws
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
