import {
  OPENJAWS_ASCII_BANNER_LINES,
  OPENJAWS_ASCII_BANNER_ROW_COLORS,
} from '../src/components/LogoV2/openjawsBannerData.js'

type Rgb = {
  r: number
  g: number
  b: number
}

function parseHexColor(hex: string): Rgb {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) {
    throw new Error(`Unsupported color "${hex}"`)
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function buildAnsiLine(line: string, color: string): string {
  const { r, g, b } = parseHexColor(color)
  return `\\033[38;2;${r};${g};${b}m${line}\\033[0m`
}

function escapeForBash(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
}

const rawLines = OPENJAWS_ASCII_BANNER_LINES.map((line, index) =>
  buildAnsiLine(line, OPENJAWS_ASCII_BANNER_ROW_COLORS[index]!),
)

const rawBlock = rawLines.join('\n')
const bashOneLiner = `printf $'${escapeForBash(rawBlock)}\\n'`

console.log('RAW_BANNER_START')
console.log(rawBlock)
console.log('RAW_BANNER_END')
console.log('BASH_PRINTF_START')
console.log(bashOneLiner)
console.log('BASH_PRINTF_END')
