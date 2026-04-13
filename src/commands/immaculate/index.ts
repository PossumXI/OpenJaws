import type { Command } from '../../commands.js'

const immaculate = {
  type: 'local',
  name: 'immaculate',
  description: 'Inspect and control the Immaculate orchestration harness',
  argumentHint:
    '[status|health|topology|intelligence|executions|models|register|run|control] ...',
  immediate: true,
  supportsNonInteractive: false,
  load: () => import('./immaculate.js'),
} satisfies Command

export default immaculate
