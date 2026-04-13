import React from 'react'
import { render } from '../src/ink.js'
import { BackgroundTasksDialog } from '../src/components/tasks/BackgroundTasksDialog.js'
import { KeybindingSetup } from '../src/keybindings/KeybindingProviderSetup.js'
import {
  AppStateProvider,
  getDefaultAppState,
  useAppStateStore,
} from '../src/state/AppState.js'
import type { Message } from '../src/types/message.js'
import { enableConfigs } from '../src/utils/config.js'
import { setDeferredTeammateLaunchRuntimeOverrides } from '../src/tools/AgentTool/deferredTeammateLaunchQueue.js'
import {
  buildHarnessContext,
  CaptureOutput,
  compactFrame,
  FakeTTYInput,
  normalizeFrame,
  setMacroVersionFromPackageJson,
  waitForFrame,
  WALKTHROUGH_TIMEOUT_MS,
} from './interactiveWalkthroughHarness.js'

function createDeferredLaunchState() {
  const now = Date.now()
  return {
    ...getDefaultAppState(),
    immaculateDeferredTeammateLaunches: [
      {
        id: 'queued-launch-1',
        teamName: 'shipyard',
        agentName: 'deckhand-1',
        queuedAt: now - 1_000,
        releaseAt: now + 45_000,
        attempts: 0,
        status: 'queued' as const,
      },
      {
        id: 'queued-launch-2',
        teamName: 'shipyard',
        agentName: 'deckhand-2',
        queuedAt: now - 500,
        releaseAt: now + 90_000,
        attempts: 0,
        status: 'queued' as const,
      },
    ],
  }
}

function DeferredLaunchWalkthroughApp({
  onClose,
  systemMessages,
}: {
  onClose: (result?: string) => void
  systemMessages: string[]
}): React.ReactNode {
  const store = useAppStateStore()
  const [messages, setMessages] = React.useState<Message[]>([])
  const context = React.useMemo(
    () => {
      const builtContext = buildHarnessContext(store, messages, setMessages, {
        appendSystemMessage: message => {
          systemMessages.push(message.content)
        },
      })
      setDeferredTeammateLaunchRuntimeOverrides(builtContext, {
        autoProcess: false,
      })
      return builtContext
    },
    [messages, store, systemMessages],
  )

  return <BackgroundTasksDialog onDone={onClose} toolUseContext={context} />
}

async function main(): Promise<void> {
  await setMacroVersionFromPackageJson()
  await enableConfigs()

  const stdin = new FakeTTYInput()
  const stdout = new CaptureOutput()
  const stderr = new CaptureOutput()
  const systemMessages: string[] = []
  let output = ''
  let closedResult: string | undefined

  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const initialState = createDeferredLaunchState()
  const instance = await render(
    <AppStateProvider initialState={initialState}>
      <KeybindingSetup>
        <DeferredLaunchWalkthroughApp
          systemMessages={systemMessages}
          onClose={result => {
            closedResult = result
            instance.unmount()
          }}
        />
      </KeybindingSetup>
    </AppStateProvider>,
    {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      stderr: stderr as unknown as NodeJS.WriteStream,
      exitOnCtrlC: false,
      patchConsole: false,
    },
  )
  const exitPromise = instance.waitUntilExit()
  const readFrame = (): string => normalizeFrame(output)
  const steps: Array<{ step: string; marker: string }> = []

  const recordStep = (step: string, frame: string): void => {
    steps.push({ step, marker: compactFrame(frame) })
  }
  const waitForSystemMessage = async (
    predicate: (messages: readonly string[]) => boolean,
    failureMessage: string,
  ): Promise<void> => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < WALKTHROUGH_TIMEOUT_MS) {
      if (predicate(systemMessages)) {
        return
      }
      await Bun.sleep(25)
    }
    throw new Error(
      `${failureMessage}\nMessages:\n${systemMessages.join('\n') || '(none)'}`,
    )
  }

  const listFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Background tasks') &&
      frame.includes('@deckhand-1') &&
      frame.includes('@deckhand-2') &&
      frame.includes('queued launch') &&
      frame.indexOf('@deckhand-1') < frame.indexOf('@deckhand-2'),
    WALKTHROUGH_TIMEOUT_MS,
    'Deferred launch walkthrough did not render the queued launch list',
  )
  recordStep('list', listFrame)

  stdin.write('\r')
  const detailFrame = await waitForFrame(
    readFrame,
    frame => {
      const normalized = frame.toLowerCase()
      return (
        normalized.includes('@deckhand-1') &&
        normalized.includes('flight deck') &&
        normalized.includes('queue status') &&
        normalized.includes('shipyard')
      )
    },
    WALKTHROUGH_TIMEOUT_MS,
    'Deferred launch walkthrough did not open the detail dialog',
  )
  recordStep('detail', detailFrame)

  stdin.write('p')
  await waitForSystemMessage(
    messages =>
      messages.some(message =>
        message.includes('Immaculate queue: prioritized deckhand-1 · shipyard'),
      ),
    'Deferred launch walkthrough did not emit the prioritize receipt',
  )
  const prioritizedDetailFrame = readFrame()
  recordStep('detail-prioritized', prioritizedDetailFrame)

  stdin.write('r')
  await waitForSystemMessage(
    messages =>
      messages.some(message =>
        message.includes(
          'Immaculate queue: release requested for deckhand-1 · shipyard',
        ),
      ),
    'Deferred launch walkthrough did not emit the release receipt',
  )
  const releasedDetailFrame = readFrame()
  recordStep('detail-release-now', releasedDetailFrame)

  stdin.write('\x1b[D')
  const listReturnFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Background tasks') &&
      frame.includes('@deckhand-1') &&
      frame.includes('@deckhand-2'),
    WALKTHROUGH_TIMEOUT_MS,
    'Deferred launch walkthrough did not return to the list view',
  )
  recordStep('list-return', listReturnFrame)

  stdin.write('x')
  const cancelledFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Background tasks') &&
      !frame.includes('@deckhand-1') &&
      frame.includes('@deckhand-2'),
    WALKTHROUGH_TIMEOUT_MS,
    'Deferred launch walkthrough did not clear the queued launch after cancel',
  )
  recordStep('cancelled', cancelledFrame)

  stdin.write('\x1b')
  await exitPromise

  if (closedResult !== 'Background tasks dialog dismissed') {
    throw new Error(
      `Deferred launch walkthrough closed unexpectedly: ${String(closedResult)}`,
    )
  }

  if (
    !systemMessages.some(message =>
      message.includes('Immaculate queue: prioritized deckhand-1 · shipyard'),
    ) ||
    !systemMessages.some(message =>
      message.includes(
        'Immaculate queue: release requested for deckhand-1 · shipyard',
      ),
    ) ||
    !systemMessages.some(message =>
      message.includes('Immaculate queue: cancelled deckhand-1 · shipyard'),
    )
  ) {
    throw new Error(
      `Deferred launch walkthrough did not emit the expected queue receipts.\nMessages:\n${systemMessages.join('\n')}`,
    )
  }

  console.log(
    JSON.stringify(
      {
        closedResult,
        systemMessages,
        steps,
      },
      null,
      2,
    ),
  )
}

await main()
