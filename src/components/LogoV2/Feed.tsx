import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { stringWidth } from '../../ink/stringWidth.js'
import { truncate } from '../../utils/format.js'
import ThemedBox from '../design-system/ThemedBox.js'

export type FeedLine = {
  text: string
  timestamp?: string
}

export type FeedConfig = {
  title: string
  lines: FeedLine[]
  footer?: string
  emptyMessage?: string
  customContent?: {
    content: React.ReactNode
    width: number
  }
}

type FeedProps = {
  config: FeedConfig
  actualWidth: number
}

export function calculateFeedWidth(config: FeedConfig): number {
  const { title, lines, footer, emptyMessage, customContent } = config

  let maxWidth = stringWidth(title)

  if (customContent !== undefined) {
    maxWidth = Math.max(maxWidth, customContent.width)
  } else if (lines.length === 0 && emptyMessage) {
    maxWidth = Math.max(maxWidth, stringWidth(emptyMessage))
  } else {
    const gap = '  '
    const maxTimestampWidth = Math.max(
      0,
      ...lines.map(line => (line.timestamp ? stringWidth(line.timestamp) : 0)),
    )

    for (const line of lines) {
      const timestampWidth = maxTimestampWidth > 0 ? maxTimestampWidth : 0
      const lineWidth =
        stringWidth(line.text) +
        (timestampWidth > 0 ? timestampWidth + gap.length : 0)
      maxWidth = Math.max(maxWidth, lineWidth)
    }
  }

  if (footer) {
    maxWidth = Math.max(maxWidth, stringWidth(footer))
  }

  return maxWidth + 4
}

export function Feed({ config, actualWidth }: FeedProps): React.ReactNode {
  const { title, lines, footer, emptyMessage, customContent } = config

  const gap = '  '
  const innerWidth = Math.max(10, actualWidth - 4)
  const maxTimestampWidth = Math.max(
    0,
    ...lines.map(line => (line.timestamp ? stringWidth(line.timestamp) : 0)),
  )

  return (
    <ThemedBox
      flexDirection="column"
      width={actualWidth}
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

      {customContent ? (
        <>
          {customContent.content}
          {footer ? (
            <Text color="inactive" italic>
              {truncate(footer, innerWidth)}
            </Text>
          ) : null}
        </>
      ) : lines.length === 0 && emptyMessage ? (
        <Text color="inactive">{truncate(emptyMessage, innerWidth)}</Text>
      ) : (
        <>
          {lines.map((line, index) => {
            const textWidth = Math.max(
              10,
              innerWidth -
                (maxTimestampWidth > 0 ? maxTimestampWidth + gap.length : 0),
            )

            return (
              <Text key={index}>
                {maxTimestampWidth > 0 ? (
                  <>
                    <Text color="inactive">
                      {(line.timestamp || '').padEnd(maxTimestampWidth)}
                    </Text>
                    {gap}
                  </>
                ) : null}
                <Text color="text">{truncate(line.text, textWidth)}</Text>
              </Text>
            )
          })}
          {footer ? (
            <Text color="inactive" italic>
              {truncate(footer, innerWidth)}
            </Text>
          ) : null}
        </>
      )}
    </ThemedBox>
  )
}
