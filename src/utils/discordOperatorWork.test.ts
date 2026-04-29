import { afterEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { spawnSync } from 'child_process'
import { basename, join } from 'path'
import { tmpdir } from 'os'
import {
  buildGitWorktreeAddArgs,
  createOperatorRunContext,
  parseDirectOperatorChatCommand,
  resolveAllowedGitCheckoutRoots,
  resolveOperatorWorkspacePath,
  type DiscordOperatorWorkspace,
} from './discordOperatorWork.js'

const tempDirs: string[] = []

afterEach(() => {
  // Skip filesystem cleanup to avoid EBUSY errors during tests
  tempDirs.length = 0;
})

describe('discordOperatorWork', () => {
  it('uses Git long-path mode for isolated worktree creation on Windows-heavy repos', () => {
    expect(
      buildGitWorktreeAddArgs({
        gitRoot: 'D:\\openjaws\\OpenJaws',
        branchName: 'discord-roundtable-q-openjaws-fix',
        worktreePath:
          'D:\\openjaws\\OpenJaws\\local-command-station\\openjaws-operator-worktrees\\openjaws\\discord-roundtable-q-openjaws-fix',
      }),
    ).toEqual([
      '-C',
      'D:\\openjaws\\OpenJaws',
      '-c',
      'core.longpaths=true',
      'worktree',
      'add',
      '-b',
      'discord-roundtable-q-openjaws-fix',
      'D:\\openjaws\\OpenJaws\\local-command-station\\openjaws-operator-worktrees\\openjaws\\discord-roundtable-q-openjaws-fix',
      'HEAD',
    ])
  })

  it('canonicalizes broad allowed parents to exact git checkout roots', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-operator-roots-'))
    tempDirs.push(root)
    const broadParent = join(root, 'repos')
    const repoRoot = join(broadParent, 'OpenJaws')
    mkdirSync(join(repoRoot, '.git'), { recursive: true })

    expect(resolveAllowedGitCheckoutRoots([broadParent])).toEqual([repoRoot])
  })

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

  it('routes authorized plain-English repo work into the default OpenJaws lane', () => {
    expect(
      parseDirectOperatorChatCommand(
        'fix the repo tests and make a short delivery artifact',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'fix the repo tests and make a short delivery artifact',
    })

    expect(
      parseDirectOperatorChatCommand('debug viola voice in discord'),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'debug viola voice in discord',
    })
  })

  it('routes plain-English web research plus project work into OpenJaws', () => {
    expect(
      parseDirectOperatorChatCommand(
        'look up latest TerminalBench leaderboard rules and update the OpenJaws benchmark docs',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'look up latest TerminalBench leaderboard rules and update the OpenJaws benchmark docs',
    })

    expect(
      parseDirectOperatorChatCommand(
        'search the web for current Discord voice gateway docs and fix Viola voice',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'search the web for current Discord voice gateway docs and fix Viola voice',
    })

    expect(
      parseDirectOperatorChatCommand(
        'use the internet to research current BridgeBench docs and make a markdown artifact',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'use the internet to research current BridgeBench docs and make a markdown artifact',
    })
  })

  it('routes direct Immaculate bridge requests through OpenJaws with receipt guidance', () => {
    const parsed = parseDirectOperatorChatCommand(
      'immaculate search --max 3 current Q benchmark status',
    )

    expect(parsed?.action).toBe('ask-openjaws')
    expect(parsed?.cwd).toBe('immaculate-c')
    expect(parsed?.text).toContain('/immaculate search --max 3 current Q benchmark status')
    expect(parsed?.text).toContain('ImmaculateHarness')
    expect(parsed?.text).toContain('receipt ids')
  })

  it('routes natural OpenJaws commands without forcing a workspace phrase', () => {
    expect(
      parseDirectOperatorChatCommand(
        'use OpenJaws to audit Asgard security hardening gaps',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'asgard',
      text: 'audit Asgard security hardening gaps',
    })

    expect(
      parseDirectOperatorChatCommand(
        'have OpenJaws create a docx artifact for Discord agent roles',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'create a docx artifact for Discord agent roles',
    })
  })

  it('keeps general non-project questions in chat instead of operator execution', () => {
    expect(parseDirectOperatorChatCommand('check the weather today')).toBeNull()
  })

  it('infers project workspace aliases from plain-English work requests', () => {
    expect(
      parseDirectOperatorChatCommand('audit Asgard security hardening gaps'),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'asgard',
      text: 'audit Asgard security hardening gaps',
    })

    expect(
      parseDirectOperatorChatCommand('improve the Apex apps tenant workflow'),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'apex-apps',
      text: 'improve the Apex apps tenant workflow',
    })
  })

  it('routes diagnostic and local-tool plain-English work into OpenJaws', () => {
    expect(
      parseDirectOperatorChatCommand(
        'diagnose why Viola voice channel is not speaking and check logs',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'diagnose why Viola voice channel is not speaking and check logs',
    })

    expect(
      parseDirectOperatorChatCommand(
        'figure out why the Discord agent cannot use tools on my local computer',
      ),
    ).toEqual({
      action: 'ask-openjaws',
      cwd: 'openjaws-d',
      text: 'figure out why the Discord agent cannot use tools on my local computer',
    })
  })

  it('routes natural artifact requests through governed OpenJaws delivery', () => {
    const parsed = parseDirectOperatorChatCommand(
      'create a pdf report for apex-apps about tenant governance pressure and next actions',
    )

    expect(parsed?.action).toBe('ask-openjaws')
    expect(parsed?.cwd).toBe('apex-apps')
    expect(parsed?.text).toContain('Discord-deliverable pdf artifact')
    expect(parsed?.text).toContain('delivery.json')
    expect(parsed?.text).toContain('smallest bounded local harness')
  })

  it('recognizes broader Discord artifact formats in natural requests', () => {
    const pptx = parseDirectOperatorChatCommand(
      'create a powerpoint report for openjaws-d about Discord delivery status',
    )
    expect(pptx?.action).toBe('ask-openjaws')
    expect(pptx?.cwd).toBe('openjaws-d')
    expect(pptx?.text).toContain('Discord-deliverable pptx slide deck artifact')

    const spreadsheet = parseDirectOperatorChatCommand(
      'generate an xlsx report for apex-apps about tenant usage',
    )
    expect(spreadsheet?.action).toBe('ask-openjaws')
    expect(spreadsheet?.cwd).toBe('apex-apps')
    expect(spreadsheet?.text).toContain('Discord-deliverable xlsx artifact')

    const csv = parseDirectOperatorChatCommand(
      'deliver a csv artifact for immaculate about current benchmark receipts',
    )
    expect(csv?.action).toBe('ask-openjaws')
    expect(csv?.cwd).toBe('immaculate')
    expect(csv?.text).toContain('Discord-deliverable csv artifact')

    const json = parseDirectOperatorChatCommand(
      'make a json file for openjaws-d about governed search receipts',
    )
    expect(json?.action).toBe('ask-openjaws')
    expect(json?.cwd).toBe('openjaws-d')
    expect(json?.text).toContain('Discord-deliverable json artifact')
  })

  it('routes explicit OpenJaws delivery aliases through governed artifact delivery', () => {
    const parsed = parseDirectOperatorChatCommand(
      'openjaws deliver immaculate :: release readiness and next operator actions',
    )

    expect(parsed).toEqual({
      action: 'ask-openjaws',
      cwd: 'immaculate',
      text: expect.stringContaining(
        'Discord-deliverable markdown, docx, pptx, xlsx, csv, json, and pdf when supported artifact about release readiness and next operator actions.',
      ),
    })
    expect(parsed?.text).toContain('delivery.json')
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

  it('resolves apex workspace aliases through the tracked apps tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-apex-root-'))
    tempDirs.push(root)
    const workspaceRoot = join(root, 'cheeks')
    const appsPath = join(workspaceRoot, 'ignite', 'apex-os-project', 'apps')
    mkdirSync(appsPath, { recursive: true })
    const workspaces: DiscordOperatorWorkspace[] = [
      {
        id: 'cheeks',
        label: 'Cheeks Desktop Root (C:)',
        path: workspaceRoot,
      },
    ]

    expect(
      resolveOperatorWorkspacePath({
        input: 'apex-apps',
        workspaces,
        allowedRoots: [root],
      }),
    ).toBe(appsPath)

    expect(
      resolveOperatorWorkspacePath({
        input: 'apex workspace',
        workspaces,
        allowedRoots: [root],
      }),
    ).toBe(appsPath)
  })

  it('resolves Asgard workspace aliases through the tracked desktop root', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-asgard-root-'))
    tempDirs.push(root)
    const workspaceRoot = join(root, 'cheeks')
    const asgardPath = join(workspaceRoot, 'Asgard')
    mkdirSync(asgardPath, { recursive: true })
    const workspaces: DiscordOperatorWorkspace[] = [
      {
        id: 'cheeks',
        label: 'Cheeks Desktop Root (C:)',
        path: workspaceRoot,
      },
    ]

    expect(
      resolveOperatorWorkspacePath({
        input: 'asgard',
        workspaces,
        allowedRoots: [root],
      }),
    ).toBe(asgardPath)
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

  it('allocates a unique branch name when a prior governed branch already exists', { timeout: 20000 }, () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-operator-git-'))
    tempDirs.push(root)
    const repoRoot = join(root, 'openjaws')
    const worktreeRoot = join(root, 'worktrees')
    mkdirSync(repoRoot, { recursive: true })
    writeFileSync(join(repoRoot, 'README.md'), '# OpenJaws\n', 'utf8')
    const workspace = join(repoRoot, 'src', 'utils')
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, 'runtime.ts'), 'export const ready = true\n', 'utf8')
    spawnSync('git', ['-C', repoRoot, 'init'], { encoding: 'utf8' })
    spawnSync('git', ['-C', repoRoot, 'config', 'user.email', 'roundtable@example.com'], {
      encoding: 'utf8',
    })
    spawnSync('git', ['-C', repoRoot, 'config', 'user.name', 'Roundtable'], {
      encoding: 'utf8',
    })
    spawnSync('git', ['-C', repoRoot, 'add', 'README.md', 'src/utils/runtime.ts'], {
      encoding: 'utf8',
    })
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

    const context = createOperatorRunContext({
      workspace,
      jobId: 'blackbeak-follow-through-openjaws-2026-04-22t02-42-52.639z',
      profileName: 'blackbeak',
      worktreeRoot,
    })

    expect(context.branchName).toBe(
      'discord-blackbeak-utils-blackbeak-follow-through-openjaw-2',
    )
    expect(context.worktreePath).not.toBeNull()
    expect(basename(context.worktreePath!)).toMatch(/^wt-[a-f0-9]{12}$/)
    expect(context.workspacePath).toBe(
      join(
        context.worktreePath!,
        'src',
        'utils',
      ),
    )
    expect(existsSync(context.workspacePath)).toBe(true)
  })
})
