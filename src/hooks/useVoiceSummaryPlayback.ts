import { useEffect, useRef } from 'react'
import { useNotifications } from '../context/notifications.js'
import type { Message } from '../types/message.js'
import { getContentText } from '../utils/messages.js'
import { useAppState } from '../state/AppState.js'
import { speakWithElevenLabs } from '../services/voiceOutput.js'

type Args = {
  isLoading: boolean
  lastQueryCompletionTime: number
  messages: Message[]
}

function getLatestAssistantSummary(messages: Message[]): string | null {
  const lastAssistant = messages.findLast(message => message.type === 'assistant')
  if (!lastAssistant || lastAssistant.type !== 'assistant') {
    return null
  }

  return getContentText(lastAssistant.message.content)
}

export function useVoiceSummaryPlayback({
  isLoading,
  lastQueryCompletionTime,
  messages,
}: Args): void {
  const enabled = useAppState(state => state.settings.voiceOutputEnabled === true)
  const lastSpokenTurnRef = useRef<number>(0)
  const { addNotification } = useNotifications()

  useEffect(() => {
    if (!enabled || isLoading || lastQueryCompletionTime === 0) {
      return
    }
    if (lastSpokenTurnRef.current === lastQueryCompletionTime) {
      return
    }

    const summary = getLatestAssistantSummary(messages)
    if (!summary) {
      return
    }

    lastSpokenTurnRef.current = lastQueryCompletionTime
    void speakWithElevenLabs(summary).catch(error => {
      addNotification({
        key: 'voice-output-error',
        text:
          error instanceof Error
            ? error.message
            : 'Voice output failed to synthesize.',
        color: 'error',
        priority: 'medium',
        timeoutMs: 8_000,
      })
    })
  }, [addNotification, enabled, isLoading, lastQueryCompletionTime, messages])
}
