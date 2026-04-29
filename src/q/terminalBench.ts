export type QTerminalBenchExecutionStatus = 'completed' | 'error'
export type QTerminalBenchBenchmarkStatus = 'passed' | 'failed' | 'unknown'

export type QTerminalBenchVerifierDiagnostics = {
  verifierDir: string
  verifierDirExists: boolean
  verifierFileNames: string[]
  rewardTextPath: string
  rewardTextExists: boolean
  rewardJsonPath: string
  rewardJsonExists: boolean
  testStdoutPath: string
  testStdoutExists: boolean
  testStdoutBytes: number | null
  testStdoutTail: string | null
  testStderrPath: string
  testStderrExists: boolean
  testStderrBytes: number | null
  testStderrTail: string | null
  logAliasProbePath: string
  logAliasProbeExists: boolean
  verifierCommandProbePath: string
  verifierCommandProbeExists: boolean
}

export type QTerminalBenchTaskReceipt = {
  cycle: number
  attempt: number
  taskIndex: number
  taskName: string | null
  trialName: string | null
  source: string | null
  trialUri: string | null
  harborResultPath: string
  executionStatus: QTerminalBenchExecutionStatus
  benchmarkStatus: QTerminalBenchBenchmarkStatus
  summary: string
  startedAt: string | null
  finishedAt: string | null
  totalDurationMs: number | null
  environmentSetupDurationMs: number | null
  agentSetupDurationMs: number | null
  agentExecutionDurationMs: number | null
  verifierDurationMs: number | null
  rewardTotal: number | null
  rewardBreakdown: Record<string, number> | null
  returnCode: number | null
  isError: boolean | null
  permissionDenialCount: number | null
  exceptionType: string | null
  exceptionMessage: string | null
  agentResultSubtype?: string | null
  agentResultSummary?: string | null
  agentResultSelfReportedIncomplete?: boolean | null
  verifierDiagnostics?: QTerminalBenchVerifierDiagnostics | null
}

export type QTerminalBenchTrialCounts = {
  total: number
  executionErrors: number
  benchmarkPassed: number
  benchmarkFailed: number
  benchmarkUnknown: number
}

export type QTerminalBenchAttemptReceipt = {
  cycle: number
  attempt: number
  status: 'completed' | 'completed_with_errors' | 'failed'
  summary: string
  exitCode: number | null
  harborJobPath: string | null
  harborJobResultPath: string | null
  jobResultSummary: Record<string, unknown> | null
  stdoutTail: string
  stderrTail: string
  trialCounts: QTerminalBenchTrialCounts
}

export type QTerminalBenchRunSummary = {
  attemptCount: number
  completedAttempts: number
  attemptsWithErrors: number
  failedAttempts: number
  totalTrials: number
  executionErrorTrials: number
  benchmarkPassedTrials: number
  benchmarkFailedTrials: number
  benchmarkUnknownTrials: number
  avgTrialDurationMs: number
  p50TrialDurationMs: number
  p95TrialDurationMs: number
  avgReward: number
}

export type QTerminalBenchCycleStatus =
  | QTerminalBenchAttemptReceipt['status']
  | 'dry_run'

export type QTerminalBenchCycleReceipt = {
  cycle: number
  status: QTerminalBenchCycleStatus
  summary: string
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
  attemptCount: number
  aggregate: QTerminalBenchRunSummary
  attempts: readonly QTerminalBenchAttemptReceipt[]
  tasks: readonly QTerminalBenchTaskReceipt[]
  exitCode: number | null
  jobPathGuess: string | null
  jobResultPath: string | null
  jobResultSummary: Record<string, unknown> | null
  stdoutTail: string
  stderrTail: string
}

export type QTerminalBenchAggregateSummary = QTerminalBenchRunSummary & {
  cycleCount: number
  completedCycles: number
  cyclesWithErrors: number
  failedCycles: number
}

export type QTerminalBenchSoakStopReason =
  | 'dry_run'
  | 'single_cycle'
  | 'cycle_limit'
  | 'duration_limit'

export type QTerminalBenchSoakReceipt = {
  enabled: boolean
  maxCycles: number
  maxDurationMinutes: number | null
  cycleDelayMs: number
  plannedCycleCount: number
  completedCycleCount: number
  stopReason: QTerminalBenchSoakStopReason | null
  startedAt: string | null
  finishedAt: string | null
  durationMs: number | null
}

function readIsoDurationMs(start: unknown, end: unknown): number | null {
  if (typeof start !== 'string' || typeof end !== 'string') {
    return null
  }
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  return Math.round(endMs - startMs)
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  )
  return sorted[index] ?? null
}

export function buildTrialCounts(
  tasks: readonly Pick<QTerminalBenchTaskReceipt, 'executionStatus' | 'benchmarkStatus'>[],
): QTerminalBenchTrialCounts {
  return tasks.reduce<QTerminalBenchTrialCounts>(
    (counts, task) => {
      counts.total += 1
      if (task.executionStatus === 'error') {
        counts.executionErrors += 1
      }
      if (task.benchmarkStatus === 'passed') {
        counts.benchmarkPassed += 1
      } else if (task.benchmarkStatus === 'failed') {
        counts.benchmarkFailed += 1
      } else {
        counts.benchmarkUnknown += 1
      }
      return counts
    },
    {
      total: 0,
      executionErrors: 0,
      benchmarkPassed: 0,
      benchmarkFailed: 0,
      benchmarkUnknown: 0,
    },
  )
}

export function buildRunSummary(
  attempts: readonly QTerminalBenchAttemptReceipt[],
  tasks: readonly QTerminalBenchTaskReceipt[],
): QTerminalBenchRunSummary {
  const counts = buildTrialCounts(tasks)
  const completedAttempts = attempts.filter(attempt => attempt.status === 'completed').length
  const attemptsWithErrors = attempts.filter(
    attempt => attempt.status === 'completed_with_errors',
  ).length
  const failedAttempts = attempts.filter(attempt => attempt.status === 'failed').length
  const durationValues = tasks
    .map(task => task.totalDurationMs)
    .filter((value): value is number => value !== null)
  const rewardValues = tasks
    .map(task => task.rewardTotal)
    .filter((value): value is number => value !== null)

  return {
    attemptCount: attempts.length,
    completedAttempts,
    attemptsWithErrors,
    failedAttempts,
    totalTrials: counts.total,
    executionErrorTrials: counts.executionErrors,
    benchmarkPassedTrials: counts.benchmarkPassed,
    benchmarkFailedTrials: counts.benchmarkFailed,
    benchmarkUnknownTrials: counts.benchmarkUnknown,
    avgTrialDurationMs:
      durationValues.length > 0
        ? Math.round(
            durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length,
          )
        : 0,
    p50TrialDurationMs: percentile(durationValues, 0.5) ?? 0,
    p95TrialDurationMs: percentile(durationValues, 0.95) ?? 0,
    avgReward:
      rewardValues.length > 0
        ? Math.round(
            (rewardValues.reduce((sum, value) => sum + value, 0) / rewardValues.length) *
              1000,
          ) / 1000
        : 0,
  }
}

export function buildAggregateSummary(
  cycles: readonly Pick<QTerminalBenchCycleReceipt, 'status'>[],
  attempts: readonly QTerminalBenchAttemptReceipt[],
  tasks: readonly QTerminalBenchTaskReceipt[],
): QTerminalBenchAggregateSummary {
  const runSummary = buildRunSummary(attempts, tasks)
  return {
    cycleCount: cycles.length,
    completedCycles: cycles.filter(cycle => cycle.status === 'completed').length,
    cyclesWithErrors: cycles.filter(cycle => cycle.status === 'completed_with_errors').length,
    failedCycles: cycles.filter(cycle => cycle.status === 'failed').length,
    ...runSummary,
  }
}

export function buildAttemptSummary(args: {
  attempt: number
  exitCode: number | null
  trialCounts: QTerminalBenchTrialCounts
}): { status: QTerminalBenchAttemptReceipt['status']; summary: string } {
  if (args.exitCode !== 0) {
    return {
      status: 'failed',
      summary: `Attempt ${args.attempt} failed to finish the Harbor run.`,
    }
  }

  if (args.trialCounts.executionErrors > 0 || args.trialCounts.benchmarkFailed > 0) {
    const issueParts = [
      args.trialCounts.executionErrors > 0
        ? `${args.trialCounts.executionErrors} execution error${args.trialCounts.executionErrors === 1 ? '' : 's'}`
        : null,
      args.trialCounts.benchmarkFailed > 0
        ? `${args.trialCounts.benchmarkFailed} benchmark failure${args.trialCounts.benchmarkFailed === 1 ? '' : 's'}`
        : null,
    ].filter(Boolean)
    return {
      status: 'completed_with_errors',
      summary: `Attempt ${args.attempt} completed with ${issueParts.join(' and ')} across ${args.trialCounts.total} trial${args.trialCounts.total === 1 ? '' : 's'}.`,
    }
  }

  return {
    status: 'completed',
    summary: `Attempt ${args.attempt} completed with ${args.trialCounts.benchmarkPassed}/${args.trialCounts.total} passing trial${args.trialCounts.total === 1 ? '' : 's'}.`,
  }
}

export function resolveAttemptJobName(
  options: Pick<{ jobName: string | null; repeat: number; soak: boolean }, 'jobName' | 'repeat' | 'soak'>,
  cycle: number,
  attempt: number,
): string | null {
  if (!options.jobName) {
    return null
  }
  const suffixes: string[] = []
  if (options.soak) {
    suffixes.push(`cycle-${cycle}`)
  }
  if (options.repeat > 1) {
    suffixes.push(`attempt-${attempt}`)
  }
  return suffixes.length > 0 ? `${options.jobName}-${suffixes.join('-')}` : options.jobName
}

export function buildCycleReceipt(args: {
  cycle: number
  startedAt: string | null
  finishedAt: string | null
  attempts: readonly QTerminalBenchAttemptReceipt[]
  tasks: readonly QTerminalBenchTaskReceipt[]
}): QTerminalBenchCycleReceipt {
  const aggregate = buildRunSummary(args.attempts, args.tasks)
  const failedAttempts = args.attempts.filter(attempt => attempt.status === 'failed')
  const attemptsWithErrors = args.attempts.filter(
    attempt => attempt.status === 'completed_with_errors',
  )
  const lastAttempt = args.attempts.at(-1) ?? null

  let status: QTerminalBenchCycleStatus
  let summary: string
  if (args.attempts.length === 0) {
    status = 'failed'
    summary = `Cycle ${args.cycle} did not launch any Harbor attempts.`
  } else if (failedAttempts.length > 0) {
    status = 'failed'
    summary =
      failedAttempts.length === args.attempts.length
        ? `Cycle ${args.cycle} failed in all ${args.attempts.length} Harbor attempt${args.attempts.length === 1 ? '' : 's'}.`
        : `Cycle ${args.cycle} failed in ${failedAttempts.length}/${args.attempts.length} Harbor attempt${args.attempts.length === 1 ? '' : 's'}.`
  } else if (
    aggregate.executionErrorTrials > 0 ||
    aggregate.benchmarkFailedTrials > 0 ||
    attemptsWithErrors.length > 0
  ) {
    status = 'completed_with_errors'
    summary = `Cycle ${args.cycle} completed with ${aggregate.executionErrorTrials} execution error trial${aggregate.executionErrorTrials === 1 ? '' : 's'} and ${aggregate.benchmarkFailedTrials} benchmark-failing trial${aggregate.benchmarkFailedTrials === 1 ? '' : 's'} across ${aggregate.totalTrials} total trial${aggregate.totalTrials === 1 ? '' : 's'}.`
  } else {
    status = 'completed'
    summary = `Cycle ${args.cycle} completed with ${aggregate.benchmarkPassedTrials}/${aggregate.totalTrials} passing trial${aggregate.totalTrials === 1 ? '' : 's'} across ${aggregate.attemptCount} Harbor attempt${aggregate.attemptCount === 1 ? '' : 's'}.`
  }

  return {
    cycle: args.cycle,
    status,
    summary,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    durationMs: readIsoDurationMs(args.startedAt, args.finishedAt),
    attemptCount: args.attempts.length,
    aggregate,
    attempts: args.attempts,
    tasks: args.tasks,
    exitCode: failedAttempts.length > 0 ? 1 : 0,
    jobPathGuess: lastAttempt?.harborJobPath ?? null,
    jobResultPath: lastAttempt?.harborJobResultPath ?? null,
    jobResultSummary: lastAttempt?.jobResultSummary ?? null,
    stdoutTail: lastAttempt?.stdoutTail ?? '',
    stderrTail: lastAttempt?.stderrTail ?? '',
  }
}

export function buildDryRunCycles(
  options: Pick<{ soak: boolean; repeat: number }, 'soak' | 'repeat'>,
  plannedCycleCount: number,
): QTerminalBenchCycleReceipt[] {
  const aggregate = buildRunSummary([], [])
  return Array.from({ length: plannedCycleCount }, (_, index) => ({
    cycle: index + 1,
    status: 'dry_run',
    summary: options.soak
      ? `Soak cycle ${index + 1} planned but not executed in dry-run mode.`
      : 'Bounded Terminal-Bench run planned but not executed in dry-run mode.',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    attemptCount: options.repeat,
    aggregate,
    attempts: [],
    tasks: [],
    exitCode: null,
    jobPathGuess: null,
    jobResultPath: null,
    jobResultSummary: null,
    stdoutTail: '',
    stderrTail: '',
  }))
}

export function buildReportOutcome(args: {
  options: Pick<{ soak: boolean; repeat: number }, 'soak' | 'repeat'>
  cycles: readonly QTerminalBenchCycleReceipt[]
  aggregate: QTerminalBenchAggregateSummary
}): { status: string; summary: string; exitCode: number } {
  if (args.options.soak && args.cycles.length === 0) {
    return {
      status: 'failed',
      summary: 'Terminal-Bench soak hit its duration ceiling before any bounded cycle launched.',
      exitCode: 1,
    }
  }

  const failedCycles = args.cycles.filter(cycle => cycle.status === 'failed')
  if (failedCycles.length > 0) {
    return {
      status: 'failed',
      summary: args.options.soak
        ? `Terminal-Bench soak failed in ${failedCycles.length}/${args.aggregate.cycleCount} cycle${args.aggregate.cycleCount === 1 ? '' : 's'}.`
        : args.options.repeat > 1
          ? `Terminal-Bench repeated run failed in ${args.aggregate.failedAttempts}/${args.aggregate.attemptCount} attempt${args.aggregate.attemptCount === 1 ? '' : 's'}.`
          : 'Harbor Terminal-Bench run failed.',
      exitCode: 1,
    }
  }

  if (
    args.aggregate.executionErrorTrials > 0 ||
    args.aggregate.benchmarkFailedTrials > 0 ||
    args.aggregate.cyclesWithErrors > 0
  ) {
    return {
      status: 'completed_with_errors',
      summary: args.options.soak
        ? `Terminal-Bench soak completed with ${args.aggregate.executionErrorTrials} execution error trial${args.aggregate.executionErrorTrials === 1 ? '' : 's'} and ${args.aggregate.benchmarkFailedTrials} benchmark-failing trial${args.aggregate.benchmarkFailedTrials === 1 ? '' : 's'} across ${args.aggregate.totalTrials} total trial${args.aggregate.totalTrials === 1 ? '' : 's'}.`
        : args.options.repeat > 1
          ? `Terminal-Bench repeated run completed with ${args.aggregate.executionErrorTrials} execution error trial${args.aggregate.executionErrorTrials === 1 ? '' : 's'} and ${args.aggregate.benchmarkFailedTrials} benchmark-failing trial${args.aggregate.benchmarkFailedTrials === 1 ? '' : 's'} across ${args.aggregate.totalTrials} total trial${args.aggregate.totalTrials === 1 ? '' : 's'}.`
          : `Terminal-Bench run completed with ${args.aggregate.executionErrorTrials} execution error trial${args.aggregate.executionErrorTrials === 1 ? '' : 's'} and ${args.aggregate.benchmarkFailedTrials} benchmark-failing trial${args.aggregate.benchmarkFailedTrials === 1 ? '' : 's'}.`,
      exitCode: 0,
    }
  }

  return {
    status: 'completed',
    summary: args.options.soak
      ? `Terminal-Bench soak completed with ${args.aggregate.benchmarkPassedTrials}/${args.aggregate.totalTrials} passing trial${args.aggregate.totalTrials === 1 ? '' : 's'} across ${args.aggregate.attemptCount} Harbor attempt${args.aggregate.attemptCount === 1 ? '' : 's'}.`
      : args.options.repeat > 1
        ? `Terminal-Bench repeated run completed with ${args.aggregate.benchmarkPassedTrials}/${args.aggregate.totalTrials} passing trial${args.aggregate.totalTrials === 1 ? '' : 's'} across ${args.aggregate.attemptCount} Harbor attempt${args.aggregate.attemptCount === 1 ? '' : 's'}.`
        : 'Harbor Terminal-Bench run completed without execution or benchmark failures.',
    exitCode: 0,
  }
}
