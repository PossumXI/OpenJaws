import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  JAWS_RELEASE_ASSETS,
  JAWS_RELEASE_BASE_URL,
} from './jaws-release-index.ts'

const root = resolve(import.meta.dir, '..')
const redirectFiles = [
  'website/public/_redirects',
  'sites/iorch-jaws-release/_redirects',
]

function expectedRedirectLines(): string[] {
  return JAWS_RELEASE_ASSETS
    .filter(asset => asset.route)
    .map(asset => {
      return `/downloads/jaws/${asset.route} ${JAWS_RELEASE_BASE_URL}/${asset.file} 302`
    })
}

describe('JAWS public download surfaces', () => {
  test('qline and iorch redirects match the current release index', () => {
    for (const file of redirectFiles) {
      const text = readFileSync(resolve(root, file), 'utf8')
      for (const line of expectedRedirectLines()) {
        expect(text).toContain(line)
      }
    }
  })
})
