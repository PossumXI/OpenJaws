import http from 'node:http'
import React from 'react'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { render } from '../src/ink.js'
import { KeybindingSetup } from '../src/keybindings/KeybindingProviderSetup.js'
import { AppStateProvider } from '../src/state/AppState.js'
import { Onboarding } from '../src/components/Onboarding.js'
import { enableConfigs } from '../src/utils/config.js'
import {
  CaptureOutput,
  compactFrame,
  FakeTTYInput,
  normalizeFrame,
  setMacroVersionFromPackageJson,
  sleep,
  waitForFrame,
  WALKTHROUGH_TIMEOUT_MS,
} from './interactiveWalkthroughHarness.js'

async function startHarnessServer(): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server = http.createServer((req, res) => {
    const writeJson = (status: number, body: unknown): void => {
      res.statusCode = status
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify(body))
    }

    if (req.url === '/api/health') {
      writeJson(200, {
        status: 'ok',
        service: 'immaculate-harness',
        clients: 1,
      })
      return
    }

    if (req.url === '/api/topology') {
      writeJson(200, {
        cycle: 42,
        nodes: 9,
        edges: 14,
        profile: 'balanced',
        objective: 'flight-deck startup',
      })
      return
    }

    if (req.url === '/api/intelligence') {
      writeJson(200, {
        layers: [{ id: 'router-core' }, { id: 'ollama-mid-gemma4-e4b' }],
        executions: [{ id: 'startup-check' }],
        recommendedLayerId: 'router-core',
      })
      return
    }

    writeJson(404, { message: 'not found' })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start onboarding walkthrough harness server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }
          resolve()
        })
      }),
  }
}

async function main(): Promise<void> {
  const tempConfigDir = mkdtempSync(
    join(tmpdir(), 'openjaws-onboarding-walkthrough-'),
  )
  const previousConfigDir = process.env.CLAUDE_CONFIG_DIR
  const previousAnthropicModel = process.env.ANTHROPIC_MODEL
  const previousHarnessUrl = process.env.IMMACULATE_HARNESS_URL
  const harness = await startHarnessServer()

  process.env.CLAUDE_CONFIG_DIR = tempConfigDir
  process.env.ANTHROPIC_MODEL = 'openai:gpt-5.4'
  process.env.IMMACULATE_HARNESS_URL = harness.url

  try {
    await setMacroVersionFromPackageJson()
    enableConfigs()

    const stdin = new FakeTTYInput()
    const stdout = new CaptureOutput()
    const stderr = new CaptureOutput()
    let output = ''
    let completed = false

    stdout.on('data', chunk => {
      output += chunk.toString()
    })

    const instance = await render(
      <AppStateProvider>
        <KeybindingSetup>
          <Onboarding
            onDone={() => {
              completed = true
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
    const confirmSelection = async (): Promise<void> => {
      // Ink select/keybinding registration can lag one frame behind the text.
      await sleep(75)
      stdin.write('\r')
    }

    const themeFrame = await waitForFrame(
      readFrame,
      frame =>
        frame.includes('Choose the text style that looks best with your terminal'),
      WALKTHROUGH_TIMEOUT_MS,
      'Onboarding walkthrough did not render the theme step',
    )
    recordStep('theme', themeFrame)
    await confirmSelection()

    const runtimeFrame = await waitForFrame(
      readFrame,
      frame =>
        frame.includes('Choose your runtime path') &&
        frame.includes('OpenAI'),
      WALKTHROUGH_TIMEOUT_MS,
      'Onboarding walkthrough did not reach the runtime setup step',
    )
    recordStep('runtime-setup', runtimeFrame)
    await confirmSelection()

    const modelFrame = await waitForFrame(
      readFrame,
      frame => frame.includes('OpenAI model'),
      WALKTHROUGH_TIMEOUT_MS,
      'Onboarding walkthrough did not reach the provider model step',
    )
    recordStep('provider-model', modelFrame)
    stdin.write('\r')

    const keyOrImmaculateFrame = await waitForFrame(
      readFrame,
      frame =>
        frame.includes('OpenAI API key') ||
        (frame.includes('Immaculate reachability') &&
          frame.includes('immaculate online')),
      WALKTHROUGH_TIMEOUT_MS,
      'Onboarding walkthrough did not advance from model selection',
    )

    if (keyOrImmaculateFrame.includes('OpenAI API key')) {
      recordStep('provider-key', keyOrImmaculateFrame)
      stdin.write('sk-openjaws-onboarding-test')
      stdin.write('\r')
    } else {
      recordStep('provider-key-existing', keyOrImmaculateFrame)
    }

    const immaculateFrame =
      keyOrImmaculateFrame.includes('Immaculate reachability') &&
      keyOrImmaculateFrame.includes('immaculate online')
        ? keyOrImmaculateFrame
        : await waitForFrame(
            readFrame,
            frame =>
              frame.includes('Immaculate reachability') &&
              frame.includes('immaculate online'),
            WALKTHROUGH_TIMEOUT_MS,
            'Onboarding walkthrough did not confirm Immaculate reachability',
          )
    recordStep('immaculate', immaculateFrame)
    await confirmSelection()

    const securityFrame = await waitForFrame(
      readFrame,
      frame => frame.includes('Security notes:'),
      WALKTHROUGH_TIMEOUT_MS,
      'Onboarding walkthrough did not reach the security step',
    )
    recordStep('security', securityFrame)
    stdin.write('\r')

    await sleep(150)
    const terminalFrame = readFrame()
    if (terminalFrame.includes('Use OpenJaws') && terminalFrame.includes('/terminal-setup')) {
      recordStep('terminal-setup', terminalFrame)
      stdin.write('\x1b[B')
      await confirmSelection()
    }

    await exitPromise

    if (!completed) {
      throw new Error('Onboarding walkthrough did not finish cleanly')
    }

    console.log(
      JSON.stringify(
        {
          completed,
          steps,
          harnessUrl: harness.url,
        },
        null,
        2,
      ),
    )
  } finally {
    if (previousConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = previousConfigDir
    }
    if (previousAnthropicModel === undefined) {
      delete process.env.ANTHROPIC_MODEL
    } else {
      process.env.ANTHROPIC_MODEL = previousAnthropicModel
    }
    if (previousHarnessUrl === undefined) {
      delete process.env.IMMACULATE_HARNESS_URL
    } else {
      process.env.IMMACULATE_HARNESS_URL = previousHarnessUrl
    }
    await harness.close()
    rmSync(tempConfigDir, { recursive: true, force: true })
  }
}

await main()
