export function buildDiscordOperatorArtifactPrompt(args: {
  topic: string
  format?: string | null
}): string {
  const normalizedFormat = args.format?.trim().toLowerCase().replace(/\s+/g, ' ') ?? null
  const normalizedFormatAlias =
    normalizedFormat === 'md'
      ? 'markdown'
      : normalizedFormat === 'txt'
        ? 'text'
        : normalizedFormat === 'powerpoint' ||
            normalizedFormat === 'slide' ||
            normalizedFormat === 'slides' ||
            normalizedFormat === 'slide deck'
          ? 'pptx slide deck'
          : normalizedFormat === 'excel' ||
              normalizedFormat === 'spreadsheet' ||
              normalizedFormat === 'workbook'
            ? 'xlsx workbook'
            : normalizedFormat
  const requestedFormats =
    normalizedFormatAlias ?? 'markdown, docx, pptx, xlsx, csv, json, and pdf when supported'

  return [
    `Create a Discord-deliverable ${requestedFormats} artifact about ${args.topic.trim()}.`,
    'Use the existing OpenJaws operator delivery contract and emit delivery.json with any markdown, text, html, docx, pptx, xlsx, csv, pdf, or workspace files that should be attached back to Discord.',
    'Build the smallest bounded local harness first when validation, parsing, replay, or differential checks are needed.',
  ].join(' ')
}
