import { normalizeLanguageForSTT } from '../../hooks/useVoice.js'
import { getShortcutDisplay } from '../../keybindings/shortcutFormat.js'
import { logEvent } from '../../services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { isAnthropicAuthEnabled } from '../../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { settingsChangeDetector } from '../../utils/settings/changeDetector.js'
import {
  getInitialSettings,
  updateSettingsForSource,
} from '../../utils/settings/settings.js'
import { isVoiceModeEnabled } from '../../voice/voiceModeEnabled.js'

const LANG_HINT_MAX_SHOWS = 2

type VoiceSettingsUpdate = {
  voiceEnabled?: boolean
  voiceFocusMode?: boolean
  voiceOutputEnabled?: boolean
  elevenLabsApiKey?: string
  elevenLabsVoiceId?: string
  elevenLabsModelId?: string
}

function updateVoiceSettings(
  updates: VoiceSettingsUpdate,
): { type: 'text'; value: string } | null {
  const result = updateSettingsForSource('userSettings', updates)
  if (result.error) {
    return {
      type: 'text' as const,
      value:
        'Failed to update settings. Check your settings file for syntax errors.',
    }
  }
  settingsChangeDetector.notifyChange('userSettings')
  return null
}

async function getVoicePreflightError(): Promise<string | null> {
  if (!isVoiceModeEnabled()) {
    if (!isAnthropicAuthEnabled()) {
      return 'Voice mode requires a signed-in web account. Please run /login to sign in.'
    }
    return 'Voice mode is not available.'
  }

  const { isVoiceStreamAvailable } = await import(
    '../../services/voiceStreamSTT.js'
  )
  const {
    checkRecordingAvailability,
    checkVoiceDependencies,
    requestMicrophonePermission,
  } = await import('../../services/voice.js')

  const recording = await checkRecordingAvailability()
  if (!recording.available) {
    return recording.reason ?? 'Voice mode is not available in this environment.'
  }

  if (!isVoiceStreamAvailable()) {
    return 'Voice mode requires a signed-in web account. Please run /login to sign in.'
  }

  const deps = await checkVoiceDependencies()
  if (!deps.available) {
    const hint = deps.installCommand
      ? `\nInstall audio recording tools? Run: ${deps.installCommand}`
      : '\nInstall SoX manually for audio recording.'
    return `No audio recording tool found.${hint}`
  }

  if (!(await requestMicrophonePermission())) {
    let guidance: string
    if (process.platform === 'win32') {
      guidance = 'Settings → Privacy → Microphone'
    } else if (process.platform === 'linux') {
      guidance = "your system's audio settings"
    } else {
      guidance = 'System Settings → Privacy & Security → Microphone'
    }
    return `Microphone access is denied. To enable it, go to ${guidance}, then run /voice again.`
  }

  return null
}

async function getVoiceStatusMessage(): Promise<string> {
  const settings = getInitialSettings()
  const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
  const { isVoiceStreamAvailable } = await import(
    '../../services/voiceStreamSTT.js'
  )
  const { checkRecordingAvailability } = await import('../../services/voice.js')
  const { getElevenLabsConfig } = await import('../../services/voiceOutput.js')
  const recording = await checkRecordingAvailability()
  const tts = getElevenLabsConfig()

  return [
    `Voice: ${settings.voiceEnabled === true ? 'on' : 'off'}`,
    `Focus mode: ${settings.voiceFocusMode === true ? 'on' : 'off'}`,
    `Deliverable speech: ${settings.voiceOutputEnabled === true ? 'on' : 'off'}`,
    `Hold-to-talk key: ${key}`,
    `STT transport: ${isVoiceStreamAvailable() ? 'voice stream ready' : 'voice stream unavailable'}`,
    `Recording backend: ${recording.available ? 'ready' : recording.reason ?? 'unavailable'}`,
    `ElevenLabs key: ${tts.apiKeySource ?? 'missing'}`,
    `ElevenLabs voice: ${tts.voiceId ?? 'missing'}`,
    `ElevenLabs model: ${tts.modelId} (${tts.modelIdSource})`,
  ].join('\n')
}

function getVoiceHelpMessage(): string {
  return [
    '/voice',
    '/voice on',
    '/voice off',
    '/voice status',
    '/voice focus on',
    '/voice focus off',
    '/voice focus status',
    '/voice speak on',
    '/voice speak off',
    '/voice speak status',
    '/voice speak test [text]',
    '/voice elevenlabs key <api-key>',
    '/voice elevenlabs clear-key',
    '/voice elevenlabs voice <voice-id>',
    '/voice elevenlabs model <model-id>',
  ].join('\n')
}

function disableVoice(): { type: 'text'; value: string } {
  const updateError = updateVoiceSettings({ voiceEnabled: false })
  if (updateError) {
    return updateError
  }
  logEvent('jaws_voice_toggled', { enabled: false })
  return {
    type: 'text' as const,
    value: 'Voice mode disabled.',
  }
}

function setVoiceFocusMode(enabled: boolean): { type: 'text'; value: string } {
  const updateError = updateVoiceSettings({ voiceFocusMode: enabled })
  if (updateError) {
    return updateError
  }
  return {
    type: 'text' as const,
    value: enabled
      ? 'Voice focus mode enabled. Recording now follows terminal focus.'
      : 'Voice focus mode disabled. Hold-to-talk remains available.',
  }
}

function setVoiceOutputEnabled(enabled: boolean): { type: 'text'; value: string } {
  const updateError = updateVoiceSettings({ voiceOutputEnabled: enabled })
  if (updateError) {
    return updateError
  }
  return {
    type: 'text' as const,
    value: enabled
      ? 'Deliverable speech enabled. OpenJaws will speak a short summary after each completed turn.'
      : 'Deliverable speech disabled.',
  }
}

function setElevenLabsSetting(
  key: 'elevenLabsApiKey' | 'elevenLabsVoiceId' | 'elevenLabsModelId',
  value: string | undefined,
  label: string,
): { type: 'text'; value: string } {
  const updateError = updateVoiceSettings({ [key]: value } as VoiceSettingsUpdate)
  if (updateError) {
    return updateError
  }
  return {
    type: 'text' as const,
    value: value
      ? `Stored ElevenLabs ${label} in user settings.`
      : `Cleared ElevenLabs ${label} from user settings.`,
  }
}

async function enableVoice({
  focusMode,
}: {
  focusMode: boolean
}): Promise<{ type: 'text'; value: string }> {
  const currentSettings = getInitialSettings()
  const preflightError = await getVoicePreflightError()
  if (preflightError) {
    return { type: 'text' as const, value: preflightError }
  }

  const updateError = updateVoiceSettings({
    voiceEnabled: true,
    voiceFocusMode: focusMode,
  })
  if (updateError) {
    return updateError
  }

  logEvent('jaws_voice_toggled', { enabled: true })
  const key = getShortcutDisplay('voice:pushToTalk', 'Chat', 'Space')
  const stt = normalizeLanguageForSTT(currentSettings.language)
  const cfg = getGlobalConfig()
  const langChanged = cfg.voiceLangHintLastLanguage !== stt.code
  const priorCount = langChanged ? 0 : (cfg.voiceLangHintShownCount ?? 0)
  const showHint = !stt.fellBackFrom && priorCount < LANG_HINT_MAX_SHOWS
  let langNote = ''
  if (stt.fellBackFrom) {
    langNote = ` Note: "${stt.fellBackFrom}" is not a supported dictation language; using English. Change it via /config.`
  } else if (showHint) {
    langNote = ` Dictation language: ${stt.code} (/config to change).`
  }
  if (langChanged || showHint) {
    saveGlobalConfig(prev => ({
      ...prev,
      voiceLangHintShownCount: priorCount + (showHint ? 1 : 0),
      voiceLangHintLastLanguage: stt.code,
    }))
  }

  const focusNote = focusMode
    ? ' Focus mode is on: recording follows terminal focus.'
    : ''

  return {
    type: 'text' as const,
    value: `Voice mode enabled. Hold ${key} to record.${langNote}${focusNote}`,
  }
}

export const call: LocalCommandCall = async args => {
  const normalizedArgs = (args ?? '').trim().toLowerCase()
  const settings = getInitialSettings()
  const voiceEnabled = settings.voiceEnabled === true
  const voiceFocusMode = settings.voiceFocusMode === true
  const voiceOutputEnabled = settings.voiceOutputEnabled === true

  switch (normalizedArgs) {
    case '':
    case 'toggle':
      return voiceEnabled
        ? disableVoice()
        : enableVoice({ focusMode: voiceFocusMode })
    case 'on':
      if (voiceEnabled) {
        return {
          type: 'text' as const,
          value: 'Voice mode is already enabled.',
        }
      }
      return enableVoice({ focusMode: voiceFocusMode })
    case 'off':
      if (!voiceEnabled) {
        return {
          type: 'text' as const,
          value: 'Voice mode is already disabled.',
        }
      }
      return disableVoice()
    case 'status':
      return {
        type: 'text' as const,
        value: await getVoiceStatusMessage(),
      }
    case 'focus on':
      if (!voiceEnabled) {
        return enableVoice({ focusMode: true })
      }
      if (voiceFocusMode) {
        return {
          type: 'text' as const,
          value: 'Voice focus mode is already enabled.',
        }
      }
      return setVoiceFocusMode(true)
    case 'focus off':
      if (!voiceFocusMode) {
        return {
          type: 'text' as const,
          value: 'Voice focus mode is already disabled.',
        }
      }
      return setVoiceFocusMode(false)
    case 'focus status':
      return {
        type: 'text' as const,
        value: `Voice focus mode: ${voiceFocusMode ? 'on' : 'off'}`,
      }
    case 'speak on':
      if (voiceOutputEnabled) {
        return {
          type: 'text' as const,
          value: 'Deliverable speech is already enabled.',
        }
      }
      return setVoiceOutputEnabled(true)
    case 'speak off':
      if (!voiceOutputEnabled) {
        return {
          type: 'text' as const,
          value: 'Deliverable speech is already disabled.',
        }
      }
      return setVoiceOutputEnabled(false)
    case 'speak status':
      return {
        type: 'text' as const,
        value: `Deliverable speech: ${voiceOutputEnabled ? 'on' : 'off'}`,
      }
    case 'help':
    case '-h':
    case '--help':
      return {
        type: 'text' as const,
        value: getVoiceHelpMessage(),
      }
    default:
      if (normalizedArgs.startsWith('speak test')) {
        const text = (args ?? '').trim().slice('speak test'.length).trim()
        const { speakWithElevenLabs } = await import(
          '../../services/voiceOutput.js'
        )
        const result = await speakWithElevenLabs(
          text || 'OpenJaws voice output test complete.',
        )
        return {
          type: 'text' as const,
          value: `Spoke voice output test via ElevenLabs.\nAudio: ${result.audioPath}\nText: ${result.spokenText}`,
        }
      }
      if (normalizedArgs.startsWith('elevenlabs key ')) {
        const apiKey = (args ?? '').trim().slice('elevenlabs key '.length).trim()
        if (!apiKey) {
          return {
            type: 'text' as const,
            value: 'Usage: /voice elevenlabs key <api-key>',
          }
        }
        return setElevenLabsSetting('elevenLabsApiKey', apiKey, 'API key')
      }
      if (normalizedArgs === 'elevenlabs clear-key') {
        return setElevenLabsSetting('elevenLabsApiKey', undefined, 'API key')
      }
      if (normalizedArgs.startsWith('elevenlabs voice ')) {
        const voiceId = (args ?? '')
          .trim()
          .slice('elevenlabs voice '.length)
          .trim()
        if (!voiceId) {
          return {
            type: 'text' as const,
            value: 'Usage: /voice elevenlabs voice <voice-id>',
          }
        }
        return setElevenLabsSetting('elevenLabsVoiceId', voiceId, 'voice ID')
      }
      if (normalizedArgs.startsWith('elevenlabs model ')) {
        const modelId = (args ?? '')
          .trim()
          .slice('elevenlabs model '.length)
          .trim()
        if (!modelId) {
          return {
            type: 'text' as const,
            value: 'Usage: /voice elevenlabs model <model-id>',
          }
        }
        return setElevenLabsSetting('elevenLabsModelId', modelId, 'model ID')
      }
      return {
        type: 'text' as const,
        value: `Unknown /voice option.\n\n${getVoiceHelpMessage()}`,
      }
  }
}
