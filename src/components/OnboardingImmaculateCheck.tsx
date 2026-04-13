import React from 'react'
import { Box, Text } from '../ink.js'
import { Select, type OptionWithDescription } from './CustomSelect/index.js'
import {
  formatImmaculateHarnessInlineStatus,
  getImmaculateHarnessDeckReceipt,
  getImmaculateHarnessStatus,
  type ImmaculateHarnessDeckReceipt,
  type ImmaculateHarnessStatus,
} from '../utils/immaculateHarness.js'

type ProbeState = {
  loading: boolean
  status: ImmaculateHarnessStatus | null
  deckReceipt: ImmaculateHarnessDeckReceipt | null
}

type Props = {
  onDone: () => void
}

function getRecoveryHints(status: ImmaculateHarnessStatus | null): string[] {
  if (!status) {
    return []
  }
  const hints = ['IMMACULATE_HARNESS_URL / settings.immaculate.harnessUrl']
  if (!status.loopback && !status.apiKeySource) {
    hints.push('immaculate.apiKeyEnv / immaculate.apiKey')
  }
  return hints
}

export function OnboardingImmaculateCheck({
  onDone,
}: Props): React.ReactNode {
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [probeState, setProbeState] = React.useState<ProbeState>({
    loading: true,
    status: null,
    deckReceipt: null,
  })

  React.useEffect(() => {
    let cancelled = false
    setProbeState(prev => ({
      ...prev,
      loading: true,
    }))

    void (async () => {
      const status = await getImmaculateHarnessStatus().catch(() => null)
      const deckReceipt =
        status?.enabled && status.reachable
          ? await getImmaculateHarnessDeckReceipt().catch(() => null)
          : null
      if (!cancelled) {
        setProbeState({
          loading: false,
          status,
          deckReceipt,
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  if (probeState.loading) {
    return (
      <Box flexDirection="column" gap={1} paddingLeft={1}>
        <Text bold>Check Immaculate reachability</Text>
        <Text dimColor>
          Probing the live Immaculate harness before OpenJaws drops into the
          main deck.
        </Text>
      </Box>
    )
  }

  const status = probeState.status
  const hints = getRecoveryHints(status)
  const options: OptionWithDescription<'continue' | 'retry'>[] = [
    {
      label: status?.enabled === true && status.reachable === false
        ? 'Continue anyway'
        : 'Continue',
      value: 'continue',
      description:
        status?.enabled === true && status.reachable === false
          ? 'Keep startup moving and fix reachability later from the deck.'
          : 'Runtime wiring is ready enough to continue.',
    },
    {
      label: 'Retry check',
      value: 'retry',
      description: 'Probe the harness again before entering the session.',
    },
  ]

  return (
    <Box flexDirection="column" gap={1} paddingLeft={1}>
      <Text bold>Immaculate reachability</Text>
      <Box width={80}>
        <Text dimColor>
          {status
            ? formatImmaculateHarnessInlineStatus(status, probeState.deckReceipt)
            : 'Immaculate status unavailable.'}
        </Text>
      </Box>
      {status?.harnessUrl ? (
        <Text dimColor>Harness URL: {status.harnessUrl}</Text>
      ) : null}
      {probeState.deckReceipt ? (
        <Text dimColor>
          Deck: {probeState.deckReceipt.layerCount} layers ·{' '}
          {probeState.deckReceipt.executionCount} executions
          {probeState.deckReceipt.recommendedLayerId
            ? ` · recommended ${probeState.deckReceipt.recommendedLayerId}`
            : ''}
        </Text>
      ) : null}
      {status?.error ? <Text color="warning">{status.error}</Text> : null}
      {hints.length > 0 ? (
        <Box width={80}>
          <Text dimColor>Recovery: {hints.join(' · ')}</Text>
        </Box>
      ) : null}
      <Select
        options={options}
        defaultValue="continue"
        defaultFocusValue="continue"
        onChange={value => {
          if (value === 'retry') {
            setRefreshKey(prev => prev + 1)
            return
          }
          onDone()
        }}
      />
    </Box>
  )
}
