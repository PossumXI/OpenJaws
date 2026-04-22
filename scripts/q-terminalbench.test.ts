import { describe, expect, test } from 'bun:test'
import { execa } from 'execa'
import { join, resolve } from 'path'
import { rmSync } from 'fs'
import {
  buildHarborArgs,
  parseArgs,
  resolveTerminalBenchSessionMetadata,
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
  })
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
