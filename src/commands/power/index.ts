import type { Command } from '../../commands.js'

const power = {
  type: 'local-jsx',
  name: 'power',
  aliases: ['profile'],
  description:
    'Switch between standard and builder power profiles for permission defaults',
  argumentHint: '[status|standard|builder]',
  immediate: true,
  load: () => import('./power.js'),
} satisfies Command

export default power
