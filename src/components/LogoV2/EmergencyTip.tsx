import * as React from 'react'
import { useEffect, useMemo } from 'react'
import { Box, Text } from 'src/ink.js'
import { getDynamicConfig_CACHED_MAY_BE_STALE } from 'src/services/analytics/growthbook.js'
import { getGlobalConfig, saveGlobalConfig } from 'src/utils/config.js'
import ThemedBox from '../design-system/ThemedBox.js'

const CONFIG_NAME = 'jaws-top-of-feed-tip'

export function EmergencyTip(): React.ReactNode {
  const tip = useMemo(getTipOfFeed, [])
  const lastShownTip = useMemo(
    () => getGlobalConfig().lastShownEmergencyTip,
    [],
  )

  const shouldShow = tip.tip && tip.tip !== lastShownTip

  useEffect(() => {
    if (shouldShow) {
      saveGlobalConfig(current => {
        if (current.lastShownEmergencyTip === tip.tip) {
          return current
        }

        return {
          ...current,
          lastShownEmergencyTip: tip.tip,
        }
      })
    }
  }, [shouldShow, tip.tip])

  if (!shouldShow) {
    return null
  }

  const tone =
    tip.color === 'warning'
      ? 'warning'
      : tip.color === 'error'
        ? 'error'
        : 'claude'
  const label =
    tip.color === 'warning'
      ? 'Deck warning'
      : tip.color === 'error'
        ? 'Deck alert'
        : 'Chart note'

  return (
    <Box paddingLeft={2} flexDirection="column">
      <ThemedBox
        borderStyle="round"
        borderColor={tone}
        backgroundColor="userMessageBackground"
        paddingX={1}
      >
        <Box marginBottom={1}>
          <Text bold color={tone} backgroundColor="messageActionsBackground">
            {' '}
            {label.toUpperCase()}
            {' '}
          </Text>
        </Box>
        <Text color={tip.color === 'dim' ? 'inactive' : tone}>{tip.tip}</Text>
      </ThemedBox>
    </Box>
  )
}

type TipOfFeed = {
  tip: string
  color?: 'dim' | 'warning' | 'error'
}

const DEFAULT_TIP: TipOfFeed = {
  tip: '',
  color: 'dim',
}

function getTipOfFeed(): TipOfFeed {
  return getDynamicConfig_CACHED_MAY_BE_STALE<TipOfFeed>(
    CONFIG_NAME,
    DEFAULT_TIP,
  )
}
