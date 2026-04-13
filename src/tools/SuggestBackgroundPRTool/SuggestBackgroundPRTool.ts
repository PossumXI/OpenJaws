import { z } from 'zod/v4'
import { buildTool } from '../../Tool.js'

const inputSchema = z.object({})

export const SuggestBackgroundPRTool = buildTool({
  name: 'SuggestBackgroundPRTool',
  maxResultSizeChars: 4_096,
  get inputSchema() {
    return inputSchema
  },
  async description() {
    return 'Unavailable in this OpenJaws compatibility build.'
  },
  async prompt() {
    return 'Unavailable in this OpenJaws compatibility build.'
  },
  async call() {
    return {
      data: {
        message:
          'Background PR suggestions are unavailable in this OpenJaws compatibility build.',
      },
    }
  },
  isEnabled() {
    return false
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
})
