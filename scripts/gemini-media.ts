import {
  classifyGeminiMediaError,
  generateGeminiImages,
  generateGeminiVideo,
  getGeminiMediaDefaults,
  probeGeminiMediaModel,
} from '../src/utils/geminiMedia.js'

type CliOptions = {
  mode: 'image' | 'video' | 'probe'
  prompt: string | null
  model: string | null
  outDir: string | null
  count: number | null
  size: string | null
  pollMs: number | null
  timeoutMs: number | null
}

function parseOptionalInt(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseArgs(argv: string[]): CliOptions {
  const defaults = getGeminiMediaDefaults()
  const options: CliOptions = {
    mode: 'probe',
    prompt: null,
    model: null,
    outDir: null,
    count: 1,
    size: null,
    pollMs: null,
    timeoutMs: null,
  }

  const first = argv[0]?.trim().toLowerCase()
  if (first === 'image' || first === 'video' || first === 'probe') {
    options.mode = first
    argv = argv.slice(1)
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ((arg === '--prompt' || arg === '-p') && argv[i + 1]) {
      options.prompt = argv[++i]!
      continue
    }
    if (arg === '--model' && argv[i + 1]) {
      options.model = argv[++i]!
      continue
    }
    if (arg === '--out-dir' && argv[i + 1]) {
      options.outDir = argv[++i]!
      continue
    }
    if (arg === '--count' && argv[i + 1]) {
      options.count = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--size' && argv[i + 1]) {
      options.size = argv[++i]!
      continue
    }
    if (arg === '--poll-ms' && argv[i + 1]) {
      options.pollMs = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--timeout-ms' && argv[i + 1]) {
      options.timeoutMs = parseOptionalInt(argv[++i]!)
      continue
    }
    if (arg === '--help' || arg === '-h') {
      console.log(
        [
          'Usage:',
          '  bun scripts/gemini-media.ts probe [--model <id>] [--kind <image|video>]',
          '  bun scripts/gemini-media.ts <image|video> --prompt "<text>" [options]',
          '',
          'Options:',
          `  --model <id>          Override the default model (${defaults.imageModel} for image, ${defaults.videoModel} for video)`,
          '  --kind <mode>         Probe kind when using probe (image or video)',
          '  --out-dir <path>      Output directory root (defaults to artifacts/gemini-media)',
          '  --count <n>           Number of images to request (image only, default 1)',
          '  --size <WxH>          Optional image size, e.g. 1024x1024',
          '  --poll-ms <n>         Video polling cadence in milliseconds',
          '  --timeout-ms <n>      Video generation timeout in milliseconds',
        ].join('\n'),
      )
      process.exit(0)
    }
    if (arg === '--kind' && argv[i + 1]) {
      const kind = argv[++i]!.trim().toLowerCase()
      options.mode = kind === 'video' ? 'video' : kind === 'image' ? 'image' : options.mode
      continue
    }
  }

  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  if (process.argv.slice(2)[0]?.trim().toLowerCase() === 'probe') {
    const kind = options.mode === 'video' ? 'video' : 'image'
    const result = await probeGeminiMediaModel({
      kind,
      model: options.model,
    })
    console.log(
      JSON.stringify(
        {
          status: result.ready ? 'ready' : 'blocked',
          mode: 'probe',
          kind: result.kind,
          model: result.model,
          apiKeyEnv: result.apiKeyEnv,
          listed: result.listed,
          ready: result.ready,
          reason: result.reason,
          statusCode: result.statusCode,
          message: result.message,
          knownModels: result.knownModels,
        },
        null,
        2,
      ),
    )
    return
  }
  const prompt = options.prompt?.trim()
  if (!prompt) {
    throw new Error('A prompt is required. Use --prompt "<text>".')
  }

  if (options.mode === 'image') {
    const result = await generateGeminiImages({
      prompt,
      model: options.model,
      outDir: options.outDir,
      count: options.count ?? 1,
      size: options.size,
    })
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          mode: 'image',
          model: result.model,
          prompt: result.prompt,
          artifacts: result.artifacts,
        },
        null,
        2,
      ),
    )
    return
  }

  const result = await generateGeminiVideo({
    prompt,
    model: options.model,
    outDir: options.outDir,
    pollMs: options.pollMs ?? undefined,
    timeoutMs: options.timeoutMs ?? undefined,
  })
  console.log(
    JSON.stringify(
      {
        status: 'ok',
        mode: 'video',
        model: result.model,
        prompt: result.prompt,
        operationId: result.operationId,
        videoStatus: result.status,
        url: result.url,
        artifactPath: result.artifactPath,
      },
      null,
      2,
    ),
  )
}

await main().catch(error => {
  const classification = classifyGeminiMediaError(error)
  console.error(
    JSON.stringify(
      {
        status: 'error',
        reason: classification.kind,
        statusCode: classification.statusCode,
        message: classification.message,
      },
      null,
      2,
    ),
  )
  process.exit(1)
})
