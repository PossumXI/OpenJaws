import { afterEach, describe, expect, test } from 'bun:test'
import {
  resolveQBridgeBenchOutputDir,
  shouldAutoQuantizeBridgeBench,
} from './q-bridgebench.ts'

const originalAuto4bit = process.env.OPENJAWS_BRIDGEBENCH_AUTO_4BIT

afterEach(() => {
  if (originalAuto4bit === undefined) {
    delete process.env.OPENJAWS_BRIDGEBENCH_AUTO_4BIT
    return
  }
  process.env.OPENJAWS_BRIDGEBENCH_AUTO_4BIT = originalAuto4bit
})

describe('q-bridgebench device mode', () => {
  test('keeps the default public lane on a flat artifact path for discovery', () => {
    expect(
      resolveQBridgeBenchOutputDir({
        root: 'D:\\openjaws\\OpenJaws',
        benchmarkId: 'q-bridgebench-20260423T010203',
        deviceMode: 'public_claim',
      }),
    ).toBe('D:\\openjaws\\OpenJaws\\artifacts\\q-bridgebench-20260423T010203')
  })

  test('routes rescue/device mode to a separate non-discovery artifact root', () => {
    expect(
      resolveQBridgeBenchOutputDir({
        root: 'D:\\openjaws\\OpenJaws',
        benchmarkId: 'q-bridgebench-20260423T010203',
        deviceMode: 'rescue_device',
      }),
    ).toBe(
      'D:\\openjaws\\OpenJaws\\artifacts\\bridgebench-device\\q-bridgebench-20260423T010203',
    )
  })

  test('only auto-enables 4-bit fallback for the explicit rescue/device lane', () => {
    process.env.OPENJAWS_BRIDGEBENCH_AUTO_4BIT = 'true'

    expect(
      shouldAutoQuantizeBridgeBench({
        adapterDir: null,
        deviceMode: 'public_claim',
        useCpu: true,
      }),
    ).toBe(false)

    expect(
      shouldAutoQuantizeBridgeBench({
        adapterDir: null,
        deviceMode: 'rescue_device',
        useCpu: true,
      }),
    ).toBe(process.platform === 'win32')
  })
})
