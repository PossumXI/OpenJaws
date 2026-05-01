import React from 'react'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { render } from '../src/ink.js'
import { KeybindingSetup } from '../src/keybindings/KeybindingProviderSetup.js'
import { AppStateProvider, useAppStateStore } from '../src/state/AppState.js'
import { Settings } from '../src/components/Settings/Settings.js'
import type { Message } from '../src/types/message.js'
import { enableConfigs } from '../src/utils/config.js'
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

function includesUsageMarker(frame: string): boolean {
  return (
    frame.includes('Loading usage data') ||
    frame.includes('Current session') ||
    frame.includes('/usage is only available for subscription plans')
  )
}

function SettingsWalkthroughApp({
  onClose,
}: {
  onClose: (result?: string) => void
}): React.ReactNode {
  const store = useAppStateStore()
  const [messages, setMessages] = React.useState<Message[]>([])
  const context = React.useMemo(
    () => buildHarnessContext(store, messages, setMessages),
    [messages, store],
  )
  return <Settings onClose={onClose} context={context} defaultTab="Status" />
}

function isolateApexTenantGovernanceMirror(): void {
  if (process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE !== undefined) {
    return
  }

  const tempGovernanceMirrorDir = mkdtempSync(
    join(tmpdir(), 'openjaws-settings-governance-'),
  )
  process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE = join(
    tempGovernanceMirrorDir,
    'Apex-Tenant-Governance.json',
  )
  process.once('exit', () => {
    delete process.env.OPENJAWS_APEX_TENANT_GOVERNANCE_MIRROR_FILE
    rmSync(tempGovernanceMirrorDir, { recursive: true, force: true })
  })
}

async function main(): Promise<void> {
  await setMacroVersionFromPackageJson()
  isolateApexTenantGovernanceMirror()
  await enableConfigs()

  const stdin = new FakeTTYInput()
  const stdout = new CaptureOutput()
  const stderr = new CaptureOutput()
  let output = ''
  let closedResult: string | undefined

  stdout.on('data', chunk => {
    output += chunk.toString()
  })

  const instance = await render(
    <AppStateProvider>
      <KeybindingSetup>
        <SettingsWalkthroughApp
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

  const initialFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Status') &&
      frame.includes('Config') &&
      frame.includes('Usage') &&
      (frame.includes('Version:') || frame.includes('Loading status')),
    WALKTHROUGH_TIMEOUT_MS,
    'Settings walkthrough did not render the Status tab',
  )
  recordStep('status', initialFrame)

  stdin.write('\x1b[C')
  const appearanceFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Search settings') &&
      frame.includes('Theme') &&
      frame.includes('Output style'),
    WALKTHROUGH_TIMEOUT_MS,
    'Settings walkthrough did not reach the Appearance tab',
  )
  recordStep('appearance', appearanceFrame)

  stdin.write('\x1b[C')
  const privacyFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Search settings') &&
      frame.includes('Privacy mode'),
    WALKTHROUGH_TIMEOUT_MS,
    'Settings walkthrough did not reach the Privacy tab',
  )
  recordStep('privacy', privacyFrame)

  stdin.write('\x1b[C')
  const configFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Search settings') &&
      frame.includes('Auto-compact') &&
      frame.includes('Default permission mode'),
    WALKTHROUGH_TIMEOUT_MS,
    'Settings walkthrough did not reach the Config tab',
  )
  recordStep('config', configFrame)

  stdin.write('\x1b[C')
  const usageFrame = await waitForFrame(
    readFrame,
    frame => includesUsageMarker(frame),
    WALKTHROUGH_TIMEOUT_MS,
    'Settings walkthrough did not reach the Usage tab',
  )
  recordStep('usage', usageFrame)

  stdin.write('\x1b[D')
  const configReturnFrame = await waitForFrame(
    readFrame,
    frame =>
      frame.includes('Search settings') &&
      frame.includes('Auto-compact') &&
      frame.includes('Default permission mode'),
    WALKTHROUGH_TIMEOUT_MS,
    'Settings walkthrough did not return to the Config tab',
  )
  recordStep('config-return', configReturnFrame)

  stdin.write('\x1b')
  await exitPromise

  if (closedResult !== 'Status dialog dismissed') {
    throw new Error(
      `Settings walkthrough closed unexpectedly: ${String(closedResult)}`,
    )
  }

  console.log(
    JSON.stringify(
      {
        closedResult,
        steps,
      },
      null,
      2,
    ),
  )
}

await main()
