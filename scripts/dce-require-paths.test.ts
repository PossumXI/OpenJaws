import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'fs'
import { relative, resolve } from 'path'

const rootDir = resolve(import.meta.dir, '..')
const srcDir = resolve(rootDir, 'src')

function scanFiles(): string[] {
  const patterns = ['**/*.ts', '**/*.tsx']
  return patterns.flatMap(pattern =>
    Array.from(new Bun.Glob(pattern).scanSync({ cwd: srcDir })).map(file =>
      resolve(srcDir, file),
    ),
  )
}

describe('dead-code-eliminated lazy requires', () => {
  test('does not use path-aliased src/* strings in require() expressions', () => {
    const offenders = scanFiles()
      .map(file => {
        const content = readFileSync(file, 'utf8')
        const matches = Array.from(
          content.matchAll(/require\((['"])src\/.+?\1\)/g),
        ).map(match => match[0])
        return matches.length > 0
          ? {
              file: relative(rootDir, file).replace(/\\/g, '/'),
              matches,
            }
          : null
      })
      .filter(entry => entry !== null)

    expect(offenders).toEqual([])
  })
})
