import { isTelemetryDisabled } from '../../utils/privacyLevel.js'
import { ANALYTICS_RUNTIME_AVAILABLE } from './index.js'

export function isAnalyticsRuntimeAvailable(): boolean {
  return ANALYTICS_RUNTIME_AVAILABLE
}

export function isAnalyticsDisabled(): boolean {
  return !isAnalyticsRuntimeAvailable() || isTelemetryDisabled()
}

export function isFeedbackSurveyDisabled(): boolean {
  return !isAnalyticsRuntimeAvailable() || isTelemetryDisabled()
}
