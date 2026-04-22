import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  findApprovalCandidate,
  formatApprovalCandidateSummary,
  summarizeChangedFiles,
  validateApprovalCandidatePushState,
  type DiscordOperatorApprovalCandidate,
} from './discordOperatorExecution.js'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

function createGitRepo(branchName: string) {
  const root = mkdtempSync(join(tmpdir(), 'openjaws-approval-push-'))
  tempDirs.push(root)

  const runGit = (...args: string[]) => {
    const result = Bun.spawnSync({
      cmd: ['git', '-C', root, ...args],
      stdout: 'pipe',
      stderr: 'pipe',
    })
    const stdout = new TextDecoder().decode(result.stdout).trim()
    const stderr = new TextDecoder().decode(result.stderr).trim()
    if ((result.exitCode ?? 1) !== 0) {
      throw new Error(stderr || stdout || `git ${args.join(' ')} failed`)
    }
    return stdout
  }

  runGit('init')
  runGit('config', 'user.name', 'OpenJaws Test')
  runGit('config', 'user.email', 'openjaws-test@local.invalid')
  runGit('checkout', '-b', branchName)
  writeFileSync(join(root, 'README.md'), '# test\n', 'utf8')
  runGit('add', 'README.md')
  runGit('commit', '-m', 'initial commit')

  return {
    root,
    head: runGit('rev-parse', '--verify', 'HEAD'),
  }
}

describe('discordOperatorExecution', () => {
  it('summarizes changed files compactly', () => {
    expect(summarizeChangedFiles([])).toBe('No changed files were detected.')
    expect(summarizeChangedFiles(['a.ts', 'b.ts'])).toBe('a.ts, b.ts')
    expect(
      summarizeChangedFiles(['a', 'b', 'c', 'd', 'e', 'f', 'g']),
    ).toBe('a, b, c, d, e, f +1 more')
  })

  it('finds approval candidates by id or branch name', () => {
    const candidates: DiscordOperatorApprovalCandidate[] = [
      {
        id: 'job-a',
        branchName: 'discord-a',
        worktreePath: 'C:\\tmp\\a',
        workspacePath: 'D:\\repo-a',
        changedFiles: ['a.ts'],
        summary: 'A',
      },
      {
        id: 'job-b',
        branchName: 'discord-b',
        worktreePath: 'C:\\tmp\\b',
        workspacePath: 'D:\\repo-b',
        changedFiles: ['b.ts'],
        summary: 'B',
      },
    ]

    expect(findApprovalCandidate(candidates, null)?.id).toBe('job-b')
    expect(findApprovalCandidate(candidates, 'job-a')?.branchName).toBe('discord-a')
    expect(findApprovalCandidate(candidates, 'DISCORD-B')?.id).toBe('job-b')
  })

  it('formats approval candidate summaries with tests', () => {
    const summary = formatApprovalCandidateSummary({
      id: 'job-a',
      branchName: 'discord-a',
      worktreePath: 'C:\\tmp\\a',
      workspacePath: 'D:\\repo-a',
      changedFiles: ['src/index.ts'],
      summary: 'Tightened auth checks.',
      verificationSummary: 'Verification passed: bun run build',
      commitSha: 'abc123',
    })

    expect(summary).toContain('Job: job-a')
    expect(summary).toContain('Branch: discord-a')
    expect(summary).toContain('Tests: Verification passed: bun run build')
  })

  it('validates the expected branch and commit before push', async () => {
    const repo = createGitRepo('agents/test-approval')

    await expect(
      validateApprovalCandidatePushState({
        branchName: 'agents/test-approval',
        worktreePath: repo.root,
        commitSha: repo.head,
      }),
    ).resolves.toEqual({
      currentBranch: 'agents/test-approval',
      currentCommitSha: repo.head,
    })
  })

  it('rejects approval pushes when the stored commit no longer matches HEAD', async () => {
    const repo = createGitRepo('agents/test-approval-drift')

    await expect(
      validateApprovalCandidatePushState({
        branchName: 'agents/test-approval-drift',
        worktreePath: repo.root,
        commitSha: 'deadbeef',
      }),
    ).rejects.toThrow(/expected commit deadbeef/i)
  })

  it('rejects approval pushes when the worktree branch drifts', async () => {
    const repo = createGitRepo('agents/test-approval-branch')

    await expect(
      validateApprovalCandidatePushState({
        branchName: 'agents/expected-branch',
        worktreePath: repo.root,
        commitSha: repo.head,
      }),
    ).rejects.toThrow(/expected branch agents\/expected-branch/i)
  })
})
