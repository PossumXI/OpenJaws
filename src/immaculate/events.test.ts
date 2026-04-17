import { describe, expect, test } from 'bun:test'
import {
  createImmaculateEvent,
  stableSerializeImmaculateEvent,
} from './events.js'

describe('immaculate event contract', () => {
  test('accepts a typed route dispatch event', () => {
    expect(
      createImmaculateEvent({
        schemaVersion: 'immaculate.event.v1',
        timestamp: '2026-04-17T00:00:00.000Z',
        sessionId: 'session-1',
        type: 'route.dispatched',
        routeId: 'route-1',
        provider: 'oci',
        model: 'Q',
      }),
    ).toMatchObject({
      type: 'route.dispatched',
      routeId: 'route-1',
      provider: 'oci',
      model: 'Q',
    })
  })

  test('serializes events with a stable key order', () => {
    const serialized = stableSerializeImmaculateEvent({
      schemaVersion: 'immaculate.event.v1',
      timestamp: '2026-04-17T00:00:00.000Z',
      sessionId: 'session-1',
      type: 'worker.assigned',
      routeId: 'route-2',
      workerId: 'worker-1',
      assignmentId: 'assignment-1',
    })

    expect(serialized).toBe(
      '{"assignmentId":"assignment-1","routeId":"route-2","schemaVersion":"immaculate.event.v1","sessionId":"session-1","timestamp":"2026-04-17T00:00:00.000Z","type":"worker.assigned","workerId":"worker-1"}',
    )
  })
})
