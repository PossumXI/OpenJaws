import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { buildInheritedEnvVars } from './spawnUtils.js'

const ENV_NAMES = [
  'Q_API_KEY',
  'Q_BASE_URL',
  'OCI_CONFIG_FILE',
  'OCI_PROFILE',
  'OCI_REGION',
  'OCI_COMPARTMENT_ID',
  'OCI_GENAI_PROJECT_ID',
  'IMMACULATE_HARNESS_URL',
  'IMMACULATE_API_KEY',
  'IMMACULATE_ACTOR',
] as const

const originalEnv = new Map<string, string | undefined>()

beforeEach(() => {
  for (const name of ENV_NAMES) {
    originalEnv.set(name, process.env[name])
    delete process.env[name]
  }
})

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv.get(name)
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
  originalEnv.clear()
})

describe('spawnUtils', () => {
  it('forwards OCI Q and Immaculate env vars to teammate shells', () => {
    process.env.Q_API_KEY = 'sk-q'
    process.env.Q_BASE_URL = 'https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1'
    process.env.OCI_CONFIG_FILE = 'C:\\Users\\Knight\\.oci\\config'
    process.env.OCI_PROFILE = 'DEFAULT'
    process.env.OCI_REGION = 'us-chicago-1'
    process.env.OCI_COMPARTMENT_ID = 'ocid1.compartment.oc1..example'
    process.env.OCI_GENAI_PROJECT_ID = 'ocid1.generativeaiproject.oc1..example'
    process.env.IMMACULATE_HARNESS_URL = 'http://127.0.0.1:8787'
    process.env.IMMACULATE_API_KEY = 'immaculate-secret'
    process.env.IMMACULATE_ACTOR = 'openjaws'

    const envVars = buildInheritedEnvVars()

    expect(envVars).toContain('CLAUDECODE=1')
    expect(envVars).toContain('OPENJAWS_EXPERIMENTAL_AGENT_TEAMS=1')
    expect(envVars).toContain('Q_API_KEY=sk-q')
    expect(envVars).toContain(
      'Q_BASE_URL=https\\://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1',
    )
    expect(envVars).toContain("OCI_CONFIG_FILE='C:\\Users\\Knight\\.oci\\config'")
    expect(envVars).toContain('OCI_PROFILE=DEFAULT')
    expect(envVars).toContain('OCI_REGION=us-chicago-1')
    expect(envVars).toContain(
      'OCI_COMPARTMENT_ID=ocid1.compartment.oc1..example',
    )
    expect(envVars).toContain(
      'OCI_GENAI_PROJECT_ID=ocid1.generativeaiproject.oc1..example',
    )
    expect(envVars).toContain(
      'IMMACULATE_HARNESS_URL=http\\://127.0.0.1\\:8787',
    )
    expect(envVars).toContain('IMMACULATE_API_KEY=immaculate-secret')
    expect(envVars).toContain('IMMACULATE_ACTOR=openjaws')
  })
})
