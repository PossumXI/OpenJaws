import React from 'react'
import { MessageResponse } from '../../components/MessageResponse.js'
import { Text } from '../../ink.js'
import type { BrowserPreviewToolInput, BrowserPreviewToolOutput } from './WebBrowserTool.js'

export function renderToolUseMessage(
  input: Partial<BrowserPreviewToolInput>,
): React.ReactNode {
  const target = input.url ?? input.sessionId ?? ''
  return `${input.action ?? 'browser'}${target ? ` ${target}` : ''}`
}

export function renderToolResultMessage(
  output: BrowserPreviewToolOutput,
): React.ReactNode {
  return (
    <MessageResponse>
      <Text>
        {output.ok ? 'Browser preview ready' : 'Browser preview blocked'}{' '}
        <Text dimColor>({output.summary})</Text>
      </Text>
    </MessageResponse>
  )
}
