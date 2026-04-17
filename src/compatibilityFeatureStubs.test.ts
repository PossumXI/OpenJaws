import { describe, expect, test } from 'bun:test'
import {
  getAssistantActivationPath,
  getAssistantSystemPromptAddendum,
  initializeAssistantTeam,
  isAssistantForced,
  isAssistantMode,
  markAssistantForced,
} from './assistant/index.js'
import { isKairosEnabled } from './assistant/gate.js'
import proactiveCommand from './commands/proactive.js'
import {
  activateProactive,
  deactivateProactive,
  getNextTickAt,
  isContextBlocked,
  isProactiveActive,
  isProactivePaused,
  pauseProactive,
  resumeProactive,
  setContextBlocked,
} from './proactive/index.js'
import { useProactive } from './proactive/useProactive.js'

describe('feature compatibility stubs', () => {
  test('keeps assistant mode inert in compatibility builds', async () => {
    expect(isAssistantForced()).toBe(false)
    markAssistantForced()
    expect(isAssistantForced()).toBe(true)
    expect(isAssistantMode()).toBe(false)
    await expect(initializeAssistantTeam()).resolves.toBeUndefined()
    expect(getAssistantSystemPromptAddendum()).toBe('')
    expect(getAssistantActivationPath()).toBeUndefined()
    await expect(isKairosEnabled()).resolves.toBe(false)
  })

  test('keeps proactive runtime explicit but inert by default', async () => {
    deactivateProactive()
    setContextBlocked(false)

    expect(isProactiveActive()).toBe(false)
    expect(isProactivePaused()).toBe(false)
    expect(isContextBlocked()).toBe(false)
    expect(getNextTickAt()).toBeNull()

    activateProactive('command')
    expect(isProactiveActive()).toBe(true)

    pauseProactive()
    expect(isProactivePaused()).toBe(true)

    resumeProactive()
    expect(isProactivePaused()).toBe(false)

    setContextBlocked(true)
    expect(isContextBlocked()).toBe(true)

    useProactive({
      isLoading: false,
      queuedCommandsLength: 0,
      hasActiveLocalJsxUI: false,
      isInPlanMode: false,
      onSubmitTick: () => {},
      onQueueTick: () => {},
    })

    const loaded = await proactiveCommand.load()
    const result = await loaded.call()
    expect(proactiveCommand.isEnabled?.()).toBe(false)
    expect(result).toEqual({
      type: 'text',
      value:
        'Proactive mode is unavailable in this OpenJaws compatibility build.',
    })

    deactivateProactive()
    expect(isProactiveActive()).toBe(false)
    expect(isProactivePaused()).toBe(false)
    expect(isContextBlocked()).toBe(false)
  })
})
