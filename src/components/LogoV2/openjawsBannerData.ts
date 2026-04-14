export const OPENJAWS_ASCII_TRIM_TOP =
  'OPENCHEEKS // ANSI-SHADOW FLIGHT DECK // IMMACULATE'

export const OPENJAWS_ASCII_TRIM_BOTTOM =
  'OCEAN-BLUE SHELL // OPENCHEEK CREW // ROUTED TOOLS'

export const OPENJAWS_ASCII_BANNER_LINES = [
  ' ██████╗ ██████╗ ███████╗███╗   ██╗     ██╗ █████╗ ██╗    ██╗███████╗',
  '██╔═══██╗██╔══██╗██╔════╝████╗  ██║     ██║██╔══██╗██║    ██║██╔════╝',
  '██║   ██║██████╔╝█████╗  ██╔██╗ ██║     ██║███████║██║ █╗ ██║███████╗',
  '██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██   ██║██╔══██║██║███╗██║╚════██║',
  '╚██████╔╝██║     ███████╗██║ ╚████║╚█████╔╝██║  ██║╚███╔███╔╝███████║',
  ' ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝ ╚════╝ ╚═╝  ╚═╝ ╚══╝╚══╝ ╚══════╝',
] as const

export const OPENJAWS_ASCII_BANNER_COMPACT_LINES = OPENJAWS_ASCII_BANNER_LINES

export const OPENJAWS_ASCII_BANNER_ROW_COLORS = [
  '#FFD700',
  '#FFEB78',
  '#FFFFFF',
  '#78C8E6',
  '#0077BE',
  '#003C78',
] as const

export function getOpenJawsAsciiBannerWidth(compact = false): number {
  const lines = compact
    ? OPENJAWS_ASCII_BANNER_COMPACT_LINES
    : OPENJAWS_ASCII_BANNER_LINES

  return Math.max(
    OPENJAWS_ASCII_TRIM_TOP.length,
    OPENJAWS_ASCII_TRIM_BOTTOM.length,
    ...lines.map(line => line.length),
  )
}
