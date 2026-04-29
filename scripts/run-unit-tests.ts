import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { execa } from 'execa'
import { relative, resolve } from 'path'

type ScopeKey = 'src' | 'scripts'

type TestScope = {
  key: ScopeKey
  cwd: string
}

type CliOptions = {
  scopes: TestScope[]
  coverage: boolean
  minLineCoverage: number | null
  coverageDir: string
}

type LcovEntry = {
  path: string
  linesFound: number
  linesHit: number
}

const rootDir = process.cwd()
const gitIgnoredPathCache = new Map<string, boolean>()
const allScopes: Record<ScopeKey, TestScope> = {
  src: {
    key: 'src',
    cwd: resolve(rootDir, 'src'),
  },
  scripts: {
    key: 'scripts',
    cwd: resolve(rootDir, 'scripts'),
  },
}

function isGitIgnoredPath(path: string): boolean {
  if (!existsSync(resolve(rootDir, '.git'))) {
    return false
  }
  const relativePath = relative(rootDir, path).replace(/\\/g, '/')
  if (!relativePath || relativePath.startsWith('../')) {
    return false
  }
  const cached = gitIgnoredPathCache.get(relativePath)
  if (cached !== undefined) {
    return cached
  }
  const result = spawnSync(
    'git',
    ['check-ignore', '--quiet', '--', relativePath],
    {
      cwd: rootDir,
      windowsHide: true,
    },
  )
  const ignored = result.status === 0
  gitIgnoredPathCache.set(relativePath, ignored)
  return ignored
}

function parseArgs(argv: string[]): CliOptions {
  const requestedScopes: ScopeKey[] = []
  let coverage = false
  let minLineCoverage: number | null = null
  let coverageDir = resolve(rootDir, '.coverage', 'unit-tests')

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--scope' && argv[i + 1]) {
      const scope = argv[++i] as ScopeKey
      if (scope in allScopes) {
        requestedScopes.push(scope)
      }
      continue
    }
    if (arg === '--coverage') {
      coverage = true
      continue
    }
    if (arg === '--min-line-coverage' && argv[i + 1]) {
      const parsed = Number.parseFloat(argv[++i]!)
      if (Number.isFinite(parsed)) {
        minLineCoverage = parsed
      }
      continue
    }
    if (arg === '--coverage-dir' && argv[i + 1]) {
      coverageDir = resolve(rootDir, argv[++i]!)
      continue
    }
  }

  const scopes =
    requestedScopes.length > 0
      ? Array.from(new Set(requestedScopes)).map(scope => allScopes[scope])
      : Object.values(allScopes)

  return {
    scopes,
    coverage,
    minLineCoverage,
    coverageDir,
  }
}

function parseLcovFile(path: string, scope: TestScope): LcovEntry[] {
  if (!existsSync(path)) {
    throw new Error(`Coverage file not found for ${scope.key}: ${path}`)
  }

  const entries: LcovEntry[] = []
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  let currentFile: string | null = null
  let linesFound = 0
  let linesHit = 0

  const flush = () => {
    if (currentFile === null) {
      return
    }
    const resolvedFile = resolve(scope.cwd, currentFile)
    if (
      resolvedFile.startsWith(scope.cwd) &&
      !isGitIgnoredPath(resolvedFile) &&
      !/\.test\.[cm]?[jt]sx?$/.test(resolvedFile) &&
      !/\.spec\.[cm]?[jt]sx?$/.test(resolvedFile)
    ) {
      entries.push({
        path: resolvedFile,
        linesFound,
        linesHit,
      })
    }
    currentFile = null
    linesFound = 0
    linesHit = 0
  }

  for (const line of lines) {
    if (line.startsWith('SF:')) {
      flush()
      currentFile = line.slice(3)
      continue
    }
    if (line.startsWith('LF:')) {
      linesFound = Number.parseInt(line.slice(3), 10) || 0
      continue
    }
    if (line.startsWith('LH:')) {
      linesHit = Number.parseInt(line.slice(3), 10) || 0
      continue
    }
    if (line === 'end_of_record') {
      flush()
    }
  }

  flush()
  return entries
}

function printCoverageSummary(scope: TestScope, entries: LcovEntry[]): number {
  if (entries.length === 0) {
    throw new Error(
      `Coverage produced no non-test files inside ${scope.key} (${scope.cwd})`,
    )
  }

  const totals = entries.reduce(
    (acc, entry) => {
      acc.linesFound += entry.linesFound
      acc.linesHit += entry.linesHit
      return acc
    },
    { linesFound: 0, linesHit: 0 },
  )

  const lineCoverage =
    totals.linesFound === 0 ? 100 : (totals.linesHit / totals.linesFound) * 100
  process.stdout.write(
    `[coverage:${scope.key}] ${lineCoverage.toFixed(2)}% lines (${totals.linesHit}/${totals.linesFound})\n`,
  )
  return lineCoverage
}

async function runScope(scope: TestScope, options: CliOptions): Promise<void> {
  const args = ['test']
  let lcovPath: string | null = null

  if (options.coverage) {
    const coverageDir = resolve(options.coverageDir, scope.key)
    rmSync(coverageDir, { recursive: true, force: true })
    mkdirSync(coverageDir, { recursive: true })
    lcovPath = resolve(coverageDir, 'lcov.info')
    args.push(
      '--coverage',
      '--coverage-reporter=text',
      '--coverage-reporter=lcov',
      '--coverage-dir',
      coverageDir,
    )
  }

  const result = await execa('bun', args, {
    cwd: scope.cwd,
    reject: false,
    windowsHide: true,
  })

  if (result.stdout.trim()) {
    process.stdout.write(`${result.stdout}\n`)
  }
  if (result.stderr.trim()) {
    process.stderr.write(`${result.stderr}\n`)
  }

  if (result.exitCode !== 0) {
    throw new Error(`Unit tests failed for ${scope.key} (${scope.cwd})`)
  }

  if (options.coverage && options.minLineCoverage !== null && lcovPath) {
    const entries = parseLcovFile(lcovPath, scope)
    const actual = printCoverageSummary(scope, entries)
    if (actual < options.minLineCoverage) {
      throw new Error(
        `${scope.key} line coverage ${actual.toFixed(2)}% is below the floor of ${options.minLineCoverage.toFixed(2)}%`,
      )
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  for (const scope of options.scopes) {
    await runScope(scope, options)
  }
}

await main()
