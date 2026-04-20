import { describe, expect, it } from 'bun:test'
import {
  buildDiscordRoundtableReceipt,
  classifyDiscordRoundtableExecution,
} from './discordRoundtableExecution.js'

describe('discordRoundtableExecution', () => {
  it('classifies verified code commits as mergeable', () => {
    expect(
      classifyDiscordRoundtableExecution({
        changedFiles: ['src/utils/managedEnv.ts'],
        verificationPassed: true,
        commitSha: 'abc123',
      }),
    ).toEqual({
      hasCodeChanges: true,
      artifactOnly: false,
      hasDisallowedChanges: false,
      verificationPassed: true,
      mergeable: true,
    })
  })

  it('rejects artifact-only output as non-mergeable even with a commit', () => {
    expect(
      classifyDiscordRoundtableExecution({
        changedFiles: ['artifacts/', 'receipt.json', 'stdout.txt'],
        verificationPassed: true,
        commitSha: 'abc123',
      }),
    ).toEqual({
      hasCodeChanges: false,
      artifactOnly: true,
      hasDisallowedChanges: true,
      verificationPassed: true,
      mergeable: false,
    })
  })

  it('rejects mixed code and artifact output as non-mergeable until cleaned', () => {
    expect(
      classifyDiscordRoundtableExecution({
        changedFiles: ['apps/harness/src/utils.ts', 'receipt.json'],
        verificationPassed: true,
        commitSha: 'abc123',
      }),
    ).toEqual({
      hasCodeChanges: true,
      artifactOnly: false,
      hasDisallowedChanges: true,
      verificationPassed: true,
      mergeable: false,
    })
  })

  it('treats generated receipt and delivery files as non-code receipts', () => {
    expect(
      classifyDiscordRoundtableExecution({
        changedFiles: ['receipt.json', 'delivery.json', 'stdout.txt'],
        verificationPassed: true,
        commitSha: 'abc123',
      }),
    ).toEqual({
      hasCodeChanges: false,
      artifactOnly: true,
      hasDisallowedChanges: true,
      verificationPassed: true,
      mergeable: false,
    })
  })

  it('rejects unverified code changes as non-mergeable', () => {
    expect(
      classifyDiscordRoundtableExecution({
        changedFiles: ['internal/cortex/apex_integration.go'],
        verificationPassed: false,
        commitSha: null,
      }),
    ).toEqual({
      hasCodeChanges: true,
      artifactOnly: false,
      hasDisallowedChanges: false,
      verificationPassed: false,
      mergeable: false,
    })
  })

  it('builds an isolated roundtable receipt with worktree metadata', () => {
    expect(
      buildDiscordRoundtableReceipt({
        personaId: 'violet',
        personaName: 'Violet',
        action: {
          id: 'roundtable-1',
          title: 'Harden the branch-only lane',
          reason: 'Keep receipts isolated from repo output.',
          targetPath: 'D:\\openjaws\\OpenJaws',
          prompt: 'fix the branch-only lane',
        },
        targetPath: 'D:\\openjaws\\OpenJaws',
        gitRoot: 'D:\\openjaws\\OpenJaws',
        targetRootLabel: 'OpenJaws',
        runContext: {
          branchName: 'discord-violet-openjaws-roundtable-1',
          worktreePath: 'D:\\openjaws\\worktrees\\openjaws\\discord-violet-openjaws-roundtable-1',
          workspacePath:
            'D:\\openjaws\\worktrees\\openjaws\\discord-violet-openjaws-roundtable-1',
        },
        outputDir: 'D:\\openjaws\\roundtable-output\\job-1',
        job: {
          changedFiles: ['src/utils/discordRoundtableExecution.ts'],
          commitSha: 'abc123',
          verification: {
            passed: true,
            summary: 'Verification passed: bun run build',
            attempted: true,
            command: 'bun run build',
            stdout: null,
            stderr: null,
          },
          result: {
            startedAt: '2026-04-20T16:00:00.000Z',
            completedAt: '2026-04-20T16:05:00.000Z',
          },
        },
        executionQuality: {
          hasCodeChanges: true,
          artifactOnly: false,
          hasDisallowedChanges: false,
          verificationPassed: true,
          mergeable: true,
        },
        timestampIso: '2026-04-20T16:05:00.000Z',
      }),
    ).toMatchObject({
      version: 1,
      targetRoot: 'OpenJaws',
      branchName: 'discord-violet-openjaws-roundtable-1',
      worktreePath:
        'D:\\openjaws\\worktrees\\openjaws\\discord-violet-openjaws-roundtable-1',
      workspacePath:
        'D:\\openjaws\\worktrees\\openjaws\\discord-violet-openjaws-roundtable-1',
      artifacts: {
        stdoutPath: 'D:\\openjaws\\roundtable-output\\job-1\\stdout.txt',
        markdownPath: 'D:\\openjaws\\roundtable-output\\job-1\\openjaws-output.md',
        resultPath: 'D:\\openjaws\\roundtable-output\\job-1\\result.json',
        deliveryPath: 'D:\\openjaws\\roundtable-output\\job-1\\delivery.json',
      },
      executionQuality: {
        mergeable: true,
      },
    })
  })
})
