import React from 'react'
import { Box, Text, useTheme } from 'src/ink.js'
import { AnimatedClawd } from './AnimatedClawd.js'

const WELCOME_V2_WIDTH = 86
const LIGHT_THEMES = new Set([
  'light',
  'opencheeks-light',
  'light-daltonized',
  'light-ansi',
])

export function WelcomeV2(): React.ReactNode {
  const [theme] = useTheme()
  const isLightTheme = LIGHT_THEMES.has(theme)

  const skyLine = isLightTheme
    ? '~~~~ ocean-blue water under an egg-yolk morning sky ~~~~'
    : '~~~~~ ocean-blue water under a black midnight sky ~~~~'

  const wakeLine = '~~~~~ shark breaching high above the ocean wake ~~~~~'
  const deckLine = 'OPENCHEEKS // ANSI-SHADOW FLIGHT DECK // IMMACULATE'

  return (
    <Box width={WELCOME_V2_WIDTH} flexDirection="column">
      <Text>
        <Text color="openjawsOcean">Welcome to OpenJaws </Text>
        <Text color="inactive">v{MACRO.VERSION}</Text>
      </Text>
      <Text color="openjawsOcean">{skyLine}</Text>
      <Box alignItems="center" marginY={1}>
        <AnimatedClawd />
      </Box>
      <Text color="clawd_body" bold>
        {deckLine}
      </Text>
      <Text color="inactive">{wakeLine}</Text>
    </Box>
  )
}
