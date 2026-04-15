import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  buildTeamTerminalMemoryMarkdown,
  createTeamTerminalContext,
  getTeamFilePath,
  removeMemberByAgentId,
  removeMemberFromTeam,
  removeTeammateFromTeamFile,
  type TeamFile,
} from './teamHelpers.js'

describe('teamHelpers agent co-work', () => {
  afterEach(() => {
    delete process.env.CLAUDE_CONFIG_DIR
    delete process.env.OCI_CONFIG_FILE
    delete process.env.OCI_PROFILE
    delete process.env.OCI_COMPARTMENT_ID
    delete process.env.OCI_GENAI_PROJECT_ID
    delete process.env.OCI_REGION
    delete process.env.Q_BASE_URL
    delete process.env.OCI_BASE_URL
    delete process.env.Q_API_KEY
    delete process.env.OCI_API_KEY
    delete process.env.OCI_GENAI_API_KEY
    delete process.env.IMMACULATE_HARNESS_URL
    delete process.env.IMMACULATE_API_KEY
    delete process.env.IMMACULATE_ACTOR
  })

  it('captures OCI and Immaculate runtime facts in a terminal context', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openjaws-agent-cowork-'))
    try {
      const configPath = join(tempDir, 'config')
      writeFileSync(
        configPath,
        ['[DEFAULT]', 'region=us-chicago-1', ''].join('\n'),
        'utf8',
      )
      process.env.OCI_CONFIG_FILE = configPath
      process.env.OCI_PROFILE = 'DEFAULT'
      process.env.OCI_COMPARTMENT_ID = 'ocid1.compartment.oc1..example'
      process.env.OCI_GENAI_PROJECT_ID =
        'ocid1.generativeaiproject.oc1..example'
      process.env.IMMACULATE_HARNESS_URL = 'http://127.0.0.1:8787/'

      const context = createTeamTerminalContext({
        agentId: 'scout@bridge',
        agentName: 'scout',
        parentSessionId: 'session-parent',
        cwd: 'D:\\openjaws\\OpenJaws',
        model: 'oci:Q',
        backendType: 'tmux',
        tmuxPaneId: '%3',
      })

      expect(context.terminalContextId).toMatch(/^term-[a-f0-9]{8}$/)
      expect(context.provider).toBe('oci')
      expect(context.qBaseUrl).toBe(
        'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1',
      )
      expect(context.immaculateHarnessUrl).toBe('http://127.0.0.1:8787')
      expect(context.parentSessionId).toBe('session-parent')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('builds a shared terminal registry that filters out stale contexts', () => {
    const teamFile: TeamFile = {
      name: 'bridge-crew',
      createdAt: 1,
      leadAgentId: 'team-lead@bridge-crew',
      members: [
        {
          agentId: 'team-lead@bridge-crew',
          name: 'team-lead',
          joinedAt: 1,
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          subscriptions: [],
        },
        {
          agentId: 'scout@bridge-crew',
          name: 'scout',
          joinedAt: 2,
          tmuxPaneId: '%2',
          cwd: 'D:\\openjaws\\OpenJaws',
          terminalContextId: 'term-active01',
          subscriptions: [],
        },
      ],
      terminalContexts: [
        {
          terminalContextId: 'term-active01',
          agentId: 'scout@bridge-crew',
          agentName: 'scout',
          sessionId: 'session-scout',
          cwd: 'D:\\openjaws\\OpenJaws',
          projectRoot: 'D:\\openjaws\\OpenJaws',
          model: 'oci:Q',
          provider: 'oci',
          backendType: 'tmux',
          tmuxPaneId: '%2',
          qBaseUrl:
            'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1',
          immaculateHarnessUrl: 'http://127.0.0.1:8787',
          teamMemoryPath: null,
          createdAt: 1,
          updatedAt: 2,
        },
        {
          terminalContextId: 'term-stale99',
          agentId: 'retired@bridge-crew',
          agentName: 'retired',
          cwd: 'D:\\retired',
          projectRoot: 'D:\\retired',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    }

    const markdown = buildTeamTerminalMemoryMarkdown(teamFile)

    expect(markdown).toContain('# Agent Co-Work Terminal Registry: bridge-crew')
    expect(markdown).toContain('terminal_context_id: `term-active01`')
    expect(markdown).toContain('q_base_url: `https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1`')
    expect(markdown).not.toContain('term-stale99')
  })

  it('removes pane-backed terminal contexts when a teammate is removed by pane id', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'openjaws-agent-cowork-team-'))
    process.env.CLAUDE_CONFIG_DIR = configDir

    const teamFilePath = getTeamFilePath('bridge-crew')
    mkdirSync(dirname(teamFilePath), { recursive: true })
    writeFileSync(
      teamFilePath,
      JSON.stringify(
        {
          name: 'bridge-crew',
          createdAt: 1,
          leadAgentId: 'team-lead@bridge-crew',
          members: [
            {
              agentId: 'team-lead@bridge-crew',
              name: 'team-lead',
              joinedAt: 1,
              tmuxPaneId: '',
              cwd: 'D:\\openjaws\\OpenJaws',
              subscriptions: [],
            },
            {
              agentId: 'scout@bridge-crew',
              name: 'scout',
              joinedAt: 2,
              tmuxPaneId: '%2',
              cwd: 'D:\\openjaws\\OpenJaws',
              terminalContextId: 'term-scout02',
              subscriptions: [],
            },
            {
              agentId: 'helper@bridge-crew',
              name: 'helper',
              joinedAt: 3,
              tmuxPaneId: '%3',
              cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
              terminalContextId: 'term-helper03',
              subscriptions: [],
            },
          ],
          terminalContexts: [
            {
              terminalContextId: 'term-scout02',
              agentId: 'scout@bridge-crew',
              agentName: 'scout',
              cwd: 'D:\\openjaws\\OpenJaws',
              projectRoot: 'D:\\openjaws\\OpenJaws',
              tmuxPaneId: '%2',
              createdAt: 2,
              updatedAt: 2,
            },
            {
              terminalContextId: 'term-helper03',
              agentId: 'helper@bridge-crew',
              agentName: 'helper',
              cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
              projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
              tmuxPaneId: '%3',
              createdAt: 3,
              updatedAt: 3,
            },
          ],
        } satisfies TeamFile,
        null,
        2,
      ),
      'utf8',
    )

    expect(removeMemberFromTeam('bridge-crew', '%3')).toBe(true)

    const updated = JSON.parse(readFileSync(teamFilePath, 'utf8')) as TeamFile
    expect(updated.members.map(member => member.name)).toEqual([
      'team-lead',
      'scout',
    ])
    expect(
      updated.terminalContexts?.map(context => context.terminalContextId),
    ).toEqual(['term-scout02'])
  })

  it('removes agent-backed terminal contexts for in-process and named removals', () => {
    const configDir = mkdtempSync(join(tmpdir(), 'openjaws-agent-cowork-team-'))
    process.env.CLAUDE_CONFIG_DIR = configDir

    const teamFilePath = getTeamFilePath('bridge-crew')
    mkdirSync(dirname(teamFilePath), { recursive: true })
    writeFileSync(
      teamFilePath,
      JSON.stringify(
        {
          name: 'bridge-crew',
          createdAt: 1,
          leadAgentId: 'team-lead@bridge-crew',
          members: [
            {
              agentId: 'team-lead@bridge-crew',
              name: 'team-lead',
              joinedAt: 1,
              tmuxPaneId: '',
              cwd: 'D:\\openjaws\\OpenJaws',
              subscriptions: [],
            },
            {
              agentId: 'scout@bridge-crew',
              name: 'scout',
              joinedAt: 2,
              tmuxPaneId: 'in-process',
              cwd: 'D:\\openjaws\\OpenJaws',
              terminalContextId: 'term-scout02',
              subscriptions: [],
            },
            {
              agentId: 'helper@bridge-crew',
              name: 'helper',
              joinedAt: 3,
              tmuxPaneId: 'in-process',
              cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
              terminalContextId: 'term-helper03',
              subscriptions: [],
            },
          ],
          terminalContexts: [
            {
              terminalContextId: 'term-scout02',
              agentId: 'scout@bridge-crew',
              agentName: 'scout',
              cwd: 'D:\\openjaws\\OpenJaws',
              projectRoot: 'D:\\openjaws\\OpenJaws',
              createdAt: 2,
              updatedAt: 2,
            },
            {
              terminalContextId: 'term-helper03',
              agentId: 'helper@bridge-crew',
              agentName: 'helper',
              cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
              projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
              createdAt: 3,
              updatedAt: 3,
            },
          ],
        } satisfies TeamFile,
        null,
        2,
      ),
      'utf8',
    )

    expect(removeMemberByAgentId('bridge-crew', 'scout@bridge-crew')).toBe(true)
    expect(removeTeammateFromTeamFile('bridge-crew', { name: 'helper' })).toBe(
      true,
    )

    const updated = JSON.parse(readFileSync(teamFilePath, 'utf8')) as TeamFile
    expect(updated.members.map(member => member.name)).toEqual(['team-lead'])
    expect(updated.terminalContexts ?? []).toEqual([])
  })
})
