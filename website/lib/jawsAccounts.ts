import { pbkdf2Sync, randomBytes, randomUUID, timingSafeEqual } from 'crypto'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

export type JawsAccountRole = 'founder_admin' | 'user'
export type JawsAccountPlan = 'admin_free_life' | 'trial' | 'subscriber'

export type JawsAccountRecord = {
  id: string
  email: string
  role: JawsAccountRole
  plan: JawsAccountPlan
  passwordHash: string
  passwordSalt: string
  trialEndsAt: string | null
  subscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled'
  createdAt: string
  updatedAt: string
}

export type JawsAccountStore = {
  version: 1
  updatedAt: string
  accounts: Record<string, JawsAccountRecord>
}

export type FounderAdminBootstrapResult = {
  storePath: string
  account: Omit<JawsAccountRecord, 'passwordHash' | 'passwordSalt'>
  password: string | null
  created: boolean
}

const DEFAULT_STORE_FILENAME = 'jaws-accounts.json'
const libDir = dirname(fileURLToPath(import.meta.url))
const websiteRootDir = resolve(libDir, '..')

function normalizeOptional(value: string | undefined | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function normalizeJawsAccountEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function resolveJawsAccountStorePath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicit = normalizeOptional(env.JAWS_ACCOUNT_STORE_PATH)
  if (explicit) {
    return resolve(explicit)
  }

  if (env.NETLIFY) {
    return resolve(tmpdir(), DEFAULT_STORE_FILENAME)
  }

  return resolve(websiteRootDir, '.data', DEFAULT_STORE_FILENAME)
}

function createEmptyStore(): JawsAccountStore {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    accounts: {},
  }
}

async function loadStore(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ path: string; store: JawsAccountStore }> {
  const path = resolveJawsAccountStorePath(env)
  if (!existsSync(path)) {
    return { path, store: createEmptyStore() }
  }

  const parsed = JSON.parse(await readFile(path, 'utf8')) as JawsAccountStore
  return {
    path,
    store: parsed?.version === 1 ? parsed : createEmptyStore(),
  }
}

async function saveStore(path: string, store: JawsAccountStore): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  store.updatedAt = new Date().toISOString()
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

export function generateJawsAdminPassword(): string {
  return `jaws_${randomBytes(24).toString('base64url')}`
}

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('base64url')
}

function createPasswordFields(password: string): {
  passwordHash: string
  passwordSalt: string
} {
  const passwordSalt = randomBytes(16).toString('base64url')
  return {
    passwordHash: hashPassword(password, passwordSalt),
    passwordSalt,
  }
}

function publicAccount(
  account: JawsAccountRecord,
): Omit<JawsAccountRecord, 'passwordHash' | 'passwordSalt'> {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...safe } = account
  return safe
}

export function verifyJawsAccountPassword(
  account: Pick<JawsAccountRecord, 'passwordHash' | 'passwordSalt'>,
  password: string,
): boolean {
  const candidate = Buffer.from(hashPassword(password, account.passwordSalt))
  const expected = Buffer.from(account.passwordHash)
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export async function bootstrapFounderAdminAccount(args: {
  email: string
  password?: string | null
  env?: NodeJS.ProcessEnv
}): Promise<FounderAdminBootstrapResult> {
  const email = normalizeJawsAccountEmail(args.email)
  if (!email) {
    throw new Error('Founder admin email is required.')
  }

  const { path, store } = await loadStore(args.env)
  const existing = store.accounts[email]
  if (existing) {
    const updated: JawsAccountRecord = {
      ...existing,
      role: 'founder_admin',
      plan: 'admin_free_life',
      subscriptionStatus: 'active',
      trialEndsAt: null,
      updatedAt: new Date().toISOString(),
    }
    store.accounts[email] = updated
    await saveStore(path, store)
    return {
      storePath: path,
      account: publicAccount(updated),
      password: null,
      created: false,
    }
  }

  const password = normalizeOptional(args.password) ?? generateJawsAdminPassword()
  const now = new Date().toISOString()
  const account: JawsAccountRecord = {
    id: randomUUID(),
    email,
    role: 'founder_admin',
    plan: 'admin_free_life',
    ...createPasswordFields(password),
    trialEndsAt: null,
    subscriptionStatus: 'active',
    createdAt: now,
    updatedAt: now,
  }
  store.accounts[email] = account
  await saveStore(path, store)

  return {
    storePath: path,
    account: publicAccount(account),
    password,
    created: true,
  }
}
