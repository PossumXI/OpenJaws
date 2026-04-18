import type { Command } from '../../commands.js'

const apex = {
  type: 'local-jsx',
  name: 'apex',
  aliases: ['workspace', 'command-center'],
  description: 'Open the Apex workspace bridge, launchers, and ops surface',
  load: () => import('./apex.js'),
} satisfies Command

export default apex
