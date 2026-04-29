import {
  findApprovalCandidate,
  type DiscordOperatorApprovalCandidate,
} from './discordOperatorExecution.js'

export type DiscordExecutionJobStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'skipped'
  | 'rejected'
  | 'error'

export type DiscordExecutionApprovalState =
  | 'pending'
  | 'approved'
  | 'rejected'
  | null

export type DiscordExecutionTrackedJob = DiscordOperatorApprovalCandidate & {
  status: DiscordExecutionJobStatus
  approvalState: DiscordExecutionApprovalState
  workKey?: string | null
  projectKey?: string | null
  leaseClaimedAt?: string | null
  leaseExpiresAt?: string | null
  leaseOwner?: string | null
  completedAt?: string | null
  approvedAt?: string | null
  approvedBy?: string | null
  rejectedAt?: string | null
  rejectedBy?: string | null
  rejectionReason?: string | null
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function isDiscordExecutionTerminalStatus(
  status: DiscordExecutionJobStatus,
): boolean {
  return (
    status === 'completed' ||
    status === 'skipped' ||
    status === 'rejected' ||
    status === 'error'
  )
}

export function normalizeDiscordExecutionApprovalState(
  job: Partial<DiscordExecutionTrackedJob>,
): DiscordExecutionApprovalState {
  if (job.approvalState === 'approved' || job.approvalState === 'rejected') {
    return job.approvalState
  }
  if (job.status === 'awaiting_approval') {
    return 'pending'
  }
  if (job.status === 'rejected' || job.status === 'error') {
    return 'rejected'
  }
  return null
}

export function reconcileDiscordExecutionJobs<
  T extends DiscordExecutionTrackedJob,
>(
  jobs: T[],
  options?: {
    nowMs?: number
    approvalTtlHours?: number
  },
): T[] {
  const nowMs = options?.nowMs ?? Date.now()
  const ttlHours = options?.approvalTtlHours ?? null
  const approvalExpiryMs =
    typeof ttlHours === 'number' && Number.isFinite(ttlHours) && ttlHours > 0
      ? ttlHours * 60 * 60_000
      : null

  return jobs.map(job => {
    const normalized = {
      ...job,
      approvalState: normalizeDiscordExecutionApprovalState(job),
    } as T

    if (
      approvalExpiryMs &&
      normalized.status === 'awaiting_approval' &&
      normalized.approvalState === 'pending'
    ) {
      const completedAtMs = toMillis(normalized.completedAt ?? null)
      if (
        completedAtMs !== null &&
        nowMs - completedAtMs >= approvalExpiryMs
      ) {
        return {
          ...normalized,
          status: 'rejected',
          approvalState: 'rejected',
          rejectedAt: new Date(nowMs).toISOString(),
          rejectionReason:
            normalized.rejectionReason ?? 'approval window expired before confirmation',
        } as T
      }
    }

    return normalized
  })
}

export function shouldEnqueueDiscordExecutionJob(args: {
  candidate:
    | Pick<DiscordExecutionTrackedJob, 'workKey' | 'projectKey'>
    | null
  jobs: DiscordExecutionTrackedJob[]
  maxActiveJobs: number
}): boolean {
  if (!args.candidate?.workKey || !args.candidate.projectKey) {
    return false
  }
  const activeJobCount = args.jobs.filter(
    job => job.status === 'queued' || job.status === 'running',
  ).length
  if (activeJobCount >= args.maxActiveJobs) {
    return false
  }
  const matchingScope = args.jobs.some(
    job =>
      job.workKey === args.candidate?.workKey &&
      !isDiscordExecutionTerminalStatus(job.status),
  )
  const activeProjectLease = args.jobs.some(
    job => job.projectKey === args.candidate?.projectKey && hasActiveProjectLease(job),
  )
  return !matchingScope && !activeProjectLease
}

function hasActiveProjectLease(
  job: Pick<DiscordExecutionTrackedJob, 'status' | 'approvalState'>,
): boolean {
  if (job.status === 'queued' || job.status === 'running') {
    return true
  }
  return (
    job.status === 'awaiting_approval' &&
    normalizeDiscordExecutionApprovalState(job) === 'pending'
  )
}

export function getNextQueuedDiscordExecutionJob<
  T extends DiscordExecutionTrackedJob,
>(jobs: T[]): T | null {
  if (jobs.some(job => job.status === 'running')) {
    return null
  }
  return jobs.find(job => job.status === 'queued') ?? null
}

export function findDiscordExecutionApprovalTarget<
  T extends DiscordExecutionTrackedJob,
>(jobs: T[], target: string | null): T | null {
  return findApprovalCandidate(
    jobs.filter(
      job =>
        job.status === 'awaiting_approval' &&
        job.approvalState === 'pending' &&
        Boolean(job.branchName),
    ),
    target,
  )
}
