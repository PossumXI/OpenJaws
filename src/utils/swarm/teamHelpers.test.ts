import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  buildTeamPhaseMemoryMarkdown,
  buildTeamTerminalMemoryMarkdown,
  createTeamTerminalContext,
  getActiveTeamPhaseId,
  getActiveTeamPhaseReceiptForAgent,
  getLatestPhaseReceiptForAgent,
  getTeamFilePath,
  removeMemberByAgentId,
  removeMemberFromTeam,
  removeTeammateFromTeamFile,
  recordTeamPhaseDelivery,
  recordTeamPhaseRequest,
  reuseTeamPhaseReceipt,
  setActiveTeamPhaseId,
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
          activePhaseId: 'phase-active01',
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
    expect(markdown).toContain('active_phase_id: `phase-active01`')
    expect(markdown).not.toContain('term-stale99')
  })

  it('records phase requests and delivered summaries for co-work memory', () => {
    const teamFile: TeamFile = {
      name: 'bridge-crew',
      createdAt: 1,
      leadAgentId: 'team-lead@bridge-crew',
      leadTerminalContextId: 'term-lead01',
      members: [
        {
          agentId: 'team-lead@bridge-crew',
          name: 'team-lead',
          joinedAt: 1,
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          terminalContextId: 'term-lead01',
          subscriptions: [],
        },
        {
          agentId: 'scout@bridge-crew',
          name: 'scout',
          joinedAt: 2,
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          terminalContextId: 'term-scout02',
          subscriptions: [],
        },
      ],
      terminalContexts: [
        {
          terminalContextId: 'term-lead01',
          agentId: 'team-lead@bridge-crew',
          agentName: 'team-lead',
          cwd: 'D:\\openjaws\\OpenJaws',
          projectRoot: 'D:\\openjaws\\OpenJaws',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          terminalContextId: 'term-scout02',
          agentId: 'scout@bridge-crew',
          agentName: 'scout',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
          provider: 'oci',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    }

    const receipt = recordTeamPhaseRequest(teamFile, {
      sourceAgentId: 'team-lead@bridge-crew',
      sourceTerminalContextId: 'term-lead01',
      targetAgentIds: ['scout@bridge-crew'],
      targetTerminalContextIds: ['term-scout02'],
      requestSummary: 'Compare the OpenJaws and cheeks OCI wiring before patching the bridge.',
      label: 'scout initial assignment',
    })

    expect(receipt.requestSummary).toBe(
      'Compare the OpenJaws and cheeks OCI wiring before patching the bridge.',
    )
    expect(receipt.targetTerminalContextIds).toEqual(['term-scout02'])

    const delivered = recordTeamPhaseDelivery(teamFile, {
      fromAgentId: 'scout@bridge-crew',
      toAgentIds: ['team-lead@bridge-crew'],
      summary: 'Found the OCI path drift and patched the shared bridge config.',
      kind: 'deliverable',
    })

    expect(delivered?.phaseId).toBe(receipt.phaseId)
    expect(delivered?.status).toBe('delivered')
    expect(delivered?.lastDeliverableSummary).toBe(
      'Found the OCI path drift and patched the shared bridge config.',
    )
    expect(getLatestPhaseReceiptForAgent(teamFile, 'scout@bridge-crew')?.phaseId).toBe(
      receipt.phaseId,
    )

    const markdown = buildTeamPhaseMemoryMarkdown(teamFile)
    expect(markdown).toContain('# Agent Co-Work Phase Memory: bridge-crew')
    expect(markdown).toContain('phase_id: `')
    expect(markdown).toContain(
      'last_deliverable: Found the OCI path drift and patched the shared bridge config.',
    )
    expect(markdown).toContain(
      'deliverable · scout -> team-lead · Found the OCI path drift and patched the shared bridge config.',
    )
  })

  it('pins an active phase to a terminal context and resolves it back', () => {
    const teamFile: TeamFile = {
      name: 'bridge-crew',
      createdAt: 1,
      leadAgentId: 'team-lead@bridge-crew',
      leadTerminalContextId: 'term-lead01',
      members: [
        {
          agentId: 'team-lead@bridge-crew',
          name: 'team-lead',
          joinedAt: 1,
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          terminalContextId: 'term-lead01',
          subscriptions: [],
        },
        {
          agentId: 'scout@bridge-crew',
          name: 'scout',
          joinedAt: 2,
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          terminalContextId: 'term-scout02',
          subscriptions: [],
        },
      ],
      terminalContexts: [
        {
          terminalContextId: 'term-lead01',
          agentId: 'team-lead@bridge-crew',
          agentName: 'team-lead',
          cwd: 'D:\\openjaws\\OpenJaws',
          projectRoot: 'D:\\openjaws\\OpenJaws',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          terminalContextId: 'term-scout02',
          agentId: 'scout@bridge-crew',
          agentName: 'scout',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    }

    const receipt = recordTeamPhaseRequest(teamFile, {
      sourceAgentId: 'team-lead@bridge-crew',
      sourceTerminalContextId: 'term-lead01',
      targetAgentIds: ['scout@bridge-crew'],
      targetTerminalContextIds: ['term-scout02'],
      requestSummary: 'Keep the bridge and cheeks OCI logic aligned.',
      label: 'bridge phase',
    })

    setActiveTeamPhaseId(teamFile, {
      agentId: 'scout@bridge-crew',
      terminalContextId: 'term-scout02',
      phaseId: receipt.phaseId,
    })

    expect(
      getActiveTeamPhaseId(teamFile, 'scout@bridge-crew', 'term-scout02'),
    ).toBe(receipt.phaseId)
    expect(
      getActiveTeamPhaseReceiptForAgent(
        teamFile,
        'scout@bridge-crew',
        'term-scout02',
      )?.label,
    ).toBe('bridge phase')
  })

  it('reuses an explicit phase across a new teammate terminal instead of creating a new receipt', () => {
    const teamFile: TeamFile = {
      name: 'bridge-crew',
      createdAt: 1,
      leadAgentId: 'team-lead@bridge-crew',
      leadTerminalContextId: 'term-lead01',
      members: [
        {
          agentId: 'team-lead@bridge-crew',
          name: 'team-lead',
          joinedAt: 1,
          tmuxPaneId: '',
          cwd: 'D:\\openjaws\\OpenJaws',
          terminalContextId: 'term-lead01',
          subscriptions: [],
        },
        {
          agentId: 'scout@bridge-crew',
          name: 'scout',
          joinedAt: 2,
          tmuxPaneId: '%2',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          terminalContextId: 'term-scout02',
          subscriptions: [],
        },
        {
          agentId: 'bridge@bridge-crew',
          name: 'bridge',
          joinedAt: 3,
          tmuxPaneId: '%3',
          cwd: 'D:\\howard_client_job_1',
          terminalContextId: 'term-bridge03',
          subscriptions: [],
        },
      ],
      terminalContexts: [
        {
          terminalContextId: 'term-lead01',
          agentId: 'team-lead@bridge-crew',
          agentName: 'team-lead',
          cwd: 'D:\\openjaws\\OpenJaws',
          projectRoot: 'D:\\openjaws\\OpenJaws',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          terminalContextId: 'term-scout02',
          agentId: 'scout@bridge-crew',
          agentName: 'scout',
          cwd: 'C:\\Users\\Knight\\Desktop\\cheeks',
          projectRoot: 'C:\\Users\\Knight\\Desktop\\cheeks',
          createdAt: 2,
          updatedAt: 2,
        },
        {
          terminalContextId: 'term-bridge03',
          agentId: 'bridge@bridge-crew',
          agentName: 'bridge',
          cwd: 'D:\\howard_client_job_1',
          projectRoot: 'D:\\howard_client_job_1',
          createdAt: 3,
          updatedAt: 3,
        },
      ],
    }

    const receipt = recordTeamPhaseRequest(teamFile, {
      sourceAgentId: 'team-lead@bridge-crew',
      sourceTerminalContextId: 'term-lead01',
      targetAgentIds: ['scout@bridge-crew'],
      targetTerminalContextIds: ['term-scout02'],
      requestSummary: 'Trace the OCI bridge drift and prep a patch.',
      label: 'bridge drift phase',
    })

    const reused = reuseTeamPhaseReceipt(teamFile, {
      phaseId: receipt.phaseId,
      fromAgentId: 'team-lead@bridge-crew',
      toAgentIds: ['bridge@bridge-crew'],
      summary: 'Join the same drift phase from the Howard project side.',
      kind: 'request',
      sourceTerminalContextId: 'term-lead01',
      targetTerminalContextIds: ['term-bridge03'],
      projectRoots: ['D:\\howard_client_job_1'],
    })

    expect(reused?.phaseId).toBe(receipt.phaseId)
    expect(teamFile.phaseReceipts).toHaveLength(1)
    expect(reused?.targetAgentIds).toEqual([
      'scout@bridge-crew',
      'bridge@bridge-crew',
    ])
    expect(reused?.targetTerminalContextIds).toEqual([
      'term-scout02',
      'term-bridge03',
    ])
    expect(reused?.projectRoots).toEqual([
      'D:\\openjaws\\OpenJaws',
      'C:\\Users\\Knight\\Desktop\\cheeks',
      'D:\\howard_client_job_1',
    ])
    expect(reused?.deliveries).toHaveLength(2)
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
