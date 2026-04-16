export const Q_ASCII_MARK_LABEL = 'Q // OPENCHEEK COMMAND MARK'

export const Q_ASCII_MARK_LINES = [
  '   ___  ',
  '  / _ \\ ',
  ' | (_) |',
  '  \\__\\_\\',
  '        ',
] as const

export function buildQAsciiMarkCodeBlock(): string {
  return ['```text', ...Q_ASCII_MARK_LINES, '', Q_ASCII_MARK_LABEL, '```'].join(
    '\n',
  )
}
