import type { Command } from '../types/command.js'

const proactive: Command = {
  type: 'local',
  name: 'proactive',
  description: 'Proactive mode is unavailable in this OpenJaws compatibility build.',
  isEnabled: () => false,
  supportsNonInteractive: true,
  async load() {
    return {
      async call() {
        return {
          type: 'text',
          value:
            'Proactive mode is unavailable in this OpenJaws compatibility build.',
        }
      },
    }
  },
}

export default proactive
