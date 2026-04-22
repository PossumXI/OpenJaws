import {
  getPublicShowcaseActivityMirrorPath,
  syncPublicShowcaseActivityFromRoot,
} from '../src/utils/publicShowcaseActivity.js'

type PublicShowcaseActivityCliOptions = {
  json: boolean
}

export function parseArgs(argv: string[]): PublicShowcaseActivityCliOptions {
  return {
    json: argv.includes('--json'),
  }
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv)
  const root = process.cwd()
  const feed = syncPublicShowcaseActivityFromRoot({
    root,
  })
  const payload = {
    path: process.env.ASGARD_PUBLIC_SHOWCASE_ACTIVITY_FILE ??
      process.env.AROBI_PUBLIC_SHOWCASE_ACTIVITY_FILE ??
      'C:\\Users\\Knight\\.arobi-public\\showcase-activity.json',
    mirrorPath: getPublicShowcaseActivityMirrorPath(root),
    ...feed,
  }

  console.log(
    options.json
      ? JSON.stringify(payload, null, 2)
      : `Wrote ${feed.entries.length} public showcase activity entr${
          feed.entries.length === 1 ? 'y' : 'ies'
        }`,
  )
  return 0
}

if (import.meta.main) {
  const exitCode = await main()
  process.exit(exitCode)
}
