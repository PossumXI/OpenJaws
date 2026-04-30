import { describe, expect, test } from 'bun:test'
import { runApexBridgeHealth } from './apex-bridge-health.ts'
import type { ApexActionResult, ApexWorkspaceHealth } from '../src/utils/apexWorkspace.ts'

function health(service: string): ApexWorkspaceHealth {
  return {
    status: 'healthy',
    service,
    version: 'test',
    timestamp: '2026-04-30T00:00:00.000Z',
  }
}

function startResult(success: boolean, message: string): ApexActionResult {
  return { ok: success, message }
}

describe('apex-bridge-health', () => {
  test('passes when all local Apex bridges answer', async () => {
    const report = await runApexBridgeHealth({
      deps: {
        getHealth: {
          workspace: async () => health('workspace'),
          chrono: async () => health('chrono'),
          browser: async () => health('browser'),
        },
        start: {
          workspace: async () => startResult(true, 'unused'),
          chrono: async () => startResult(true, 'unused'),
          browser: async () => startResult(true, 'unused'),
        },
      },
    })

    expect(report.status).toBe('passed')
    expect(report.checks.every(check => check.status === 'passed')).toBe(true)
  })

  test('warns on missing bridges unless strict or start mode is requested', async () => {
    const report = await runApexBridgeHealth({
      deps: {
        getHealth: {
          workspace: async () => health('workspace'),
          chrono: async () => null,
          browser: async () => null,
        },
        start: {
          workspace: async () => startResult(true, 'unused'),
          chrono: async () => startResult(false, 'cargo missing'),
          browser: async () => startResult(false, 'source missing'),
        },
      },
    })

    expect(report.status).toBe('warning')
    expect(report.checks.filter(check => check.status === 'warning')).toHaveLength(2)
  })

  test('fails when start-missing cannot recover a bridge', async () => {
    let chronoChecks = 0
    const report = await runApexBridgeHealth({
      startMissing: true,
      deps: {
        getHealth: {
          workspace: async () => health('workspace'),
          chrono: async () => {
            chronoChecks += 1
            return null
          },
          browser: async () => health('browser'),
        },
        start: {
          workspace: async () => startResult(true, 'unused'),
          chrono: async () => startResult(false, 'cargo missing'),
          browser: async () => startResult(true, 'unused'),
        },
      },
    })

    expect(report.status).toBe('failed')
    expect(chronoChecks).toBe(2)
    expect(report.checks.find(check => check.id === 'chrono')).toMatchObject({
      status: 'failed',
    })
  })
})
