import * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { LocalJSXCommandCall } from '../../types/command.js'
import { Pane } from '../../components/design-system/Pane.js'
import { Tab, Tabs, useTabHeaderFocus } from '../../components/design-system/Tabs.js'
import {
  type OptionWithDescription,
  Select,
} from '../../components/CustomSelect/select.js'
import { Box, Text } from '../../ink.js'
import {
  useIsInsideModal,
  useModalOrTerminalSize,
} from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { getApexLaunchTarget } from '../../utils/apexWorkspace.js'
import type {
  BrowserPreviewIntent,
  BrowserPreviewReceipt,
  BrowserPreviewRuntime,
} from '../../utils/browserPreview.js'
import {
  closeBrowserPreviewSession,
  navigateBrowserPreviewSession,
  openAccountableBrowserPreview,
  readBrowserPreviewReceipt,
  readBrowserPreviewRuntime,
  summarizeBrowserPreviewReceipt,
  summarizeBrowserPreviewRuntime,
} from '../../utils/browserPreview.js'

const REFRESH_INTERVAL_MS = 15_000

type PreviewAction =
  | 'url'
  | 'rationale'
  | 'intent-preview'
  | 'intent-research'
  | 'intent-browse'
  | 'intent-watch'
  | 'intent-music'
  | 'open-preview'
  | 'navigate-preview'
  | 'close-preview'
  | 'refresh'

function getIntentFromAction(action: PreviewAction): BrowserPreviewIntent | null {
  switch (action) {
    case 'intent-research':
      return 'research'
    case 'intent-browse':
      return 'browse'
    case 'intent-watch':
      return 'watch'
    case 'intent-music':
      return 'music'
    case 'intent-preview':
      return 'preview'
    default:
      return null
  }
}

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
        <Text key={item} wrap="wrap">
          • {item}
        </Text>
      ))}
    </Box>
  )
}

function PreviewOverview({
  receipt,
  runtime,
  runtimeStatus,
}: {
  receipt: BrowserPreviewReceipt | null
  runtime: BrowserPreviewRuntime | null
  runtimeStatus: string
}): React.ReactNode {
  const runtimeSummary = summarizeBrowserPreviewRuntime(runtime)
  const receiptSummary = summarizeBrowserPreviewReceipt(receipt)

  return (
    <Box flexDirection="column" gap={1}>
      <SectionTitle>OpenJaws browser</SectionTitle>
      <Text>{runtimeSummary.headline}</Text>
      <DetailList items={runtimeSummary.details} />

      <SectionTitle>Runtime</SectionTitle>
      <Text>{runtimeStatus}</Text>
      <Text dimColor>
        Use /preview to keep browsing inside the OpenJaws TUI. The desktop Apex
        browser stays out of process and is only the fallback when you
        explicitly need an external window. User browsing history is not
        persisted by default; only Q or agent-led browsing on the user&apos;s
        behalf lands in accountable receipts.
      </Text>

      <SectionTitle>Accountable receipts</SectionTitle>
      <Text>{receiptSummary.headline}</Text>
      <DetailList items={receiptSummary.details} />
    </Box>
  )
}

function PreviewSession({
  runtime,
}: {
  runtime: BrowserPreviewRuntime | null
}): React.ReactNode {
  const activeSession =
    runtime?.summary?.sessions.find(
      session => session.id === runtime.summary?.activeSessionId,
    ) ?? runtime?.summary?.sessions[0]

  if (!activeSession) {
    return (
      <Box flexDirection="column" gap={1}>
        <SectionTitle>Session view</SectionTitle>
        <Text dimColor>
          No active browser session yet. Open a URL from the Controls tab to
          render it here inside the native OpenJaws TUI browser lane.
        </Text>
      </Box>
    )
  }

  const metadata = [
    activeSession.metadata.description
      ? `description ${activeSession.metadata.description}`
      : null,
    activeSession.metadata.author
      ? `author ${activeSession.metadata.author}`
      : null,
    activeSession.metadata.contentType
      ? `content ${activeSession.metadata.contentType}`
      : null,
    activeSession.metadata.keywords.length > 0
      ? `keywords ${activeSession.metadata.keywords.join(', ')}`
      : null,
  ].filter(Boolean) as string[]

  const links = activeSession.links
    .slice(0, 10)
    .map(link => `${link.text} · ${link.linkType} · ${link.url}`)

  return (
    <Box flexDirection="column" gap={1}>
      <SectionTitle>{activeSession.title}</SectionTitle>
      <Text wrap="wrap">{activeSession.url}</Text>
      <Text wrap="wrap">
        {activeSession.statusCode} · {activeSession.loadTimeMs}ms ·{' '}
        {activeSession.imageCount} images · {activeSession.links.length} links
      </Text>

      <SectionTitle>Excerpt</SectionTitle>
      <Text wrap="wrap">{activeSession.excerpt}</Text>

      <SectionTitle>Metadata</SectionTitle>
      <DetailList
        items={metadata}
        empty="No page metadata was exposed by the current page."
      />

      <SectionTitle>Links</SectionTitle>
      <DetailList
        items={links}
        empty="No links were captured for the active page."
      />
    </Box>
  )
}

function PreviewLaunch({
  url,
  rationale,
  intent,
  runtime,
  receipt,
  actionMessage,
  onSetUrl,
  onSetRationale,
  onSetIntent,
  onRunAction,
}: {
  url: string
  rationale: string
  intent: BrowserPreviewIntent
  runtime: BrowserPreviewRuntime | null
  receipt: BrowserPreviewReceipt | null
  actionMessage: string | null
  onSetUrl: (value: string) => void
  onSetRationale: (value: string) => void
  onSetIntent: (value: BrowserPreviewIntent) => void
  onRunAction: (value: PreviewAction) => void
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
  const activeSession =
    runtime?.summary?.sessions.find(
      session => session.id === runtime.summary?.activeSessionId,
    ) ?? runtime?.summary?.sessions[0] ??
    null
  const options = useMemo<OptionWithDescription<PreviewAction>[]>(
    () => [
      {
        label: 'Preview URL',
        value: 'url',
        type: 'input',
        initialValue: url,
        onChange: onSetUrl,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Why this session',
        value: 'rationale',
        type: 'input',
        initialValue: rationale,
        onChange: onSetRationale,
        allowEmptySubmitToCancel: true,
      },
      {
        label: 'Intent: preview',
        value: 'intent-preview',
        description: 'Local app preview, QA, UI verification, or dev review.',
      },
      {
        label: 'Intent: research',
        value: 'intent-research',
        description: 'Focused docs or fact-finding work with an explicit why.',
      },
      {
        label: 'Intent: browse',
        value: 'intent-browse',
        description: 'General supervised browsing without persisting user history.',
      },
      {
        label: 'Intent: watch',
        value: 'intent-watch',
        description: 'Video or long-form viewing inside the TUI browser lane.',
      },
      {
        label: 'Intent: music',
        value: 'intent-music',
        description: 'Audio or music sessions that still render inside OpenJaws.',
      },
      {
        label: 'Open in-TUI browser session',
        value: 'open-preview',
        description: 'Open the URL inside the native OpenJaws browser lane.',
      },
      {
        label: 'Navigate active session',
        value: 'navigate-preview',
        description:
          'Reuse the active session and navigate it to the current URL.',
      },
      {
        label: 'Close active session',
        value: 'close-preview',
        description: 'Clear the current in-TUI browser session.',
      },
      {
        label: 'Refresh browser state',
        value: 'refresh',
        description: 'Reload the live browser bridge state and accountable receipts.',
      },
    ],
    [onSetRationale, onSetUrl, rationale, url],
  )

  const recent = receipt?.sessions.slice(0, 5).map(summarizeReceiptLine) ?? []

  return (
    <Box flexDirection="row" gap={3}>
      <Box width={40} flexDirection="column">
        <Select
          options={options}
          layout="compact-vertical"
          visibleOptionCount={10}
          defaultFocusValue="url"
          onChange={value => {
            const intentAction = getIntentFromAction(value as PreviewAction)
            if (intentAction) {
              onSetIntent(intentAction)
              return
            }
            onRunAction(value as PreviewAction)
          }}
          isDisabled={headerFocused}
          onUpFromFirstItem={focusHeader}
        />
      </Box>

      <Box flexDirection="column" flexGrow={1} gap={1}>
        <SectionTitle>Current draft</SectionTitle>
        <Text wrap="wrap">URL: {url || 'not set'}</Text>
        <Text wrap="wrap">Intent: {intent}</Text>
        <Text wrap="wrap">Why: {rationale || 'not set'}</Text>

        <SectionTitle>Active session</SectionTitle>
        <DetailList
          items={
            activeSession
              ? [
                  `${activeSession.title} · ${activeSession.state}`,
                  `${activeSession.url}`,
                  activeSession.recordHistory
                    ? 'Accountable agent session'
                    : 'Private user session',
                ]
              : []
          }
          empty="No active browser session yet."
        />

        <SectionTitle>Recent accountable handoffs</SectionTitle>
        <DetailList
          items={recent}
          empty="Only Q or agent-led browsing appears here."
        />

        <SectionTitle>Last action</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Open a session to render the web inside OpenJaws. Use /preview for the native lane; the desktop Apex browser is the explicit out-of-process fallback.'}
        </Text>
      </Box>
    </Box>
  )
}

function summarizeReceiptLine(session: BrowserPreviewReceipt['sessions'][number]): string {
  return `${session.intent} · ${session.requestedBy} · ${session.url ?? session.note}`
}

function PreviewCommand({
  initialUrl,
}: {
  initialUrl: string
}): React.ReactNode {
  const insideModal = useIsInsideModal()
  const [, terminalHeight] = useTerminalSize()
  const modalSize = useModalOrTerminalSize()
  const contentHeight = insideModal
    ? undefined
    : Math.max(16, Math.min(terminalHeight - 6, 28))

  const [selectedTab, setSelectedTab] = useState('overview')
  const [url, setUrl] = useState(initialUrl)
  const [rationale, setRationale] = useState(
    'Preview the current surface inside the OpenJaws browser lane.',
  )
  const [intent, setIntent] = useState<BrowserPreviewIntent>('preview')
  const [receipt, setReceipt] = useState<BrowserPreviewReceipt | null>(null)
  const [runtime, setRuntime] = useState<BrowserPreviewRuntime | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState(
    'Checking the OpenJaws browser bridge…',
  )

  const refresh = useCallback(async () => {
    const [nextReceipt, nextRuntime] = await Promise.all([
      readBrowserPreviewReceipt(),
      readBrowserPreviewRuntime(),
    ])
    setReceipt(nextReceipt)
    setRuntime(nextRuntime)
    setRuntimeStatus(nextRuntime.message)
  }, [])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => {
      void refresh()
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const handleAction = useCallback(
    async (action: PreviewAction) => {
      if (action === 'refresh') {
        await refresh()
        setActionMessage('Reloaded the in-TUI browser state and accountable receipts.')
        return
      }

      if (action === 'open-preview') {
        const result = await openAccountableBrowserPreview({
          url,
          rationale,
          intent,
        })
        setActionMessage(result.message)
        setReceipt(result.receipt)
        setRuntime(result.runtime)
        setRuntimeStatus(result.runtime.message)
        setSelectedTab('session')
        return
      }

      if (action === 'navigate-preview') {
        const sessionId =
          runtime?.summary?.activeSessionId ?? runtime?.summary?.sessions[0]?.id ?? null
        if (!sessionId) {
          setActionMessage(
            'There is no active browser session to navigate yet. Open one first.',
          )
          return
        }
        const result = await navigateBrowserPreviewSession({
          sessionId,
          url,
          intent,
          rationale,
          requestedBy: 'user',
        })
        setActionMessage(result.message)
        setReceipt(result.receipt)
        setRuntime(result.runtime)
        setRuntimeStatus(result.runtime.message)
        setSelectedTab('session')
        return
      }

      if (action === 'close-preview') {
        const sessionId =
          runtime?.summary?.activeSessionId ?? runtime?.summary?.sessions[0]?.id ?? null
        if (!sessionId) {
          setActionMessage('There is no active browser session to close.')
          return
        }
        const result = await closeBrowserPreviewSession({
          sessionId,
          requestedBy: 'user',
        })
        setActionMessage(result.message)
        setReceipt(result.receipt)
        setRuntime(result.runtime)
        setRuntimeStatus(result.runtime.message)
        return
      }
    },
    [intent, rationale, refresh, runtime, url],
  )

  const apexBrowserBridge = getApexLaunchTarget('browser_bridge')
  const banner = (
    <Box flexDirection="row" gap={2}>
      <Text>{runtimeStatus}</Text>
      <Text dimColor>
        Bridge: {apexBrowserBridge?.path ?? 'not configured'} · Esc closes
      </Text>
    </Box>
  )

  return (
    <Pane color="chromeYellow">
      <Tabs
        title="Preview:"
        color="chromeYellow"
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        banner={banner}
        contentHeight={
          insideModal ? undefined : Math.min(contentHeight, modalSize.height)
        }
      >
        <Tab title="Overview">
          <PreviewOverview
            receipt={receipt}
            runtime={runtime}
            runtimeStatus={runtimeStatus}
          />
        </Tab>
        <Tab title="Session">
          <PreviewSession runtime={runtime} />
        </Tab>
        <Tab title="Controls">
          <PreviewLaunch
            url={url}
            rationale={rationale}
            intent={intent}
            runtime={runtime}
            receipt={receipt}
            actionMessage={actionMessage}
            onSetUrl={setUrl}
            onSetRationale={setRationale}
            onSetIntent={setIntent}
            onRunAction={value => {
              void handleAction(value)
            }}
          />
        </Tab>
      </Tabs>
    </Pane>
  )
}

export const call: LocalJSXCommandCall = async (_onDone, _context, args) => {
  const initialUrl = args.trim()
  return <PreviewCommand initialUrl={initialUrl} />
}
