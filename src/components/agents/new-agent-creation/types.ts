import type { AgentColorName } from '../../../tools/AgentTool/agentColorManager.js'
import type { AgentMemoryScope } from '../../../tools/AgentTool/agentMemory.js'
import type { CustomAgentDefinition } from '../../../tools/AgentTool/loadAgentsDir.js'
import type { SettingSource } from '../../../utils/settings/constants.js'

export type GeneratedAgentDraft = {
  identifier: string
  whenToUse: string
  systemPrompt: string
}

export type AgentWizardData = {
  agentType?: string
  finalAgent?: CustomAgentDefinition
  generatedAgent?: GeneratedAgentDraft
  generationPrompt?: string
  isGenerating?: boolean
  location?: SettingSource
  selectedColor?: AgentColorName
  selectedMemory?: AgentMemoryScope
  selectedModel?: string
  selectedTools?: string[]
  systemPrompt?: string
  wasGenerated?: boolean
  whenToUse?: string
}
