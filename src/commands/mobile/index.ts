import type { Command } from '../../commands.js'

const mobile = {
  type: 'local-jsx',
  name: 'mobile',
  aliases: ['ios', 'android'],
  description: 'Show a QR code for OpenJaws mobile handoff',
  load: () => import('./mobile.js'),
} satisfies Command

export default mobile
