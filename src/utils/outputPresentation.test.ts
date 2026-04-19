import { describe, expect, it } from 'bun:test'
import {
  formatDirectDeliverySummary,
  formatLifecycleStatusText,
  formatScopedActivitySummary,
  polishToolUseSummaryLabel,
  sanitizeOutputText,
  summarizeOutputText,
} from './outputPresentation.js'

describe('outputPresentation', () => {
  it('sanitizes markdown, code, and internal tags into compact summaries', () => {
    expect(
      sanitizeOutputText(
        '```ts\nconsole.log("hi")\n```\n<summary>Check [dashboard](https://qline.site)</summary>',
      ),
    ).toBe('code block Check dashboard')
  })

  it('builds compact scoped summaries with consistent lifecycle wording', () => {
    expect(
      formatScopedActivitySummary({
        scope: 'Agent',
        title: 'scan repo',
        status: 'completed',
      }),
    ).toBe('Agent "scan repo" completed')
    expect(
      formatScopedActivitySummary({
        scope: 'Background command',
        title: 'npm test',
        status: 'failed',
        detail: 'exit 1',
      }),
    ).toBe('Background command "npm test" needs retry: exit 1')
    expect(
      formatScopedActivitySummary({
        scope: 'Background command',
        title: 'npm test',
        status: 'watch',
      }),
    ).toBe('Background command "npm test" waiting for input')
  })

  it('normalizes compact status tokens and delivery receipts', () => {
    expect(formatLifecycleStatusText('completed')).toBe('completed')
    expect(formatLifecycleStatusText('failed')).toBe('retry')
    expect(
      formatDirectDeliverySummary({
        target: '@scout',
        summary: 'Keep the OCI bridge aligned before the release cut.',
      }),
    ).toBe('Delivered to @scout · Keep the OCI bridge aligned before the release cut')
  })

  it('polishes preview and tool-summary labels into compact release-safe text', () => {
    expect(
      summarizeOutputText('  Keep   the   bridge aligned.\n\n', 32),
    ).toBe('Keep the bridge aligned')
    expect(polishToolUseSummaryLabel('fixed npe in user service.')).toBe(
      'Fixed npe in user service',
    )
  })
})
