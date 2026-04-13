import { describe, expect, it } from 'bun:test'
import {
  getCoordinatorTaskCount,
  getVisibleAgentTasks,
} from './coordinatorTaskModel.js'

function makeLocalAgentTask({
  id,
  startTime,
  agentType = 'worker',
  evictAfter,
}: {
  id: string
  startTime: number
  agentType?: string
  evictAfter?: number
}) {
  return {
    id,
    type: 'local_agent' as const,
    agentId: id,
    prompt: '',
    agentType,
    status: 'running' as const,
    description: id,
    startTime,
    outputFile: '',
    outputOffset: 0,
    notified: false,
    retrieved: false,
    lastReportedToolCount: 0,
    lastReportedTokenCount: 0,
    isBackgrounded: true,
    pendingMessages: [],
    retain: false,
    diskLoaded: false,
    evictAfter,
  }
}

describe('CoordinatorTaskPanel helpers', () => {
  it('filters to visible panel-managed agent tasks and sorts by start time', () => {
    const tasks = {
      shell: {
        id: 'shell',
        type: 'local_bash' as const,
      },
      hidden: makeLocalAgentTask({
        id: 'hidden',
        startTime: 30,
        evictAfter: 0,
      }),
      main: makeLocalAgentTask({
        id: 'main',
        startTime: 10,
        agentType: 'main-session',
      }),
      later: makeLocalAgentTask({
        id: 'later',
        startTime: 20,
      }),
      early: makeLocalAgentTask({
        id: 'early',
        startTime: 5,
      }),
    }

    expect(getVisibleAgentTasks(tasks as never).map(task => task.id)).toEqual([
      'early',
      'later',
    ])
  })

  it('includes the main bridge row in coordinator task count', () => {
    const emptyTasks = {}
    const activeTasks = {
      workerA: makeLocalAgentTask({
        id: 'workerA',
        startTime: 1,
      }),
      workerB: makeLocalAgentTask({
        id: 'workerB',
        startTime: 2,
      }),
    }

    expect(getCoordinatorTaskCount(emptyTasks as never)).toBe(0)
    expect(getCoordinatorTaskCount(activeTasks as never)).toBe(3)
  })
})
