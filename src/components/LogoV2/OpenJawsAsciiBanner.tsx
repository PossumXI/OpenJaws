import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { truncate } from '../../utils/format.js'

const ASCII_TRIM_TOP = ':: ocean-cut // opencheeks ::'
const ASCII_TRIM_BOTTOM = ':: flight deck // immaculate ::'

export const OPENJAWS_ASCII_BANNER_LINES = [
  '  ___   ___  ___ _  _ ',
  ' / _ \\ | _ \\| __| \\| |',
  '| (_) ||  _/| _|| .` |',
  ' \\___/ |_|  |___|_|\\_|',
  '    _   ___ __      __ ___ ',
  '   | | / / |\\ \\    / // __|',
  '   | |/ /| | \\/\\/ / \\__ \\',
  '   |___/ |_|  \\_/\\_/  |___/',
] as const

const LINE_COLORS = [
  'promptBorder',
  'openjawsOcean',
  'openjawsOceanShimmer',
  'clawd_body',
  'promptBorder',
  'openjawsOcean',
  'openjawsOceanShimmer',
  'clawd_body',
] as const

export function getOpenJawsAsciiBannerWidth(): number {
  return Math.max(
    ASCII_TRIM_TOP.length,
    ASCII_TRIM_BOTTOM.length,
    ...OPENJAWS_ASCII_BANNER_LINES.map(line => line.length),
  )
}

export function OpenJawsAsciiBanner({
  maxWidth,
  compact = false,
}: {
  maxWidth?: number
  compact?: boolean
}): React.ReactNode {
  const width = Math.max(18, maxWidth ?? getOpenJawsAsciiBannerWidth())

  return (
    <Box flexDirection="column" alignItems="center">
      {!compact && (
        <Text color="clawd_background">{truncate(ASCII_TRIM_TOP, width)}</Text>
      )}
      {OPENJAWS_ASCII_BANNER_LINES.map((line, index) => (
        <Text key={line} color={LINE_COLORS[index]} bold>
          {truncate(line, width)}
        </Text>
      ))}
      {!compact && (
        <Text color="promptBorder">
          {truncate(ASCII_TRIM_BOTTOM, width)}
        </Text>
      )}
    </Box>
  )
}
