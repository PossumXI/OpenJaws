export function buildDiscordOperatorArtifactPrompt(args: {
  topic: string
  format?: string | null
}): string {
  const normalizedFormat = args.format?.trim().toLowerCase() ?? null
  const requestedFormats =
    normalizedFormat === 'md'
      ? 'markdown'
      : normalizedFormat === 'txt'
        ? 'text'
        : normalizedFormat ?? 'markdown, docx, and pdf when supported'

  return [
    `Create a Discord-deliverable ${requestedFormats} artifact about ${args.topic.trim()}.`,
    'Use the existing OpenJaws operator delivery contract and emit delivery.json with any markdown, text, html, docx, pptx, xlsx, csv, pdf, or workspace files that should be attached back to Discord.',
    'Build the smallest bounded local harness first when validation, parsing, replay, or differential checks are needed.',
  ].join(' ')
}
