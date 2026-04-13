import { describe, expect, test } from 'bun:test'
import {
  buildLocalAgentReceipt,
  buildTeammateReceipt,
} from './backgroundTaskReceipts.js'

describe('backgroundTaskReceipts', () => {
  test('builds compact local-agent receipts with queue and focus', () => {
    const receipt = buildLocalAgentReceipt(
      {
        status: 'running',
        model: 'openai:gpt-5.4',
        pendingMessages: ['note 1', 'note 2'],
        progress: {
          toolUseCount: 7,
          tokenCount: 12500,
          summary: 'repairing tool-call retry path',
        },
      },
      200,
    )

    expect(receipt).toBe(
      'openai:gpt-5.4 · 2 queued notes · 7 tools · 12.5k tok · repairing tool-call retry path',
    )
  })

  test('uses failure text as the local-agent focus when available', () => {
    const receipt = buildLocalAgentReceipt(
      {
        status: 'failed',
        model: 'gemini:gemini-3.1-pro-preview',
        pendingMessages: [],
        error: 'provider rejected tool round',
      },
      200,
    )

    expect(receipt).toBe(
      'gemini:gemini-3.1-pro-preview · provider rejected tool round',
    )
  })

  test('builds teammate receipts with mode and queued note count', () => {
    const receipt = buildTeammateReceipt(
      {
        model: 'openai:gpt-5.4',
        permissionMode: 'acceptEdits',
        pendingUserMessages: ['supervise this'],
        progress: {
          toolUseCount: 3,
          tokenCount: 4200,
        },
      },
      200,
    )

    expect(receipt).toBe(
      'openai:gpt-5.4 · mode builder · 1 queued note · 3 tools · 4.2k tok',
    )
  })

  test('can hide queued and tool counts once the row promotes them to badges', () => {
    const receipt = buildLocalAgentReceipt(
      {
        status: 'running',
        model: 'openai:gpt-5.4',
        pendingMessages: ['note 1'],
        progress: {
          toolUseCount: 9,
          tokenCount: 12500,
          summary: 'repairing tool-call retry path',
        },
      },
      200,
      {
        hideQueuedCount: true,
        hideToolCount: true,
      },
    )

    expect(receipt).toBe(
      'openai:gpt-5.4 · 12.5k tok · repairing tool-call retry path',
    )
  })

  test('promotes focus, tools, and queued notes first for selected local-agent rows', () => {
    const receipt = buildLocalAgentReceipt(
      {
        status: 'running',
        model: 'openai:gpt-5.4',
        pendingMessages: ['note 1', 'note 2'],
        progress: {
          toolUseCount: 7,
          tokenCount: 12500,
          summary: 'repairing tool-call retry path',
        },
      },
      200,
      {
        order: 'selected',
      },
    )

    expect(receipt).toBe(
      'repairing tool-call retry path · 7 tools · 2 queued notes · openai:gpt-5.4 · 12.5k tok',
    )
  })

  test('promotes active tool pressure and supervision first for selected teammate rows', () => {
    const receipt = buildTeammateReceipt(
      {
        model: 'openai:gpt-5.4',
        permissionMode: 'acceptEdits',
        pendingUserMessages: ['supervise this'],
        progress: {
          toolUseCount: 3,
          tokenCount: 4200,
        },
      },
      200,
      {
        order: 'selected',
      },
    )

    expect(receipt).toBe(
      '3 tools · 1 queued note · mode builder · openai:gpt-5.4 · 4.2k tok',
    )
  })
})
