import type { Command } from '../../commands.js'

const caveman = {
  type: 'local',
  name: 'caveman',
  description: 'Switch between terse Caveman output styles',
  supportsNonInteractive: false,
  load: () => import('./caveman.js'),
} satisfies Command

export default caveman
