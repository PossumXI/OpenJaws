import { spawnSync } from 'child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { globSync } from 'glob'
import { tmpdir } from 'os'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..')
const knipBin = join(repoRoot, 'node_modules', 'knip', 'bin', 'knip.js')
const SOURCE_MAP_LINE = /^\/\/# sourceMappingURL=.*$/gm

async function stageScriptFiles(stageDir: string): Promise<void> {
  const relativePaths = globSync('scripts/**/*.ts', {
    cwd: repoRoot,
    nodir: true,
    ignore: ['scripts/artifacts/**'],
  }).concat(
    globSync('scripts/**/*.tsx', {
      cwd: repoRoot,
      nodir: true,
      ignore: ['scripts/artifacts/**'],
    }),
  )

  for (const relativePath of relativePaths) {
    const sourcePath = join(repoRoot, relativePath)
    const stagedPath = join(stageDir, relativePath)
    await mkdir(dirname(stagedPath), { recursive: true })
    const source = await readFile(sourcePath, 'utf8')
    await writeFile(stagedPath, source.replace(SOURCE_MAP_LINE, ''), 'utf8')
  }
}

async function stageConfigFiles(stageDir: string): Promise<void> {
  const packageJson = {
    name: 'openjaws-knip-stage',
    private: true,
    type: 'module',
  }
  const knipConfig = {
    $schema: 'https://unpkg.com/knip@5/schema.json',
    entry: ['scripts/**/*.ts', 'scripts/**/*.tsx'],
    project: ['scripts/**/*.ts', 'scripts/**/*.tsx'],
  }

  await writeFile(
    join(stageDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
    'utf8',
  )
  await writeFile(
    join(stageDir, 'knip.json'),
    `${JSON.stringify(knipConfig, null, 2)}\n`,
    'utf8',
  )
}

async function main(): Promise<void> {
  const stageDir = await mkdtemp(join(tmpdir(), 'openjaws-knip-'))

  try {
    await stageConfigFiles(stageDir)
    await stageScriptFiles(stageDir)

    const nodeOptions = [
      '--max-old-space-size=4096',
      process.env.NODE_OPTIONS ?? '',
    ]
      .filter(Boolean)
      .join(' ')

    const result = spawnSync(
      process.execPath,
      [knipBin, '--config', 'knip.json', '--include', 'files'],
      {
        cwd: stageDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          NODE_OPTIONS: nodeOptions,
        },
      },
    )

    if (result.error) {
      throw result.error
    }

    process.exit(result.status ?? 1)
  } finally {
    await rm(stageDir, { recursive: true, force: true })
  }
}

await main()
