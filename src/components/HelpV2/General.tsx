import * as React from 'react'
import { formatDescriptionWithSource } from '../../commands.js'
import { Box, Text } from '../../ink.js'
import { type Command } from '../../types/command.js'
import { PromptInputHelpMenu } from '../PromptInput/PromptInputHelpMenu.js'
import {
  formatCommandAliases,
  formatCommandUsage,
  resolveQuickStartCommands,
} from './commandPresentation.js'

type Props = {
  commands: Command[]
}

export function General({ commands }: Props): React.ReactNode {
  const quickStartCommands = resolveQuickStartCommands(commands)

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
          <Text bold>Quick start</Text>
        </Box>
        <Text dimColor>
          Type / in the prompt to search commands, then keep typing to narrow
          the list.
        </Text>
        {quickStartCommands.map(command => {
          const aliasText = formatCommandAliases(command)
          return (
            <Box key={command.name} flexDirection="column">
              <Text bold>{formatCommandUsage(command)}</Text>
              <Text>{formatDescriptionWithSource(command)}</Text>
              {aliasText ? <Text dimColor>{aliasText}</Text> : null}
            </Box>
          )
        })}
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
