import React from 'react'
import { Box, Text } from '../../ink.js'
import type { Theme } from '../../utils/theme.js'
import ThemedBox from '../design-system/ThemedBox.js'

export type TaskReceiptItem = {
  label: string
  value: React.ReactNode
  color?: keyof Theme
}

type TaskDetailSectionProps = {
  title: string
  children: React.ReactNode
  marginTop?: number
}

export function TaskDetailSection({
  title,
  children,
  marginTop = 1,
}: TaskDetailSectionProps): React.ReactNode {
  return (
    <ThemedBox
      flexDirection="column"
      marginTop={marginTop}
      borderStyle="round"
      borderColor="promptBorder"
      backgroundColor="userMessageBackground"
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text
          bold
          color="promptBorder"
          backgroundColor="messageActionsBackground"
        >
          {' '}
          {title.toUpperCase()}
          {' '}
        </Text>
      </Box>
      {children}
    </ThemedBox>
  )
}

export function TaskReceiptList({
  items,
}: {
  items: readonly TaskReceiptItem[]
}): React.ReactNode {
  if (items.length === 0) {
    return null
  }

  return (
    <Box flexDirection="column">
      {items.map(item => (
        <Box key={item.label}>
          <Text color={item.color ?? 'openjawsOcean'} bold>
            {item.label}
          </Text>
          <Text color="inactive"> · </Text>
          <Text wrap="wrap">{item.value}</Text>
        </Box>
      ))}
    </Box>
  )
}
