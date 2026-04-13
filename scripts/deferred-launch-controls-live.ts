import { createStore } from '../src/state/store.js'
import {
  getDefaultAppState,
  type AppState,
} from '../src/state/AppState.js'
import type { ToolUseContext } from '../src/Tool.js'
import {
  cancelDeferredTeammateLaunch,
  prioritizeDeferredTeammateLaunch,
  releaseDeferredTeammateLaunchNow,
  setDeferredTeammateLaunchRuntimeOverrides,
} from '../src/tools/AgentTool/deferredTeammateLaunchQueue.js'
import type { Message } from '../src/types/message.js'
import type { FileStateCache } from '../src/utils/fileStateCache.js'
import type { ImmaculateDeferredTeammateLaunch } from '../src/utils/immaculateDeferredLaunches.js'
import type { ThinkingConfig } from '../src/utils/thinking.js'

function createHarnessContext(
  launches: ImmaculateDeferredTeammateLaunch[],
): {
  context: ToolUseContext
  getLaunches: () => readonly ImmaculateDeferredTeammateLaunch[]
  getSystemMessages: () => readonly string[]
} {
  const store = createStore<AppState>({
    ...getDefaultAppState(),
    immaculateDeferredTeammateLaunches: launches,
  })
  const systemMessages: string[] = []
  const thinkingConfig: ThinkingConfig = { type: 'disabled' }

  const context = {
    options: {
      commands: [],
      debug: false,
      mainLoopModel: 'openai:gpt-5.4',
      tools: [],
      verbose: false,
      thinkingConfig,
      mcpClients: [],
      mcpResources: {},
      isNonInteractiveSession: false,
      agentDefinitions: { activeAgents: [], allAgents: [] },
    },
    abortController: new AbortController(),
    readFileState: {} as FileStateCache,
    getAppState: () => store.getState(),
    setAppState: store.setState,
    appendSystemMessage: message => {
      systemMessages.push(message.content)
    },
    nestedMemoryAttachmentTriggers: new Set<string>(),
    loadedNestedMemoryPaths: new Set<string>(),
    dynamicSkillDirTriggers: new Set<string>(),
    discoveredSkillNames: new Set<string>(),
    setInProgressToolUseIDs: () => {},
    setResponseLength: () => {},
    updateFileHistoryState: () => {},
    updateAttributionState: () => {},
    messages: [] as Message[],
  } as ToolUseContext

  return {
    context,
    getLaunches: () => store.getState().immaculateDeferredTeammateLaunches,
    getSystemMessages: () => systemMessages,
  }
}

function createLaunch(
  id: string,
  status: ImmaculateDeferredTeammateLaunch['status'],
  options?: {
    agentName?: string
    queuedAt?: number
    releaseAt?: number
  },
): ImmaculateDeferredTeammateLaunch {
  return {
    id,
    teamName: 'shipyard',
    agentName: options?.agentName ?? 'deckhand-1',
    queuedAt: options?.queuedAt ?? 10,
    releaseAt: options?.releaseAt ?? 100,
    attempts: status === 'queued' ? 0 : 1,
    status,
    ...(status === 'failed' ? { lastError: 'provider rejected tool round' } : {}),
  }
}

function serializeLaunches(
  launches: readonly ImmaculateDeferredTeammateLaunch[],
): string {
  return JSON.stringify(launches)
}

async function main(): Promise<void> {
  const queuedHarness = createHarnessContext([
    createLaunch('queued-launch-1', 'queued', {
      agentName: 'deckhand-1',
      queuedAt: 10,
      releaseAt: 120,
    }),
    createLaunch('queued-launch-2', 'queued', {
      agentName: 'deckhand-2',
      queuedAt: 20,
      releaseAt: 240,
    }),
  ])
  setDeferredTeammateLaunchRuntimeOverrides(queuedHarness.context, {
    autoProcess: false,
  })
  const prioritizeStart = Date.now()
  const queuedPrioritized = prioritizeDeferredTeammateLaunch(
    queuedHarness.context,
    'queued-launch-2',
  )
  const queuedAfterPrioritize = queuedHarness.getLaunches()
  const prioritizedLaunch = queuedAfterPrioritize.find(
    launch => launch.id === 'queued-launch-2',
  )
  const queuedReleased = releaseDeferredTeammateLaunchNow(
    queuedHarness.context,
    'queued-launch-2',
  )
  const releaseObservedAt = Date.now()
  const releasedLaunch = queuedHarness.getLaunches().find(
    launch => launch.id === 'queued-launch-2',
  )
  const queuedCancelled = cancelDeferredTeammateLaunch(
    queuedHarness.context,
    'queued-launch-2',
  )
  setDeferredTeammateLaunchRuntimeOverrides(queuedHarness.context, null)

  const launchingHarness = createHarnessContext([
    createLaunch('launching-launch', 'launching'),
  ])
  const launchingBefore = serializeLaunches(launchingHarness.getLaunches())
  const launchingCancel = cancelDeferredTeammateLaunch(
    launchingHarness.context,
    'launching-launch',
  )
  const launchingPrioritize = prioritizeDeferredTeammateLaunch(
    launchingHarness.context,
    'launching-launch',
  )
  const launchingRelease = releaseDeferredTeammateLaunchNow(
    launchingHarness.context,
    'launching-launch',
  )
  const launchingAfter = serializeLaunches(launchingHarness.getLaunches())

  const failedHarness = createHarnessContext([
    createLaunch('failed-launch', 'failed'),
  ])
  const failedBefore = serializeLaunches(failedHarness.getLaunches())
  const failedCancel = cancelDeferredTeammateLaunch(
    failedHarness.context,
    'failed-launch',
  )
  const failedPrioritize = prioritizeDeferredTeammateLaunch(
    failedHarness.context,
    'failed-launch',
  )
  const failedRelease = releaseDeferredTeammateLaunchNow(
    failedHarness.context,
    'failed-launch',
  )
  const failedAfter = serializeLaunches(failedHarness.getLaunches())

  const details = {
    queuedControls: {
      prioritize: queuedPrioritized,
      prioritizedLeadingId: queuedAfterPrioritize
        .filter(launch => launch.status === 'queued')
        .sort((left, right) =>
          left.releaseAt === right.releaseAt
            ? left.queuedAt - right.queuedAt
            : left.releaseAt - right.releaseAt,
        )[0]?.id,
      prioritizedReleaseAt: prioritizedLaunch?.releaseAt ?? null,
      prioritizedQueuedAt: prioritizedLaunch?.queuedAt ?? null,
      release: queuedReleased,
      releaseAtAfterRelease: releasedLaunch?.releaseAt ?? null,
      result: queuedCancelled,
      remaining: queuedHarness.getLaunches().map(launch => launch.id),
      messages: queuedHarness.getSystemMessages(),
    },
    launchingGuards: {
      cancel: launchingCancel,
      prioritize: launchingPrioritize,
      release: launchingRelease,
      unchanged: launchingBefore === launchingAfter,
      messages: launchingHarness.getSystemMessages(),
    },
    failedGuards: {
      cancel: failedCancel,
      prioritize: failedPrioritize,
      release: failedRelease,
      unchanged: failedBefore === failedAfter,
      messages: failedHarness.getSystemMessages(),
    },
  }

  const passes =
    details.queuedControls.prioritize &&
    details.queuedControls.prioritizedLeadingId === 'queued-launch-2' &&
    details.queuedControls.prioritizedReleaseAt === 120 &&
    details.queuedControls.prioritizedQueuedAt === 9 &&
    details.queuedControls.release &&
    details.queuedControls.releaseAtAfterRelease !== null &&
    details.queuedControls.releaseAtAfterRelease >= prioritizeStart &&
    details.queuedControls.releaseAtAfterRelease <= releaseObservedAt &&
    details.queuedControls.result &&
    details.queuedControls.remaining.length === 1 &&
    details.queuedControls.remaining[0] === 'queued-launch-1' &&
    details.queuedControls.messages.some(message =>
      message.includes('Immaculate queue: prioritized deckhand-2 · shipyard'),
    ) &&
    details.queuedControls.messages.some(message =>
      message.includes(
        'Immaculate queue: release requested for deckhand-2 · shipyard',
      ),
    ) &&
    details.queuedControls.messages.some(message =>
      message.includes('Immaculate queue: cancelled deckhand-2 · shipyard'),
    ) &&
    !details.launchingGuards.cancel &&
    !details.launchingGuards.prioritize &&
    !details.launchingGuards.release &&
    details.launchingGuards.unchanged &&
    details.launchingGuards.messages.length === 0 &&
    !details.failedGuards.cancel &&
    !details.failedGuards.prioritize &&
    !details.failedGuards.release &&
    details.failedGuards.unchanged &&
    details.failedGuards.messages.length === 0

  if (!passes) {
    console.error(JSON.stringify(details, null, 2))
    process.exit(1)
  }

  console.log(JSON.stringify(details, null, 2))
}

await main()
