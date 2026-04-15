import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  buildOciOpenAIBaseUrl,
  DEFAULT_OCI_Q_UPSTREAM_MODEL,
  resolveOciQRuntime,
} from './ociQRuntime.js'

describe('ociQRuntime', () => {
  afterEach(() => {
    delete process.env.OCI_CONFIG_FILE
    delete process.env.OCI_PROFILE
    delete process.env.OCI_COMPARTMENT_ID
    delete process.env.OCI_GENAI_PROJECT_ID
    delete process.env.OCI_REGION
    delete process.env.Q_MODEL
    delete process.env.OCI_MODEL
    delete process.env.Q_API_KEY
    delete process.env.OCI_API_KEY
    delete process.env.OCI_GENAI_API_KEY
    delete process.env.Q_BASE_URL
    delete process.env.OCI_BASE_URL
  })

  it('builds the OCI OpenAI-compatible base URL from a region', () => {
    expect(buildOciOpenAIBaseUrl('us-ashburn-1')).toBe(
      'https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1',
    )
  })

  it('resolves bearer auth when an OCI key is present', () => {
    process.env.Q_API_KEY = 'sk-oci'
    process.env.Q_MODEL = 'openai.gpt-oss-120b'
    process.env.Q_BASE_URL =
      'https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1'

    const runtime = resolveOciQRuntime()
    expect(runtime.authMode).toBe('bearer')
    expect(runtime.ready).toBe(true)
    expect(runtime.apiKeySource).toBe('Q_API_KEY')
    expect(runtime.model).toBe('openai.gpt-oss-120b')
    expect(runtime.baseURLSource).toBe('Q_BASE_URL')
  })

  it('resolves IAM auth from OCI config plus project and compartment envs', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'openjaws-oci-runtime-'))
    try {
      const configPath = join(tempDir, 'config')
      writeFileSync(
        configPath,
        ['[DEFAULT]', 'region=us-ashburn-1', ''].join('\n'),
        'utf8',
      )
      process.env.OCI_CONFIG_FILE = configPath
      process.env.OCI_PROFILE = 'DEFAULT'
      process.env.OCI_COMPARTMENT_ID = 'ocid1.tenancy.oc1..example'
      process.env.OCI_GENAI_PROJECT_ID = 'ocid1.generativeaiproject.oc1.iad.example'

      const runtime = resolveOciQRuntime()
      expect(runtime.authMode).toBe('iam')
      expect(runtime.ready).toBe(true)
      expect(runtime.region).toBe('us-ashburn-1')
      expect(runtime.baseURL).toBe(
        'https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1',
      )
      expect(runtime.model).toBe(DEFAULT_OCI_Q_UPSTREAM_MODEL)
      expect(runtime.summary).toBe(
        'OCI IAM ready for openai.gpt-oss-120b via https://inference.generativeai.us-ashburn-1.oci.oraclecloud.com/openai/v1 (DEFAULT)',
      )
      expect(runtime.summary).not.toContain('ocid1.generativeaiproject')
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('reports missing IAM requirements clearly', () => {
    process.env.OCI_PROFILE = 'DEFAULT'

    const runtime = resolveOciQRuntime()
    expect(runtime.ready).toBe(false)
    expect(runtime.authMode).toBe('iam')
    expect(runtime.missing).toContain('OCI_COMPARTMENT_ID')
    expect(runtime.missing).toContain('OCI_GENAI_PROJECT_ID')
  })
})
