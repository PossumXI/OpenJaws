import type { Command } from '../../commands.js'
import { shouldInferenceConfigCommandBeImmediate } from '../../utils/immediateCommand.js'

export default {
  type: 'local-jsx',
  name: 'provider',
  aliases: ['providers', 'apikey'],
  description: 'Manage external model providers, API keys, and default models',
  argumentHint: '[status|use|key|clear-key|model|base-url] ...',
  isSensitive: true,
  get immediate() {
    return shouldInferenceConfigCommandBeImmediate()
  },
  load: () => import('./provider.js'),
} satisfies Command
