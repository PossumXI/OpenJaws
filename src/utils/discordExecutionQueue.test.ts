import { describe, expect, it } from 'bun:test'
import {
  findDiscordExecutionApprovalTarget,
  getNextQueuedDiscordExecutionJob,
  isDiscordExecutionTerminalStatus,
  normalizeDiscordExecutionApprovalState,
  reconcileDiscordExecutionJobs,
  shouldEnqueueDiscordExecutionJob,
  type DiscordExecutionTrackedJob,
} from './discordExecutionQueue.js'

function buildJob(
  patch: Partial<DiscordExecutionTrackedJob> = {},
): DiscordExecutionTrackedJob {
  return {
    id: 'job-1',
    branchName: 'branch-1',
    worktreePath: 'D:\\ojrt\\branch-1',
    workspacePath: 'D:\\repo',
    changedFiles: [],
    summary: 'summary',
    status: 'queued',
    approvalState: null,
    workKey: 'openjaws::.',
    projectKey: 'openjaws',
    ...patch,
  }
}

describe('discordExecutionQueue', () => {
  it('recognizes terminal statuses', () => {
    expect(isDiscordExecutionTerminalStatus('queued')).toBe(false)
    expect(isDiscordExecutionTerminalStatus('running')).toBe(false)
    expect(isDiscordExecutionTerminalStatus('completed')).toBe(true)
    expect(isDiscordExecutionTerminalStatus('rejected')).toBe(true)
  })

  it('normalizes approval state from execution status', () => {
    expect(
      normalizeDiscordExecutionApprovalState({ status: 'awaiting_approval' }),
    ).toBe('pending')
    expect(
      normalizeDiscordExecutionApprovalState({ status: 'completed' }),
    ).toBeNull()
    expect(
      normalizeDiscordExecutionApprovalState({ status: 'error' }),
    ).toBe('rejected')
  })

  it('rejects expired approval jobs during reconciliation', () => {
    const reconciled = reconcileDiscordExecutionJobs(
      [
        buildJob({
          status: 'awaiting_approval',
          approvalState: 'pending',
          completedAt: '2026-04-20T08:00:00.000Z',
        }),
      ],
      {
        nowMs: Date.parse('2026-04-20T12:00:00.000Z'),
        approvalTtlHours: 2,
      },
    )
    expect(reconciled[0]?.status).toBe('rejected')
    expect(reconciled[0]?.approvalState).toBe('rejected')
    expect(reconciled[0]?.rejectionReason).toContain('approval window expired')
  })

  it('dedupes queued work by work key and active project lease', () => {
    const jobs = [
      buildJob({
        id: 'job-openjaws',
        status: 'queued',
        workKey: 'openjaws::src',
        projectKey: 'openjaws',
      }),
    ]
    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate: {
          workKey: 'openjaws::src',
          projectKey: 'openjaws',
        },
        jobs,
        maxActiveJobs: 2,
      }),
    ).toBe(false)
    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate: {
          workKey: 'immaculate::apps/harness',
          projectKey: 'immaculate',
        },
        jobs,
        maxActiveJobs: 2,
      }),
    ).toBe(true)
  })

  it('blocks a same-project job when the prior job is awaiting approval', () => {
    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate: {
          workKey: 'openjaws::docs',
          projectKey: 'openjaws',
        },
        jobs: [
          buildJob({
            id: 'job-awaiting-approval',
            status: 'awaiting_approval',
            approvalState: null,
            workKey: 'openjaws::src',
            projectKey: 'openjaws',
          }),
        ],
        maxActiveJobs: 2,
      }),
    ).toBe(false)
  })

  it('releases a project lease only after approval resolves or expires', () => {
    const candidate = {
      workKey: 'openjaws::docs',
      projectKey: 'openjaws',
    }
    const pendingApprovalJob = buildJob({
      id: 'job-pending',
      status: 'awaiting_approval',
      approvalState: 'pending',
      workKey: 'openjaws::src',
      projectKey: 'openjaws',
      completedAt: '2026-04-20T08:00:00.000Z',
    })

    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate,
        jobs: [pendingApprovalJob],
        maxActiveJobs: 2,
      }),
    ).toBe(false)

    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate,
        jobs: [{ ...pendingApprovalJob, approvalState: 'approved' }],
        maxActiveJobs: 2,
      }),
    ).toBe(true)

    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate,
        jobs: [
          {
            ...pendingApprovalJob,
            status: 'rejected',
            approvalState: 'rejected',
          },
        ],
        maxActiveJobs: 2,
      }),
    ).toBe(true)

    const expiredApprovalJob = reconcileDiscordExecutionJobs([pendingApprovalJob], {
      nowMs: Date.parse('2026-04-20T12:00:00.000Z'),
      approvalTtlHours: 2,
    })

    expect(expiredApprovalJob[0]?.status).toBe('rejected')
    expect(
      shouldEnqueueDiscordExecutionJob({
        candidate,
        jobs: expiredApprovalJob,
        maxActiveJobs: 2,
      }),
    ).toBe(true)
  })

  it('only releases the next queued job when no job is running', () => {
    const queued = buildJob({ id: 'job-queued', status: 'queued' })
    const running = buildJob({ id: 'job-running', status: 'running' })
    expect(getNextQueuedDiscordExecutionJob([running, queued])).toBeNull()
    expect(getNextQueuedDiscordExecutionJob([queued])?.id).toBe('job-queued')
  })

  it('finds awaiting-approval jobs by id or latest', () => {
    const jobs = [
      buildJob({
        id: 'job-old',
        branchName: 'branch-old',
        status: 'awaiting_approval',
        approvalState: 'pending',
      }),
      buildJob({
        id: 'job-new',
        branchName: 'branch-new',
        status: 'awaiting_approval',
        approvalState: 'pending',
      }),
    ]
    expect(findDiscordExecutionApprovalTarget(jobs, 'job-old')?.id).toBe(
      'job-old',
    )
    expect(findDiscordExecutionApprovalTarget(jobs, null)).toBeNull()
    expect(findDiscordExecutionApprovalTarget(jobs, 'latest')?.id).toBe('job-new')
  })
})
