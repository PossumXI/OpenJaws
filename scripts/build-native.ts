import { copyFileSync, rmSync } from 'node:fs'
import { getOpenJawsReleaseVersion } from './releaseVersion.ts'

const packageJson = (await Bun.file(
  new URL('../package.json', import.meta.url),
).json()) as {
  version?: string
}

const version = getOpenJawsReleaseVersion({
  packageVersion: packageJson.version ?? '0.0.0',
})
const outfile =
  process.env.OPENJAWS_NATIVE_OUTFILE ||
  (process.platform === 'win32' ? 'dist/openjaws.exe' : 'dist/openjaws')
const macro = {
  VERSION: version,
  BUILD_TIME: new Date().toISOString(),
  VERSION_CHANGELOG: '',
  PACKAGE_URL: 'openjaws',
  NATIVE_PACKAGE_URL: 'openjaws',
  FEEDBACK_CHANNEL: 'the OpenJaws issue tracker',
  ISSUES_EXPLAINER: 'open an issue in the OpenJaws issue tracker',
}

await Bun.write('dist/.keep', '')

async function buildNativeExecutable(targetOutfile: string) {
  const result = await Bun.build({
    entrypoints: ['src/entrypoints/cli.tsx'],
    target: 'bun',
    define: {
      MACRO: JSON.stringify(macro),
    },
    compile: {
      outfile: targetOutfile,
    },
  })

  if (!result.success) {
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  return targetOutfile
}

function shouldUseWindowsStagingBuild(): boolean {
  return process.platform === 'win32' && !process.env.OPENJAWS_NATIVE_OUTFILE
}

const stagingOutfile = shouldUseWindowsStagingBuild()
  ? `dist/openjaws-${process.pid}.verify.exe`
  : outfile
let builtOutfile = await buildNativeExecutable(stagingOutfile)

if (stagingOutfile !== outfile) {
  try {
    copyFileSync(stagingOutfile, outfile)
    rmSync(stagingOutfile, { force: true })
    builtOutfile = outfile
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(
      [
        `Built ${stagingOutfile}, but could not replace ${outfile}.`,
        'A running OpenJaws session is likely holding the release binary open.',
        `Leaving verification binary in place. ${message}`,
      ].join(' '),
    )
  }
}

console.log(`Built ${builtOutfile} (${version})`)
