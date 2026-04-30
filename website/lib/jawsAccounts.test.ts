import { mkdtempSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, test } from 'bun:test'
import {
  bootstrapFounderAdminAccount,
  resolveJawsAccountStorePath,
  verifyJawsAccountPassword,
} from './jawsAccounts'

describe('JAWS account store', () => {
  test('bootstraps a founder admin account without exposing password hashes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'jaws-account-'))
    const storePath = join(root, 'accounts.json')
    const result = await bootstrapFounderAdminAccount({
      email: 'Founder@qline.test',
      password: 'local-test-password',
      env: {
        JAWS_ACCOUNT_STORE_PATH: storePath,
      },
    })

    expect(result.created).toBe(true)
    expect(result.password).toBe('local-test-password')
    expect(result.account).toMatchObject({
      email: 'founder@qline.test',
      role: 'founder_admin',
      plan: 'admin_free_life',
      subscriptionStatus: 'active',
      trialEndsAt: null,
    })
    expect(result.account).not.toHaveProperty('passwordHash')

    const store = JSON.parse(await readFile(storePath, 'utf8'))
    const account = store.accounts['founder@qline.test']
    expect(account.passwordHash).not.toBe('local-test-password')
    expect(verifyJawsAccountPassword(account, 'local-test-password')).toBe(true)
  })

  test('uses an ignored local website data path by default', () => {
    expect(resolveJawsAccountStorePath({})).toContain(join('website', '.data', 'jaws-accounts.json'))
  })
})
