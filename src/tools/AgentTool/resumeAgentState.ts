import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'

export type ResumeAgentMetadataLike = {
  agentType: string
  description?: string
  resolvedAgentModel?: string
  permissionMode?: PermissionMode
  allowedTools?: string[]
}

export type ResumeAgentDefinitionLike = {
  agentType: string
  permissionMode?: PermissionMode
  model?: string
}

type AgentModelResolver = (
  agentModel: string | undefined,
  parentMainLoopModel: string,
  toolSpecifiedModel: string | undefined,
  permissionMode: PermissionMode,
) => string

export type ResolvedAgentResumeState<TAgent extends ResumeAgentDefinitionLike> = {
  selectedAgent: TAgent
  isResumedFork: boolean
  uiDescription: string
  resumedAllowedTools?: string[]
  workerPermissionMode: PermissionMode
  resolvedAgentModel: string
}

export function resolveAgentResumeState<TAgent extends ResumeAgentDefinitionLike>({
  meta,
  activeAgents,
  generalPurposeAgent,
  forkAgent,
  parentMainLoopModel,
  currentPermissionMode,
  resolveModel,
}: {
  meta: ResumeAgentMetadataLike | null
  activeAgents: TAgent[]
  generalPurposeAgent: TAgent
  forkAgent: TAgent
  parentMainLoopModel: string
  currentPermissionMode: PermissionMode
  resolveModel: AgentModelResolver
}): ResolvedAgentResumeState<TAgent> {
  let selectedAgent: TAgent
  let isResumedFork = false

  if (meta?.agentType === forkAgent.agentType) {
    selectedAgent = forkAgent
    isResumedFork = true
  } else if (meta?.agentType) {
    selectedAgent =
      activeAgents.find(agent => agent.agentType === meta.agentType) ??
      generalPurposeAgent
  } else {
    selectedAgent = generalPurposeAgent
  }

  const workerPermissionMode =
    meta?.permissionMode ?? selectedAgent.permissionMode ?? 'acceptEdits'

  return {
    selectedAgent,
    isResumedFork,
    uiDescription: meta?.description ?? '(resumed)',
    resumedAllowedTools: meta?.allowedTools,
    workerPermissionMode,
    resolvedAgentModel:
      meta?.resolvedAgentModel ??
      resolveModel(
        selectedAgent.model,
        parentMainLoopModel,
        undefined,
        meta?.permissionMode ?? currentPermissionMode,
      ),
  }
}
