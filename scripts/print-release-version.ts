import { getOpenJawsReleaseVersion } from './releaseVersion.ts'

const packageJson = (await Bun.file(
  new URL('../package.json', import.meta.url),
).json()) as {
  version?: string
}

console.log(
  getOpenJawsReleaseVersion({
    packageVersion: packageJson.version ?? '0.0.0',
  }),
)
