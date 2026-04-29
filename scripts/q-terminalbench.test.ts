import { describe, expect, test } from 'bun:test'
import { execa } from 'execa'
import { join, resolve } from 'path'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import {
  applyOfficialSubmissionDefaults,
  buildHarborArgs,
  buildTerminalBenchRepairHint,
  buildTerminalBenchRepairPlan,
  buildTerminalBenchTaskSelectionPlan,
  buildTaskSummary,
  buildVerifierDiagnostics,
  collectAgentEnv,
  parseArgs,
  resolveDiscoveredHarborJobResultPath,
  resolveHarborDockerEnv,
  resolveTerminalBenchSessionMetadata,
  readOpenJawsAgentOutcome,
  validateOfficialSubmissionOptions,
  validateTaskSelectionOptions,
} from './q-terminalbench.ts'
import { createBenchmarkTraceWriter } from '../src/immaculate/benchmarkTrace.js'
import { buildQProviderProbeCheck } from '../src/q/runtime.js'
import {
  buildAggregateSummary,
  buildCycleReceipt,
  resolveAttemptJobName,
} from '../src/q/terminalBench.js'

describe('q-terminalbench soak options', () => {
  test('parses a deterministic seed for reproducible receipts', () => {
    const options = parseArgs(['--seed', '77'])

    expect(options.seed).toBe(77)
  })

  test('parses soak flags as an outer repeated cycle lane', () => {
    const options = parseArgs([
      '--repeat',
      '2',
      '--soak-cycles',
      '4',
      '--soak-duration-minutes',
      '30',
      '--soak-interval-ms',
      '5000',
    ])

    expect(options.repeat).toBe(2)
    expect(options.soak).toBe(true)
    expect(options.soakCycles).toBe(4)
    expect(options.soakDurationMinutes).toBe(30)
    expect(options.soakIntervalMs).toBe(5000)
  })

  test('builds deterministic job names across soak cycles and repeated attempts', () => {
    expect(
      resolveAttemptJobName(
        {
          jobName: 'smoke',
          repeat: 1,
          soak: false,
        },
        1,
        1,
      ),
    ).toBe('smoke')

    expect(
      resolveAttemptJobName(
        {
          jobName: 'smoke',
          repeat: 2,
          soak: false,
        },
        1,
        2,
      ),
    ).toBe('smoke-attempt-2')

    expect(
      resolveAttemptJobName(
        {
          jobName: 'smoke',
          repeat: 2,
          soak: true,
        },
        3,
        2,
      ),
    ).toBe('smoke-cycle-3-attempt-2')
  })

  test('uses Harbor include-task-name filters compatible with current CLI', () => {
    const options = parseArgs([
      '--include-task-name',
      'terminal-bench/circuit-fibsqrt',
      '--exclude-task-name',
      'terminal-bench/skip-me',
      '--job-name',
      'compat-check',
    ])

    expect(buildHarborArgs(options, 1, 1)).toEqual(
      expect.arrayContaining([
        '--include-task-name',
        'circuit-fibsqrt',
        '--exclude-task-name',
        'skip-me',
      ]),
    )
    expect(buildHarborArgs(options, 1, 1)).not.toContain('--task-name')
  })

  test('keeps scoped bounded runs from falling back onto stale global Harbor jobs', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'q-terminalbench-'))
    const scopedRoot = join(sandbox, 'scoped')
    const globalRoot = join(sandbox, 'global')
    mkdirSync(join(scopedRoot, 'jobs'), { recursive: true })
    mkdirSync(join(globalRoot, 'jobs', 'stale-job'), { recursive: true })
    const staleResultPath = join(globalRoot, 'jobs', 'stale-job', 'result.json')
    writeFileSync(staleResultPath, '{}\n', 'utf8')

    expect(
      resolveDiscoveredHarborJobResultPath({
        jobsDir: join(scopedRoot, 'jobs'),
        excludedPaths: new Set<string>(),
        roots: [scopedRoot],
      }),
    ).toBeNull()

    expect(
      resolveDiscoveredHarborJobResultPath({
        jobsDir: null,
        excludedPaths: new Set<string>(),
        roots: [globalRoot],
      }),
    ).toBe(staleResultPath)

    rmSync(sandbox, { force: true, recursive: true })
  })

  test('official submission defaults keep leaderboard timeout rules', () => {
    const options = applyOfficialSubmissionDefaults(
      parseArgs(['--official-submission', '--max-turns', '12']),
    )

    expect(options.dataset).toBe('terminal-bench@2.0')
    expect(options.nAttempts).toBe(5)
    expect(options.maxTurns).toBe(20)
    expect(options.agentSetupTimeoutMultiplier).toBe(1)
    expect(buildHarborArgs(options, 1, 1)).toEqual(
      expect.arrayContaining([
        '--timeout-multiplier',
        '1',
        '--ak',
        'max_turns=20',
      ]),
    )
  })

  test('rejects official submission configs that modify timeouts', () => {
    const options = parseArgs([
      '--official-submission',
      '--agent-setup-timeout-multiplier',
      '5',
      '--n-attempts',
      '5',
    ])

    expect(() => validateOfficialSubmissionOptions(options)).toThrow(
      'timeout-multiplier must equal 1.0',
    )
  })

  test('defaults to the runtime bundle lane unless source-tree runtime is explicitly requested', () => {
    const defaultOptions = parseArgs([])
    const sourceTreeOptions = parseArgs(['--source-tree-runtime'])

    expect(buildHarborArgs(defaultOptions, 1, 1)).toEqual(
      expect.arrayContaining(['--ak', 'use_runtime_bundle=true']),
    )
    expect(buildHarborArgs(sourceTreeOptions, 1, 1)).not.toEqual(
      expect.arrayContaining(['--ak', 'use_runtime_bundle=true']),
    )
  })

  test('injects verifier repair hints into the Harbor OpenJaws agent', () => {
    const options = parseArgs([
      '--job-name',
      'repair-check',
      '--benchmark-repair-hint',
      'Verifier stdout: expected 144, got placeholder output.',
    ])
    const args = buildHarborArgs(options, 1, 1)

    expect(args).toEqual(
      expect.arrayContaining([
        '--ak',
        'benchmark_repair_hint=Verifier stdout: expected 144, got placeholder output.',
      ]),
    )
  })

  test('builds a verifier-driven repair hint from failed task diagnostics', () => {
    const hint = buildTerminalBenchRepairHint([
      {
        taskName: 'terminal-bench/circuit-fibsqrt',
        trialName: 'circuit-fibsqrt__trial',
        executionStatus: 'completed',
        benchmarkStatus: 'failed',
        rewardTotal: 0,
        exceptionType: null,
        exceptionMessage: null,
        agentResultSummary: 'Generated a placeholder gates.txt.',
        agentResultSelfReportedIncomplete: true,
        verifierDiagnostics: {
          testStdoutTail: 'expected fib(isqrt(144)) modulo 2^32, got 0',
          testStderrTail: '',
        },
      } as any,
    ])

    expect(hint).toContain('Verifier-driven Terminal-Bench repair hint')
    expect(hint).toContain('circuit-fibsqrt')
    expect(hint).toContain('expected fib(isqrt(144))')

    expect(
      buildTerminalBenchRepairPlan([
        {
          taskName: 'terminal-bench/circuit-fibsqrt',
          trialName: 'circuit-fibsqrt__trial',
          executionStatus: 'completed',
          benchmarkStatus: 'failed',
          rewardTotal: 0,
          verifierDiagnostics: {
            testStdoutTail: 'expected fib(isqrt(144)) modulo 2^32, got 0',
          },
        } as any,
      ]),
    ).toMatchObject({
      enabled: true,
      candidateCount: 1,
      hintCharCount: expect.any(Number),
    })
  })

  test('builds a first-nonzero TerminalBench task selection plan', () => {
    const options = parseArgs([
      '--task-selection-lane',
      '--task-candidate-name',
      'terminal-bench/circuit-fibsqrt',
      '--task-candidate-name',
      'json-grep',
      '--job-name',
      'selector',
    ])

    expect(() => validateTaskSelectionOptions(options)).not.toThrow()
    const plan = buildTerminalBenchTaskSelectionPlan(options) as {
      enabled: boolean
      candidateCount: number
      candidates: Array<{ taskName: string; harborArgs: string[] }>
    }

    expect(plan.enabled).toBe(true)
    expect(plan.candidateCount).toBe(2)
    expect(plan.candidates[0]?.harborArgs).toEqual(
      expect.arrayContaining([
        '--include-task-name',
        'circuit-fibsqrt',
        '--job-name',
        'selector-candidate-1-terminal-bench-circuit-fibsqrt',
      ]),
    )
    expect(plan.candidates[1]?.harborArgs).toEqual(
      expect.arrayContaining(['--include-task-name', 'json-grep']),
    )
  })

  test('keeps oci q Harbor runs scoped to OCI env names', () => {
    const originalEnv = {
      Q_BASE_URL: process.env.Q_BASE_URL,
      OCI_BASE_URL: process.env.OCI_BASE_URL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    }
    process.env.Q_BASE_URL = 'https://oci.example/openai/v1'
    process.env.OCI_BASE_URL = 'https://oci.example/openai/v1'
    process.env.OPENAI_API_KEY = 'should-not-leak'
    process.env.GEMINI_API_KEY = 'should-not-leak'

    const env = collectAgentEnv({ model: 'oci:Q' })

    expect(env.Q_BASE_URL).toBe('https://oci.example/openai/v1')
    expect(env.OCI_BASE_URL).toBe('https://oci.example/openai/v1')
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.GEMINI_API_KEY).toBeUndefined()

    process.env.Q_BASE_URL = originalEnv.Q_BASE_URL
    process.env.OCI_BASE_URL = originalEnv.OCI_BASE_URL
    process.env.OPENAI_API_KEY = originalEnv.OPENAI_API_KEY
    process.env.GEMINI_API_KEY = originalEnv.GEMINI_API_KEY
  })

  test('pins Harbor to Docker Desktop on Windows when Docker env is unset', () => {
    expect(
      resolveHarborDockerEnv({
        env: {},
        platform: 'win32',
      }),
    ).toEqual({
      DOCKER_CONTEXT: 'desktop-linux',
      DOCKER_HOST: 'npipe:////./pipe/dockerDesktopLinuxEngine',
    })
  })

  test('respects explicit Docker host settings for Harbor on Windows', () => {
    expect(
      resolveHarborDockerEnv({
        env: {
          DOCKER_CONTEXT: 'custom-context',
          DOCKER_HOST: 'npipe:////./pipe/customDockerEngine',
        },
        platform: 'win32',
      }),
    ).toEqual({
      DOCKER_CONTEXT: 'custom-context',
      DOCKER_HOST: 'npipe:////./pipe/customDockerEngine',
    })
  })

  test('does not inject Docker Desktop settings for non-Windows Harbor runs', () => {
    expect(
      resolveHarborDockerEnv({
        env: {},
        platform: 'linux',
      }),
    ).toEqual({})
  })

  test('official submission validation accepts the sanctioned setup budget', () => {
    const options = applyOfficialSubmissionDefaults(
      parseArgs(['--official-submission']),
    )

    expect(() => validateOfficialSubmissionOptions(options)).not.toThrow()
  })

  test('surfaces non-executing success when the verifier reward file is missing', () => {
    expect(
      buildTaskSummary({
        taskName: 'circuit-fibsqrt',
        executionStatus: 'error',
        benchmarkStatus: 'unknown',
        rewardTotal: null,
        exceptionType: 'RewardFileNotFoundError',
        exceptionMessage: 'No reward file found',
        permissionDenialCount: 0,
        agentResultSubtype: 'success',
        agentResultSummary:
          'completed the task but only returned a prose explanation instead of changing the workspace',
      }),
    ).toContain('completed without verifier output')
  })

  test('captures verifier reward and log diagnostics from Harbor trial directories', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'q-terminalbench-verifier-'))
    try {
      const trialRoot = join(sandbox, 'task__trial')
      const verifierDir = join(trialRoot, 'verifier')
      mkdirSync(verifierDir, { recursive: true })
      const resultPath = join(trialRoot, 'result.json')
      writeFileSync(resultPath, '{}\n', 'utf8')
      writeFileSync(join(verifierDir, 'test-stdout.txt'), 'line 1\nline 2\n', 'utf8')
      writeFileSync(
        join(verifierDir, '.openjaws-log-alias-probe.txt'),
        'openjaws harbor linux logs alias ready\n',
        'utf8',
      )
      writeFileSync(
        join(verifierDir, '.openjaws-verifier-command-probe.txt'),
        'openjaws verifier command write probe\n',
        'utf8',
      )

      expect(buildVerifierDiagnostics(resultPath)).toMatchObject({
        verifierDir,
        verifierDirExists: true,
        verifierFileNames: [
          '.openjaws-log-alias-probe.txt',
          '.openjaws-verifier-command-probe.txt',
          'test-stdout.txt',
        ],
        rewardTextExists: false,
        rewardJsonExists: false,
        testStdoutExists: true,
        testStdoutBytes: 14,
        testStdoutTail: 'line 1\nline 2',
        testStderrExists: false,
        logAliasProbeExists: true,
        verifierCommandProbeExists: true,
      })
    } finally {
      rmSync(sandbox, { force: true, recursive: true })
    }
  })

  test('summarizes OpenJaws CLI result text from Harbor task artifacts', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'q-terminalbench-agent-result-'))
    try {
      const trialRoot = join(sandbox, 'task__trial')
      const agentDir = join(trialRoot, 'agent')
      mkdirSync(agentDir, { recursive: true })
      const resultPath = join(trialRoot, 'result.json')
      writeFileSync(resultPath, '{}\n', 'utf8')
      writeFileSync(
        join(agentDir, 'openjaws-result.json'),
        JSON.stringify({
          subtype: 'success',
          result:
            'Implemented a placeholder gates.txt, but it does not yet compute fib(isqrt(N)) modulo 2^32.',
        }),
        'utf8',
      )

      expect(readOpenJawsAgentOutcome(resultPath)).toEqual({
        subtype: 'success',
        summary:
          'Implemented a placeholder gates.txt, but it does not yet compute fib(isqrt(N)) modulo 2^32.',
        selfReportedIncomplete: true,
      })
    } finally {
      rmSync(sandbox, { force: true, recursive: true })
    }
  })

  test('surfaces self-reported incomplete agent output in failed task summaries', () => {
    expect(
      buildTaskSummary({
        taskName: 'circuit-fibsqrt',
        executionStatus: 'completed',
        benchmarkStatus: 'failed',
        rewardTotal: 0,
        exceptionType: null,
        exceptionMessage: null,
        permissionDenialCount: 0,
        agentResultSubtype: 'success',
        agentResultSummary:
          'Generated a placeholder gates.txt that does not yet compute the requested function.',
        agentResultSelfReportedIncomplete: true,
      }),
    ).toContain('failed after self-reported incomplete agent output')
  })
})

describe('q-terminalbench provenance', () => {
  test('captures branch, repo sha, and session scope for receipt and trace', async () => {
    const root = resolve(process.cwd())
    const [expectedTopLevel, expectedBranch] = await Promise.all([
      execa('git', ['-C', root, 'rev-parse', '--show-toplevel'], {
        reject: false,
        windowsHide: true,
      }),
      execa('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], {
        reject: false,
        windowsHide: true,
      }),
    ])

    const metadata = await resolveTerminalBenchSessionMetadata({
      root,
      runId: 'run-123',
      options: {
        officialSubmission: false,
        soak: false,
      },
    })

    expect(metadata).toMatchObject({
      runId: 'run-123',
      sessionScope: 'terminalbench:bounded',
      repoPath: resolve(root),
      worktreePath: expectedTopLevel.stdout.trim() || resolve(root),
    })
    expect(metadata.gitBranch).toBe(
      expectedBranch.stdout.trim() === 'HEAD' ? null : expectedBranch.stdout.trim(),
    )
    expect(metadata.repoSha).toMatch(/^[0-9a-f]{40}$/)

    const traceDir = join(root, 'artifacts', 'terminalbench-provenance-test')
    rmSync(traceDir, { force: true, recursive: true })
    const writer = createBenchmarkTraceWriter({
      outputDir: traceDir,
      sessionId: 'run-123',
      sessionMetadata: metadata,
    })
    expect(metadata.tracePath).toBe(writer.path)
    const firstLine = (await Bun.file(writer.path).text()).split(/\r?\n/)[0]
    expect(firstLine).toBeTruthy()
    expect(JSON.parse(firstLine)).toMatchObject({
      type: 'session.started',
      sessionId: 'run-123',
      tracePath: writer.path,
      runId: 'run-123',
      sessionScope: 'terminalbench:bounded',
      repoPath: resolve(root),
      worktreePath: expectedTopLevel.stdout.trim() || resolve(root),
      gitBranch: metadata.gitBranch,
      repoSha: metadata.repoSha,
    })
  }, 15_000)
})
describe('q-terminalbench soak receipts', () => {
  test('builds a cycle receipt and top-level aggregate without Harbor', () => {
    const attempts = [
      {
        cycle: 1,
        attempt: 1,
        status: 'completed_with_errors' as const,
        summary: 'Attempt 1 completed with 1 benchmark failure across 1 trial.',
        exitCode: 0,
        harborJobPath: 'jobs/cycle-1-attempt-1',
        harborJobResultPath: 'jobs/cycle-1-attempt-1/result.json',
        jobResultSummary: null,
        stdoutTail: 'out-1',
        stderrTail: '',
        trialCounts: {
          total: 1,
          executionErrors: 0,
          benchmarkPassed: 0,
          benchmarkFailed: 1,
          benchmarkUnknown: 0,
        },
      },
      {
        cycle: 1,
        attempt: 2,
        status: 'completed' as const,
        summary: 'Attempt 2 completed with 1/1 passing trial.',
        exitCode: 0,
        harborJobPath: 'jobs/cycle-1-attempt-2',
        harborJobResultPath: 'jobs/cycle-1-attempt-2/result.json',
        jobResultSummary: null,
        stdoutTail: 'out-2',
        stderrTail: '',
        trialCounts: {
          total: 1,
          executionErrors: 0,
          benchmarkPassed: 1,
          benchmarkFailed: 0,
          benchmarkUnknown: 0,
        },
      },
    ]

    const tasks = [
      {
        cycle: 1,
        attempt: 1,
        taskIndex: 1,
        taskName: 'terminal-bench/example-fail',
        trialName: 'example-fail__a',
        source: 'terminal-bench/terminal-bench-2',
        trialUri: 'file:///jobs/cycle-1-attempt-1/example-fail__a',
        harborResultPath: 'jobs/cycle-1-attempt-1/example-fail__a/result.json',
        executionStatus: 'completed' as const,
        benchmarkStatus: 'failed' as const,
        summary: 'example-fail completed with reward 0.00.',
        startedAt: '2026-04-16T00:00:00.000Z',
        finishedAt: '2026-04-16T00:00:01.000Z',
        totalDurationMs: 1000,
        environmentSetupDurationMs: 100,
        agentSetupDurationMs: 200,
        agentExecutionDurationMs: 300,
        verifierDurationMs: 400,
        rewardTotal: 0,
        rewardBreakdown: { reward: 0 },
        returnCode: 0,
        isError: false,
        permissionDenialCount: 0,
        exceptionType: null,
        exceptionMessage: null,
      },
      {
        cycle: 1,
        attempt: 2,
        taskIndex: 1,
        taskName: 'terminal-bench/example-pass',
        trialName: 'example-pass__b',
        source: 'terminal-bench/terminal-bench-2',
        trialUri: 'file:///jobs/cycle-1-attempt-2/example-pass__b',
        harborResultPath: 'jobs/cycle-1-attempt-2/example-pass__b/result.json',
        executionStatus: 'completed' as const,
        benchmarkStatus: 'passed' as const,
        summary: 'example-pass passed.',
        startedAt: '2026-04-16T00:00:02.000Z',
        finishedAt: '2026-04-16T00:00:04.000Z',
        totalDurationMs: 2000,
        environmentSetupDurationMs: 100,
        agentSetupDurationMs: 200,
        agentExecutionDurationMs: 300,
        verifierDurationMs: 1400,
        rewardTotal: 1,
        rewardBreakdown: { reward: 1 },
        returnCode: 0,
        isError: false,
        permissionDenialCount: 0,
        exceptionType: null,
        exceptionMessage: null,
      },
    ]

    const cycle = buildCycleReceipt({
      cycle: 1,
      startedAt: '2026-04-16T00:00:00.000Z',
      finishedAt: '2026-04-16T00:05:00.000Z',
      attempts,
      tasks,
    })

    expect(cycle.status).toBe('completed_with_errors')
    expect(cycle.durationMs).toBe(300000)
    expect(cycle.aggregate.attemptCount).toBe(2)
    expect(cycle.aggregate.totalTrials).toBe(2)
    expect(cycle.aggregate.benchmarkFailedTrials).toBe(1)
    expect(cycle.attempts[0]?.cycle).toBe(1)
    expect(cycle.tasks[0]?.cycle).toBe(1)

    const aggregate = buildAggregateSummary(
      [
        { status: 'completed' as const },
        { status: cycle.status },
        { status: 'failed' as const },
      ],
      attempts,
      tasks,
    )

    expect(aggregate.cycleCount).toBe(3)
    expect(aggregate.completedCycles).toBe(1)
    expect(aggregate.cyclesWithErrors).toBe(1)
    expect(aggregate.failedCycles).toBe(1)
    expect(aggregate.totalTrials).toBe(2)
    expect(aggregate.avgReward).toBe(0.5)
    expect(aggregate.p95TrialDurationMs).toBe(2000)
  })
})

describe('q-terminalbench provider probe checks', () => {
  test('downgrades unhealthy external provider probes to forceable warnings', () => {
    const check = buildQProviderProbeCheck({
      name: 'openjaws-provider-preflight',
      warnOnFailure: true,
      result: {
        ok: false,
        code: 'auth_failed',
        provider: 'oci',
        label: 'OCI',
        model: 'Q',
        modelRef: 'oci:Q',
        baseURL: 'https://example.com/openai/v1',
        baseURLSource: null,
        apiKeySource: 'Q_API_KEY',
        endpoint: 'https://example.com/openai/v1/responses',
        endpointLabel: '/responses',
        method: 'POST',
        checkedAt: 0,
        summary: 'OCI:Q failed · auth rejected (401)',
      },
    })

    expect(check).toEqual({
      name: 'openjaws-provider-preflight',
      status: 'warning',
      summary: 'OCI:Q failed · auth rejected (401)',
    })
  })
})
