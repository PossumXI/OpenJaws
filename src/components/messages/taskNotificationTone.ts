import type { TextProps } from '../../ink.js'

export type TaskNotificationRenderTone = {
  bulletColor: TextProps['color']
  summaryColor?: TextProps['color']
  summaryBold?: boolean
}

export function getTaskNotificationRenderTone(
  status: string | null,
  summary: string,
): TaskNotificationRenderTone {
  const normalized = summary.trim().toLowerCase()

  if (
    status === 'failed' ||
    hasWord(normalized, 'retry') ||
    hasWord(normalized, 'error')
  ) {
    return {
      bulletColor: 'error',
      summaryColor: 'error',
      summaryBold: true,
    }
  }

  if (
    hasWord(normalized, 'approval') ||
    hasWord(normalized, 'watch') ||
    hasWord(normalized, 'waiting') ||
    normalized.includes('waiting for input') ||
    hasWord(normalized, 'input')
  ) {
    return {
      bulletColor: 'warning',
      summaryColor: 'warning',
      summaryBold: true,
    }
  }

  if (status === 'killed' || hasWord(normalized, 'stopped')) {
    return {
      bulletColor: 'warning',
      summaryColor: 'warning',
    }
  }

  if (hasWord(normalized, 'ready')) {
    return {
      bulletColor: 'success',
      summaryColor: 'success',
      summaryBold: true,
    }
  }

  if (
    status === 'completed' ||
    hasWord(normalized, 'done') ||
    hasWord(normalized, 'completed') ||
    hasWord(normalized, 'ended')
  ) {
    return {
      bulletColor: 'success',
    }
  }

  return {
    bulletColor: 'text',
  }
}

function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`).test(text)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
