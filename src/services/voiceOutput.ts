import axios from 'axios'
import { spawn } from 'child_process'
import { mkdir, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getInitialSettings } from '../utils/settings/settings.js'

const ELEVENLABS_DEFAULT_MODEL_ID = 'eleven_flash_v2_5'
const ELEVENLABS_PCM_SAMPLE_RATE = 22_050
const ELEVENLABS_PCM_CHANNELS = 1
const ELEVENLABS_PCM_BITS_PER_SAMPLE = 16
const MAX_SPOKEN_SUMMARY_CHARS = 280

export type ElevenLabsConfig = {
  enabled: boolean
  apiKey: string | null
  apiKeySource: string | null
  voiceId: string | null
  voiceIdSource: string | null
  modelId: string
  modelIdSource: string
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function getElevenLabsConfig(): ElevenLabsConfig {
  const settings = getInitialSettings()
  const apiKeyFromSettings = trimOrNull(settings.elevenLabsApiKey)
  const apiKeyFromEnv = trimOrNull(process.env.ELEVENLABS_API_KEY)
  const voiceIdFromSettings = trimOrNull(settings.elevenLabsVoiceId)
  const voiceIdFromEnv = trimOrNull(process.env.ELEVENLABS_VOICE_ID)
  const modelIdFromSettings = trimOrNull(settings.elevenLabsModelId)
  const modelIdFromEnv = trimOrNull(process.env.ELEVENLABS_MODEL_ID)

  return {
    enabled: settings.voiceOutputEnabled === true,
    apiKey: apiKeyFromSettings ?? apiKeyFromEnv,
    apiKeySource: apiKeyFromSettings
      ? 'settings'
      : apiKeyFromEnv
        ? 'ELEVENLABS_API_KEY'
        : null,
    voiceId: voiceIdFromSettings ?? voiceIdFromEnv,
    voiceIdSource: voiceIdFromSettings
      ? 'settings'
      : voiceIdFromEnv
        ? 'ELEVENLABS_VOICE_ID'
        : null,
    modelId:
      modelIdFromSettings ?? modelIdFromEnv ?? ELEVENLABS_DEFAULT_MODEL_ID,
    modelIdSource: modelIdFromSettings
      ? 'settings'
      : modelIdFromEnv
        ? 'ELEVENLABS_MODEL_ID'
        : 'default',
  }
}

export function summarizeTextForSpeech(text: string): string {
  const cleaned = text
    .replace(/```[\s\S]*?```/g, ' code omitted ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned.length <= MAX_SPOKEN_SUMMARY_CHARS) {
    return cleaned
  }

  return `${cleaned.slice(0, MAX_SPOKEN_SUMMARY_CHARS - 1).trimEnd()}…`
}

function buildWavFromPcm(pcmData: Buffer): Buffer {
  const dataSize = pcmData.length
  const byteRate =
    ELEVENLABS_PCM_SAMPLE_RATE *
    ELEVENLABS_PCM_CHANNELS *
    (ELEVENLABS_PCM_BITS_PER_SAMPLE / 8)
  const blockAlign =
    ELEVENLABS_PCM_CHANNELS * (ELEVENLABS_PCM_BITS_PER_SAMPLE / 8)
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(ELEVENLABS_PCM_CHANNELS, 22)
  buffer.writeUInt32LE(ELEVENLABS_PCM_SAMPLE_RATE, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(ELEVENLABS_PCM_BITS_PER_SAMPLE, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  pcmData.copy(buffer, 44)

  return buffer
}

async function writeSpeechFile(wavData: Buffer): Promise<string> {
  const outDir = join(tmpdir(), 'openjaws-voice')
  await mkdir(outDir, { recursive: true })
  const outPath = join(outDir, `deliverable-${Date.now()}.wav`)
  await writeFile(outPath, wavData)
  return outPath
}

function playAudioFile(audioPath: string): void {
  if (process.platform === 'win32') {
    const escaped = audioPath.replace(/'/g, "''")
    const child = spawn(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        [
          `$player = New-Object System.Media.SoundPlayer '${escaped}'`,
          '$player.PlaySync()',
        ].join('; '),
      ],
      { detached: true, stdio: 'ignore', windowsHide: true },
    )
    child.unref()
    return
  }

  const command =
    process.platform === 'darwin'
      ? ['afplay', audioPath]
      : ['aplay', audioPath]
  const child = spawn(command[0]!, command.slice(1), {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

export async function speakWithElevenLabs(text: string): Promise<{
  audioPath: string
  spokenText: string
}> {
  const config = getElevenLabsConfig()
  const spokenText = summarizeTextForSpeech(text)

  if (!spokenText) {
    throw new Error('No text available for voice output.')
  }
  if (!config.apiKey) {
    throw new Error(
      'ElevenLabs is not configured. Set ELEVENLABS_API_KEY or /voice elevenlabs key <api-key>.',
    )
  }
  if (!config.voiceId) {
    throw new Error(
      'ElevenLabs voice ID is not configured. Set ELEVENLABS_VOICE_ID or /voice elevenlabs voice <voice-id>.',
    )
  }

  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${config.voiceId}/stream?output_format=pcm_22050`,
    {
      text: spokenText,
      model_id: config.modelId,
    },
    {
      headers: {
        'xi-api-key': config.apiKey,
        Accept: 'audio/pcm',
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
      timeout: 30_000,
    },
  )

  const wavData = buildWavFromPcm(Buffer.from(response.data))
  const audioPath = await writeSpeechFile(wavData)
  playAudioFile(audioPath)
  return { audioPath, spokenText }
}
