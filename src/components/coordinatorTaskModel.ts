type CoordinatorTaskLike = {
  type: 'local_agent'
  agentType: string
  evictAfter?: number
  startTime: number
}

function isVisibleCoordinatorTask<T extends CoordinatorTaskLike>(
  task: T | unknown,
): task is T {
  return (
    typeof task === 'object' &&
    task !== null &&
    'type' in task &&
    task.type === 'local_agent' &&
    'agentType' in task &&
    task.agentType !== 'main-session' &&
    (!('evictAfter' in task) || task.evictAfter !== 0) &&
    'startTime' in task &&
    typeof task.startTime === 'number'
  )
}

/**
 * Which panel-managed tasks currently have a visible row.
 * Presence in AppState.tasks IS visibility — the 1s tick in
 * CoordinatorTaskPanel evicts tasks past their evictAfter deadline. The
 * evictAfter !== 0 check handles immediate dismiss (x key) without making
 * the filter time-dependent. Shared by panel render, useCoordinatorTaskCount,
 * and index resolvers so the math can't drift.
 */
export function getVisibleAgentTasks<T extends CoordinatorTaskLike>(
  tasks: Record<string, T | unknown>,
): T[] {
  return Object.values(tasks)
    .filter(isVisibleCoordinatorTask<T>)
    .sort((a, b) => a.startTime - b.startTime)
}

export function getCoordinatorTaskCount<T extends CoordinatorTaskLike>(
  tasks: Record<string, T | unknown>,
): number {
  const count = getVisibleAgentTasks(tasks).length
  return count > 0 ? count + 1 : 0
}
