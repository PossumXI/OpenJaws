import {
  buildOpenAICompatibleAssistantContent,
  buildOpenAICompatibleMessages,
  mapOpenAICompatibleStopReason,
  type ExternalConversationMessageLike,
  type OpenAICompatibleAssistantContentBlock,
  type OpenAICompatibleMessage,
  type OpenAICompatibleResponse,
  type SystemBlock,
} from './externalInterop.js'

export type OpenAICompatibleReplayFixture = {
  request?: {
    system: SystemBlock[]
    messages: ExternalConversationMessageLike[]
  }
  response?: OpenAICompatibleResponse
}

export type OpenAICompatibleReplayResult = {
  outgoingMessages: OpenAICompatibleMessage[]
  assistantContent: OpenAICompatibleAssistantContentBlock[]
  stopReason: ReturnType<typeof mapOpenAICompatibleStopReason>
}

export function replayOpenAICompatibleFixture(
  fixture: OpenAICompatibleReplayFixture,
): OpenAICompatibleReplayResult {
  return {
    outgoingMessages: fixture.request
      ? buildOpenAICompatibleMessages(fixture.request)
      : [],
    assistantContent: fixture.response
      ? buildOpenAICompatibleAssistantContent(fixture.response)
      : [],
    stopReason: fixture.response
      ? mapOpenAICompatibleStopReason(fixture.response)
      : null,
  }
}
