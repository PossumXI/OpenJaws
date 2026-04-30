import { mkdir, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { bootstrapFounderAdminAccount } from '../website/lib/jawsAccounts'

type Args = {
  email: string
  receipt: string
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    email: process.env.JAWS_ADMIN_EMAIL ?? '',
    receipt: resolve('website', '.data', 'jaws-admin.local.json'),
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    const next = argv[index + 1]
    if (!current.startsWith('--') || !next) {
      throw new Error(`Missing value for ${current}`)
    }
    index += 1
    if (current === '--email') {
      args.email = next
    } else if (current === '--receipt') {
      args.receipt = resolve(next)
    } else {
      throw new Error(`Unknown argument: ${current}`)
    }
  }

  if (!args.email.trim()) {
    throw new Error('Set JAWS_ADMIN_EMAIL or pass --email to bootstrap a local JAWS admin account.')
  }

  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const result = await bootstrapFounderAdminAccount({
    email: args.email,
  })

  const receipt = {
    generatedAt: new Date().toISOString(),
    email: result.account.email,
    role: result.account.role,
    plan: result.account.plan,
    subscriptionStatus: result.account.subscriptionStatus,
    storePath: result.storePath,
    password:
      result.password ??
      'Existing account was preserved. Rotate the local password explicitly if needed.',
    created: result.created,
    note: 'Local ignored bootstrap receipt. Do not commit this file.',
  }

  await mkdir(dirname(args.receipt), { recursive: true })
  await writeFile(args.receipt, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8')
  console.log(
    JSON.stringify(
      {
        ok: true,
        email: receipt.email,
        plan: receipt.plan,
        created: receipt.created,
        storePath: result.storePath,
        receiptPath: args.receipt,
      },
      null,
      2,
    ),
  )
}

await main()
