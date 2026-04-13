const packageJson = (await Bun.file(
  new URL('../package.json', import.meta.url),
).json()) as {
  version?: string
}

const version = packageJson.version ?? '0.0.0'
const outfile = process.env.OPENJAWS_NATIVE_OUTFILE || 'dist/openjaws.exe'
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
  target: 'bun',
  define: {
    MACRO: JSON.stringify(macro),
  },
  compile: {
    outfile,
  },
})

if (!result.success) {
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

console.log(`Built ${outfile} (${version})`)
