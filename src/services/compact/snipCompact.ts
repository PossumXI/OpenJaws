import type { Message } from '../../types/message.js'

export type SnipCompactResult = {
  messages: Message[]
  tokensFreed: number
  boundaryMessage?: Message
}

export function snipCompactIfNeeded(
  messages: Message[],
  _options?: { force?: boolean },
): SnipCompactResult {
  return {
    messages,
    tokensFreed: 0,
  }
}

export function isSnipMarkerMessage(_message: Message): boolean {
  return false
}
