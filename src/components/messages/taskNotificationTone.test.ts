import { describe, expect, it } from 'bun:test'
import { getTaskNotificationRenderTone } from './taskNotificationTone.js'

describe('taskNotificationTone', () => {
  it('elevates retry receipts to error tone', () => {
    expect(
      getTaskNotificationRenderTone('failed', 'Agent "scan repo" retry'),
    ).toEqual({
      bulletColor: 'error',
      summaryColor: 'error',
      summaryBold: true,
    })
  })

  it('elevates watch and input receipts to warning tone even without status', () => {
    expect(
      getTaskNotificationRenderTone(
        null,
        'Background command "npm test" watch: waiting for input',
      ),
    ).toEqual({
      bulletColor: 'warning',
      summaryColor: 'warning',
      summaryBold: true,
    })

    expect(
      getTaskNotificationRenderTone(null, 'Ultraplan approval waiting'),
    ).toEqual({
      bulletColor: 'warning',
      summaryColor: 'warning',
      summaryBold: true,
    })
  })

  it('keeps stopped receipts as warning tone', () => {
    expect(
      getTaskNotificationRenderTone('killed', 'Background command "npm test" stopped'),
    ).toEqual({
      bulletColor: 'warning',
      summaryColor: 'warning',
    })
  })

  it('keeps done receipts compact and ready receipts positively emphasized', () => {
    expect(
      getTaskNotificationRenderTone('completed', 'Agent "scan repo" done'),
    ).toEqual({
      bulletColor: 'success',
    })

    expect(
      getTaskNotificationRenderTone(null, 'Ultrareview ready'),
    ).toEqual({
      bulletColor: 'success',
      summaryColor: 'success',
      summaryBold: true,
    })
  })

  it('lets mixed-pressure overflow stay error-first', () => {
    expect(
      getTaskNotificationRenderTone(
        'failed',
        '+3 more task receipts · 1 done · 1 retry · 1 watch',
      ),
    ).toEqual({
      bulletColor: 'error',
      summaryColor: 'error',
      summaryBold: true,
    })
  })
})
