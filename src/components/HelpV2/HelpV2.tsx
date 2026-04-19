import * as React from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import { useShortcutDisplay } from 'src/keybindings/useShortcutDisplay.js'
import {
  builtInCommandNames,
  type Command,
  type CommandResultDisplay,
} from '../../commands.js'
import { useIsInsideModal } from '../../context/modalContext.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { Box, Link, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import { Pane } from '../design-system/Pane.js'
import { Tab, Tabs } from '../design-system/Tabs.js'
import { Commands } from './Commands.js'
import { General } from './General.js'

type Props = {
  onClose: (
    result?: string,
    options?: { display?: CommandResultDisplay },
  ) => void
  commands: Command[]
}

export function HelpV2({ onClose, commands }: Props): React.ReactNode {
  const { rows, columns } = useTerminalSize()
  const maxHeight = Math.floor(rows / 2)
  const insideModal = useIsInsideModal()

  const close = () => onClose('Help dialog dismissed', { display: 'system' })
  useKeybinding('help:dismiss', close, { context: 'Help' })
  const exitState = useExitOnCtrlCDWithKeybindings(close)
  const dismissShortcut = useShortcutDisplay('help:dismiss', 'Help', 'esc')

  const builtinNames = builtInCommandNames()
  const builtinCommands = commands.filter(
    command => builtinNames.has(command.name) && !command.isHidden,
  )
  const customCommands = commands.filter(
    command => !builtinNames.has(command.name) && !command.isHidden,
  )

  const tabs = [
    <Tab key="general" title="general">
      <General commands={builtinCommands} />
    </Tab>,
    <Tab key="commands" title="commands">
      <Commands
        commands={builtinCommands}
        maxHeight={maxHeight}
        columns={columns}
        title="Browse default commands:"
        onCancel={close}
      />
    </Tab>,
    <Tab key="custom" title="custom-commands">
      <Commands
        commands={customCommands}
        maxHeight={maxHeight}
        columns={columns}
        title="Browse custom commands:"
        emptyMessage="No custom commands found"
        onCancel={close}
      />
    </Tab>,
  ]

  return (
    <Box flexDirection="column" height={insideModal ? undefined : maxHeight}>
      <Pane color="professionalBlue">
        <Tabs
          title={`OpenJaws v${MACRO.VERSION}`}
          color="professionalBlue"
          defaultTab="general"
        >
          {tabs}
        </Tabs>
        <Box marginTop={1}>
          <Text>
            For more help: <Link url="https://code.openjaws.com/docs/en/overview" />
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>
            {exitState.pending ? (
              <>Press {exitState.keyName} again to exit</>
            ) : (
              <Text italic>{dismissShortcut} to cancel</Text>
            )}
          </Text>
        </Box>
      </Pane>
    </Box>
  )
}
