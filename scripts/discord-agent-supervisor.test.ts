import { describe, expect, test } from 'bun:test'
import { mkdirSync, writeFileSync } from 'fs'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  buildDiscordAgentSupervisorPlan,
  formatSupervisorCommand,
  parseArgs,
} from './discord-agent-supervisor.ts'

function createStation(files: string[] = []) {
  const root = mkdtempSync(join(tmpdir(), 'openjaws-discord-supervisor-'))
  const station = join(root, 'local-command-station')
  mkdirSync(station, { recursive: true })
  for (const file of files) {
    writeFileSync(join(station, file), '# test\n', 'utf8')
  }
  return root
}

describe('discord-agent-supervisor', () => {
  test('builds a validated Q repair plan through the tracked wrapper', () => {
    const root = createStation([
      'repair-q-agent.ps1',
      'discord-q-agent.env.ps1',
    ])
    const options = parseArgs(['repair', '--agent', 'Q', '--root', root])
    const plan = buildDiscordAgentSupervisorPlan(options)

    expect(plan.missing).toEqual([])
    expect(plan.scriptPath.endsWith('repair-q-agent.ps1')).toBe(true)
    expect(plan.envFilePath?.endsWith('discord-q-agent.env.ps1')).toBe(true)
    expect(formatSupervisorCommand(plan)).toContain('-AgentLabel Q')
  })

  test('builds repair plans for Viola and Blackbeak env files', () => {
    const root = createStation([
      'repair-q-agent.ps1',
      'discord-viola.env.ps1',
      'discord-blackbeak.env.ps1',
    ])

    const viola = buildDiscordAgentSupervisorPlan(
      parseArgs(['repair', '--agent', 'viola', '--root', root]),
    )
    const blackbeak = buildDiscordAgentSupervisorPlan(
      parseArgs(['repair', 'blackbeak', '--root', root]),
    )

    expect(viola.envFilePath?.endsWith('discord-viola.env.ps1')).toBe(true)
    expect(blackbeak.envFilePath?.endsWith('discord-blackbeak.env.ps1')).toBe(true)
    expect(viola.missing).toEqual([])
    expect(blackbeak.missing).toEqual([])
  })

  test('builds a scheduled-task install plan without requiring agent env files', () => {
    const root = createStation(['install-q-agent-tasks.ps1'])
    const plan = buildDiscordAgentSupervisorPlan(
      parseArgs(['install-tasks', '--root', root]),
    )

    expect(plan.envFilePath).toBeNull()
    expect(plan.scriptPath.endsWith('install-q-agent-tasks.ps1')).toBe(true)
    expect(plan.missing).toEqual([])
  })

  test('reports missing local supervisor files before spawning PowerShell', () => {
    const root = createStation([])
    const plan = buildDiscordAgentSupervisorPlan(
      parseArgs(['repair', '--agent', 'Q', '--root', root]),
    )

    expect(plan.missing.some(item => item.endsWith('repair-q-agent.ps1'))).toBe(true)
    expect(plan.missing.some(item => item.endsWith('discord-q-agent.env.ps1'))).toBe(true)
  })

  test('quotes rendered display commands with PowerShell-safe single quotes', () => {
    const root = createStation([
      'repair-q-agent.ps1',
      'discord-q-agent.env.ps1',
    ])
    const plan = buildDiscordAgentSupervisorPlan(
      parseArgs(['repair', '--agent', 'Q', '--root', root]),
    )

    plan.args.push('D:\\agent station\\"quoted"')
    plan.args.push("D:\\operator's station")

    const command = formatSupervisorCommand(plan)
    expect(command).toContain("'D:\\agent station\\\"quoted\"'")
    expect(command).toContain("'D:\\operator''s station'")
  })

  test('rejects unknown agent labels', () => {
    expect(() => parseArgs(['repair', '--agent', 'Skyler'])).toThrow(
      'agent must be one of Q, Viola, or Blackbeak',
    )
  })
})
