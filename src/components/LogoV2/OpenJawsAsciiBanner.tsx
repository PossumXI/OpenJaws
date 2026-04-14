import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'
import {
  getOpenJawsAsciiBannerWidth,
  OPENJAWS_ASCII_BANNER_COMPACT_LINES,
  OPENJAWS_ASCII_BANNER_LINES,
  OPENJAWS_ASCII_BANNER_ROW_COLORS,
  OPENJAWS_ASCII_TRIM_BOTTOM,
  OPENJAWS_ASCII_TRIM_TOP,
} from './openjawsBannerData.js'

export function OpenJawsAsciiBanner({
  maxWidth,
  compact = false,
}: {
  maxWidth?: number
  compact?: boolean
}): React.ReactNode {
  const lines = compact
    ? OPENJAWS_ASCII_BANNER_COMPACT_LINES
    : OPENJAWS_ASCII_BANNER_LINES
  const width = Math.max(18, maxWidth ?? getOpenJawsAsciiBannerWidth(compact))

  return (
    <Box flexDirection="column" alignItems="center">
      {!compact && (
        <Text color="clawd_background">
          {truncate(OPENJAWS_ASCII_TRIM_TOP, width)}
        </Text>
      )}
      {lines.map((line, index) => (
        <Text key={line} color={OPENJAWS_ASCII_BANNER_ROW_COLORS[index]} bold>
          {truncate(line, width)}
        </Text>
      ))}
      {!compact && (
        <Text color="promptBorder">
          {truncate(OPENJAWS_ASCII_TRIM_BOTTOM, width)}
        </Text>
      )}
    </Box>
  )
}
