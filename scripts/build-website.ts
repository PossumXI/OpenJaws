import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { execa } from 'execa'

async function resolveNodeCommand(): Promise<string> {
  try {
    const result = await execa('node', ['--version'], {
      reject: false,
      windowsHide: true,
    })
    if (result.exitCode === 0) {
      return 'node'
    }
  } catch {
    // Fall through to the explicit failure below.
  }
  throw new Error(
    'Node.js is required for website builds because Next.js production builds are flaky when driven directly through Bun on Windows.',
  )
}

export function getNextBinCandidates(root: string, websiteRoot: string): string[] {
  return [
    join(websiteRoot, 'node_modules', 'next', 'dist', 'bin', 'next'),
    join(root, 'node_modules', 'next', 'dist', 'bin', 'next'),
  ]
}

export function findExistingNextBin(root: string, websiteRoot: string): string | null {
  return getNextBinCandidates(root, websiteRoot).find(candidate => existsSync(candidate)) ?? null
}

export async function installWebsiteDependencies(websiteRoot: string): Promise<void> {
  await execa('bun', ['install'], {
    cwd: websiteRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
}

export async function ensureNextBuildBinary(
  root: string,
  websiteRoot: string,
  installDeps: (websiteRoot: string) => Promise<void> = installWebsiteDependencies,
): Promise<string> {
  const existing = findExistingNextBin(root, websiteRoot)
  if (existing) {
    return existing
  }

  await installDeps(websiteRoot)

  const installed = findExistingNextBin(root, websiteRoot)
  if (installed) {
    return installed
  }

  throw new Error(
    `Next.js build binary not found. Checked: ${getNextBinCandidates(root, websiteRoot).join(', ')}`,
  )
}

export async function main() {
  const root = process.cwd()
  const websiteRoot = resolve(root, 'website')
  const nextBin = await ensureNextBuildBinary(root, websiteRoot)
  const nodeCommand = await resolveNodeCommand()
  await execa(nodeCommand, [nextBin, 'build'], {
    cwd: websiteRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
}

if (import.meta.main) {
  await main()
}
