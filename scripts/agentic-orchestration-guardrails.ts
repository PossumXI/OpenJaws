import { existsSync, readFileSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export type GuardrailStatus = 'passed' | 'failed'

export type GuardrailFileRequirement = {
  path: string
  fragments: string[]
}

export type GuardrailRule = {
  id: string
  title: string
  category:
    | 'context'
    | 'orchestration'
    | 'worker-health'
    | 'benchmark'
    | 'runtime'
    | 'public-release'
    | 'docs'
  why: string
  files: GuardrailFileRequirement[]
}

export type GuardrailRuleResult = {
  id: string
  title: string
  category: GuardrailRule['category']
  status: GuardrailStatus
  summary: string
  why: string
  missingFiles: string[]
  missingFragments: Array<{
    path: string
    fragment: string
  }>
}

export type GuardrailReport = {
  generatedAt: string
  root: string
  ok: boolean
  summary: string
  counts: Record<GuardrailStatus, number>
  results: GuardrailRuleResult[]
}

type CliOptions = {
  root: string
  json: boolean
  outPath: string | null
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function buildAgenticOrchestrationGuardrailRules(): GuardrailRule[] {
  return [
    {
      id: 'context-brain-privacy-envelope',
      title: 'Context Brain stays aggregate-only and excludes secrets',
      category: 'context',
      why:
        'Users need visible context trust without widening the prompt-injection or secret-exposure surface.',
      files: [
        {
          path: 'apps/jaws-desktop/src-tauri/src/main.rs',
          fragments: [
            'fn project_context_snapshot',
            'secret-like file',
            'raw source, secrets, env files, or private prompts',
          ],
        },
        {
          path: 'apps/jaws-desktop/src/App.tsx',
          fragments: ['ProjectContextSnapshot', 'Context Brain'],
        },
        {
          path: 'docs/wiki/JAWS-Desktop-App.md',
          fragments: ['aggregate-only project scan'],
        },
      ],
    },
    {
      id: 'signed-q-route-control-plane',
      title: 'Q route manifests and remote results stay signed and phased',
      category: 'orchestration',
      why:
        'Symphony-style fan-out only scales when route work is tied to signed receipts, lineage, and phase IDs instead of stale latest-state guesses.',
      files: [
        {
          path: 'src/utils/qTraining.ts',
          fragments: [
            'QTrainingRouteSecurity',
            'verifyQTrainingRouteManifest',
            'verifyQTrainingRouteResultEnvelope',
            'payloadSha256',
            'lineageId',
            'phaseId',
          ],
        },
        {
          path: 'src/q/routing.ts',
          fragments: [
            'verifyQTrainingRouteManifestIntegrity',
            'pending_assignment',
            'signatureVerified',
          ],
        },
      ],
    },
    {
      id: 'worker-health-gated-dispatch',
      title: 'Remote worker dispatch is health-gated and fail-closed',
      category: 'worker-health',
      why:
        'Q_agents and Immaculate workers must not receive routed work when they are stale, faulted, unverified, or not explicitly assigned.',
      files: [
        {
          path: 'src/utils/qTraining.ts',
          fragments: [
            "healthStatus?: 'healthy' | 'stale' | 'faulted'",
            'eligibleWorkerCount',
            'reapStaleQTrainingRouteWorkers',
          ],
        },
        {
          path: 'src/q/routing.ts',
          fragments: [
            'reapStaleQTrainingRouteWorkers',
            'pending_assignment',
            'registerImmaculateHarnessWorker',
          ],
        },
        {
          path: 'scripts/q-route-worker-assignment-live.ts',
          fragments: [
            "healthStatus === 'healthy'",
            'assignmentEligible === true',
            'unverified federation worker',
          ],
        },
      ],
    },
    {
      id: 'personaplex-loopback-redaction',
      title: 'PersonaPlex probing is local-first and redacted',
      category: 'runtime',
      why:
        'Live voice/runtime probes should help operators repair failures without leaking credentials or calling remote hosts by default.',
      files: [
        {
          path: 'scripts/personaplex-probe.ts',
          fragments: [
            'validatePersonaPlexRuntimeUrl',
            'must not include credentials',
            'loopback',
            'redactSensitiveText',
            'allowRemote',
          ],
        },
        {
          path: 'scripts/runtime-coherence.ts',
          fragments: ['probePersonaPlexCoherence', 'PERSONAPLEX_ALLOW_REMOTE'],
        },
      ],
    },
    {
      id: 'terminalbench-verifier-receipts',
      title: 'TerminalBench runs produce honest verifier receipts',
      category: 'benchmark',
      why:
        'Public benchmark credibility depends on machine-parseable receipts, official-mode constraints, scoped job paths, and scrubbed Harbor artifacts.',
      files: [
        {
          path: 'scripts/q-terminalbench.ts',
          fragments: [
            'validateOfficialSubmissionOptions',
            'agentSetupTimeoutMultiplier = null',
            'scrubSubmissionBundle',
            'result.json',
            'terminalbench-receipt.json',
          ],
        },
        {
          path: 'scripts/q-terminalbench.test.ts',
          fragments: [
            'q-terminalbench provenance',
            'harborJobResultPath',
            'officialSubmission',
          ],
        },
      ],
    },
    {
      id: 'runtime-coherence-live-disagreement',
      title: 'Runtime coherence reports live disagreement instead of stale success',
      category: 'runtime',
      why:
        'A release pass must prefer active trace, queue, worker, Discord, and PersonaPlex failures over old completed receipts.',
      files: [
        {
          path: 'scripts/runtime-coherence.ts',
          fragments: [
            'readDiscordQAgentReceipt',
            'readDiscordRoundtableSessionSnapshot',
            'readLatestImmaculateTraceSummary',
            'readLatestQTraceSummary',
            'probePersonaPlexCoherence',
          ],
        },
        {
          path: 'src/immaculate/runtimeCoherence.ts',
          fragments: [
            'staleTraceSummaries',
            'routeQueueDepth',
            'roundtable',
            'probes',
          ],
        },
      ],
    },
    {
      id: 'public-release-copy-and-mirrors',
      title: 'Public release surfaces stay copy-safe and mirror-verified',
      category: 'public-release',
      why:
        'JAWS and OpenJaws public pages should not publish local paths, raw receipts, token-shaped text, or mismatched signed updater assets.',
      files: [
        {
          path: 'scripts/check-public-showcase-copy.ts',
          fragments: [
            'raw chain-of-thought',
            'route-request|result',
            'runStatePath',
          ],
        },
        {
          path: 'scripts/jaws-release-mirror-health.ts',
          fragments: [
            'latest.json',
            'requiresSignature',
            'targets the wrong asset',
          ],
        },
        {
          path: 'package.json',
          fragments: ['"jaws:mirror:check"', '"showcase:copy:check"'],
        },
      ],
    },
    {
      id: 'agentic-guardrail-docs',
      title: 'Agentic orchestration guardrails are documented for release operators',
      category: 'docs',
      why:
        'The safe parts of the PDF and Symphony findings need to live in repo-owned operating docs, not only in chat history.',
      files: [
        {
          path: 'docs/wiki/Agentic-Orchestration-Guardrails.md',
          fragments: [
            'trust-tiered context envelope',
            'structured worker receipts',
            'health-gated dispatch',
            'Prompt-injection boundaries',
            'public release gate',
          ],
        },
      ],
    },
  ]
}

export function evaluateGuardrailRules(args: {
  root: string
  rules: GuardrailRule[]
  now?: Date
}): GuardrailReport {
  const root = resolve(args.root)
  const results = args.rules.map(rule => {
    const missingFiles: string[] = []
    const missingFragments: GuardrailRuleResult['missingFragments'] = []

    for (const requirement of rule.files) {
      const path = resolve(root, requirement.path)
      if (!path.startsWith(root) || !existsSync(path)) {
        missingFiles.push(requirement.path)
        continue
      }
      const text = readFileSync(path, 'utf8')
      for (const fragment of requirement.fragments) {
        if (!text.includes(fragment)) {
          missingFragments.push({
            path: requirement.path,
            fragment,
          })
        }
      }
    }

    const status: GuardrailStatus =
      missingFiles.length === 0 && missingFragments.length === 0
        ? 'passed'
        : 'failed'
    return {
      id: rule.id,
      title: rule.title,
      category: rule.category,
      status,
      summary:
        status === 'passed'
          ? `${rule.title} is covered.`
          : `${rule.title} is missing ${missingFiles.length} files and ${missingFragments.length} fragments.`,
      why: rule.why,
      missingFiles,
      missingFragments,
    }
  })

  const counts = results.reduce(
    (acc, result) => {
      acc[result.status] += 1
      return acc
    },
    { passed: 0, failed: 0 } as Record<GuardrailStatus, number>,
  )
  const ok = counts.failed === 0
  return {
    generatedAt: (args.now ?? new Date()).toISOString(),
    root,
    ok,
    summary: ok
      ? `Agentic orchestration guardrails passed (${counts.passed}/${results.length}).`
      : `Agentic orchestration guardrails failed (${counts.failed}/${results.length}).`,
    counts,
    results,
  }
}

export function runAgenticOrchestrationGuardrailAudit(args: {
  root?: string
  now?: Date
} = {}): GuardrailReport {
  return evaluateGuardrailRules({
    root: args.root ?? repoRoot,
    now: args.now,
    rules: buildAgenticOrchestrationGuardrailRules(),
  })
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    root: process.cwd(),
    json: false,
    outPath: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--root' && argv[index + 1]) {
      options.root = resolve(argv[++index]!)
      continue
    }
    if (arg === '--out' && argv[index + 1]) {
      options.outPath = resolve(argv[++index]!)
      continue
    }
    throw new Error(`unknown argument: ${arg}`)
  }

  return options
}

function formatTextReport(report: GuardrailReport): string {
  return [
    report.summary,
    ...report.results.map(result => {
      const suffix =
        result.status === 'passed'
          ? ''
          : ` (${result.missingFiles.length} missing files, ${result.missingFragments.length} missing fragments)`
      return `- [${result.status}] ${result.id}: ${result.title}${suffix}`
    }),
  ].join('\n')
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  let options: CliOptions
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  const report = runAgenticOrchestrationGuardrailAudit({ root: options.root })
  const output = options.json
    ? `${JSON.stringify(report, null, 2)}\n`
    : `${formatTextReport(report)}\n`

  if (options.outPath) {
    writeFileSync(options.outPath, output, 'utf8')
  }

  process.stdout.write(output)
  return report.ok ? 0 : 1
}

if (import.meta.main) {
  process.exit(await main())
}
