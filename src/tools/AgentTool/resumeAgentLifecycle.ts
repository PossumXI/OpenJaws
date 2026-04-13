import type { Message } from '../../types/message.js'
import {
  filterOrphanedThinkingOnlyMessages,
  filterUnresolvedToolUses,
  filterWhitespaceOnlyAssistantMessages,
} from '../../utils/messages.js'

export function sanitizeResumedAgentMessages(messages: Message[]): Message[] {
  return filterWhitespaceOnlyAssistantMessages(
    filterOrphanedThinkingOnlyMessages(filterUnresolvedToolUses(messages)),
  )
}
