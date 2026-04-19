import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js'

const STARTER_COMMANDS = [
  '/help',
  '/config',
  '/theme',
  '/privacy-settings',
  '/preview',
  '/apex',
] as const

export function General(): React.ReactNode {
  return (
    <Box flexDirection="column" paddingY={1} gap={1}>
      <Box>
        <Text>
          OpenJaws understands your codebase, makes edits with your permission,
          and runs commands right from your terminal.
        </Text>
      </Box>
      <Box flexDirection="column" gap={1}>
        <Box>
          <Text bold>Starter commands</Text>
        </Box>
        {STARTER_COMMANDS.map(command => (
          <Text key={command}>
            {command}
          </Text>
        ))}
      </Box>
      <Box flexDirection="column">
        <Box>
          <Text bold>Shortcuts</Text>
        </Box>
        <PromptInputHelpMenu gap={2} fixedWidth />
      </Box>
    </Box>
  )
}
