import type { Command } from '../../commands.js'

const preview = {
  type: 'local-jsx',
  name: 'preview',
  aliases: ['browser-preview', 'browse'],
  description:
    'Open an accountable browser preview lane for local apps, research, or chill sessions',
  argumentHint: '[url]',
  load: () => import('./preview.js'),
} satisfies Command

export default preview
