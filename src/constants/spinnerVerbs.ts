import { getInitialSettings } from '../utils/settings/settings.js'

export function getSpinnerVerbs(): string[] {
  const settings = getInitialSettings()
  const config = settings.spinnerVerbs
  if (!config) {
    return SPINNER_VERBS
  }
  if (config.mode === 'replace') {
    return config.verbs.length > 0 ? config.verbs : SPINNER_VERBS
  }
  return [...SPINNER_VERBS, ...config.verbs]
}

// Spinner verbs for loading messages
export const SPINNER_VERBS = [
  'Bearing Down On The Prize',
  'Calling For No Quarter',
  'Charting Black Waters',
  'Cutting Through The Squall',
  'Eyeing The Fat Prize',
  'Hauling The Black Colors',
  'Keeping To Windward',
  'Loading The Long Guns',
  'Marking The Chart',
  "Mind The Devil's Tide",
  'Opencheeks At Full Sail',
  'Plotting The Raid',
  'Riding The Plantain',
  'Reading The Black Water',
  'Scouting Rich Waters',
  'Sharpening The Bite',
  'Shiver Me Timbers',
  'Sounding The Deep',
  'Steadying The Black Helm',
  'Swinging To Broadside',
  'Taking The Weather Gage',
  'Two Booties Fighting A War',
  'Trimming For Hard Weather',
  'Turning The Capstan',
  'Weighing Anchor',
  'Working The Guns',
]
