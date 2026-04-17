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

async function main() {
  const root = process.cwd()
  const websiteRoot = resolve(root, 'website')
  const nextBin = join(
    websiteRoot,
    'node_modules',
    'next',
    'dist',
    'bin',
    'next',
  )

  if (!existsSync(nextBin)) {
    throw new Error(
      `Next.js build binary not found at ${nextBin}. Run bun install in website/ first.`,
    )
  }

  const nodeCommand = await resolveNodeCommand()
  await execa(nodeCommand, [nextBin, 'build'], {
    cwd: websiteRoot,
    stdio: 'inherit',
    windowsHide: true,
  })
}

await main()
