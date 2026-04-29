import { getOpenJawsReleaseVersion } from './releaseVersion.ts'

const packageJson = (await Bun.file(new URL('../package.json', import.meta.url)).json()) as {
  version?: string
}

const version = getOpenJawsReleaseVersion({
  packageVersion: packageJson.version ?? '0.0.0',
})

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

const result = await Bun.build({
  entrypoints: ['src/entrypoints/cli.tsx'],
  outdir: 'dist',
  target: 'bun',
  define: {
    MACRO: JSON.stringify(macro),
  },
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

const output = result.outputs.find(file => file.path.endsWith('/cli.js') || file.path.endsWith('\\cli.js'))

if (!output) {
  console.error('Benchmark CLI build did not emit dist/cli.js')
  process.exit(1)
}

console.log(`Built ${output.path} (${version})`)
