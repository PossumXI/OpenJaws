import { getInitialSettings } from './settings/settings.js'

export const IMMACULATE_MODES = ['balanced', 'strict'] as const

export type ImmaculateMode = (typeof IMMACULATE_MODES)[number]

const IMMACULATE_HEADER = '# Immaculate orchestration'

type ImmaculateSettingsLike = {
  immaculate?: {
    enabled?: boolean
    mode?: string
  }
} | null | undefined

export function isImmaculateMode(value: string): value is ImmaculateMode {
  return IMMACULATE_MODES.includes(value as ImmaculateMode)
}

export function isImmaculateEnabled(
  settings: ImmaculateSettingsLike = getInitialSettings(),
): boolean {
  return settings?.immaculate?.enabled !== false
}

export function getImmaculateMode(
  settings: ImmaculateSettingsLike = getInitialSettings(),
): ImmaculateMode {
  const mode = settings?.immaculate?.mode
  return typeof mode === 'string' && isImmaculateMode(mode)
    ? mode
    : 'balanced'
}

export function getImmaculateStatus(
  settings: ImmaculateSettingsLike = getInitialSettings(),
): {
  enabled: boolean
  mode: ImmaculateMode
  label: string
} {
  const enabled = isImmaculateEnabled(settings)
  const mode = getImmaculateMode(settings)
  return {
    enabled,
    mode,
    label: enabled ? `on · ${mode}` : `off · ${mode}`,
  }
}

export function buildImmaculateSystemPrompt(
  settings: ImmaculateSettingsLike = getInitialSettings(),
): string | null {
  if (!isImmaculateEnabled(settings)) {
    return null
  }

  const mode = getImmaculateMode(settings)
  const items = [
    'Operate with an explicit execution loop: identify the requested end state, inspect the current state, choose the narrowest viable path, act, verify, then deliver.',
    'Inspect before changing. Prefer direct evidence from files, commands, tests, and tool output over assumptions or remembered structure.',
    'When a task depends on packages, APIs, frameworks, security posture, deployment targets, or prior art, research the current state first. Prefer authoritative primary sources, concrete version checks, and direct environment evidence over stale memory.',
    'Default to up-to-date implementation choices. Before adding or changing dependencies, tooling, model routing, or security-sensitive behavior, check what exists now, who already solved something similar, and whether there is a maintained best-practice path.',
    'Use tools surgically. Pick the smallest tool that answers the question, batch independent reads when useful, and avoid duplicate or low-signal tool calls.',
    'Treat Immaculate as the default orchestration substrate for provider and model routing, openckeek agent delegation, tool calls, command execution, web search and scrubbing, builds and compiles, and training or fine-tuning workflows.',
    'When the Immaculate harness is relevant and the ImmaculateHarness tool is available, use it directly for orchestration state and control instead of shelling out or reconstructing that state indirectly.',
    'Keep orchestration legible. When work spans steps, tools, or agents, preserve a short working plan and keep side work tied to the main objective.',
    'Verify before claiming success. Run the relevant command, test, or observable check. If verification is blocked, say exactly what could not be verified and why.',
    'Do not silently paper over degraded states, missing dependencies, fallback behavior, or provider/tool failures. Surface the condition and the next best action.',
    ...(mode === 'strict'
      ? [
          'In strict mode, treat conflicting or partial results as unverified until confirmed by another direct check.',
          'In strict mode, prefer failing closed over guessing when tool output, environment state, or provider responses are ambiguous.',
        ]
      : []),
  ]

  return [IMMACULATE_HEADER, ...items.map(item => `- ${item}`)].join('\n')
}

export function appendImmaculateSystemPrompt(
  promptParts: string[],
  settings: ImmaculateSettingsLike = getInitialSettings(),
): string[] {
  const immaculatePrompt = buildImmaculateSystemPrompt(settings)
  if (!immaculatePrompt) {
    return [...promptParts]
  }
  if (promptParts.some(part => part.includes(IMMACULATE_HEADER))) {
    return [...promptParts]
  }
  return [...promptParts, immaculatePrompt]
}
