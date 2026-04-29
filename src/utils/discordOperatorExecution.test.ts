import { describe, expect, it } from 'bun:test'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { strToU8, unzipSync, zipSync } from 'fflate'
import {
  DISCORD_OPERATOR_DELIVERY_MAX_FILE_BYTES,
  DISCORD_OPERATOR_DELIVERY_MAX_FILES,
  buildDiscordOperatorDeliveryArtifactManifest,
  collectDiscordOperatorDeliveryArtifacts,
  collectDiscordOperatorDeliveryArtifactsWithRejections,
  findApprovalCandidate,
  findDiscordOperatorRunnerPermissionBypassFlags,
  resolveDiscordOperatorDeliveryArtifactMime,
  renderDiscordOperatorDeliveryBundle,
  formatApprovalCandidateSummary,
  pushApprovalCandidateToOrigin,
  runScriptedOpenJawsOperatorJob,
  summarizeChangedFiles,
  writeDiscordOperatorDeliveryArtifactManifest,
  type DiscordOperatorApprovalCandidate,
} from './discordOperatorExecution.js'

function runGit(worktreePath: string, args: string[]): string {
  const result = Bun.spawnSync({
    cmd: ['git', '-C', worktreePath, ...args],
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '',
    },
  })
  if ((result.exitCode ?? 1) !== 0) {
    throw new Error(
      new TextDecoder().decode(result.stderr).trim() ||
        new TextDecoder().decode(result.stdout).trim() ||
        `git ${args.join(' ')} failed`,
    )
  }
  return new TextDecoder().decode(result.stdout).trim()
}

function writeOfficeXmlFixture(
  path: string,
  entries: Record<string, string> = {
    'docProps/core.xml': '<coreProperties>fixture</coreProperties>',
  },
): void {
  writeFileSync(
    path,
    Buffer.from(
      zipSync(
        Object.fromEntries(
          Object.entries(entries).map(([entryName, value]) => [
            entryName,
            strToU8(value),
          ]),
        ),
      ),
    ),
  )
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

    expect(findApprovalCandidate(candidates, null)).toBeNull()
    expect(findApprovalCandidate(candidates, 'latest')?.id).toBe('job-b')
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

  it('renders tracked operator delivery files without the local PowerShell renderer', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-render-delivery-'))
    try {
      const outputDir = join(root, 'output')
      const workspaceDir = join(root, 'workspace')
      mkdirSync(workspaceDir, { recursive: true })
      writeFileSync(join(workspaceDir, 'handoff.md'), '# handoff\n', 'utf8')

      const delivery = await renderDiscordOperatorDeliveryBundle({
        workspacePath: workspaceDir,
        outputDir,
        prompt: 'Summarize the governed operator result.',
        outputText: 'Operator result <safe> & auditable.',
        model: 'oci:Q',
        generatedAt: '2026-04-23T10:00:00.000Z',
        includePdf: false,
      })

      expect(delivery.markdownPath && existsSync(delivery.markdownPath)).toBe(true)
      expect(delivery.textPath && existsSync(delivery.textPath)).toBe(true)
      expect(delivery.htmlPath && existsSync(delivery.htmlPath)).toBe(true)
      expect(delivery.docxPath && existsSync(delivery.docxPath)).toBe(true)
      expect(delivery.pptxPath && existsSync(delivery.pptxPath)).toBe(true)
      expect(delivery.xlsxPath && existsSync(delivery.xlsxPath)).toBe(true)
      expect(delivery.pdfPath).toBeNull()
      expect(readFileSync(delivery.markdownPath!, 'utf8')).toContain(
        'Operator result <safe> & auditable.',
      )
      expect(readFileSync(delivery.htmlPath!, 'utf8')).toContain(
        'Operator result &lt;safe&gt; &amp; auditable.',
      )
      expect(readFileSync(delivery.docxPath!)[0]).toBe(0x50)
      expect(readFileSync(delivery.docxPath!)[1]).toBe(0x4b)
      const pptxFiles = unzipSync(new Uint8Array(readFileSync(delivery.pptxPath!)))
      expect(Object.keys(pptxFiles)).toContain('ppt/presentation.xml')
      expect(new TextDecoder().decode(pptxFiles['ppt/slides/slide1.xml'])).toContain(
        'OpenJaws Operator Output',
      )
      const xlsxFiles = unzipSync(new Uint8Array(readFileSync(delivery.xlsxPath!)))
      expect(Object.keys(xlsxFiles)).toContain('xl/workbook.xml')
      expect(new TextDecoder().decode(xlsxFiles['xl/worksheets/sheet1.xml'])).toContain(
        'Operator result &lt;safe&gt; &amp; auditable.',
      )
      expect(delivery.workspaceFiles).toEqual([
        {
          path: join(workspaceDir, 'handoff.md'),
          name: 'handoff.md',
          relativePath: 'handoff.md',
        },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('detects permission-bypass flags in Discord OpenJaws runner scripts', () => {
    expect(
      findDiscordOperatorRunnerPermissionBypassFlags(
        [
          '& openjaws',
          '--allow-dangerously-skip-permissions',
          '--dangerously-skip-permissions',
          '--permission-mode',
          'bypassPermissions',
        ].join('\n'),
      ),
    ).toEqual([
      '--allow-dangerously-skip-permissions',
      '--dangerously-skip-permissions',
      '--permission-mode bypassPermissions',
    ])
  })

  it('refuses Discord scripted jobs that request permission bypass by default', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-bypass-runner-'))
    try {
      const workspaceDir = join(root, 'workspace')
      const outputDir = join(root, 'output')
      const runnerScript = join(root, 'run-openjaws-visible.ps1')
      mkdirSync(workspaceDir, { recursive: true })
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(
        runnerScript,
        [
          'param([string]$Workspace, [string]$Prompt, [string]$OutputDir)',
          '& openjaws --permission-mode bypassPermissions --dangerously-skip-permissions',
        ].join('\n'),
        'utf8',
      )

      await expect(
        runScriptedOpenJawsOperatorJob({
          runContext: {
            jobId: 'job-bypass',
            requestedWorkspace: workspaceDir,
            gitRoot: null,
            gitRelativePath: null,
            branchName: null,
            worktreePath: null,
            workspacePath: workspaceDir,
            repoLabel: null,
          },
          prompt: 'Try to bypass permissions.',
          runnerScriptPath: runnerScript,
          model: 'oci:Q',
          outputDir,
          allowPermissionBypass: false,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow('permission bypass')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('reports missing scripted result receipts with an actionable diagnostic', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-missing-result-runner-'))
    try {
      const workspaceDir = join(root, 'workspace')
      const outputDir = join(root, 'output')
      const runnerScript = join(root, 'run-openjaws-visible.ps1')
      mkdirSync(workspaceDir, { recursive: true })
      mkdirSync(outputDir, { recursive: true })
      writeFileSync(
        runnerScript,
        [
          'param([string]$Workspace, [string]$Prompt, [string]$OutputDir)',
          "Write-Host 'OpenJaws visible job starting...'",
          "Write-Host \"Workspace: $Workspace\"",
        ].join('\n'),
        'utf8',
      )

      await expect(
        runScriptedOpenJawsOperatorJob({
          runContext: {
            jobId: 'job-no-result',
            requestedWorkspace: workspaceDir,
            gitRoot: null,
            gitRelativePath: null,
            branchName: null,
            worktreePath: null,
            workspacePath: workspaceDir,
            repoLabel: null,
          },
          prompt: 'Run without receipt.',
          runnerScriptPath: runnerScript,
          model: 'oci:Q',
          outputDir,
          timeoutMs: 30_000,
        }),
      ).rejects.toThrow(
        `OpenJaws scripted operator job did not produce a result receipt at ${join(outputDir, 'result.json')}.`,
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('collects canonical delivery artifacts in a stable order', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-artifacts-'))
    const outputDir = join(root, 'output')
    const workspaceDir = join(root, 'workspace')
    mkdirSync(outputDir, { recursive: true })
    mkdirSync(join(workspaceDir, 'reports'), { recursive: true })
    writeFileSync(join(outputDir, 'openjaws-output.md'), '# hi\n', 'utf8')
    writeFileSync(join(outputDir, 'openjaws-output.txt'), 'hi\n', 'utf8')
    writeFileSync(join(outputDir, 'openjaws-output.html'), '<p>hi</p>\n', 'utf8')
    writeOfficeXmlFixture(join(outputDir, 'openjaws-output.docx'))
    writeOfficeXmlFixture(join(outputDir, 'openjaws-output.pptx'))
    writeOfficeXmlFixture(join(outputDir, 'openjaws-output.xlsx'))
    writeFileSync(join(outputDir, 'openjaws-output.pdf'), 'pdf', 'utf8')
    writeFileSync(join(workspaceDir, 'report.md'), '# report\n', 'utf8')
    writeFileSync(join(workspaceDir, 'reports', 'notes.txt'), 'notes\n', 'utf8')

    expect(
      collectDiscordOperatorDeliveryArtifacts({
        outputDir,
        workspacePath: workspaceDir,
        delivery: {
          markdownPath: join(outputDir, 'openjaws-output.md'),
          textPath: join(outputDir, 'openjaws-output.txt'),
          htmlPath: join(outputDir, 'openjaws-output.html'),
          docxPath: join(outputDir, 'openjaws-output.docx'),
          pptxPath: join(outputDir, 'openjaws-output.pptx'),
          xlsxPath: join(outputDir, 'openjaws-output.xlsx'),
          pdfPath: join(outputDir, 'openjaws-output.pdf'),
          workspaceFiles: [
            {
              path: join(workspaceDir, 'report.md'),
              name: 'report.md',
              relativePath: 'report.md',
            },
            {
              path: join(workspaceDir, 'reports', 'notes.txt'),
              name: 'notes.txt',
              relativePath: 'reports/notes.txt',
            },
          ],
        },
      }).map(artifact => ({
        kind: artifact.kind,
        name: artifact.name,
        relativePath: artifact.relativePath ?? null,
      })),
    ).toEqual([
      {
        kind: 'markdown',
        name: 'openjaws-output.md',
        relativePath: null,
      },
      {
        kind: 'docx',
        name: 'openjaws-output.docx',
        relativePath: null,
      },
      {
        kind: 'pptx',
        name: 'openjaws-output.pptx',
        relativePath: null,
      },
      {
        kind: 'xlsx',
        name: 'openjaws-output.xlsx',
        relativePath: null,
      },
      {
        kind: 'pdf',
        name: 'openjaws-output.pdf',
        relativePath: null,
      },
      {
        kind: 'html',
        name: 'openjaws-output.html',
        relativePath: null,
      },
      {
        kind: 'workspace',
        name: 'report.md',
        relativePath: 'report.md',
      },
      {
        kind: 'workspace',
        name: 'notes.txt',
        relativePath: 'reports/notes.txt',
      },
    ])
  })

  it('builds a machine-checkable delivery artifact manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-manifest-'))
    const outputDir = join(root, 'output')
    mkdirSync(outputDir, { recursive: true })
    const markdownPath = join(outputDir, 'openjaws-output.md')
    const docxPath = join(outputDir, 'openjaws-output.docx')
    writeFileSync(markdownPath, '# hi\n', 'utf8')
    writeOfficeXmlFixture(docxPath)

    try {
      const manifest = buildDiscordOperatorDeliveryArtifactManifest({
        artifacts: [
          {
            kind: 'markdown',
            path: markdownPath,
            name: 'openjaws-output.md',
            relativePath: null,
          },
          {
            kind: 'docx',
            path: docxPath,
            name: 'openjaws-output.docx',
            relativePath: null,
          },
        ],
        rejectedArtifacts: [
          {
            kind: 'workspace',
            name: 'token-report.md',
            relativePath: null,
            reason: 'sensitive_content_or_invalid_container',
          },
        ],
        sourceReceipt: 'result.json',
        publicSafe: false,
        generatedAt: '2026-04-25T12:00:00.000Z',
      })

      expect(manifest.version).toBe(1)
      expect(manifest.generatedAt).toBe('2026-04-25T12:00:00.000Z')
      expect(manifest.sourceReceipt).toBe('result.json')
      expect(manifest.artifacts).toHaveLength(2)
      expect(manifest.rejectedArtifacts).toEqual([
        {
          name: 'token-report.md',
          kind: 'workspace',
          reason: 'sensitive_content_or_invalid_container',
          sourceReceipt: 'result.json',
          publicSafe: true,
        },
      ])
      expect(manifest.artifacts[0]).toEqual(
        expect.objectContaining({
          name: 'openjaws-output.md',
          mime: 'text/markdown; charset=utf-8',
          bytes: 5,
          sourceReceipt: 'result.json',
          publicSafe: false,
        }),
      )
      expect(manifest.artifacts[1]).toEqual(
        expect.objectContaining({
          name: 'openjaws-output.docx',
          mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          bytes: readFileSync(docxPath).length,
          sourceReceipt: 'result.json',
          publicSafe: false,
        }),
      )
      expect(manifest.artifacts[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(resolveDiscordOperatorDeliveryArtifactMime({
        path: join(outputDir, 'report.unknown'),
        name: 'report.unknown',
      })).toBe('application/octet-stream')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('writes a delivery manifest when every artifact was rejected', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-rejected-manifest-'))
    const outputDir = join(root, 'output')
    mkdirSync(outputDir, { recursive: true })

    try {
      const manifestPath = writeDiscordOperatorDeliveryArtifactManifest({
        outputDir,
        artifacts: [],
        rejectedArtifacts: [
          {
            kind: 'docx',
            name: 'redacted-artifact.docx',
            relativePath: null,
            reason: 'sensitive_content_or_invalid_container',
          },
        ],
        sourceReceipt: 'result.json',
        publicSafe: false,
        generatedAt: '2026-04-25T12:10:00.000Z',
      })

      expect(manifestPath).toBe(join(outputDir, 'delivery-artifacts.manifest.json'))
      const manifest = JSON.parse(readFileSync(manifestPath!, 'utf8'))
      expect(manifest.artifacts).toEqual([])
      expect(manifest.rejectedArtifacts).toEqual([
        {
          name: 'redacted-artifact.docx',
          kind: 'docx',
          reason: 'sensitive_content_or_invalid_container',
          sourceReceipt: 'result.json',
          publicSafe: true,
        },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ignores missing or out-of-root delivery artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-artifacts-filter-'))
    const outputDir = join(root, 'output')
    const workspaceDir = join(root, 'workspace')
    const outsideDir = join(root, 'outside')
    mkdirSync(outputDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })
    writeFileSync(join(outputDir, 'openjaws-output.md'), '# hi\n', 'utf8')
    writeFileSync(join(outsideDir, 'escape.txt'), 'nope\n', 'utf8')

    expect(
      collectDiscordOperatorDeliveryArtifacts({
        outputDir,
        workspacePath: workspaceDir,
        delivery: {
          markdownPath: join(outputDir, 'openjaws-output.md'),
          textPath: join(outsideDir, 'escape.txt'),
          htmlPath: null,
          docxPath: null,
          pptxPath: null,
          xlsxPath: null,
          pdfPath: null,
          workspaceFiles: [
            {
              path: join(outsideDir, 'escape.txt'),
              name: 'escape.txt',
              relativePath: 'escape.txt',
            },
            {
              path: join(root, 'missing.txt'),
              name: 'missing.txt',
              relativePath: 'missing.txt',
            },
          ],
        },
      }).map(artifact => artifact.name),
    ).toEqual(['openjaws-output.md'])
  })

  it('drops secret-bearing text artifacts before Discord upload', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-artifacts-secret-'))
    const outputDir = join(root, 'output')
    const workspaceDir = join(root, 'workspace')
    mkdirSync(outputDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })
    const safePath = join(workspaceDir, 'summary.md')
    const secretPath = join(workspaceDir, 'token-report.md')
    writeFileSync(safePath, '# summary\nNo credentials here.\n', 'utf8')
    writeFileSync(
      secretPath,
      'DISCORD_BOT_TOKEN=ABCDEFGHIJKLMNOPQRSTUVWX.YYYYYY.ZZZZZZZZZZZZZZZZZZZZZZZZZZZZ\n',
      'utf8',
    )

    try {
      const collection = collectDiscordOperatorDeliveryArtifactsWithRejections({
        outputDir,
        workspacePath: workspaceDir,
        delivery: {
          markdownPath: null,
          textPath: null,
          htmlPath: null,
          docxPath: null,
          pptxPath: null,
          xlsxPath: null,
          pdfPath: null,
          workspaceFiles: [
            {
              path: secretPath,
              name: 'token-report.md',
              relativePath: 'token-report.md',
            },
            {
              path: safePath,
              name: 'summary.md',
              relativePath: 'summary.md',
            },
          ],
        },
      })
      expect(collection.artifacts.map(artifact => artifact.name)).toEqual(['summary.md'])
      expect(collection.rejectedArtifacts).toEqual([
        {
          kind: 'workspace',
          name: 'token-report.md',
          relativePath: 'token-report.md',
          reason: 'sensitive_content_or_invalid_container',
        },
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('drops secret-bearing Office XML artifacts before Discord upload', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-artifacts-office-secret-'))
    const outputDir = join(root, 'output')
    mkdirSync(outputDir, { recursive: true })
    const secretDocxPath = join(outputDir, 'openjaws-output.docx')
    const safeXlsxPath = join(outputDir, 'openjaws-output.xlsx')
    writeOfficeXmlFixture(secretDocxPath, {
      'word/document.xml':
        '<w:document><w:t>GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWX1234567890</w:t></w:document>',
    })
    writeOfficeXmlFixture(safeXlsxPath, {
      'xl/workbook.xml': '<workbook><sheet name="public summary"/></workbook>',
    })

    try {
      expect(
        collectDiscordOperatorDeliveryArtifacts({
          outputDir,
          workspacePath: null,
          delivery: {
            markdownPath: null,
            textPath: null,
            htmlPath: null,
            docxPath: secretDocxPath,
            pptxPath: null,
            xlsxPath: safeXlsxPath,
            pdfPath: null,
            workspaceFiles: [],
          },
        }).map(artifact => artifact.name),
      ).toEqual(['openjaws-output.xlsx'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects malformed Office artifacts before Discord upload', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-artifacts-office-malformed-'))
    const outputDir = join(root, 'output')
    mkdirSync(outputDir, { recursive: true })
    const markdownPath = join(outputDir, 'openjaws-output.md')
    const malformedDocxPath = join(outputDir, 'openjaws-output.docx')
    writeFileSync(markdownPath, '# summary\nSafe public output.\n', 'utf8')
    writeFileSync(malformedDocxPath, 'not an office zip', 'utf8')

    try {
      expect(
        collectDiscordOperatorDeliveryArtifacts({
          outputDir,
          workspacePath: null,
          delivery: {
            markdownPath,
            textPath: null,
            htmlPath: null,
            docxPath: malformedDocxPath,
            pptxPath: null,
            xlsxPath: null,
            pdfPath: null,
            workspaceFiles: [],
          },
        }).map(artifact => artifact.name),
      ).toEqual(['openjaws-output.md'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('limits delivery artifacts by extension, hidden names, size, and count', () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-delivery-artifacts-limits-'))
    const outputDir = join(root, 'output')
    const workspaceDir = join(root, 'workspace')
    mkdirSync(outputDir, { recursive: true })
    mkdirSync(workspaceDir, { recursive: true })

    const workspaceFiles = Array.from({ length: DISCORD_OPERATOR_DELIVERY_MAX_FILES + 3 }, (_, index) => {
      const name = `report-${index}.md`
      const path = join(workspaceDir, name)
      writeFileSync(path, `# ${index}\n`, 'utf8')
      return {
        path,
        name,
        relativePath: name,
      }
    })
    const secretPath = join(workspaceDir, '.env')
    const binaryPath = join(workspaceDir, 'archive.bin')
    const oversizedPath = join(workspaceDir, 'oversized.md')
    writeFileSync(secretPath, 'TOKEN=nope\n', 'utf8')
    writeFileSync(binaryPath, 'binary\n', 'utf8')
    writeFileSync(oversizedPath, Buffer.alloc(DISCORD_OPERATOR_DELIVERY_MAX_FILE_BYTES + 1))

    try {
      const artifacts = collectDiscordOperatorDeliveryArtifacts({
        outputDir,
        workspacePath: workspaceDir,
        delivery: {
          markdownPath: null,
          textPath: null,
          htmlPath: null,
          docxPath: null,
          pptxPath: null,
          xlsxPath: null,
          pdfPath: null,
          workspaceFiles: [
            {
              path: secretPath,
              name: '.env',
              relativePath: '.env',
            },
            {
              path: binaryPath,
              name: 'archive.bin',
              relativePath: 'archive.bin',
            },
            {
              path: oversizedPath,
              name: 'oversized.md',
              relativePath: 'oversized.md',
            },
            ...workspaceFiles,
          ],
        },
      })

      expect(artifacts).toHaveLength(DISCORD_OPERATOR_DELIVERY_MAX_FILES)
      expect(artifacts.map(artifact => artifact.name)).toEqual(
        workspaceFiles.slice(0, DISCORD_OPERATOR_DELIVERY_MAX_FILES).map(file => file.name),
      )
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('forwards prompt footer and add-dir context into scripted OpenJaws jobs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-scripted-runner-'))
    try {
      const workspaceDir = join(root, 'workspace')
      const addDir = join(root, 'canonical-root')
      const outputDir = join(root, 'output')
      mkdirSync(workspaceDir, { recursive: true })
      mkdirSync(addDir, { recursive: true })
      const runnerScript = join(root, 'runner.ps1')
      writeFileSync(
        runnerScript,
        [
          'param(',
          '  [string]$Workspace,',
          '  [string]$Prompt,',
          '  [string]$OutputDir,',
          '  [string]$Model,',
          '  [string]$TransientConfigDir,',
          '  [string]$PromptFooter,',
          '  [string]$AddDirJsonBase64,',
          '  [string]$AddDirJson,',
          '  [string[]]$AddDir = @()',
          ')',
          '$resolvedAddDirs = @()',
          'if ($AddDirJsonBase64) {',
          '  $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($AddDirJsonBase64))',
          '  foreach ($dir in ($decoded | ConvertFrom-Json)) {',
          '    if ($dir) { $resolvedAddDirs += [string]$dir }',
          '  }',
          '}',
          'if ($AddDirJson) {',
          '  foreach ($dir in ($AddDirJson | ConvertFrom-Json)) {',
          '    if ($dir) { $resolvedAddDirs += [string]$dir }',
          '  }',
          '}',
          'foreach ($dir in $AddDir) {',
          '  if ($dir) { $resolvedAddDirs += [string]$dir }',
          '}',
          'New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null',
          "$stdoutPath = Join-Path $OutputDir 'stdout.txt'",
          "Set-Content -Path $stdoutPath -Value 'runner ok' -Encoding utf8",
          '$receipt = [pscustomobject]@{',
          '  startedAt = (Get-Date).ToString("o")',
          '  completedAt = (Get-Date).ToString("o")',
          '  workspace = $Workspace',
          '  model = $Model',
          '  prompt = $Prompt',
          '  outputDir = $OutputDir',
          '  stdoutPath = $stdoutPath',
          '  promptFooter = $PromptFooter',
          '  addDirs = @($resolvedAddDirs)',
          '  exitCode = 0',
          '}',
          "$json = $receipt | ConvertTo-Json -Depth 6",
          "$encoding = New-Object System.Text.UTF8Encoding($false)",
          "[System.IO.File]::WriteAllText((Join-Path $OutputDir 'result.json'), $json, $encoding)",
        ].join('\n'),
        'utf8',
      )

      const completed = await runScriptedOpenJawsOperatorJob({
        runContext: {
          jobId: 'job-a',
          requestedWorkspace: workspaceDir,
          gitRoot: null,
          gitRelativePath: null,
          branchName: null,
          worktreePath: null,
          workspacePath: workspaceDir,
          repoLabel: null,
        },
        prompt: 'Create the Discord deliverable.',
        runnerScriptPath: runnerScript,
        model: 'oci:Q',
        outputDir,
        addDirs: [workspaceDir, addDir, join(root, 'missing')],
        promptFooter: 'Freshness and artifact footer.',
        includePdf: false,
        timeoutMs: 30_000,
      })

      const receipt = JSON.parse(readFileSync(join(outputDir, 'result.json'), 'utf8')) as {
        promptFooter?: string
        addDirs?: string[]
      }
      expect(receipt.promptFooter).toBe('Freshness and artifact footer.')
      expect(receipt.addDirs).toEqual([workspaceDir, addDir])
      expect(completed.deliveryArtifactManifestPath).toBe(
        join(outputDir, 'delivery-artifacts.manifest.json'),
      )
      const manifest = JSON.parse(
        readFileSync(completed.deliveryArtifactManifestPath!, 'utf8'),
      ) as { sourceReceipt?: string; artifacts?: Array<{ name: string; sha256: string }> }
      expect(manifest.sourceReceipt).toBe('result.json')
      expect(manifest.artifacts?.map(artifact => artifact.name)).toContain(
        'openjaws-output.md',
      )
      expect(manifest.artifacts?.[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('refuses to push non-Discord operator branches', async () => {
    await expect(
      pushApprovalCandidateToOrigin({
        branchName: 'main',
        worktreePath: 'C:\\missing',
      }),
    ).rejects.toThrow('non-Discord operator branch')
  })

  it('refuses to push dirty approval worktrees', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-push-dirty-'))
    try {
      runGit(root, ['init'])
      runGit(root, ['config', 'user.name', 'Test Runner'])
      runGit(root, ['config', 'user.email', 'test@example.invalid'])
      writeFileSync(join(root, 'file.txt'), 'clean\n', 'utf8')
      runGit(root, ['add', 'file.txt'])
      runGit(root, ['commit', '-m', 'init'])
      runGit(root, ['checkout', '-b', 'discord-test-job'])
      const head = runGit(root, ['rev-parse', 'HEAD'])
      writeFileSync(join(root, 'file.txt'), 'dirty\n', 'utf8')

      await expect(
        pushApprovalCandidateToOrigin({
          branchName: 'discord-test-job',
          worktreePath: root,
          commitSha: head,
        }),
      ).rejects.toThrow('uncommitted changes')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('refuses to push when approval commit no longer matches HEAD', async () => {
    const root = mkdtempSync(join(tmpdir(), 'oj-push-sha-'))
    try {
      runGit(root, ['init'])
      runGit(root, ['config', 'user.name', 'Test Runner'])
      runGit(root, ['config', 'user.email', 'test@example.invalid'])
      writeFileSync(join(root, 'file.txt'), 'one\n', 'utf8')
      runGit(root, ['add', 'file.txt'])
      runGit(root, ['commit', '-m', 'init'])
      runGit(root, ['checkout', '-b', 'discord-test-job'])

      await expect(
        pushApprovalCandidateToOrigin({
          branchName: 'discord-test-job',
          worktreePath: root,
          commitSha: '0000000000000000000000000000000000000000',
        }),
      ).rejects.toThrow('does not match HEAD')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  }, 15_000)
})
