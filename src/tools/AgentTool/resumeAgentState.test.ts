import { describe, expect, test } from 'bun:test'
import type { PermissionMode } from '../../utils/permissions/PermissionMode.js'
import {
  resolveAgentResumeState,
  type ResumeAgentDefinitionLike,
  type ResumeAgentMetadataLike,
} from './resumeAgentState.js'

function makeAgent(
  overrides: Partial<ResumeAgentDefinitionLike> &
    Pick<ResumeAgentDefinitionLike, 'agentType'>,
): ResumeAgentDefinitionLike {
  return {
    agentType: overrides.agentType,
    ...overrides,
  }
}

function makeMeta(
  overrides: Partial<ResumeAgentMetadataLike> = {},
): ResumeAgentMetadataLike {
  return {
    agentType: 'researcher',
    ...overrides,
  }
}

describe('resolveAgentResumeState', () => {
  test('restores fork agents from metadata', () => {
    const result = resolveAgentResumeState({
      meta: makeMeta({ agentType: 'fork' }),
      activeAgents: [],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: () => 'resolved',
    })

    expect(result.isResumedFork).toBe(true)
    expect(result.selectedAgent.agentType).toBe('fork')
  })

  test('falls back to general-purpose agent when metadata points at a missing agent', () => {
    const result = resolveAgentResumeState({
      meta: makeMeta({ agentType: 'missing-agent' }),
      activeAgents: [],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: () => 'resolved',
    })

    expect(result.isResumedFork).toBe(false)
    expect(result.selectedAgent.agentType).toBe('general-purpose')
  })

  test('preserves stored resolved model without re-resolving', () => {
    let calls = 0
    const result = resolveAgentResumeState({
      meta: makeMeta({
        resolvedAgentModel: 'gemini:gemini-3.1-pro-preview',
      }),
      activeAgents: [makeAgent({ agentType: 'researcher' })],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: () => {
        calls++
        return 'unexpected'
      },
    })

    expect(result.resolvedAgentModel).toBe('gemini:gemini-3.1-pro-preview')
    expect(calls).toBe(0)
  })

  test('uses stored permission mode for model resolution when present', () => {
    const calls: PermissionMode[] = []
    resolveAgentResumeState({
      meta: makeMeta({
        permissionMode: 'plan',
      }),
      activeAgents: [makeAgent({ agentType: 'researcher' })],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: (_agentModel, _parentModel, _toolSpecifiedModel, mode) => {
        calls.push(mode)
        return 'resolved'
      },
    })

    expect(calls).toEqual(['plan'])
  })

  test('falls back to current permission mode for model resolution when metadata lacks one', () => {
    const calls: PermissionMode[] = []
    resolveAgentResumeState({
      meta: makeMeta(),
      activeAgents: [
        makeAgent({ agentType: 'researcher', permissionMode: 'plan' }),
      ],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'acceptEdits',
      resolveModel: (_agentModel, _parentModel, _toolSpecifiedModel, mode) => {
        calls.push(mode)
        return 'resolved'
      },
    })

    expect(calls).toEqual(['acceptEdits'])
  })

  test('uses metadata permission and allow rules for worker resume context', () => {
    const result = resolveAgentResumeState({
      meta: makeMeta({
        description: 'continue long-running review',
        permissionMode: 'plan',
        allowedTools: ['Read', 'Bash(git:*)'],
      }),
      activeAgents: [makeAgent({ agentType: 'researcher' })],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: () => 'resolved',
    })

    expect(result.uiDescription).toBe('continue long-running review')
    expect(result.workerPermissionMode).toBe('plan')
    expect(result.resumedAllowedTools).toEqual(['Read', 'Bash(git:*)'])
  })

  test('falls back to agent default permission mode, then acceptEdits', () => {
    const planned = resolveAgentResumeState({
      meta: makeMeta(),
      activeAgents: [
        makeAgent({ agentType: 'researcher', permissionMode: 'plan' }),
      ],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: () => 'resolved',
    })
    const defaulted = resolveAgentResumeState({
      meta: null,
      activeAgents: [],
      generalPurposeAgent: makeAgent({ agentType: 'general-purpose' }),
      forkAgent: makeAgent({ agentType: 'fork' }),
      parentMainLoopModel: 'openai:gpt-5.4',
      currentPermissionMode: 'default',
      resolveModel: () => 'resolved',
    })

    expect(planned.workerPermissionMode).toBe('plan')
    expect(defaulted.workerPermissionMode).toBe('acceptEdits')
  })
})
