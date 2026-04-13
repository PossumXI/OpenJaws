import { cp, mkdir, stat } from 'fs/promises'
import { createHash } from 'node:crypto'
import { basename, join, resolve } from 'node:path'
import {
  getGithubReleaseBinaryAssetName,
  getGithubReleaseManifestAssetName,
  getPublicGithubReleaseRepo,
} from '../src/utils/publicReleaseSource.js'
import { getOpenJawsReleaseVersion } from './releaseVersion.ts'

type Args = {
  binary: string
  outDir: string
  platform?: string
  version?: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    binary: '',
    outDir: '',
  }

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i]
    const next = argv[i + 1]
    if (!current?.startsWith('--')) {
      continue
    }
    if (!next) {
      throw new Error(`Missing value for ${current}`)
    }
    switch (current) {
      case '--binary':
        args.binary = next
        i += 1
        break
      case '--out-dir':
        args.outDir = next
        i += 1
        break
      case '--platform':
        args.platform = next
        i += 1
        break
      case '--version':
        args.version = next
        i += 1
        break
      default:
        throw new Error(`Unknown argument: ${current}`)
    }
  }

  if (!args.binary || !args.outDir) {
    throw new Error('Usage: bun scripts/build-release-asset.ts --binary <path> --out-dir <dir> [--platform <platform>] [--version <version>]')
  }

  return args
}

function resolvePlatform(explicit?: string): string {
  if (explicit) {
    return explicit
  }
  const arch =
    process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : null
  if (!arch) {
    throw new Error(`Unsupported release asset architecture: ${process.arch}`)
  }
  return `${process.platform}-${arch}`
}

const args = parseArgs(process.argv.slice(2))
const packageJson = (await Bun.file(
  new URL('../package.json', import.meta.url),
).json()) as {
  version?: string
}

const version =
  args.version ||
  getOpenJawsReleaseVersion({
    packageVersion: packageJson.version ?? '0.0.0',
  })
const platform = resolvePlatform(args.platform)
const sourceBinaryPath = resolve(args.binary)
const outDir = resolve(args.outDir)
const assetName = getGithubReleaseBinaryAssetName(platform)
const manifestName = getGithubReleaseManifestAssetName(platform)

await mkdir(outDir, { recursive: true })

const binaryContents = await Bun.file(sourceBinaryPath).bytes()
const checksum = createHash('sha256').update(binaryContents).digest('hex')
const stats = await stat(sourceBinaryPath)

await cp(sourceBinaryPath, join(outDir, assetName), { force: true })

const manifest = {
  version,
  releasedAt: new Date().toISOString(),
  source: 'github_release',
  repo: getPublicGithubReleaseRepo(),
  originalBinary: basename(sourceBinaryPath),
  platforms: {
    [platform]: {
      assetName,
      checksum,
      bytes: stats.size,
    },
  },
}

await Bun.write(
  join(outDir, manifestName),
  `${JSON.stringify(manifest, null, 2)}\n`,
)

console.log(
  JSON.stringify(
    {
      version,
      platform,
      assetName,
      manifestName,
      checksum,
      bytes: stats.size,
    },
    null,
    2,
  ),
)
