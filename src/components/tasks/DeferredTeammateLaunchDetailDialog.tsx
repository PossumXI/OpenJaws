import React from 'react'
import { useSyncExternalStore } from 'react'
import type { DeepImmutable } from 'src/types/utils.js'
import { formatDuration } from '../../utils/format.js'
import type { ImmaculateDeferredTeammateLaunch } from '../../utils/immaculateDeferredLaunches.js'
import { Box, Text } from '../../ink.js'
import type { KeyboardEvent } from '../../ink/events/keyboard-event.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import { Byline } from '../design-system/Byline.js'
import { Dialog } from '../design-system/Dialog.js'
import { KeyboardShortcutHint } from '../design-system/KeyboardShortcutHint.js'
import {
  TaskDetailSection,
  TaskReceiptList,
} from './TaskDetailSection.js'
import {
  buildDeferredTeammateLaunchDetailItems,
  getDeferredTeammateLaunchStateLabel,
  getDeferredTeammateLaunchTone,
} from './deferredTeammateLaunchPresentation.js'

type Props = {
  launch: DeepImmutable<ImmaculateDeferredTeammateLaunch>
  onDone: () => void
  onBack?: () => void
  onCancelLaunch?: () => void
  onPrioritize?: () => void
  onReleaseNow?: () => void
}

function useDeferredLaunchCountdown(
  releaseAt: number,
  isLive: boolean,
): string | null {
  const get = () => {
    if (!isLive) {
      return null
    }
    return formatDuration(Math.max(0, releaseAt - Date.now()))
  }

  const subscribe = (notify: () => void) => {
    if (!isLive) {
      return () => {}
    }
    const interval = setInterval(notify, 1000)
    return () => clearInterval(interval)
  }

  return useSyncExternalStore(subscribe, get, get)
}

export function DeferredTeammateLaunchDetailDialog({
  launch,
  onDone,
  onBack,
  onCancelLaunch,
  onPrioritize,
  onReleaseNow,
}: Props): React.ReactNode {
  useKeybindings(
    {
      'confirm:yes': onDone,
    },
    { context: 'Confirmation' },
  )

  const countdown = useDeferredLaunchCountdown(
    launch.releaseAt,
    launch.status === 'queued',
  )
  const tone = getDeferredTeammateLaunchTone(launch)
  const statusLabel = getDeferredTeammateLaunchStateLabel(launch)
  const flightDeckItems = buildDeferredTeammateLaunchDetailItems(launch)
  const canControlQueue = launch.status === 'queued'
  const liveEta =
    launch.status === 'queued'
      ? countdown === '0s'
        ? 'releasing now'
        : countdown
      : null
  const receiptItems =
    liveEta && flightDeckItems.some(item => item.label === 'release')
      ? flightDeckItems.map(item =>
          item.label === 'release'
            ? {
                ...item,
                value: liveEta,
              }
            : item,
        )
      : flightDeckItems

  const handleKeyDown = (event: KeyboardEvent) => {
    if (canControlQueue && event.key === 'x' && onCancelLaunch) {
      event.preventDefault()
      onCancelLaunch()
      return
    }

    if (canControlQueue && event.key === 'p' && onPrioritize) {
      event.preventDefault()
      onPrioritize()
      return
    }

    if (canControlQueue && event.key === 'r' && onReleaseNow) {
      event.preventDefault()
      onReleaseNow()
      return
    }

    if (event.key === ' ') {
      event.preventDefault()
      onDone()
      return
    }

    if (event.key === 'left' && onBack) {
      event.preventDefault()
      onBack()
    }
  }

  return (
    <Box flexDirection="column" tabIndex={0} autoFocus onKeyDown={handleKeyDown}>
      <Dialog
        title={
          <Text color={tone}>
            @{launch.agentName}
            <Text dimColor>{` · ${statusLabel}`}</Text>
          </Text>
        }
        subtitle={
          <Text dimColor>
            {launch.teamName}
            {liveEta ? ` · ${liveEta === 'releasing now' ? liveEta : `releases in ${liveEta}`}` : null}
            {launch.attempts > 0
              ? ` · ${launch.attempts} ${launch.attempts === 1 ? 'retry' : 'retries'}`
              : null}
          </Text>
        }
        onCancel={onDone}
        color={tone}
        inputGuide={exitState =>
          exitState.pending ? (
            <Text>Press {exitState.keyName} again to exit</Text>
          ) : (
            <Byline>
              {onBack ? (
                <KeyboardShortcutHint shortcut="←" action="go back" />
              ) : null}
              {canControlQueue && onPrioritize ? (
                <KeyboardShortcutHint shortcut="p" action="prioritize" />
              ) : null}
              {canControlQueue && onReleaseNow ? (
                <KeyboardShortcutHint shortcut="r" action="release" />
              ) : null}
              {canControlQueue && onCancelLaunch ? (
                <KeyboardShortcutHint shortcut="x" action="cancel" />
              ) : null}
              <KeyboardShortcutHint
                shortcut="Esc/Enter/Space"
                action="close"
              />
            </Byline>
          )
        }
      >
        <TaskDetailSection title="Flight deck" marginTop={0}>
          <TaskReceiptList items={receiptItems} />
        </TaskDetailSection>

        <TaskDetailSection title="Queue status">
          <Text wrap="wrap">
            {launch.status === 'queued'
              ? 'launch is held by the immaculate burst budget. you can prioritize it, release it now, or cancel it while crew pressure clears.'
              : launch.status === 'launching'
                ? 'launch has cleared the queue and is handing off to the crew now.'
                : 'launch is no longer queued.'}
          </Text>
        </TaskDetailSection>
      </Dialog>
    </Box>
  )
}
