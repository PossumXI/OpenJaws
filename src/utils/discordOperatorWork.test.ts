import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import {
  REAL_WORLD_ENGAGEMENT_DEFAULT_WORKSPACE,
  createOperatorRunContext,
  parseDirectOperatorChatCommand,
  resolveOperatorWorkspacePath,
  type DiscordOperatorWorkspace,
} from './discordOperatorWork.js'

const tempDirs: string[] = []
const GIT_OPERATOR_WORK_TEST_TIMEOUT_MS = 15_000

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

  it('routes plain-English browser preview requests through the governed OpenJaws lane', () => {
    const parsed = parseDirectOperatorChatCommand(
      'use the browser in D:\\sites\\qline to build a product demo with screenshots',
    )

    expect(parsed).toMatchObject({
      action: 'ask-openjaws',
      cwd: 'D:\\sites\\qline',
    })
    expect(parsed?.text).toContain(
      'Real-world engagement lane: browser preview and demo (browser_preview).',
    )
    expect(parsed?.text).toContain('native Apex browser bridge')
    expect(parsed?.text).toContain(
      'Operator request: build a product demo with screenshots',
    )
  })

  it('keeps external communication requests in draft-and-approve mode', () => {
    const parsed = parseDirectOperatorChatCommand(
      'draft a LinkedIn marketing line for "D:\\cheeks\\Asgard\\Websites" to announce the public ledger',
    )

    expect(parsed).toMatchObject({
      action: 'ask-openjaws',
      cwd: 'D:\\cheeks\\Asgard\\Websites',
    })
    expect(parsed?.text).toContain(
      'Real-world engagement lane: external communication draft (external_communication_draft).',
    )
    expect(parsed?.text).toContain('Do not send, post, purchase, submit forms')
    expect(parsed?.text).toContain('Operator request: announce the public ledger')
  })

  it('routes live research requests without inventing an external side effect', () => {
    const parsed = parseDirectOperatorChatCommand(
      'research online to compare hosted Q durable backend options',
    )

    expect(parsed).toMatchObject({
      action: 'ask-openjaws',
      cwd: REAL_WORLD_ENGAGEMENT_DEFAULT_WORKSPACE,
    })
    expect(parsed?.text).toContain('Real-world engagement lane: web research')
    expect(parsed?.text).toContain('cite live sources')
    expect(parsed?.text).toContain('Workspace routing: no explicit approved project')
    expect(parsed?.text).toContain(
      'Operator request: compare hosted Q durable backend options',
    )
  })

  it('recognizes operator requests to continue real-world engagement behavior', () => {
    const parsed = parseDirectOperatorChatCommand(
      'continue the real-world engagement behavior in OpenJaws',
    )

    expect(parsed).toMatchObject({
      action: 'ask-openjaws',
      cwd: REAL_WORLD_ENGAGEMENT_DEFAULT_WORKSPACE,
    })
    expect(parsed?.text).toContain(
      'Real-world engagement lane: Apex workspace action (apex_workspace).',
    )
    expect(parsed?.text).toContain(
      'Operator request: continue the real-world engagement behavior in OpenJaws',
    )
  })

  it('resolves the default real-world engagement workspace through existing aliases', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-default-engagement-root-'))
    tempDirs.push(root)
    const workspacePath = join(root, 'OpenJaws')
    mkdirSync(workspacePath, { recursive: true })
    const workspaces: DiscordOperatorWorkspace[] = [
      {
        id: 'openjaws-main',
        label: 'OpenJaws Repo',
        path: workspacePath,
      },
    ]

    expect(
      resolveOperatorWorkspacePath({
        input: REAL_WORLD_ENGAGEMENT_DEFAULT_WORKSPACE,
        workspaces,
        allowedRoots: [root],
      }),
    ).toBe(workspacePath)
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

  it('allocates a unique branch name when a prior governed branch already exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-operator-git-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'openjaws')
    const worktreeRoot = join(root, 'worktrees')
    mkdirSync(repoRoot, { recursive: true })
    writeFileSync(join(repoRoot, 'README.md'), '# OpenJaws\n', 'utf8')
    spawnSync('git', ['-C', repoRoot, 'init'], { encoding: 'utf8' })
    spawnSync('git', ['-C', repoRoot, 'config', 'user.email', 'roundtable@example.com'], {
      encoding: 'utf8',
    })
    spawnSync('git', ['-C', repoRoot, 'config', 'user.name', 'Roundtable'], {
      encoding: 'utf8',
    })
    spawnSync('git', ['-C', repoRoot, 'add', 'README.md'], { encoding: 'utf8' })
    spawnSync('git', ['-C', repoRoot, 'commit', '-m', 'init'], { encoding: 'utf8' })
    spawnSync(
      'git',
      [
        '-C',
        repoRoot,
        'branch',
        'discord-blackbeak-utils-blackbeak-follow-through-openjaw',
      ],
      { encoding: 'utf8' },
    )

    const workspace = join(repoRoot, 'src', 'utils')
    mkdirSync(workspace, { recursive: true })

    const context = createOperatorRunContext({
      workspace,
      jobId: 'blackbeak-follow-through-openjaws-2026-04-22t02-42-52.639z',
      profileName: 'blackbeak',
      worktreeRoot,
    })

    expect(context.branchName).toBe(
      'discord-blackbeak-utils-blackbeak-follow-through-openjaw-2',
    )
    expect(context.worktreePath).toBe(
      join(
        worktreeRoot,
        'openjaws',
        'discord-blackbeak-utils-blackbeak-follow-through-openjaw-2',
      ),
    )
    expect(context.workspacePath).toBe(
      join(
        worktreeRoot,
        'openjaws',
        'discord-blackbeak-utils-blackbeak-follow-through-openjaw-2',
        'src',
        'utils',
      ),
    )
  }, GIT_OPERATOR_WORK_TEST_TIMEOUT_MS)

  it('preserves uniqueness suffixes when the governed branch base reaches the length cap', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-operator-long-git-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'openjaws')
    const worktreeRoot = join(root, 'worktrees')
    const workspace = join(repoRoot, 'src', 'utils', 'roundtable-allocator')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(repoRoot, 'README.md'), '# OpenJaws\n', 'utf8')
    writeFileSync(join(workspace, 'runtime.ts'), 'export const ready = true\n', 'utf8')
    spawnSync('git', ['-C', repoRoot, 'init'], { encoding: 'utf8' })
    spawnSync('git', ['-C', repoRoot, 'config', 'user.email', 'roundtable@example.com'], {
      encoding: 'utf8',
    })
    spawnSync('git', ['-C', repoRoot, 'config', 'user.name', 'Roundtable'], {
      encoding: 'utf8',
    })
    spawnSync(
      'git',
      ['-C', repoRoot, 'add', 'README.md', 'src/utils/roundtable-allocator/runtime.ts'],
      { encoding: 'utf8' },
    )
    spawnSync('git', ['-C', repoRoot, 'commit', '-m', 'init'], { encoding: 'utf8' })

    const args = {
      workspace,
      jobId:
        'blackbeak-follow-through-openjaws-2026-04-30t23-21-48.493z-with-extra-collision-padding',
      profileName: 'roundtable-blackbeak',
      worktreeRoot,
    }

    const first = createOperatorRunContext(args)
    const second = createOperatorRunContext(args)

    expect(first.branchName).not.toBeNull()
    expect(second.branchName).not.toBeNull()
    expect(second.branchName).not.toBe(first.branchName)
    expect(second.branchName!.length).toBeLessThanOrEqual(92)
    expect(second.branchName).toMatch(/-2$/)
    expect(basename(second.worktreePath!)).toBe(second.branchName)
    expect(existsSync(second.workspacePath)).toBe(true)
  }, GIT_OPERATOR_WORK_TEST_TIMEOUT_MS)
})
