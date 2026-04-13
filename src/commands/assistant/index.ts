import type { Command } from '../../types/command.js'

const assistant: Command = {
  type: 'local',
  name: 'assistant',
  description: 'Assistant mode is unavailable in this OpenJaws compatibility build.',
  isEnabled: () => false,
  supportsNonInteractive: true,
  async load() {
    return {
      async call() {
        return {
          type: 'text',
          value:
            'Assistant mode is unavailable in this OpenJaws compatibility build.',
        }
      },
    }
  },
}

export default assistant
