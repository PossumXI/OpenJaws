import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  parseDirectOperatorChatCommand,
  resolveOperatorWorkspacePath,
  type DiscordOperatorWorkspace,
} from './discordOperatorWork.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const path = tempDirs.pop()
    if (path) {
      rmSync(path, { recursive: true, force: true })
    }
  }
})

describe('discordOperatorWork', () => {
  it('parses natural start commands into an OpenJaws ask action', () => {
    expect(
      parseDirectOperatorChatCommand(
        'start an openjaws session for project sealed and begin the next high value pass',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'sealed',
      text: 'begin the next high value pass',
    })
  })

  it('parses explicit operator commands with :: prompts', () => {
    expect(
      parseDirectOperatorChatCommand(
        'openjaws ask immaculate :: audit the next harness bottleneck',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'immaculate',
      text: 'audit the next harness bottleneck',
    })
  })

  it('parses direct roundtable status commands', () => {
    expect(parseDirectOperatorChatCommand('openjaws roundtable')).toEqual({
      action: 'roundtable-status',
      cwd: null,
      text: null,
    })
  })

  it('parses plain-English OpenJaws work requests', () => {
    expect(
      parseDirectOperatorChatCommand(
        'use openjaws in Immaculate to tighten the roundtable guardrails',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'Immaculate',
      text: 'tighten the roundtable guardrails',
    })
  })

  it('parses plain-English workspace and status requests', () => {
    expect(parseDirectOperatorChatCommand('show the openjaws workspaces')).toEqual({
      action: 'workspaces',
      cwd: null,
      text: null,
    })
    expect(parseDirectOperatorChatCommand("what is the openjaws status")).toEqual({
      action: 'openjaws-status',
      cwd: null,
      text: null,
    })
    expect(parseDirectOperatorChatCommand('check the roundtable status')).toEqual({
      action: 'roundtable-status',
      cwd: null,
      text: null,
    })
  })

  it('parses plain-English push review commands', () => {
    expect(parseDirectOperatorChatCommand('list the pending pushes')).toEqual({
      action: 'pending-pushes',
      cwd: null,
      text: null,
    })
    expect(parseDirectOperatorChatCommand('confirm push rt-job-42')).toEqual({
      action: 'confirm-push',
      cwd: null,
      text: 'rt-job-42',
    })
  })

  it('resolves workspace aliases inside approved roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-operator-root-'))
    tempDirs.push(root)
    const workspacePath = join(root, 'SEALED')
    mkdirSync(workspacePath, { recursive: true })
    const workspaces: DiscordOperatorWorkspace[] = [
      {
        id: 'sealed',
        label: 'SEALED Demo',
        path: workspacePath,
      },
    ]

    expect(
      resolveOperatorWorkspacePath({
        input: 'sealed',
        workspaces,
        allowedRoots: [root],
      }),
    ).toBe(workspacePath)
  })

  it('rejects workspaces outside approved roots', () => {
    const approvedRoot = mkdtempSync(join(tmpdir(), 'oj-approved-root-'))
    const otherRoot = mkdtempSync(join(tmpdir(), 'oj-other-root-'))
    tempDirs.push(approvedRoot, otherRoot)
    const workspacePath = join(otherRoot, 'rogue')
    mkdirSync(workspacePath, { recursive: true })

    expect(() =>
      resolveOperatorWorkspacePath({
        input: workspacePath,
        workspaces: [],
        allowedRoots: [approvedRoot],
      }),
    ).toThrow(/outside the approved operator roots/i)
  })
})
