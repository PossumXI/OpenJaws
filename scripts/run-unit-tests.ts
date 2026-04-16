import { execa } from 'execa'
import { resolve } from 'path'

type TestScope = {
  label: string
  cwd: string
}

const rootDir = process.cwd()
const scopes: TestScope[] = [
  {
    label: 'src',
    cwd: resolve(rootDir, 'src'),
  },
  {
    label: 'scripts',
    cwd: resolve(rootDir, 'scripts'),
  },
]

async function main(): Promise<void> {
  for (const scope of scopes) {
    const result = await execa('bun', ['test'], {
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
      throw new Error(`Unit tests failed for ${scope.label} (${scope.cwd})`)
    }
  }
}

await main()
