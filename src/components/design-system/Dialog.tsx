import React from 'react'
import type { ExitState } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { useExitOnCtrlCDWithKeybindings } from '../../hooks/useExitOnCtrlCDWithKeybindings.js'
import { Box, Text } from '../../ink.js'
import { useKeybinding } from '../../keybindings/useKeybinding.js'
import type { Theme } from '../../utils/theme.js'
import { ConfigurableShortcutHint } from '../ConfigurableShortcutHint.js'
import { Byline } from './Byline.js'
import { KeyboardShortcutHint } from './KeyboardShortcutHint.js'
import { Pane } from './Pane.js'
import ThemedBox from './ThemedBox.js'

type Props = {
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  onCancel: () => void
  color?: keyof Theme
  hideInputGuide?: boolean
  hideBorder?: boolean
  inputGuide?: (exitState: ExitState) => React.ReactNode
  isCancelActive?: boolean
}

function renderInlineNode(
  node: React.ReactNode,
  textProps: React.ComponentProps<typeof Text> = {},
): React.ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return <Text {...textProps}>{node}</Text>
  }

  return node
}

function renderDefaultInputGuide(isCancelActive: boolean): React.ReactNode {
  if (!isCancelActive) {
    return <KeyboardShortcutHint shortcut="Enter" action="confirm" />
  }

  return (
    <Byline>
      <KeyboardShortcutHint shortcut="Enter" action="confirm" />
      <ConfigurableShortcutHint
        action="confirm:no"
        context="Confirmation"
        fallback="Esc"
        description="cancel"
      />
    </Byline>
  )
}

export function Dialog({
  title,
  subtitle,
  children,
  onCancel,
  color,
  hideInputGuide = false,
  hideBorder = false,
  inputGuide,
  isCancelActive = true,
}: Props): React.ReactNode {
  const exitState = useExitOnCtrlCDWithKeybindings(
    undefined,
    undefined,
    isCancelActive,
  )

  useKeybinding('confirm:no', onCancel, {
    context: 'Confirmation',
    isActive: isCancelActive,
  })

  const guide =
    hideInputGuide === true
      ? null
      : (inputGuide?.(exitState) ?? renderDefaultInputGuide(isCancelActive))

  const content = (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <ThemedBox
          borderStyle="round"
          borderColor={color ?? 'promptBorder'}
          backgroundColor="messageActionsBackground"
          paddingX={1}
          alignSelf="flex-start"
        >
          {renderInlineNode(title, { bold: true })}
        </ThemedBox>
        {subtitle ? (
          <Box marginTop={1}>
            {renderInlineNode(subtitle, { color: 'inactive' })}
          </Box>
        ) : null}
      </Box>

      <Box flexDirection="column" gap={1}>
        {children}
      </Box>

      {guide ? (
        <Box marginTop={1}>
          <Text dimColor>{guide}</Text>
        </Box>
      ) : null}
    </Box>
  )

  if (hideBorder) {
    return content
  }

  return <Pane color={color}>{content}</Pane>
}
