import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { z } from 'zod/v4'
import type {
  SDKMessage,
  SDKSessionInfo,
  SDKUserMessage,
} from './coreTypes.generated.js'

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export type AnyZodRawShape = z.ZodRawShape

export type InferShape<Schema extends AnyZodRawShape> = z.infer<
  z.ZodObject<Schema>
>

export type SdkMcpToolDefinition<Schema extends AnyZodRawShape> = {
  name: string
  description: string
  inputSchema: Schema
  handler: (args: InferShape<Schema>, extra: unknown) => Promise<CallToolResult>
}

export type McpSdkServerConfigWithInstance = {
  name?: string
  version?: string
  tools?: Array<SdkMcpToolDefinition<any>>
}

export type SDKSessionOptions = Record<string, unknown>
export type SDKSession = Record<string, unknown>
export type Options = Record<string, unknown>
export type InternalOptions = Record<string, unknown>
export type Query = AsyncIterable<SDKMessage>
export type InternalQuery = AsyncIterable<SDKMessage>
export type SessionMessage = SDKMessage
export type SessionMutationOptions = Record<string, unknown>
export type GetSessionInfoOptions = Record<string, unknown>
export type GetSessionMessagesOptions = Record<string, unknown>
export type ListSessionsOptions = Record<string, unknown>
export type ForkSessionOptions = Record<string, unknown>
export type ForkSessionResult = { sessionId?: string }

export type SDKResultMessage = Extract<SDKMessage, { type: 'result' }>
export type SDKUserMessageType = SDKUserMessage
export type SDKSessionInfoType = SDKSessionInfo
