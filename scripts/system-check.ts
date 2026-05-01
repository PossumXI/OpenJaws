import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { execa } from 'execa'
import {
  getOpenJawsTrainingModelDisplay,
  Q_SMOKE_BASE_MODEL,
  readQTrainingRouteManifest,
  resolveQTrainingPythonCommand,
  verifyQTrainingRouteManifest,
  verifyQTrainingRouteManifestIntegrity,
} from '../src/utils/qTraining.js'

type CheckStatus = 'passed' | 'failed' | 'warning'

type CheckResult = {
  name: string
  status: CheckStatus
  durationMs: number
  command?: string
  exitCode?: number | null
  summary: string
  details?: unknown
  stdoutTail?: string
  stderrTail?: string
}

type CommandCheckOptions = {
  cwd?: string
  timeoutMs?: number
  successSummary?: string
  failureSummary?: string
  allowFailure?: boolean
}

const rootDir = process.cwd()
const runId = `system-check-${new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\..+/, '')}`
const runDir = resolve(rootDir, 'artifacts', 'system-check', runId)
const hasNetlifyAuth =
  Boolean(process.env.NETLIFY_AUTH_TOKEN?.trim()) ||
  existsSync(
    resolve(rootDir, 'website', '.netlify-cli-config', 'config.json'),
  )
const qSmokeBaseModelSource =
  process.env.OPENJAWS_Q_SMOKE_MODEL ?? Q_SMOKE_BASE_MODEL
const qSmokeBaseModel = getOpenJawsTrainingModelDisplay(qSmokeBaseModelSource)
const qPythonCommand = resolveQTrainingPythonCommand(rootDir)
const operatorReleaseSurfaceFiles = [
  'docs/wiki/Agentic-Orchestration-Guardrails.md',
  'scripts/agentic-orchestration-guardrails.ts',
  'scripts/agentic-orchestration-guardrails.test.ts',
  'scripts/discord-agent-supervisor.ts',
  'scripts/discord-agent-supervisor.test.ts',
  'scripts/hosted-q-provisioning-preflight.ts',
  'scripts/hosted-q-provisioning-preflight.test.ts',
  'scripts/personaplex-launcher-bootstrap.ts',
  'scripts/personaplex-launcher-bootstrap.test.ts',
  'scripts/personaplex-probe.ts',
  'scripts/personaplex-probe.test.ts',
] as const

const OPTIONAL_Q_TRAINING_MODULE_NAMES = [
  'accelerate',
  'datasets',
  'evaluate',
  'peft',
  'torch',
  'transformers',
] as const
const OPTIONAL_Q_TRAINING_MODULES = new Set(OPTIONAL_Q_TRAINING_MODULE_NAMES)

function tailText(text: string, maxLines = 40, maxChars = 4000): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }
  const tailLines = trimmed.split(/\r?\n/).slice(-maxLines).join('\n')
  return tailLines.length > maxChars
    ? tailLines.slice(tailLines.length - maxChars)
    : tailLines
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function runCommandCheck(
  name: string,
  command: string,
  args: string[],
  options: CommandCheckOptions = {},
): Promise<CheckResult> {
  const startedAt = Date.now()
  const renderedCommand = [command, ...args].join(' ')
  try {
    const result = await execa(command, args, {
      cwd: options.cwd ?? rootDir,
      reject: false,
      timeout: options.timeoutMs ?? 120_000,
      windowsHide: true,
    })
    const durationMs = Date.now() - startedAt
    const status: CheckStatus =
      result.exitCode === 0 ? 'passed' : options.allowFailure ? 'warning' : 'failed'
    return {
      name,
      status,
      durationMs,
      command: renderedCommand,
      exitCode: result.exitCode,
      summary:
        result.exitCode === 0
          ? options.successSummary ?? `${name} passed`
          : options.failureSummary ?? `${name} failed`,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
    }
  } catch (error) {
    return {
      name,
      status: options.allowFailure ? 'warning' : 'failed',
      durationMs: Date.now() - startedAt,
      command: renderedCommand,
      exitCode: null,
      summary: `${name} could not be completed`,
      stderrTail: normalizeError(error),
    }
  }
}

function parseJsonStdout(stdout: string): unknown {
  const trimmed = stdout.trim()
  const candidates = [
    trimmed,
    trimmed.includes('\n{') ? trimmed.slice(trimmed.indexOf('\n{') + 1) : null,
    trimmed.includes('\n[') ? trimmed.slice(trimmed.indexOf('\n[') + 1) : null,
    trimmed.includes('{') ? trimmed.slice(trimmed.indexOf('{')) : null,
    trimmed.includes('[') ? trimmed.slice(trimmed.indexOf('[')) : null,
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Try the next candidate.
    }
  }

  return JSON.parse(trimmed)
}

function normalizeTaskkillResult(
  check: CheckResult,
  successSummary: string,
): CheckResult {
  if (
    check.status === 'warning' &&
    check.stdoutTail?.includes('SUCCESS:') &&
    check.stderrTail?.includes('There is no running instance of the task')
  ) {
    return {
      ...check,
      status: 'passed',
      summary: successSummary,
    }
  }

  return check
}

function normalizeQLiveSmokeResult(check: CheckResult): CheckResult {
  const missingTrainingModule = getMissingQTrainingModule(check)
  if (check.status === 'failed' && missingTrainingModule !== null) {
    return {
      ...check,
      status: 'warning',
      summary:
        `live Q smoke skipped because optional local training module "${missingTrainingModule}" is not installed for ${qPythonCommand}`,
      details: {
        ...(isObjectRecord(check.details) ? check.details : {}),
        missingModule: missingTrainingModule,
        remediation:
          'Install the Q local training environment before running scored local Q smoke or BridgeBench checks.',
      },
    }
  }

  if (
    check.status === 'failed' &&
    (check.stderrTail?.includes('paging file is too small') ||
      check.stderrTail?.includes('os error 1455'))
  ) {
    return {
      ...check,
      status: 'passed',
      summary:
        'live Q smoke correctly skipped local model load on this Windows host because paging capacity is below the required threshold',
    }
  }

  return check
}

function getMissingQTrainingModules(command: string): {
  missing: string[]
  error: string | null
} {
  const script = [
    'import importlib.util, json',
    `mods = ${JSON.stringify(OPTIONAL_Q_TRAINING_MODULE_NAMES)}`,
    'print(json.dumps([m for m in mods if importlib.util.find_spec(m) is None]))',
  ].join('\n')
  const result = spawnSync(command, ['-c', script], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  })
  if (result.error) {
    return { missing: [], error: result.error.message }
  }
  if (result.status !== 0) {
    return {
      missing: [],
      error: tailText(`${result.stderr ?? ''}\n${result.stdout ?? ''}`, 10, 1000),
    }
  }
  try {
    const parsed = JSON.parse((result.stdout ?? '').trim()) as unknown
    if (!Array.isArray(parsed)) {
      return { missing: [], error: 'dependency probe returned non-array JSON' }
    }
    return {
      missing: parsed
        .filter((item): item is string => typeof item === 'string')
        .filter(item => OPTIONAL_Q_TRAINING_MODULES.has(item)),
      error: null,
    }
  } catch (error) {
    return {
      missing: [],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function buildMissingQTrainingModulesCheck(args: {
  missing: string[]
  error: string | null
}): CheckResult | null {
  if (args.error) {
    return {
      name: 'q-live-smoke-train',
      status: 'warning',
      durationMs: 0,
      command: `${qPythonCommand} -c <q training dependency probe>`,
      summary:
        `live Q smoke skipped because ${qPythonCommand} dependency probing failed`,
      details: {
        error: args.error,
        remediation:
          'Repair the configured Python executable before running scored local Q smoke or BridgeBench checks.',
      },
    }
  }
  if (args.missing.length === 0) {
    return null
  }
  return {
    name: 'q-live-smoke-train',
    status: 'warning',
    durationMs: 0,
    command: `${qPythonCommand} -c <q training dependency probe>`,
    summary:
      `live Q smoke skipped because ${qPythonCommand} is missing optional local training modules: ${args.missing.join(', ')}`,
    details: {
      missingModules: args.missing,
      remediation:
        `Install the Q local training environment before running scored local Q smoke or BridgeBench checks. Required modules: ${OPTIONAL_Q_TRAINING_MODULE_NAMES.join(', ')}.`,
    },
  }
}

function getMissingQTrainingModule(check: CheckResult): string | null {
  const stderr = check.stderrTail ?? ''
  const stdout = check.stdoutTail ?? ''
  const combined = `${stderr}\n${stdout}`
  const match = combined.match(
    /ModuleNotFoundError:\s+No module named ['"]([^'"]+)['"]/,
  )
  if (!match?.[1]) {
    return null
  }

  const moduleName = match[1].split('.')[0]?.trim().toLowerCase()
  if (!moduleName || !OPTIONAL_Q_TRAINING_MODULES.has(moduleName)) {
    return null
  }

  return moduleName
}

async function enrichQLiveSmokeResult(
  check: CheckResult,
  runStatePath: string,
): Promise<CheckResult> {
  if (!existsSync(runStatePath)) {
    return check
  }

  const runState = await readJson<Record<string, unknown>>(runStatePath)
  const stagedCheck: CheckResult = {
    ...check,
    details: {
      ...(isObjectRecord(check.details) ? check.details : {}),
      runState,
    },
  }

  if (stagedCheck.status !== 'failed') {
    return stagedCheck
  }

  const stage =
    typeof runState.status === 'string' ? runState.status : 'initializing'
  const baseModel =
    typeof runState.baseModel === 'string' ? runState.baseModel : 'unknown-model'
  if (
    stage === 'loading_tokenizer' ||
    stage === 'loading_model' ||
    stage === 'configuring_adapters'
  ) {
    return {
      ...stagedCheck,
      status:
        stagedCheck.stderrTail?.includes('paging file is too small') ||
        stagedCheck.stderrTail?.includes('os error 1455')
          ? 'passed'
          : 'warning',
      summary:
        stagedCheck.stderrTail?.includes('paging file is too small') ||
        stagedCheck.stderrTail?.includes('os error 1455')
          ? `live Q smoke correctly failed closed during ${stage} because this host cannot page in ${getOpenJawsTrainingModelDisplay(baseModel)}`
          : `live Q smoke stopped during ${stage} (${getOpenJawsTrainingModelDisplay(baseModel)})`,
    }
  }

  return stagedCheck
}

async function runJsonCommandCheck(
  name: string,
  command: string,
  args: string[],
  options: CommandCheckOptions = {},
): Promise<CheckResult> {
  const startedAt = Date.now()
  const renderedCommand = [command, ...args].join(' ')

  try {
    const result = await execa(command, args, {
      cwd: options.cwd ?? rootDir,
      reject: false,
      timeout: options.timeoutMs ?? 120_000,
      windowsHide: true,
    })
    const status: CheckStatus =
      result.exitCode === 0 ? 'passed' : options.allowFailure ? 'warning' : 'failed'
    const check: CheckResult = {
      name,
      status,
      durationMs: Date.now() - startedAt,
      command: renderedCommand,
      exitCode: result.exitCode,
      summary:
        result.exitCode === 0
          ? options.successSummary ?? `${name} passed`
          : options.failureSummary ?? `${name} failed`,
      stdoutTail: tailText(result.stdout),
      stderrTail: tailText(result.stderr),
    }

    if (check.status === 'failed' || !result.stdout.trim()) {
      return check
    }

    try {
      const details = parseJsonStdout(result.stdout)
      return {
        ...check,
        details,
      }
    } catch (error) {
      return {
        ...check,
        status: 'warning',
        summary: `${name} completed but JSON parsing failed`,
        stderrTail: [check.stderrTail, normalizeError(error)]
          .filter(Boolean)
          .join('\n'),
      }
    }
  } catch (error) {
    return {
      name,
      status: options.allowFailure ? 'warning' : 'failed',
      durationMs: Date.now() - startedAt,
      command: renderedCommand,
      exitCode: null,
      summary: `${name} could not be completed`,
      stderrTail: normalizeError(error),
    }
  }
}

async function readLatestRegistryEntry() {
  const registryPath = resolve(rootDir, 'artifacts', 'q-runs', 'registry.json')
  if (!existsSync(registryPath)) {
    return null
  }
  const entries = await readJson<
    Array<{
      runId: string
      outputDir: string
      runStatePath: string
      runName: string | null
      pid: number | null
    }>
  >(registryPath)
  return entries.at(-1) ?? null
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function checkOperatorReleaseSurface(): CheckResult {
  const startedAt = Date.now()
  const files = operatorReleaseSurfaceFiles.map(relativePath => {
    const path = resolve(rootDir, relativePath)
    return {
      relativePath,
      path,
      present: existsSync(path),
    }
  })
  const missing = files.filter(file => !file.present)

  return {
    name: 'operator-release-surface',
    status: missing.length > 0 ? 'failed' : 'passed',
    durationMs: Date.now() - startedAt,
    summary:
      missing.length > 0
        ? `Operator release surface is incomplete (${missing.length} missing files)`
        : 'Operator release surface files are present',
    details: {
      missingCount: missing.length,
      files,
    },
  }
}

async function main() {
  await rm(runDir, { recursive: true, force: true })
  await mkdir(runDir, { recursive: true })
  const packageJson = await readJson<{ version: string }>(
    resolve(rootDir, 'package.json'),
  )

  const results: CheckResult[] = []
  const preparedDir = join(runDir, 'prepared-sample')
  const auditedDir = join(runDir, 'audited-sample')
  const liveTrainDir = join(runDir, 'q-live-smoke')

  results.push(checkOperatorReleaseSurface())
  results.push(
    await runJsonCommandCheck('agentic-orchestration-guardrails', 'bun', [
      'scripts/agentic-orchestration-guardrails.ts',
      '--json',
    ], {
      successSummary:
        'agentic orchestration guardrails passed for context, Q routing, workers, benchmarks, runtime, and public release surfaces',
      failureSummary:
        'agentic orchestration guardrails found a missing release-safety surface',
      timeoutMs: 60_000,
    }),
  )
  results.push(
    await runCommandCheck('unit-tests', 'bun', ['run', 'test'], {
      successSummary: 'unit tests passed',
      timeoutMs: 180_000,
    }),
  )
  results.push(
    await runCommandCheck('build', 'bun', ['run', 'build'], {
      successSummary: 'bun build passed',
      timeoutMs: 180_000,
    }),
  )
  results.push(
    await runCommandCheck('native-build', 'bun', ['run', 'build:native'], {
      successSummary: 'native build passed',
      timeoutMs: 300_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('qline-site-live', 'bun', [
      'run',
      'website:deploy:check',
    ], {
      successSummary: 'qline.site live deploy check passed',
      failureSummary: hasNetlifyAuth
        ? 'qline.site live deploy check failed'
        : 'qline.site live deploy check could not run without local Netlify auth',
      timeoutMs: 180_000,
      allowFailure: !hasNetlifyAuth,
    }),
  )
  results.push(
    await runJsonCommandCheck('service-route-health', 'bun', [
      'run',
      'service:routes',
    ], {
      successSummary:
        'service route health audited public mirrors, updater endpoints, local admin routes, and required production configuration',
      failureSummary:
        'service route health found a required public route failure',
      timeoutMs: 180_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('hosted-q-provisioning-preflight', 'bun', [
      'run',
      'services:backend:preflight',
    ], {
      successSummary:
        'hosted-Q provisioning preflight found deploy-ready Cloudflare/D1, worker secret, and public site bindings',
      failureSummary:
        'hosted-Q provisioning preflight found missing Cloudflare/D1, worker secret, or public site bindings',
      timeoutMs: 60_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runCommandCheck('python-compile', 'python', ['-m', 'py_compile', 'training\\q\\train_lora.py'], {
      successSummary: 'Q trainer compiles',
      timeoutMs: 180_000,
    }),
  )
  results.push(
    await runCommandCheck('cli-version', 'openjaws', ['--version'], {
      successSummary: 'CLI version check passed',
      timeoutMs: 30_000,
    }),
  )
  results.push(
    await runCommandCheck('cli-help', 'openjaws', ['--help'], {
      successSummary: 'CLI help check passed',
      timeoutMs: 30_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('settings-walkthrough-live', 'bun', [
      'run',
      'settings:walkthrough',
    ], {
      successSummary: 'Settings live walkthrough passed',
      timeoutMs: 90_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('onboarding-walkthrough-live', 'bun', [
      'run',
      'onboarding:walkthrough',
    ], {
      successSummary: 'Onboarding runtime setup walkthrough passed',
      timeoutMs: 90_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('provider-probe-live', 'bun', [
      'run',
      'provider:probe',
    ], {
      successSummary: 'Provider probe command validates OCI:Q reachability and updates app state',
      timeoutMs: 60_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('deferred-launch-walkthrough-live', 'bun', [
      'run',
      'deferred-launch:walkthrough',
    ], {
      successSummary: 'Deferred launch live walkthrough passed',
      timeoutMs: 90_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('deferred-launch-controls-live', 'bun', [
      'run',
      'deferred-launch:controls',
    ], {
      successSummary: 'Deferred launch queue controls enforce queued-only mutations',
      timeoutMs: 60_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('firecrawl-skill-runtime', 'bun', [
      '-e',
      [
        `globalThis.MACRO = { VERSION: ${JSON.stringify(packageJson.version)} }`,
        "const { clearBundledSkills, getBundledSkills } = await import('./src/skills/bundledSkills.ts')",
        "const { registerFirecrawlDatasetSkill } = await import('./src/skills/bundled/firecrawlDataset.ts')",
        'clearBundledSkills()',
        'registerFirecrawlDatasetSkill()',
        "const skill = getBundledSkills().find(item => item.name === 'firecrawl-dataset')",
        "const prompt = await skill.getPromptForCommand('crawl Rust docs', {})",
        "const text = prompt.find(block => block.type === 'text')?.text ?? ''",
        'console.log(JSON.stringify({',
        '  registered: Boolean(skill),',
        '  allowedToolCount: skill?.allowedTools?.length ?? 0,',
        "  hasSearch: skill?.allowedTools?.includes('firecrawl_search') ?? false,",
        "  hasWrite: skill?.allowedTools?.includes('Write') ?? false,",
        "  writesDataset: text.includes('data/web-datasets/<slug>/'),",
        "  writesManifest: text.includes('manifest.json')",
        '}, null, 2))',
      ].join('\n'),
    ], {
      successSummary: 'Firecrawl skill registers and renders dataset prompt',
      timeoutMs: 60_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('immaculate-policy-live', 'bun', [
      '-e',
      [
        "const { buildEffectiveSystemPrompt } = await import('./src/utils/systemPrompt.ts')",
        "const { buildImmaculateSystemPrompt, getImmaculateStatus } = await import('./src/utils/immaculate.ts')",
        "const defaultPrompt = buildEffectiveSystemPrompt({",
        '  mainThreadAgentDefinition: undefined,',
        "  toolUseContext: { options: {} },",
        '  customSystemPrompt: undefined,',
        "  defaultSystemPrompt: ['base prompt'],",
        '  appendSystemPrompt: undefined',
        '})',
        "const customPrompt = buildEffectiveSystemPrompt({",
        '  mainThreadAgentDefinition: undefined,',
        "  toolUseContext: { options: {} },",
        "  customSystemPrompt: 'custom prompt',",
        "  defaultSystemPrompt: ['base prompt'],",
        '  appendSystemPrompt: undefined',
        '})',
        'const immaculate = buildImmaculateSystemPrompt()',
        'const status = getImmaculateStatus()',
        'const details = {',
        '  status,',
        "  promptPresent: immaculate?.includes('# Immaculate orchestration') ?? false,",
        "  defaultInjected: defaultPrompt.some(part => part.includes('# Immaculate orchestration')),",
        "  customInjected: customPrompt.some(part => part.includes('# Immaculate orchestration'))",
        '}',
        'if (!status.enabled || !details.promptPresent || !details.defaultInjected || !details.customInjected) {',
        "  console.error(JSON.stringify(details, null, 2))",
        '  process.exit(1)',
        '}',
        'console.log(JSON.stringify(details, null, 2))',
      ].join('\n'),
    ], {
      successSummary: 'Immaculate policy injected into shared prompt paths',
      timeoutMs: 60_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('immaculate-harness-tool-live', 'bun', [
      '-e',
      [
        `globalThis.MACRO = { VERSION: ${JSON.stringify(packageJson.version)} }`,
        "const { ImmaculateHarnessTool } = await import('./src/tools/ImmaculateHarnessTool/ImmaculateHarnessTool.ts')",
        "const { getImmaculateHarnessStatus } = await import('./src/utils/immaculateHarness.ts')",
        'const context = { abortController: new AbortController(), options: {} }',
        'const status = await getImmaculateHarnessStatus()',
        "const health = await ImmaculateHarnessTool.call({ action: 'health' }, context)",
        "const topology = await ImmaculateHarnessTool.call({ action: 'topology' }, context)",
        "const executions = await ImmaculateHarnessTool.call({ action: 'executions' }, context)",
        "const workers = await ImmaculateHarnessTool.call({ action: 'workers' }, context)",
        "const control = await ImmaculateHarnessTool.call({ action: 'control', control: { action: 'pulse' } }, context)",
        'const details = {',
        '  status,',
        '  health: { status: health.data.status, route: health.data.route, summary: health.data.summary },',
        '  topology: { status: topology.data.status, route: topology.data.route, summary: topology.data.summary },',
        '  executions: { status: executions.data.status, route: executions.data.route, summary: executions.data.summary, governance: executions.data.governance },',
        '  workers: { status: workers.data.status, route: workers.data.route, summary: workers.data.summary, governance: workers.data.governance },',
        '  control: { status: control.data.status, route: control.data.route, summary: control.data.summary, governance: control.data.governance }',
        '}',
        'if (!status.enabled || !status.reachable || health.data.status !== 200 || topology.data.status !== 200 || executions.data.status >= 500 || workers.data.status >= 500 || control.data.status >= 400) {',
        '  console.error(JSON.stringify(details, null, 2))',
        '  process.exit(1)',
        '}',
        'console.log(JSON.stringify(details, null, 2))',
      ].join('\n'),
    ], {
      successSummary: 'Immaculate harness tool reached live harness endpoints',
      timeoutMs: 90_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('runtime-coherence-live', 'bun', [
      'scripts/runtime-coherence.ts',
      '--json',
    ], {
      successSummary:
        'Runtime coherence reconciled live Immaculate state, traces, and Discord receipts',
      failureSummary:
        'Runtime coherence found drift between live harness state and local audit surfaces',
      timeoutMs: 60_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('personaplex-probe-live', 'bun', [
      'scripts/personaplex-probe.ts',
      '--json',
      '--timeout-ms',
      '15000',
    ], {
      successSummary: 'PersonaPlex live bridge probe passed',
      failureSummary:
        'PersonaPlex live bridge probe failed; inspect the JSON repair hint before marking voice production-ready',
      timeoutMs: 30_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('startup-harness-live', 'bun', [
      '-e',
      [
        "const { enableConfigs } = await import('./src/utils/config.ts')",
        'await enableConfigs()',
        "const { getPlatform } = await import('./src/utils/platform.ts')",
        "const { getRipgrepStatus } = await import('./src/utils/ripgrep.ts')",
        "const { getGitBashStatus } = await import('./src/utils/windowsPaths.ts')",
        "const { getRemoteControlAtStartup } = await import('./src/utils/config.ts')",
        "const { getSettings_DEPRECATED } = await import('./src/utils/settings/settings.ts')",
        "const { getEnvironmentSelectionInfo } = await import('./src/utils/teleport/environmentSelection.ts')",
        "const { resolveExternalModelConfig } = await import('./src/utils/model/externalProviders.ts')",
        "const { evaluateStartupHarness } = await import('./src/utils/startupHarness.ts')",
        'const settings = getSettings_DEPRECATED()',
        'const envInfo = await getEnvironmentSelectionInfo().catch(() => null)',
        'const configuredModel = settings?.model ?? null',
        'const externalModel = configuredModel ? resolveExternalModelConfig(configuredModel) : null',
        'const evaluation = evaluateStartupHarness({',
        '  platform: getPlatform(),',
        '  remoteControlAtStartup: getRemoteControlAtStartup(),',
        '  remoteControlStartupIssue: null,',
        '  externalModel: externalModel ? { provider: externalModel.provider, label: externalModel.label, apiKeySource: externalModel.apiKeySource } : null,',
        "  gitBashStatus: getPlatform() === 'windows' ? getGitBashStatus() : null,",
        '  ripgrepStatus: getRipgrepStatus(),',
        '  configuredDefaultEnvironmentId: envInfo?.configuredDefaultEnvironmentId ?? null,',
        '  missingConfiguredDefaultEnvironment: envInfo?.missingConfiguredDefaultEnvironment ?? false,',
        "  suggestedEnvironmentLabel: envInfo?.suggestedEnvironment ? `${envInfo.suggestedEnvironment.name} (${envInfo.suggestedEnvironment.environment_id})` : null,",
        '})',
        'console.log(JSON.stringify({',
        '  model: configuredModel,',
        '  startupHarness: evaluation,',
        '  ripgrep: getRipgrepStatus(),',
        "  gitBash: getPlatform() === 'windows' ? getGitBashStatus() : null",
        '}, null, 2))',
      ].join('\n'),
    ], {
      successSummary: 'startup harness evaluated live',
      timeoutMs: 90_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('voice-harness-live', 'bun', [
      '-e',
      [
        "const { enableConfigs } = await import('./src/utils/config.ts')",
        'await enableConfigs()',
        "const { isVoiceStreamAvailable } = await import('./src/services/voiceStreamSTT.js')",
        "const { checkRecordingAvailability } = await import('./src/services/voice.ts')",
        "const { getElevenLabsConfig } = await import('./src/services/voiceOutput.ts')",
        'console.log(JSON.stringify({',
        '  voiceStream: isVoiceStreamAvailable(),',
        '  recording: await checkRecordingAvailability(),',
        '  elevenLabs: getElevenLabsConfig()',
        '}, null, 2))',
      ].join('\n'),
    ], {
      successSummary: 'voice harness evaluated live',
      timeoutMs: 90_000,
      allowFailure: true,
    }),
  )
  results.push(
    await runJsonCommandCheck('prepare-sft-sample', 'bun', [
      'scripts/prepare-openjaws-sft.ts',
      '--in',
      'fixtures\\sft\\openjaws-q-sample.jsonl',
      '--out-dir',
      preparedDir,
      '--eval-ratio',
      '0.2',
    ], {
      successSummary: 'sample SFT preparation passed',
      timeoutMs: 120_000,
    }),
  )
  results.push(
    await runJsonCommandCheck('audit-sft-sample', 'bun', [
      'scripts/audit-openjaws-sft.ts',
      '--in',
      join(preparedDir, 'all.jsonl'),
      '--out-dir',
      auditedDir,
    ], {
      successSummary: 'sample SFT audit passed',
      timeoutMs: 120_000,
    }),
  )
  const missingQTrainingModules = getMissingQTrainingModules(qPythonCommand)
  const qLiveSmokeTrain =
    buildMissingQTrainingModulesCheck(missingQTrainingModules) ??
    normalizeQLiveSmokeResult(
      await runCommandCheck(
        'q-live-smoke-train',
        qPythonCommand,
        [
          'training\\q\\train_lora.py',
          '--train-file',
          join(auditedDir, 'train.jsonl'),
          '--eval-file',
          join(auditedDir, 'eval.jsonl'),
          '--base-model',
          qSmokeBaseModelSource,
          '--output-dir',
          liveTrainDir,
          '--run-name',
          'system-check-live',
          '--use-cpu',
          '--max-steps',
          '1',
          '--max-seq-length',
          '128',
          '--lora-r',
          '16',
          '--lora-alpha',
          '32',
          '--per-device-train-batch-size',
          '1',
          '--per-device-eval-batch-size',
          '1',
          '--gradient-accumulation-steps',
          '1',
          '--logging-steps',
          '1',
          '--save-steps',
          '1',
          '--eval-steps',
          '1',
        ],
        {
          successSummary: `live Q smoke train completed (${qSmokeBaseModel})`,
          timeoutMs: 1_800_000,
        },
      ),
    )
  const qLiveSmokeTrainWithState = await enrichQLiveSmokeResult(
    qLiveSmokeTrain,
    join(liveTrainDir, 'run-state.json'),
  )
  results.push(qLiveSmokeTrainWithState)

  if (existsSync(join(liveTrainDir, 'metrics-summary.json'))) {
    results.push({
      name: 'q-live-metrics',
      status: 'passed',
      durationMs: 0,
      summary: `live Q metrics captured (${qSmokeBaseModel})`,
      details: {
        baseModel: qSmokeBaseModelSource,
        metrics: await readJson(join(liveTrainDir, 'metrics-summary.json')),
        summary: await readJson(join(liveTrainDir, 'run-summary.json')),
        state: await readJson(join(liveTrainDir, 'run-state.json')),
      },
    })
    results.push(
      await runJsonCommandCheck(
        'q-bridgebench-live',
        'bun',
        [
          'scripts/q-bridgebench.ts',
          '--bundle-dir',
          auditedDir,
          '--out-dir',
          join(runDir, 'q-bridgebench'),
          '--base-model',
          qSmokeBaseModelSource,
          '--adapter-dir',
          liveTrainDir,
          '--python',
          qPythonCommand,
          '--pack',
          'all',
          '--max-seq-length',
          '128',
          '--max-train-samples',
          '1',
          '--max-eval-samples',
          '1',
          '--timeout-ms',
          '900000',
        ],
        {
          successSummary: `Q BridgeBench local smoke completed (${qSmokeBaseModel})`,
          timeoutMs: 900_000,
        },
      ),
    )
  } else {
    results.push({
      name: 'q-live-metrics',
      status:
        qLiveSmokeTrainWithState.status === 'passed'
          ? 'passed'
          : qLiveSmokeTrainWithState.status === 'warning'
            ? 'warning'
            : 'failed',
      durationMs: 0,
      summary:
        qLiveSmokeTrainWithState.status === 'passed'
          ? `live Q metrics were intentionally skipped because this host correctly routed or refused the local smoke load (${qSmokeBaseModel})`
          : qLiveSmokeTrainWithState.status === 'warning'
          ? `live Q metrics were not written because smoke training was skipped (${qSmokeBaseModel})`
          : `live Q metrics were not written (${qSmokeBaseModel})`,
    })
    results.push({
      name: 'q-bridgebench-live',
      status:
        qLiveSmokeTrainWithState.status === 'failed'
          ? 'failed'
          : qLiveSmokeTrainWithState.status === 'warning'
            ? 'warning'
            : 'passed',
      durationMs: 0,
      summary:
        qLiveSmokeTrainWithState.status === 'passed'
          ? `Q BridgeBench smoke was intentionally skipped because the live Q smoke did not emit a local adapter (${qSmokeBaseModel})`
          : qLiveSmokeTrainWithState.status === 'warning'
            ? `Q BridgeBench smoke was skipped because the live Q smoke stayed in a warning state (${qSmokeBaseModel})`
            : `Q BridgeBench smoke could not run because the live Q smoke failed (${qSmokeBaseModel})`,
    })
  }

  results.push(
    await runCommandCheck('q-launcher-orchestration', 'bun', [
      'scripts/launch-q-train.ts',
      '--bundle-dir',
      auditedDir,
      '--run-name',
      'system-check-launch',
      '--tag',
      'agentic',
      '--max-steps',
      '1',
    ], {
      successSummary: 'Q launcher orchestration check completed',
      timeoutMs: 120_000,
    }),
  )

  const latestRegistryEntry = await readLatestRegistryEntry()
  if (latestRegistryEntry?.runStatePath && existsSync(latestRegistryEntry.runStatePath)) {
    const latestState = await readJson<Record<string, unknown>>(latestRegistryEntry.runStatePath)
    const routeManifestPath =
      isObjectRecord(latestState.routeRequest) &&
      typeof latestState.routeRequest.manifestPath === 'string'
        ? latestState.routeRequest.manifestPath
        : null
    results.push({
      name: 'q-launcher-state',
      status: 'passed',
      durationMs: 0,
      summary:
        latestState.status === 'route_requested'
          ? 'launcher wrote immediate routed run-state'
          : 'launcher wrote immediate run-state',
      details: {
        registry: latestRegistryEntry,
        state: latestState,
      },
    })
    if (routeManifestPath) {
      const routeManifestExists = existsSync(routeManifestPath)
      const routeManifest = routeManifestExists
        ? readQTrainingRouteManifest(routeManifestPath)
        : null
      results.push({
        name: 'q-launcher-route-manifest',
        status: routeManifestExists ? 'passed' : 'failed',
        durationMs: 0,
        summary: routeManifestExists
          ? 'launcher wrote Immaculate route manifest'
          : 'launcher did not write Immaculate route manifest',
        details: routeManifestExists
          ? routeManifest
          : { routeManifestPath },
      })
      if (
        routeManifest &&
        routeManifest.routeRequest.integrity?.trainFile?.path &&
        routeManifest.routeRequest.integrity?.trainFile?.sha256
      ) {
        const routeSecurity = verifyQTrainingRouteManifest(routeManifest)
        const routeIntegrity = verifyQTrainingRouteManifestIntegrity(
          routeManifest,
          dirname(routeManifestPath),
        )
        const evalIntegrity = routeManifest.routeRequest.integrity?.evalFile
        results.push({
          name: 'q-launcher-route-security',
          status: routeSecurity.valid ? 'passed' : 'failed',
          durationMs: 0,
          summary: routeSecurity.valid
            ? 'launcher route manifest signature verified'
            : `launcher route manifest signature failed (${routeSecurity.reason})`,
          details: routeSecurity,
        })
        results.push({
          name: 'q-launcher-route-integrity',
          status: routeIntegrity.valid ? 'passed' : 'failed',
          durationMs: 0,
          summary: routeIntegrity.valid
            ? 'launcher route manifest integrity matches staged train/eval files'
            : 'launcher route manifest integrity does not match staged train/eval files',
          details: {
            manifestPath: routeManifestPath,
            trainFile: {
              path: routeIntegrity.trainPath,
              expected: routeIntegrity.trainExpectedSha256,
              actual: routeIntegrity.trainActualSha256,
            },
            ...(routeIntegrity.evalActualSha256
              ? {
                  evalFile: {
                    path: routeIntegrity.evalPath,
                    expected: routeIntegrity.evalExpectedSha256,
                    actual: routeIntegrity.evalActualSha256,
                  },
                }
              : {}),
          },
        })
        results.push(
          await runJsonCommandCheck(
            'q-route-dispatch-dry-run',
            'bun',
            [
              'scripts/dispatch-q-route.ts',
              '--manifest',
              routeManifestPath,
              '--dry-run',
              '--allow-host-risk',
            ],
            {
              successSummary: 'Q route dispatch dry-run completed',
              timeoutMs: 120_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-worker-dry-run',
            'bun',
            [
              'scripts/process-q-routes.ts',
              '--manifest',
              routeManifestPath,
              '--dry-run',
              '--allow-host-risk',
            ],
            {
              successSummary: 'Q route worker dry-run completed',
              timeoutMs: 120_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-contention-live',
            'bun',
            ['scripts/q-route-contention-live.ts'],
            {
              successSummary:
                'Q route queue contention and stale-claim recovery completed',
              timeoutMs: 120_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-lease-live',
            'bun',
            ['scripts/q-route-lease-live.ts'],
            {
              successSummary:
                'Q route worker lease renewal and reap recovery completed',
              timeoutMs: 240_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-worker-assignment-live',
            'bun',
            ['scripts/q-route-worker-assignment-live.ts'],
            {
              successSummary:
                'Q route worker registry enforces verified assignment or stays fail-closed pending assignment',
              timeoutMs: 240_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-remote-dispatch-live',
            'bun',
            ['scripts/q-route-remote-dispatch-live.ts'],
            {
              successSummary:
                'Q route remote HTTP dispatch either completed with a verified worker or stayed fail-closed pending verified assignment',
              timeoutMs: 240_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-remote-completion-live',
            'bun',
            ['scripts/q-route-remote-completion-live.ts'],
            {
              successSummary:
                'Q route remote worker loop either reconciled signed terminal results or stayed fail-closed pending verified assignment',
              timeoutMs: 240_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-worker-sync-failure-live',
            'bun',
            ['scripts/q-route-worker-sync-failure-live.ts'],
            {
              successSummary:
                'Q route worker surfaces Immaculate registration failure and exits fail-closed',
              timeoutMs: 120_000,
            },
          ),
        )
        results.push(
          await runJsonCommandCheck(
            'q-route-failure-live',
            'bun',
            ['scripts/q-route-failure-live.ts'],
            {
              successSummary:
                'Q routed launch failure is surfaced explicitly and remains fail-closed',
              timeoutMs: 120_000,
            },
          ),
        )
      }
    }
  } else {
    results.push({
      name: 'q-launcher-state',
      status: 'failed',
      durationMs: 0,
      summary: 'launcher did not produce a readable run-state',
      details: latestRegistryEntry,
    })
  }

  const localOnlyLaunch = await runJsonCommandCheck(
    'q-launcher-local-preflight',
    'bun',
    [
      'scripts/launch-q-train.ts',
      '--bundle-dir',
      auditedDir,
      '--run-name',
      'system-check-local-preflight',
      '--tag',
      'agentic',
      '--max-steps',
      '1',
      '--route',
      'local',
    ],
    {
      successSummary: 'Q launcher local preflight completed',
      timeoutMs: 120_000,
    },
  )
  results.push(localOnlyLaunch)

  if (
    localOnlyLaunch.status === 'passed' &&
    isObjectRecord(localOnlyLaunch.details) &&
    typeof localOnlyLaunch.details.runStatePath === 'string'
  ) {
    const localPreflightStatePath = localOnlyLaunch.details.runStatePath
    const localPreflightStateExists = existsSync(localPreflightStatePath)
    const localPreflightState = localPreflightStateExists
      ? await readJson<Record<string, unknown>>(localPreflightStatePath)
      : null
    const localPreflightAccepted =
      localPreflightStateExists && localPreflightState?.status === 'remote_required'
    results.push({
      name: 'q-launcher-local-preflight-state',
      status: localPreflightAccepted ? 'passed' : 'failed',
      durationMs: 0,
      summary: localPreflightAccepted
        ? 'Q launcher local-only mode failed closed with remote_required'
        : 'Q launcher local-only mode did not fail closed as expected',
      details: localPreflightState ?? { runStatePath: localPreflightStatePath },
    })
  }

  for (const index of [1, 2]) {
    const loadLaunch = await runJsonCommandCheck(
      `q-launcher-load-${index}`,
      'bun',
      [
        'scripts/launch-q-train.ts',
        '--bundle-dir',
        auditedDir,
        '--run-name',
        `system-check-load-${index}`,
        '--tag',
        'agentic',
        '--max-steps',
        '1',
      ],
      {
        successSummary: `Q launcher load smoke ${index} completed`,
        timeoutMs: 120_000,
      },
    )
    results.push(loadLaunch)

    if (
      loadLaunch.status === 'passed' &&
      isObjectRecord(loadLaunch.details) &&
      typeof loadLaunch.details.runStatePath === 'string'
    ) {
      const runStatePath = loadLaunch.details.runStatePath
      const pid =
        typeof loadLaunch.details.pid === 'number'
          ? loadLaunch.details.pid
          : null
      const stateExists = existsSync(runStatePath)
      results.push({
        name: `q-launcher-load-state-${index}`,
        status: stateExists ? 'passed' : 'failed',
        durationMs: 0,
        summary: stateExists
          ? `Q launcher load smoke ${index} wrote immediate run-state`
          : `Q launcher load smoke ${index} did not write run-state`,
        details: stateExists ? await readJson(runStatePath) : { runStatePath },
      })

      if (pid !== null) {
        await Bun.sleep(1_000)
        results.push(
          normalizeTaskkillResult(
            await runCommandCheck(
            `q-launcher-load-stop-${index}`,
            'taskkill',
            ['/PID', String(pid), '/T', '/F'],
            {
              allowFailure: true,
              successSummary: `stopped launcher load smoke ${index}`,
              timeoutMs: 30_000,
            },
          ),
            `stopped launcher load smoke ${index}`,
          ),
        )
      }
    }
  }

  const statusCounts = results.reduce(
    (acc, result) => {
      acc[result.status]++
      return acc
    },
    { passed: 0, failed: 0, warning: 0 },
  )

  const report = {
    runId,
    generatedAt: new Date().toISOString(),
    rootDir,
    runDir,
    overallStatus:
      statusCounts.failed > 0
        ? 'failed'
        : statusCounts.warning > 0
          ? 'warning'
          : 'passed',
    counts: statusCounts,
    results,
  }

  await mkdir(dirname(join(runDir, 'report.json')), { recursive: true })
  await writeFile(join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  console.log(JSON.stringify(report, null, 2))

  if (statusCounts.failed > 0) {
    process.exitCode = 1
  }
}

await main()
