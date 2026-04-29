import { renderDiscordOperatorDeliveryBundle } from '../src/utils/discordOperatorExecution.js'

type RenderOptions = {
  workspace: string | null
  prompt: string | null
  outputTextPath: string | null
  outDir: string | null
  model: string
  includePdf: boolean
}

function parseArgs(argv: string[]): RenderOptions {
  const options: RenderOptions = {
    workspace: null,
    prompt: null,
    outputTextPath: null,
    outDir: null,
    model: 'oci:Q',
    includePdf: true,
  }

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    const next = argv[index + 1]
    if (arg === '--workspace' && next) {
      options.workspace = next
      index++
      continue
    }
    if (arg === '--prompt' && next) {
      options.prompt = next
      index++
      continue
    }
    if (arg === '--output-text-path' && next) {
      options.outputTextPath = next
      index++
      continue
    }
    if (arg === '--out-dir' && next) {
      options.outDir = next
      index++
      continue
    }
    if (arg === '--model' && next) {
      options.model = next
      index++
      continue
    }
    if (arg === '--no-pdf') {
      options.includePdf = false
      continue
    }
  }

  return options
}

function requireOption(value: string | null, name: string): string {
  if (!value?.trim()) {
    throw new Error(`Missing required ${name} option.`)
  }
  return value
}

const options = parseArgs(process.argv.slice(2))
const delivery = await renderDiscordOperatorDeliveryBundle({
  workspacePath: requireOption(options.workspace, '--workspace'),
  prompt: requireOption(options.prompt, '--prompt'),
  outputTextPath: requireOption(options.outputTextPath, '--output-text-path'),
  outputDir: requireOption(options.outDir, '--out-dir'),
  model: options.model,
  includePdf: options.includePdf,
})

console.log(JSON.stringify(delivery, null, 2))
