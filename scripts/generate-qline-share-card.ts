import { mkdirSync, readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import sharp from 'sharp'

const root = process.cwd()
const emblemPath = resolve(root, 'website', 'public', 'assets', 'images', 'q-emblem.png')
const posterPath = resolve(root, 'website', 'public', 'assets', 'images', 'q-poster.png')
const outputPath = resolve(root, 'website', 'public', 'assets', 'images', 'q-share-card.png')
const snapshotPath = resolve(root, 'website', 'lib', 'benchmarkSnapshot.generated.json')

const width = 1600
const height = 900

type BenchmarkSnapshot = {
  bridgeBench?: {
    status?: string
    scorePercent?: number | null
  }
  soak?: {
    successCount?: number
    totalProbes?: number
  }
  terminalBench?: {
    taskName?: string
    outcome?: string
    executionErrorTrials?: number
    benchmarkFailedTrials?: number
  }
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatStatus(value: string | undefined): string {
  return value ? value.replace(/_/g, ' ') : 'unknown'
}

function readSnapshot(): BenchmarkSnapshot {
  return JSON.parse(readFileSync(snapshotPath, 'utf8')) as BenchmarkSnapshot
}

function buildBenchmarkLines(snapshot: BenchmarkSnapshot): {
  bridgeBench: string
  soak: string
  terminalBench: string
  receiptTask: string
  receiptSummary: string
} {
  const bridgeScore = snapshot.bridgeBench?.scorePercent
  const bridgeBench =
    typeof bridgeScore === 'number'
      ? `BridgeBench ${bridgeScore.toFixed(2)}%`
      : `BridgeBench ${formatStatus(snapshot.bridgeBench?.status)}`
  const soak =
    typeof snapshot.soak?.successCount === 'number' &&
    typeof snapshot.soak?.totalProbes === 'number'
      ? `Soak ${snapshot.soak.successCount}/${snapshot.soak.totalProbes}`
      : 'Soak receipt ready'
  const terminalBench = snapshot.terminalBench?.outcome
    ? `TerminalBench ${snapshot.terminalBench.outcome}`
    : 'TerminalBench receipt ready'
  const receiptTask =
    snapshot.terminalBench?.taskName &&
    snapshot.terminalBench.taskName !== 'unknown'
      ? `terminal-bench/${snapshot.terminalBench.taskName}`
      : 'terminal-bench public task'
  const runtimeErrors = snapshot.terminalBench?.executionErrorTrials ?? 0
  const benchmarkFailures = snapshot.terminalBench?.benchmarkFailedTrials ?? 0
  const receiptSummary = `Runtime errors ${runtimeErrors}. Benchmark failures ${benchmarkFailures}.`

  return {
    bridgeBench,
    soak,
    terminalBench,
    receiptTask,
    receiptSummary,
  }
}

function buildOverlaySvg(): string {
  const lines = buildBenchmarkLines(readSnapshot())

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#030913"/>
          <stop offset="48%" stop-color="#07131f"/>
          <stop offset="100%" stop-color="#010407"/>
        </linearGradient>
        <radialGradient id="flareGold" cx="0.15" cy="0.18" r="0.65">
          <stop offset="0%" stop-color="rgba(255,210,107,0.34)"/>
          <stop offset="100%" stop-color="rgba(255,210,107,0)"/>
        </radialGradient>
        <radialGradient id="flareBlue" cx="0.88" cy="0.2" r="0.72">
          <stop offset="0%" stop-color="rgba(91,182,255,0.28)"/>
          <stop offset="100%" stop-color="rgba(91,182,255,0)"/>
        </radialGradient>
        <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#ffd26b"/>
          <stop offset="100%" stop-color="#74c2ef"/>
        </linearGradient>
      </defs>

      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#flareGold)"/>
      <rect width="${width}" height="${height}" fill="url(#flareBlue)"/>

      <g opacity="0.16">
        ${Array.from({ length: 18 }, (_, index) => {
          const y = 70 + index * 46
          return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#7ab1e0" stroke-width="1"/>`
        }).join('')}
        ${Array.from({ length: 30 }, (_, index) => {
          const x = 70 + index * 48
          return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#7ab1e0" stroke-width="1"/>`
        }).join('')}
      </g>

      <rect x="56" y="54" width="862" height="576" rx="30" fill="rgba(4, 12, 21, 0.84)" stroke="rgba(122,177,224,0.20)" stroke-width="2"/>
      <rect x="56" y="54" width="862" height="74" rx="30" fill="rgba(8, 18, 30, 0.94)"/>
      <circle cx="104" cy="91" r="8" fill="#ff7f6e"/>
      <circle cx="132" cy="91" r="8" fill="#ffd26b"/>
      <circle cx="160" cy="91" r="8" fill="#74c2ef"/>
      <rect x="214" y="76" width="320" height="30" rx="15" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <text x="238" y="96" fill="#dcedf8" font-size="18" font-family="Segoe UI, Arial, sans-serif">qline.site // OpenJaws // Q_agents</text>

      <rect x="92" y="158" width="390" height="180" rx="22" fill="rgba(7, 18, 29, 0.92)" stroke="rgba(255,210,107,0.24)" stroke-width="2"/>
      <text x="122" y="197" fill="#ffd26b" font-size="18" letter-spacing="4" font-family="Segoe UI, Arial, sans-serif">OPENJAWS // Q // AGENT CO-WORK</text>
      <text x="122" y="254" fill="#f4fbff" font-size="90" font-weight="700" font-family="Segoe UI, Arial, sans-serif">Q.</text>
      <text x="122" y="300" fill="#dcedf8" font-size="26" font-family="Segoe UI, Arial, sans-serif">Intelligence with every frame.</text>

      <rect x="514" y="158" width="358" height="180" rx="22" fill="rgba(255,255,255,0.025)" stroke="rgba(122,177,224,0.18)" stroke-width="2"/>
      <text x="544" y="197" fill="#ffd26b" font-size="18" letter-spacing="4" font-family="Segoe UI, Arial, sans-serif">LIVE SURFACE</text>
      <rect x="544" y="220" width="298" height="24" rx="12" fill="rgba(255,255,255,0.08)"/>
      <rect x="544" y="262" width="120" height="84" rx="16" fill="rgba(255,210,107,0.12)" stroke="rgba(255,210,107,0.24)" stroke-width="1"/>
      <rect x="680" y="262" width="162" height="84" rx="16" fill="rgba(116,194,239,0.10)" stroke="rgba(116,194,239,0.20)" stroke-width="1"/>
      <rect x="544" y="364" width="298" height="160" rx="18" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
      <text x="570" y="408" fill="#f4fbff" font-size="28" font-family="Segoe UI, Arial, sans-serif">OpenJaws</text>
      <text x="570" y="446" fill="#8fb5cd" font-size="21" font-family="Segoe UI, Arial, sans-serif">Q_agents, receipts, routed work,</text>
      <text x="570" y="476" fill="#8fb5cd" font-size="21" font-family="Segoe UI, Arial, sans-serif">and one visible control layer.</text>

      <rect x="56" y="662" width="448" height="184" rx="26" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
      <text x="92" y="712" fill="#ffd26b" font-size="18" letter-spacing="4" font-family="Segoe UI, Arial, sans-serif">CAPABILITIES</text>
      <text x="92" y="758" fill="#f4fbff" font-size="34" font-family="Segoe UI, Arial, sans-serif">OCI Q default</text>
      <text x="92" y="796" fill="#8fb5cd" font-size="22" font-family="Segoe UI, Arial, sans-serif">Agent Co-Work, routed tools,</text>
      <text x="92" y="826" fill="#8fb5cd" font-size="22" font-family="Segoe UI, Arial, sans-serif">and hosted access on one deck.</text>

      <rect x="530" y="662" width="388" height="184" rx="26" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
      <text x="564" y="712" fill="#ffd26b" font-size="18" letter-spacing="4" font-family="Segoe UI, Arial, sans-serif">BENCHMARKS</text>
      <text x="564" y="756" fill="#f4fbff" font-size="30" font-family="Segoe UI, Arial, sans-serif">${escapeText(lines.bridgeBench)}</text>
      <text x="564" y="792" fill="#f4fbff" font-size="30" font-family="Segoe UI, Arial, sans-serif">${escapeText(lines.soak)}</text>
      <text x="564" y="828" fill="#8fb5cd" font-size="20" font-family="Segoe UI, Arial, sans-serif">${escapeText(lines.terminalBench)}</text>

      <text x="1040" y="118" fill="#ffd26b" font-size="18" letter-spacing="5" font-family="Segoe UI, Arial, sans-serif">Q_AGENTS // OPENJAWS // QLINE.SITE</text>

      <rect x="1030" y="696" width="436" height="142" rx="28" fill="rgba(5, 14, 24, 0.92)" stroke="rgba(255,210,107,0.24)" stroke-width="2"/>
      <text x="1066" y="744" fill="#ffd26b" font-size="18" letter-spacing="4" font-family="Segoe UI, Arial, sans-serif">PUBLIC RECEIPT</text>
      <text x="1066" y="786" fill="#f4fbff" font-size="28" font-family="Segoe UI, Arial, sans-serif">${escapeText(lines.receiptTask)}</text>
      <text x="1066" y="820" fill="#8fb5cd" font-size="19" font-family="Segoe UI, Arial, sans-serif">${escapeText(lines.receiptSummary)}</text>
    </svg>
  `
}

async function main(): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true })

  const overlay = Buffer.from(buildOverlaySvg())
  const emblem = await sharp(emblemPath).resize(188, 188).png().toBuffer()
  const poster = await sharp(posterPath)
    .resize(472, 520, { fit: 'cover', position: 'top' })
    .png()
    .toBuffer()
  const smallEmblem = await sharp(emblem).resize(132, 132).png().toBuffer()

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#02060c',
    },
  })
    .composite([
      { input: overlay, top: 0, left: 0 },
      { input: poster, top: 150, left: 1040 },
      { input: smallEmblem, top: 556, left: 1354 },
    ])
    .png()
    .toFile(outputPath)

  console.log(`Wrote ${outputPath}`)
}

await main()
