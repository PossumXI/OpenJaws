import { describe, expect, it } from 'bun:test'
import {
  findApprovalCandidate,
  formatApprovalCandidateSummary,
  summarizeChangedFiles,
  type DiscordOperatorApprovalCandidate,
} from './discordOperatorExecution.js'

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
})
