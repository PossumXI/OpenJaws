import { describe, expect, test } from 'bun:test'
import {
  countActiveDeferredTeammateLaunches,
  getNextDeferredTeammateLaunch,
  isActiveDeferredTeammateLaunch,
  prioritizeDeferredTeammateLaunches,
  releaseDeferredTeammateLaunchNow,
} from './immaculateDeferredLaunches.js'

describe('immaculate deferred launches', () => {
  test('counts only active queued and launching launches', () => {
    const launches = [
      {
        id: 'queued-1',
        teamName: 'shipyard',
        agentName: 'deckhand-1',
        queuedAt: 1,
        releaseAt: 10,
        attempts: 0,
        status: 'queued' as const,
      },
      {
        id: 'launching-1',
        teamName: 'shipyard',
        agentName: 'deckhand-2',
        queuedAt: 2,
        releaseAt: 11,
        attempts: 1,
        status: 'launching' as const,
      },
      {
        id: 'failed-1',
        teamName: 'shipyard',
        agentName: 'deckhand-3',
        queuedAt: 3,
        releaseAt: 12,
        attempts: 2,
        status: 'failed' as const,
      },
      {
        id: 'queued-2',
        teamName: 'chartroom',
        agentName: 'deckhand-4',
        queuedAt: 4,
        releaseAt: 13,
        attempts: 0,
        status: 'queued' as const,
      },
    ]

    expect(isActiveDeferredTeammateLaunch(launches[0]!)).toBe(true)
    expect(isActiveDeferredTeammateLaunch(launches[2]!)).toBe(false)
    expect(countActiveDeferredTeammateLaunches(launches)).toBe(3)
    expect(
      countActiveDeferredTeammateLaunches(launches, {
        teamName: 'shipyard',
      }),
    ).toBe(2)
  })

  test('picks the earliest queued launch for a team', () => {
    const launches = [
      {
        id: 'launching-1',
        teamName: 'shipyard',
        agentName: 'deckhand-1',
        queuedAt: 1,
        releaseAt: 10,
        attempts: 0,
        status: 'launching' as const,
      },
      {
        id: 'queued-late',
        teamName: 'shipyard',
        agentName: 'deckhand-2',
        queuedAt: 5,
        releaseAt: 20,
        attempts: 0,
        status: 'queued' as const,
      },
      {
        id: 'queued-early',
        teamName: 'shipyard',
        agentName: 'deckhand-3',
        queuedAt: 2,
        releaseAt: 15,
        attempts: 0,
        status: 'queued' as const,
      },
    ]

    expect(getNextDeferredTeammateLaunch(launches, 'shipyard')?.id).toBe(
      'queued-early',
    )
  })

  test('prioritizes a queued launch to the front of its crew wave', () => {
    const launches = prioritizeDeferredTeammateLaunches(
      [
        {
          id: 'queued-late',
          teamName: 'shipyard',
          agentName: 'deckhand-2',
          queuedAt: 50,
          releaseAt: 200,
          attempts: 0,
          status: 'queued',
        },
        {
          id: 'queued-early',
          teamName: 'shipyard',
          agentName: 'deckhand-1',
          queuedAt: 20,
          releaseAt: 100,
          attempts: 0,
          status: 'queued',
        },
      ],
      'queued-late',
    )

    expect(getNextDeferredTeammateLaunch(launches, 'shipyard')?.id).toBe(
      'queued-late',
    )
    expect(launches.find(launch => launch.id === 'queued-late')).toMatchObject({
      queuedAt: 19,
      releaseAt: 100,
    })
  })

  test('releases a queued launch immediately without touching other crews', () => {
    const launches = releaseDeferredTeammateLaunchNow(
      [
        {
          id: 'shipyard-target',
          teamName: 'shipyard',
          agentName: 'deckhand-2',
          queuedAt: 50,
          releaseAt: 200,
          attempts: 0,
          status: 'queued',
        },
        {
          id: 'chartroom-target',
          teamName: 'chartroom',
          agentName: 'deckhand-3',
          queuedAt: 10,
          releaseAt: 100,
          attempts: 0,
          status: 'queued',
        },
      ],
      'shipyard-target',
      75,
    )

    expect(launches.find(launch => launch.id === 'shipyard-target')).toMatchObject({
      releaseAt: 75,
      queuedAt: 49,
    })
    expect(launches.find(launch => launch.id === 'chartroom-target')).toMatchObject({
      releaseAt: 100,
      queuedAt: 10,
    })
  })
})
