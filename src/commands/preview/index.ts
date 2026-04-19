import type { Command } from '../../commands.js'

const preview = {
  type: 'local-jsx',
  name: 'preview',
  aliases: ['browser-preview', 'browse'],
  description:
    'Open the native in-TUI browser for local apps, research, or accountable agent browsing',
  argumentHint: '[url]',
  load: () => import('./preview.js'),
} satisfies Command

export default preview
