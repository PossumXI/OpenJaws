import { describe, expect, it } from 'bun:test'
import type { QueuedCommand } from '../../types/textInputTypes.js'
import {
  createOverflowTaskNotificationMessage,
  processQueuedCommandsForPreview,
} from './queuedNotificationOverflow.js'

function makeQueuedCommand(
  value: string,
  mode: QueuedCommand['mode'],
): QueuedCommand {
  return { value, mode }
}

describe('queuedNotificationOverflow', () => {
  it('filters idle notifications out of the preview', () => {
    const processed = processQueuedCommandsForPreview([
      makeQueuedCommand('{"type":"idle_notification"}', 'task-notification'),
      makeQueuedCommand('/status', 'prompt'),
    ])

    expect(processed).toEqual([makeQueuedCommand('/status', 'prompt')])
  })

  it('caps task notifications without reordering surrounding commands', () => {
    const processed = processQueuedCommandsForPreview([
      makeQueuedCommand(
        '<task-notification><summary>Agent "a" done</summary><status>completed</status></task-notification>',
        'task-notification',
      ),
      makeQueuedCommand('/init', 'prompt'),
      makeQueuedCommand(
        '<task-notification><summary>Agent "b" done</summary><status>completed</status></task-notification>',
        'task-notification',
      ),
      makeQueuedCommand(
        '<task-notification><summary>Agent "c" retry</summary><status>failed</status></task-notification>',
        'task-notification',
      ),
      makeQueuedCommand('/status', 'prompt'),
      makeQueuedCommand(
        '<task-notification><summary>Agent "d" watch: waiting for input</summary></task-notification>',
        'task-notification',
      ),
    ])

    expect(processed.map(cmd => cmd.mode)).toEqual([
      'task-notification',
      'prompt',
      'task-notification',
      'task-notification',
      'prompt',
    ])
    expect(processed[1]?.value).toBe('/init')
    expect(processed[4]?.value).toBe('/status')
    expect(String(processed[3]?.value)).toContain(
      '+2 more task receipts · 1 retry · 1 waiting',
    )
  })

  it('builds overflow receipts with the shared pressure summary', () => {
    const message = createOverflowTaskNotificationMessage([
      makeQueuedCommand(
        '<task-notification><summary>Agent "b" retry</summary><status>failed</status></task-notification>',
        'task-notification',
      ),
      makeQueuedCommand(
        '<task-notification><summary>Agent "d" watch: waiting for input</summary></task-notification>',
        'task-notification',
      ),
    ])

    expect(message).toContain('+2 more task receipts · 1 retry · 1 waiting')
    expect(message).toContain('<status>failed</status>')
  })
})
