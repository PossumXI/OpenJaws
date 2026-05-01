import { existsSync, readFileSync } from 'fs'
import { mkdir } from 'fs/promises'
import { resolve } from 'path'
import { execa } from 'execa'
import {
  buildQTrainingPythonEnv,
  resolveQTrainingPythonCommand,
} from '../src/utils/qTraining.js'

export const Q_TRAINING_REQUIRED_MODULES = [
  'accelerate',
  'datasets',
  'evaluate',
  'peft',
  'torch',
  'transformers',
] as const

export type QTrainingEnvProfile = 'default' | 'windows-cpu'

export type QTrainingEnvBootstrapOptions = {
  json: boolean
  install: boolean
  root?: string | null
  python?: string | null
  venvDir?: string | null
  profile?: QTrainingEnvProfile | null
  timeoutMs: number
}

export type QTrainingEnvModuleStatus = {
  module: string
  present: boolean
}

export type QTrainingEnvCommandPlan = {
  createVenv: string[]
  upgradePip: string[]
  installRequirements: string[]
  verifyModules: string[]
}

export type QTrainingEnvBootstrapReceipt = {
  status: 'ready' | 'missing_modules' | 'installed' | 'install_failed'
  checkedAt: string
  root: string
  profile: QTrainingEnvProfile
  pythonCommand: string
  venvDir: string
  venvPython: string
  probePython: string
  requirementsPath: string
  requiredModules: string[]
  missingModules: string[]
  moduleStatus: QTrainingEnvModuleStatus[]
  commands: QTrainingEnvCommandPlan
  installLog?: Array<{
    step: keyof Omit<QTrainingEnvCommandPlan, 'verifyModules'>
    exitCode: number | null
    stderrTail: string
  }>
  nextActions: string[]
}

type ModuleProbe = {
  missingModules: string[]
  error: string | null
}

const DEFAULT_TIMEOUT_MS = 20 * 60 * 1000

function trimToNull(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function defaultProfile(platform = process.platform): QTrainingEnvProfile {
  return platform === 'win32' ? 'windows-cpu' : 'default'
}

function parseProfile(value: string | null | undefined): QTrainingEnvProfile | null {
  const normalized = value?.trim().toLowerCase()
  if (normalized === 'default' || normalized === 'windows-cpu') {
    return normalized
  }
  return null
}

function resolveVenvPython(venvDir: string, platform = process.platform): string {
  return platform === 'win32'
    ? resolve(venvDir, 'Scripts', 'python.exe')
    : resolve(venvDir, 'bin', 'python')
}

export function resolveQTrainingRequirementsPath(args: {
  root: string
  profile: QTrainingEnvProfile
}): string {
  return resolve(
    args.root,
    'training',
    'q',
    args.profile === 'windows-cpu'
      ? 'requirements-windows-cpu.txt'
      : 'requirements.txt',
  )
}

export function parseQTrainingEnvBootstrapArgs(
  argv: string[],
): QTrainingEnvBootstrapOptions {
  const options: QTrainingEnvBootstrapOptions = {
    json: false,
    install: false,
    root: null,
    python: trimToNull(process.env.OPENJAWS_Q_TRAINING_BOOTSTRAP_PYTHON),
    venvDir: trimToNull(process.env.OPENJAWS_Q_TRAINING_VENV_DIR),
    profile: parseProfile(process.env.OPENJAWS_Q_TRAINING_PROFILE),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    switch (arg) {
      case '--json':
        options.json = true
        break
      case '--install':
        options.install = true
        break
      case '--root':
        options.root = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--python':
        options.python = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--venv-dir':
        options.venvDir = argv[index + 1]?.trim() || null
        index += 1
        break
      case '--profile': {
        const profile = parseProfile(argv[index + 1])
        if (!profile) {
          throw new Error('--profile must be default or windows-cpu.')
        }
        options.profile = profile
        index += 1
        break
      }
      case '--timeout-ms': {
        const parsed = Number.parseInt(argv[index + 1] ?? '', 10)
        if (Number.isFinite(parsed) && parsed > 0) {
          options.timeoutMs = parsed
        }
        index += 1
        break
      }
      default:
        throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return options
}

export function buildQTrainingEnvCommandPlan(args: {
  pythonCommand: string
  venvDir: string
  venvPython: string
  requirementsPath: string
}): QTrainingEnvCommandPlan {
  return {
    createVenv: [args.pythonCommand, '-m', 'venv', args.venvDir],
    upgradePip: [args.venvPython, '-m', 'pip', 'install', '--upgrade', 'pip'],
    installRequirements: [
      args.venvPython,
      '-m',
      'pip',
      'install',
      '-r',
      args.requirementsPath,
    ],
    verifyModules: [
      args.venvPython,
      '-c',
      'import importlib.util, json; mods = ' +
        JSON.stringify(Q_TRAINING_REQUIRED_MODULES) +
        '; print(json.dumps([m for m in mods if importlib.util.find_spec(m) is None]))',
    ],
  }
}

function tailText(text: string, maxChars = 1600): string {
  const trimmed = text.trim()
  return trimmed.length > maxChars
    ? trimmed.slice(trimmed.length - maxChars)
    : trimmed
}

async function probeModules(
  pythonCommand: string,
  root: string,
  timeoutMs: number,
): Promise<ModuleProbe> {
  const script = [
    'import importlib.util, json',
    `mods = ${JSON.stringify(Q_TRAINING_REQUIRED_MODULES)}`,
    'print(json.dumps([m for m in mods if importlib.util.find_spec(m) is None]))',
  ].join('\n')
  const result = await execa(pythonCommand, ['-c', script], {
    cwd: root,
    env: buildQTrainingPythonEnv(),
    reject: false,
    timeout: Math.min(timeoutMs, 60_000),
    windowsHide: true,
  })
  if (result.exitCode !== 0) {
    return {
      missingModules: [...Q_TRAINING_REQUIRED_MODULES],
      error: tailText(`${result.stderr}\n${result.stdout}`),
    }
  }
  try {
    const parsed = JSON.parse(result.stdout.trim()) as unknown
    if (!Array.isArray(parsed)) {
      return {
        missingModules: [...Q_TRAINING_REQUIRED_MODULES],
        error: 'module probe returned non-array JSON',
      }
    }
    return {
      missingModules: parsed
        .filter((item): item is string => typeof item === 'string')
        .filter(item =>
          (Q_TRAINING_REQUIRED_MODULES as readonly string[]).includes(item),
        ),
      error: null,
    }
  } catch (error) {
    return {
      missingModules: [...Q_TRAINING_REQUIRED_MODULES],
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function runPlanStep(args: {
  command: string[]
  cwd: string
  timeoutMs: number
}) {
  const [command, ...commandArgs] = args.command
  const result = await execa(command!, commandArgs, {
    cwd: args.cwd,
    env: buildQTrainingPythonEnv(),
    reject: false,
    timeout: args.timeoutMs,
    windowsHide: true,
  })
  return {
    exitCode: result.exitCode,
    stderrTail: tailText(`${result.stderr}\n${result.stdout}`),
  }
}

export function assertQTrainingRequirementsCoverModules(args: {
  requirementsText: string
  modules?: readonly string[]
}): string[] {
  const requirementNames = new Set(
    args.requirementsText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => line.split(/[<>=!~\s\[]/, 1)[0]?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)),
  )
  return (args.modules ?? Q_TRAINING_REQUIRED_MODULES).filter(
    moduleName => !requirementNames.has(moduleName.toLowerCase()),
  )
}

export async function bootstrapQTrainingEnv(
  options: QTrainingEnvBootstrapOptions,
): Promise<QTrainingEnvBootstrapReceipt> {
  const root = resolve(options.root ?? process.cwd())
  const profile = options.profile ?? defaultProfile()
  const venvDir = resolve(root, options.venvDir ?? '.venv-q')
  const venvPython = resolveVenvPython(venvDir)
  const pythonCommand =
    trimToNull(options.python) ??
    (existsSync(venvPython) ? venvPython : resolveQTrainingPythonCommand(root))
  const requirementsPath = resolveQTrainingRequirementsPath({ root, profile })
  if (!existsSync(requirementsPath)) {
    throw new Error(`Q training requirements file is missing: ${requirementsPath}`)
  }
  const requirementsMissing = assertQTrainingRequirementsCoverModules({
    requirementsText: readFileSync(requirementsPath, 'utf8'),
  })
  if (requirementsMissing.length > 0) {
    throw new Error(
      `Q training requirements file is missing required modules: ${requirementsMissing.join(', ')}`,
    )
  }

  const commands = buildQTrainingEnvCommandPlan({
    pythonCommand,
    venvDir,
    venvPython,
    requirementsPath,
  })

  let probePython = existsSync(venvPython) ? venvPython : pythonCommand
  let installLog: QTrainingEnvBootstrapReceipt['installLog'] = []
  if (options.install) {
    await mkdir(venvDir, { recursive: true })
    for (const step of ['createVenv', 'upgradePip', 'installRequirements'] as const) {
      if (step === 'createVenv' && existsSync(venvPython)) {
        continue
      }
      const result = await runPlanStep({
        command: commands[step],
        cwd: root,
        timeoutMs: options.timeoutMs,
      })
      installLog.push({ step, ...result })
      if (result.exitCode !== 0) {
        const missingModules = [...Q_TRAINING_REQUIRED_MODULES]
        return {
          status: 'install_failed',
          checkedAt: new Date().toISOString(),
          root,
          profile,
          pythonCommand,
          venvDir,
          venvPython,
          probePython,
          requirementsPath,
          requiredModules: [...Q_TRAINING_REQUIRED_MODULES],
          missingModules,
          moduleStatus: Q_TRAINING_REQUIRED_MODULES.map(module => ({
            module,
            present: false,
          })),
          commands,
          installLog,
          nextActions: [
            `Inspect pip output, then rerun bun run q:training:bootstrap --install --profile ${profile}.`,
          ],
        }
      }
    }
    probePython = venvPython
  }

  const moduleProbe = await probeModules(probePython, root, options.timeoutMs)
  const missingModules = moduleProbe.missingModules
  const moduleStatus = Q_TRAINING_REQUIRED_MODULES.map(module => ({
    module,
    present: !missingModules.includes(module),
  }))
  const ready = missingModules.length === 0 && moduleProbe.error === null

  return {
    status: ready ? (options.install ? 'installed' : 'ready') : 'missing_modules',
    checkedAt: new Date().toISOString(),
    root,
    profile,
    pythonCommand,
    venvDir,
    venvPython,
    probePython,
    requirementsPath,
    requiredModules: [...Q_TRAINING_REQUIRED_MODULES],
    missingModules,
    moduleStatus,
    commands,
    ...(installLog.length > 0 ? { installLog } : {}),
    nextActions: ready
      ? ['Run bun run system:check to retry the Q smoke and BridgeBench lanes.']
      : [
          `Install the local Q training environment: bun run q:training:bootstrap --install --profile ${profile}`,
          `Then rerun bun run system:check to retry Q smoke, metrics, and BridgeBench.`,
          ...(moduleProbe.error ? [`Python probe error: ${moduleProbe.error}`] : []),
        ],
  }
}

async function main(argv = process.argv.slice(2)): Promise<number> {
  let options: QTrainingEnvBootstrapOptions
  try {
    options = parseQTrainingEnvBootstrapArgs(argv)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 2
  }

  try {
    const receipt = await bootstrapQTrainingEnv(options)
    if (options.json) {
      console.log(JSON.stringify(receipt, null, 2))
    } else {
      console.log(
        [
          `Q training environment: ${receipt.status}`,
          `Python: ${receipt.probePython}`,
          `Requirements: ${receipt.requirementsPath}`,
          ...(receipt.missingModules.length
            ? [`Missing modules: ${receipt.missingModules.join(', ')}`]
            : []),
          ...receipt.nextActions.map(action => `- ${action}`),
        ].join('\n'),
      )
    }
    return receipt.status === 'install_failed' ? 1 : 0
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = await main()
}
