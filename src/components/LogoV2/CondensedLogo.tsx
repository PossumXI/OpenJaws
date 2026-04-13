import * as React from 'react'
import { type ReactNode, useEffect } from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { Box, Text } from '../../ink.js'
import { useAppState } from '../../state/AppState.js'
import { getEffortSuffix } from '../../utils/effort.js'
import { truncate } from '../../utils/format.js'
import {
  formatModelAndBilling,
  getLogoDisplayData,
  truncatePath,
} from '../../utils/logoV2Utils.js'
import { renderModelSetting } from '../../utils/model/model.js'
import { OffscreenFreeze } from '../OffscreenFreeze.js'
import { AnimatedClawd } from './AnimatedClawd.js'
import {
  GuestPassesUpsell,
  incrementGuestPassesSeenCount,
  useShowGuestPassesUpsell,
} from './GuestPassesUpsell.js'
import {
  incrementOverageCreditUpsellSeenCount,
  OverageCreditUpsell,
  useShowOverageCreditUpsell,
} from './OverageCreditUpsell.js'

const CONDENSED_SKYLINE =
  'FLIGHT DECK · SUNLIT SHELL · AGENTS · NOTES · TOOLS'
const CONDENSED_WAKE =
  'inspect each cut · keep tools honest · ship in warm daylight'

export function CondensedLogo(): ReactNode {
  const { columns } = useTerminalSize()
  const agent = useAppState(s => s.agent)
  const effortValue = useAppState(s => s.effortValue)
  const model = useMainLoopModel()
  const modelDisplayName = renderModelSetting(model)
  const { version, cwd, billingType, agentName: agentNameFromSettings } =
    getLogoDisplayData()

  const agentName = agent ?? agentNameFromSettings
  const showGuestPassesUpsell = useShowGuestPassesUpsell()
  const showOverageCreditUpsell = useShowOverageCreditUpsell()

  useEffect(() => {
    if (showGuestPassesUpsell) {
      incrementGuestPassesSeenCount()
    }
  }, [showGuestPassesUpsell])

  useEffect(() => {
    if (showOverageCreditUpsell && !showGuestPassesUpsell) {
      incrementOverageCreditUpsellSeenCount()
    }
  }, [showOverageCreditUpsell, showGuestPassesUpsell])

  const textWidth = Math.max(columns - 15, 20)
  const truncatedVersion = truncate(
    version,
    Math.max(textWidth - 'OpenJaws // OpenCheeks v'.length, 6),
  )
  const effortSuffix = getEffortSuffix(model, effortValue)
  const { shouldSplit, truncatedModel, truncatedBilling } =
    formatModelAndBilling(
      modelDisplayName + effortSuffix,
      billingType,
      textWidth,
    )

  const cwdAvailableWidth = agentName
    ? textWidth - 1 - stringWidth(agentName) - 3
    : textWidth
  const truncatedCwd = truncatePath(cwd, Math.max(cwdAvailableWidth, 10))
  const skyLine = truncate(CONDENSED_SKYLINE, textWidth)
  const wakeLine = truncate(CONDENSED_WAKE, textWidth)

  return (
    <OffscreenFreeze>
      <Box
        flexDirection="row"
        gap={2}
        alignItems="center"
        backgroundColor="userMessageBackground"
        borderStyle="round"
        borderColor="openjawsOcean"
        paddingX={1}
      >
        <AnimatedClawd />
        <Box flexDirection="column">
          <Text>
            <Text color="openjawsOcean" bold>
              OPENJAWS
            </Text>{' '}
            <Text color="promptBorder" bold>
              // OPENCHEEKS
            </Text>{' '}
            <Text color="inactive">v{truncatedVersion}</Text>
          </Text>
          <Text color="clawd_body" bold>
            {skyLine}
          </Text>
          {shouldSplit ? (
            <>
              <Text color="inactive">{truncatedModel}</Text>
              <Text color="inactive">{truncatedBilling}</Text>
            </>
          ) : (
            <Text color="inactive">
              {truncatedModel} · {truncatedBilling}
            </Text>
          )}
          <Text color="inactive">
            {agentName ? `@${agentName} · ${truncatedCwd}` : truncatedCwd}
          </Text>
          <Text color="inactive">{wakeLine}</Text>
          {showGuestPassesUpsell && <GuestPassesUpsell />}
          {!showGuestPassesUpsell && showOverageCreditUpsell && (
            <OverageCreditUpsell maxWidth={textWidth} twoLine />
          )}
        </Box>
      </Box>
    </OffscreenFreeze>
  )
}
