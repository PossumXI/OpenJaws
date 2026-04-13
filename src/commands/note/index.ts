import type { Command } from '../../commands.js'

const note = {
  type: 'local-jsx',
  name: 'note',
  aliases: ['notes'],
  description:
    'View or add session supervision notes for future turns, active workers, and openckeek agents',
  argumentHint: '[show|clear|<text>]',
  immediate: true,
  load: () => import('./note.js'),
} satisfies Command

export default note
