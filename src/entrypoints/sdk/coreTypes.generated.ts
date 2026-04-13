export type PermissionMode =
  | 'default'
  | 'plan'
  | 'bypassPermissions'
  | 'auto'
  | 'bubble'

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'PermissionRequest'
  | 'PermissionDenied'
  | 'Setup'
  | 'TeammateIdle'
  | 'TaskCreated'
  | 'TaskCompleted'
  | 'Elicitation'
  | 'ElicitationResult'
  | 'ConfigChange'
  | 'WorktreeCreate'
  | 'WorktreeRemove'
  | 'InstructionsLoaded'
  | 'CwdChanged'
  | 'FileChanged'

export type ExitReason =
  | 'clear'
  | 'resume'
  | 'logout'
  | 'prompt_input_exit'
  | 'other'
  | 'bypass_permissions_disabled'

export type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
  costUSD: number
  contextWindow: number
  maxOutputTokens: number
}

export type PermissionResult = {
  behavior?: string
  updatedInput?: Record<string, unknown>
  reason?: string
}

export type PermissionUpdate = {
  permissionMode?: PermissionMode
  toolName?: string
  matcher?: string
}

export type HookInput = Record<string, unknown>

export type SyncHookJSONOutput = {
  continue?: boolean
  suppressOutput?: boolean
  stopReason?: string
  decision?: 'approve' | 'block'
  reason?: string
  systemMessage?: string
  hookSpecificOutput?: Record<string, unknown>
}

export type AsyncHookJSONOutput = {
  async: true
}

export type HookJSONOutput = SyncHookJSONOutput | AsyncHookJSONOutput

export type SDKMessageBase = {
  uuid: string
  session_id?: string
}

export type SDKUserMessage = SDKMessageBase & {
  type: 'user'
  message: { role?: 'user'; content: unknown }
}

export type SDKUserMessageReplay = SDKUserMessage & {
  parent_uuid?: string
}

export type SDKAssistantMessageError = {
  message?: string
}

export type SDKAssistantMessage = SDKMessageBase & {
  type: 'assistant'
  message: { role?: 'assistant'; content: unknown; usage?: unknown }
  error?: SDKAssistantMessageError
}

export type SDKPartialAssistantMessage = SDKMessageBase & {
  type: 'partial_assistant'
  event: unknown
}

export type SDKResultMessage = SDKMessageBase & {
  type: 'result'
  subtype?: string
  errors?: string[]
}

export type SDKSystemMessage = SDKMessageBase & {
  type: 'system'
  model?: string
}

export type SDKStatus = 'idle' | 'running' | 'compacting' | 'complete' | string

export type SDKStatusMessage = SDKMessageBase & {
  type: 'status'
  status?: SDKStatus
}

export type SDKToolProgressMessage = SDKMessageBase & {
  type: 'tool_progress'
  tool_name: string
  elapsed_time_seconds: number
}

export type SDKCompactBoundaryMessage = SDKMessageBase & {
  type: 'compact_boundary'
  metadata?: unknown
}

export type SDKPermissionDenial = SDKMessageBase & {
  type: 'permission_denial'
  tool_name?: string
  reason?: string
}

export type SDKSessionInfo = {
  sessionId: string
  title?: string
  cwd?: string
  updatedAt?: string
}

export type SDKMessage =
  | SDKUserMessage
  | SDKUserMessageReplay
  | SDKAssistantMessage
  | SDKPartialAssistantMessage
  | SDKResultMessage
  | SDKSystemMessage
  | SDKStatusMessage
  | SDKToolProgressMessage
  | SDKCompactBoundaryMessage
  | SDKPermissionDenial
