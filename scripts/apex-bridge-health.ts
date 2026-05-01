import {
  APEX_BROWSER_API_URL,
  APEX_CHRONO_API_URL,
  APEX_WORKSPACE_API_URL,
  getApexBrowserHealth,
  getApexChronoHealth,
  getApexWorkspaceHealth,
  probeApexLocalHealth,
  startApexBrowserBridge,
  startApexChronoBridge,
  startApexWorkspaceApi,
  type ApexActionResult,
  type ApexWorkspaceHealth,
} from '../src/utils/apexWorkspace.js'

type ApexBridgeId = 'workspace' | 'chrono' | 'browser'
type ApexBridgeStatus = 'passed' | 'warning' | 'failed'

type ApexBridgeDefinition = {
  id: ApexBridgeId
  service: string
  url: string
}

type ApexBridgeCheck = ApexBridgeDefinition & {
  status: ApexBridgeStatus
  summary: string
  health: ApexWorkspaceHealth | null
  listenerHealth?: ApexWorkspaceHealth | null
  start?: ApexActionResult | null
}

export type ApexBridgeHealthReport = {
  status: ApexBridgeStatus
  checkedAt: string
  checks: ApexBridgeCheck[]
}

type ApexBridgeDeps = {
  getHealth: Record<ApexBridgeId, () => Promise<ApexWorkspaceHealth | null>>
  getListenerHealth: Record<ApexBridgeId, () => Promise<ApexWorkspaceHealth | null>>
  start: Record<ApexBridgeId, () => Promise<ApexActionResult>>
}

type ApexBridgeHealthOptions = {
  startMissing?: boolean
  strict?: boolean
  deps?: ApexBridgeDeps
}

const BRIDGES: ApexBridgeDefinition[] = [
  {
    id: 'workspace',
    service: 'Apex workspace bridge',
    url: APEX_WORKSPACE_API_URL,
  },
  {
    id: 'chrono',
    service: 'Apex Chrono bridge',
    url: APEX_CHRONO_API_URL,
  },
  {
    id: 'browser',
    service: 'Apex browser bridge',
    url: APEX_BROWSER_API_URL,
  },
]

function defaultDeps(): ApexBridgeDeps {
  return {
    getHealth: {
      workspace: getApexWorkspaceHealth,
      chrono: getApexChronoHealth,
      browser: getApexBrowserHealth,
    },
    getListenerHealth: {
      workspace: () => probeApexLocalHealth(APEX_WORKSPACE_API_URL),
      chrono: () => probeApexLocalHealth(APEX_CHRONO_API_URL),
      browser: () => probeApexLocalHealth(APEX_BROWSER_API_URL),
    },
    start: {
      workspace: startApexWorkspaceApi,
      chrono: startApexChronoBridge,
      browser: startApexBrowserBridge,
    },
  }
}

function combineStatus(checks: ApexBridgeCheck[]): ApexBridgeStatus {
  if (checks.some(check => check.status === 'failed')) {
    return 'failed'
  }
  if (checks.some(check => check.status === 'warning')) {
    return 'warning'
  }
  return 'passed'
}

export async function runApexBridgeHealth(
  options: ApexBridgeHealthOptions = {},
): Promise<ApexBridgeHealthReport> {
  const deps = options.deps ?? defaultDeps()
  const checks: ApexBridgeCheck[] = []

  for (const bridge of BRIDGES) {
    const initialHealth = await deps.getHealth[bridge.id]()
    if (initialHealth) {
      checks.push({
        ...bridge,
        status: 'passed',
        summary: `${bridge.service} is reachable.`,
        health: initialHealth,
      })
      continue
    }

    const listenerHealth = await deps.getListenerHealth[bridge.id]()
    if (listenerHealth && !options.startMissing) {
      checks.push({
        ...bridge,
        status: options.strict ? 'failed' : 'warning',
        summary: `${bridge.service} has a local listener, but it is not trusted by this OpenJaws session. Stop it or set OPENJAWS_APEX_TRUST_LOCALHOST=1 to trust that listener explicitly.`,
        health: null,
        listenerHealth,
      })
      continue
    }

    let start: ApexActionResult | null = null
    let followupHealth: ApexWorkspaceHealth | null = null
    if (options.startMissing) {
      start = await deps.start[bridge.id]()
      followupHealth = await deps.getHealth[bridge.id]()
    }

    const recovered = Boolean(followupHealth)
    checks.push({
      ...bridge,
      status: recovered ? 'passed' : options.strict || options.startMissing ? 'failed' : 'warning',
      summary: recovered
        ? `${bridge.service} started and is reachable.`
        : start
          ? `${bridge.service} is still unreachable after start attempt: ${start.message}`
          : `${bridge.service} is unreachable. Run bun scripts/apex-bridge-health.ts --json --start-missing from the operator machine to attempt a guarded launch.`,
      health: followupHealth,
      listenerHealth,
      start,
    })
  }

  return {
    status: combineStatus(checks),
    checkedAt: new Date().toISOString(),
    checks,
  }
}

function parseArgs(argv: string[]): {
  json: boolean
  startMissing: boolean
  strict: boolean
} {
  return {
    json: argv.includes('--json'),
    startMissing: argv.includes('--start-missing'),
    strict: argv.includes('--strict'),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const report = await runApexBridgeHealth(options)
  if (options.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Apex bridge health ${report.status}.`)
    for (const check of report.checks) {
      console.log(`- [${check.status}] ${check.id}: ${check.summary}`)
    }
  }
  return report.status === 'failed' ? 1 : 0
}

if (import.meta.main) {
  process.exit(await main())
}
