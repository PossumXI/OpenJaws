import React from 'react'
import { Box, Text } from '../../ink.js'
import {
  readBrowserPreviewReceipt,
  readBrowserPreviewRuntime,
  summarizeBrowserPreviewReceipt,
  summarizeBrowserPreviewRuntime,
} from '../../utils/browserPreview.js'

type BrowserPanelState = {
  headline: string
  detail: string
  updatedAt: string
}

const REFRESH_MS = 15_000

async function readBrowserPanelState(): Promise<BrowserPanelState> {
  const [runtime, receipt] = await Promise.all([
    readBrowserPreviewRuntime().catch(() => null),
    readBrowserPreviewReceipt().catch(() => null),
  ])
  const runtimeSummary = summarizeBrowserPreviewRuntime(runtime)
  const receiptSummary = summarizeBrowserPreviewReceipt(receipt)
  return {
    headline: runtimeSummary.headline,
    detail:
      runtimeSummary.details[0] ??
      receiptSummary.details[0] ??
      'Browser preview is ready for accountable sessions and demo harnesses.',
    updatedAt: new Date().toISOString(),
  }
}

export function WebBrowserPanel(): React.ReactNode {
  const [state, setState] = React.useState<BrowserPanelState | null>(null)

  React.useEffect(() => {
    let active = true
    const refresh = async () => {
      const next = await readBrowserPanelState()
      if (active) {
        setState(next)
      }
    }
    void refresh()
    const interval = setInterval(refresh, REFRESH_MS)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  if (!state) {
    return null
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      marginBottom={1}
    >
      <Text bold>BrowserPreview</Text>
      <Text>{state.headline}</Text>
      <Text dimColor>{state.detail}</Text>
    </Box>
  )
}
