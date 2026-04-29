import { describe, expect, it } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { strToU8, zipSync } from 'fflate'
import {
  buildDiscordRoundtableReceipt,
  buildDiscordRoundtableOperatorPromptFooter,
  classifyDiscordRoundtableExecution,
  inspectDiscordRoundtableExecution,
} from './discordRoundtableExecution.js'

function writeOfficeXmlFixture(path: string): void {
  writeFileSync(
    path,
    Buffer.from(zipSync({
      'docProps/core.xml': strToU8('<coreProperties>fixture</coreProperties>'),
    })),
  )
}

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

  it('only allows commits for clean verified code changes', () => {
    expect(
      inspectDiscordRoundtableExecution({
        changedFiles: ['src/utils/managedEnv.ts'],
        verificationPassed: true,
      }).commitAllowed,
    ).toBe(true)
    expect(
      inspectDiscordRoundtableExecution({
        changedFiles: ['src/utils/managedEnv.ts', 'receipt.json'],
        verificationPassed: true,
      }).commitAllowed,
    ).toBe(false)
  })

  it('builds roundtable operator footers with freshness and scoped-branch constraints', () => {
    const footer = buildDiscordRoundtableOperatorPromptFooter({
      personaName: 'Viola',
      targetPath: 'D:\\openjaws\\OpenJaws',
      gitRoot: 'D:\\openjaws\\OpenJaws',
      targetRootLabel: 'OpenJaws',
      action: {
        id: 'action-1',
        title: 'Tighten planner shaping',
        reason: 'Reduce PASS outcomes.',
        targetPath: 'D:\\openjaws\\OpenJaws',
        prompt: 'tighten planner shaping',
      },
      runContext: {
        jobId: 'action-1',
        requestedWorkspace: 'D:\\openjaws\\OpenJaws',
        gitRoot: 'D:\\openjaws\\OpenJaws',
        gitRelativePath: '.',
        branchName: 'discord-roundtable-viola-openjaws-action-1',
        worktreePath: 'D:\\openjaws\\worktrees\\discord-roundtable-viola-openjaws-action-1',
        workspacePath: 'D:\\openjaws\\worktrees\\discord-roundtable-viola-openjaws-action-1',
        repoLabel: 'openjaws',
      },
    })

    expect(footer).toContain('runtime date/time:')
    expect(footer).toContain('June 2024')
    expect(footer).toContain('code-bearing changes')
    expect(footer).toContain('do not commit output receipts')
  })

  it('builds an isolated roundtable receipt with worktree metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-roundtable-receipt-'))
    const outputDir = join(root, 'roundtable-output', 'job-1')
    const workspacePath = join(root, 'worktrees', 'openjaws', 'discord-violet-openjaws-roundtable-1')
    mkdirSync(outputDir, { recursive: true })
    mkdirSync(workspacePath, { recursive: true })
    writeFileSync(join(outputDir, 'openjaws-output.md'), '# output\n', 'utf8')
    writeFileSync(join(outputDir, 'openjaws-output.txt'), 'output\n', 'utf8')
    writeFileSync(join(outputDir, 'openjaws-output.html'), '<p>output</p>\n', 'utf8')
    writeOfficeXmlFixture(join(outputDir, 'openjaws-output.docx'))
    writeFileSync(join(outputDir, 'openjaws-output.pdf'), 'pdf', 'utf8')

    expect(
      buildDiscordRoundtableReceipt({
        personaId: 'violet',
        personaName: 'Violet',
        action: {
          id: 'roundtable-1',
          title: 'Harden the branch-only lane',
          reason: 'Keep receipts isolated from repo output.',
          targetPath: root,
          prompt: 'fix the branch-only lane',
        },
        targetPath: root,
        gitRoot: root,
        targetRootLabel: 'OpenJaws',
        runContext: {
          branchName: 'discord-violet-openjaws-roundtable-1',
          worktreePath: workspacePath,
          workspacePath,
        },
        outputDir,
        job: {
          changedFiles: ['src/utils/discordRoundtableExecution.ts'],
          commitSha: 'abc123',
          delivery: {
            markdownPath: join(outputDir, 'openjaws-output.md'),
            textPath: join(outputDir, 'openjaws-output.txt'),
            htmlPath: join(outputDir, 'openjaws-output.html'),
            docxPath: join(outputDir, 'openjaws-output.docx'),
            pptxPath: join(outputDir, 'openjaws-output.pptx'),
            xlsxPath: join(outputDir, 'openjaws-output.xlsx'),
            pdfPath: join(outputDir, 'openjaws-output.pdf'),
            workspaceFiles: null,
          },
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
      worktreePath: workspacePath,
      workspacePath,
      artifacts: {
        stdoutPath: join(outputDir, 'stdout.txt'),
        markdownPath: join(outputDir, 'openjaws-output.md'),
        resultPath: join(outputDir, 'result.json'),
        deliveryPath: join(outputDir, 'delivery.json'),
        deliveryArtifacts: [
          {
            kind: 'markdown',
            path: join(outputDir, 'openjaws-output.md'),
            name: 'openjaws-output.md',
            relativePath: null,
          },
          {
            kind: 'docx',
            path: join(outputDir, 'openjaws-output.docx'),
            name: 'openjaws-output.docx',
            relativePath: null,
          },
          {
            kind: 'pdf',
            path: join(outputDir, 'openjaws-output.pdf'),
            name: 'openjaws-output.pdf',
            relativePath: null,
          },
          {
            kind: 'html',
            path: join(outputDir, 'openjaws-output.html'),
            name: 'openjaws-output.html',
            relativePath: null,
          },
          {
            kind: 'text',
            path: join(outputDir, 'openjaws-output.txt'),
            name: 'openjaws-output.txt',
            relativePath: null,
          },
        ],
      },
      executionQuality: {
        mergeable: true,
      },
    })
  })
})
