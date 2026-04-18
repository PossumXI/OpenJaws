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
import { useIsInsideModal, useModalOrTerminalSize } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import type {
  BrowserPreviewIntent,
  BrowserPreviewReceipt,
} from '../../utils/browserPreview.js'
import {
  launchApexBrowserShell,
  openAccountableBrowserPreview,
  readBrowserPreviewReceipt,
  summarizeBrowserPreviewReceipt,
} from '../../utils/browserPreview.js'
import { getApexLaunchTarget } from '../../utils/apexWorkspace.js'
import { detectAvailableBrowser } from '../../utils/openjawsInChrome/common.js'

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
  | 'launch-apex-browser'
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
        <Text key={item}>• {item}</Text>
      ))}
    </Box>
  )
}

function PreviewOverview({
  receipt,
  browserAvailability,
}: {
  receipt: BrowserPreviewReceipt | null
  browserAvailability: string
}): React.ReactNode {
  const summary = summarizeBrowserPreviewReceipt(receipt)
  return (
    <Box flexDirection="column" gap={1}>
      <SectionTitle>Preview lane</SectionTitle>
      <Text>{summary.headline}</Text>
      <DetailList items={summary.details} />

      <SectionTitle>Runtime</SectionTitle>
      <Text>{browserAvailability}</Text>
      <Text dimColor>
        OpenJaws keeps the accountability record in its config home. Chrome/system
        URL opens stay supervised; the Apex browser remains a launcher-backed shell.
      </Text>
    </Box>
  )
}

function PreviewLaunch({
  url,
  rationale,
  intent,
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
  receipt: BrowserPreviewReceipt | null
  actionMessage: string | null
  onSetUrl: (value: string) => void
  onSetRationale: (value: string) => void
  onSetIntent: (value: BrowserPreviewIntent) => void
  onRunAction: (value: PreviewAction) => void
}): React.ReactNode {
  const { headerFocused, focusHeader } = useTabHeaderFocus()
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
        label: `Intent: ${intent}`,
        value: `intent-${intent}` as PreviewAction,
        description:
          'Switch the browser lane between app preview, research, browse, watch, or music.',
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
        description: 'General supervised browsing outside the dev loop.',
      },
      {
        label: 'Intent: watch',
        value: 'intent-watch',
        description: 'Video, streams, or long-form watch sessions.',
      },
      {
        label: 'Intent: music',
        value: 'intent-music',
        description: 'Music or audio sessions that still need accountability.',
      },
      {
        label: 'Open accountable session',
        value: 'open-preview',
        description: 'Open the URL in the real browser path and persist the why/intent.',
      },
      {
        label: 'Launch Apex browser shell',
        value: 'launch-apex-browser',
        description:
          'Start the external Flowspace/Apex browser app as a desktop shell.',
      },
      {
        label: 'Refresh session history',
        value: 'refresh',
        description: 'Reload the latest accountable browser sessions from disk.',
      },
    ],
    [intent, onSetRationale, onSetUrl, rationale, url],
  )

  const recent = receipt?.sessions.slice(0, 5).map(session => {
    const target =
      session.action === 'launch_apex_browser'
        ? 'Apex browser shell'
        : session.url ?? 'browser session'
    return `${session.intent} · ${session.handler} · ${target}`
  }) ?? []

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

        <SectionTitle>Recent sessions</SectionTitle>
        <DetailList
          items={recent}
          empty="No accountable sessions recorded yet. Open one from the menu on the left."
        />

        <SectionTitle>Last action</SectionTitle>
        <Text wrap="wrap">
          {actionMessage ??
            'Set the URL, keep the rationale explicit, then open the preview lane or launch the Apex browser shell.'}
        </Text>
      </Box>
    </Box>
  )
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
    'Preview the current surface with an accountable browser session.',
  )
  const [intent, setIntent] = useState<BrowserPreviewIntent>('preview')
  const [receipt, setReceipt] = useState<BrowserPreviewReceipt | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [browserAvailability, setBrowserAvailability] = useState(
    'Checking browser availability…',
  )

  const refresh = useCallback(async () => {
    const [nextReceipt, browser] = await Promise.all([
      readBrowserPreviewReceipt(),
      detectAvailableBrowser().catch(() => null),
    ])
    setReceipt(nextReceipt)
    setBrowserAvailability(
      browser
        ? `Chrome-compatible browser detected (${browser}).`
        : 'Chrome-compatible browser not detected. System browser fallback will be used.',
    )
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
        setActionMessage('Reloaded the accountable browser session history.')
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
        return
      }

      if (action === 'launch-apex-browser') {
        const result = await launchApexBrowserShell({
          intent,
          rationale,
        })
        setActionMessage(result.message)
        setReceipt(result.receipt)
      }
    },
    [intent, rationale, refresh, url],
  )

  const apexBrowser = getApexLaunchTarget('browser')
  const banner = (
    <Box flexDirection="row" gap={2}>
      <Text>{browserAvailability}</Text>
      <Text dimColor>
        Apex browser shell: {apexBrowser?.path ?? 'not configured'} · Esc closes
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
        contentHeight={insideModal ? undefined : Math.min(contentHeight, modalSize.height)}
      >
        <Tab title="Overview">
          <PreviewOverview
            receipt={receipt}
            browserAvailability={browserAvailability}
          />
        </Tab>
        <Tab title="Launch">
          <PreviewLaunch
            url={url}
            rationale={rationale}
            intent={intent}
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
