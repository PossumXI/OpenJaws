import { formatTotalCost } from '../../cost-tracker.js'
import { currentLimits } from '../../services/openjawsUsageLimits.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isOpenJawsSubscriber } from '../../utils/auth.js'

export const call: LocalCommandCall = async () => {
  if (isOpenJawsSubscriber()) {
    let value: string

    if (currentLimits.isUsingOverage) {
      value =
        'You are currently using your overages to power your OpenJaws usage. We will automatically switch you back to your subscription rate limits when they reset'
    } else {
      value =
        'You are currently using your subscription to power your OpenJaws usage'
    }

    if (process.env.USER_TYPE === 'jaws') {
      value += `\n\n[JAWS-ONLY] Showing cost anyway:\n ${formatTotalCost()}`
    }
    return { type: 'text', value }
  }
  return { type: 'text', value: formatTotalCost() }
}
