import { describe, expect, it } from 'bun:test'
import {
  buildAuraGenesisStatusFingerprint,
  buildAuraGenesisStatusMessage,
  buildOpenJawsProductUpdateDigest,
  createDiscordPublicLedgerMirrorState,
  formatPublicShowcaseEntryForDiscord,
  normalizeDiscordPublicLedgerMirrorState,
  selectUnpostedPublicShowcaseEntries,
} from './discordPublicLedger.js'

describe('discordPublicLedger', () => {
  it('creates and normalizes bounded ledger mirror state', () => {
    const created = createDiscordPublicLedgerMirrorState(
      new Date('2026-04-22T12:00:00.000Z'),
    )
    expect(created).toEqual({
      version: 1,
      updatedAt: '2026-04-22T12:00:00.000Z',
      lastStatusFingerprint: null,
      lastStatusAt: null,
      postedActivityIds: [],
      lastProductUpdateFingerprint: null,
      lastProductUpdateAt: null,
    })

    expect(
      normalizeDiscordPublicLedgerMirrorState({
        updatedAt: '2026-04-22T12:01:00.000Z',
        postedActivityIds: ['entry-1', 'entry-1', 'entry-2'],
        lastStatusFingerprint: 'fingerprint',
      }),
    ).toMatchObject({
      updatedAt: '2026-04-22T12:01:00.000Z',
      postedActivityIds: ['entry-1', 'entry-2'],
      lastStatusFingerprint: 'fingerprint',
    })
  })

  it('summarizes the aura-genesis public telemetry lane without using volatile timestamps', () => {
    const payload = {
      network: {
        info: {
          height: 35639,
          peerCount: 2,
          version: '3.3.1',
        },
      },
      ledger: {
        verification: {
          totalEntries: 69,
          chainValid: true,
        },
      },
      fabric: {
        status: 'healthy',
        latestLaneReady: true,
        showcase: {
          fleetLabel: 'ASGARD Core 16',
          subsystemCount: 16,
          onlineSubsystemCount: 4,
          simulatedSubsystemCount: 12,
          publicHeight: 35639,
          verifiedLedgerEntries: 16,
          resultsReady: true,
          orchestrationProfile: 'immaculate-supervised-operator-loop',
          qAuthMode: 'iam',
          summary: 'Controlled live showcase active with token MTIzNDU2Nzg5MDEyMzQ1Njc4OQ.AbCdEf.GhIjKlMnOpQrStUvWxYz0123456789.',
        },
      },
      brain: {
        ready: true,
      },
    }

    expect(buildAuraGenesisStatusFingerprint(payload)).toContain('35639')
    expect(buildAuraGenesisStatusMessage(payload)).toContain(
      'Arobi public ledger status',
    )
    expect(buildAuraGenesisStatusMessage(payload)).toContain(
      'ASGARD Core 16',
    )
    expect(buildAuraGenesisStatusMessage(payload)).toContain(
      'Public-safe pressure loop: 16 subsystem demo',
    )
    expect(buildAuraGenesisStatusMessage(payload)).toContain(
      'private 00 payloads stay closed',
    )
    expect(buildAuraGenesisStatusMessage(payload)).toContain(
      'Immaculate immaculate-supervised-operator-loop',
    )
    expect(buildAuraGenesisStatusMessage(payload)).not.toContain(
      'MTIzNDU2Nzg5MDEyMzQ1Njc4OQ',
    )
  })

  it('selects only new public showcase entries and formats them for Discord', () => {
    const selected = selectUnpostedPublicShowcaseEntries({
      feed: {
        updatedAt: '2026-04-22T12:02:00.000Z',
        entries: [
          {
            id: 'entry-1',
            timestamp: '2026-04-22T12:00:00.000Z',
            title: 'Older',
            summary: 'already mirrored',
            kind: 'patrol',
            status: 'ok',
            source: 'OpenJaws',
            operatorActions: [],
            subsystems: [],
            artifacts: [],
            tags: [],
          },
          {
            id: 'entry-2',
            timestamp: '2026-04-22T12:01:00.000Z',
            title: 'New activity',
            summary: 'bounded update',
            kind: 'operator',
            status: 'ok',
            source: 'OpenJaws Discord lane',
            operatorActions: ['ask_openjaws'],
            subsystems: ['openjaws'],
            artifacts: ['discord:q-agent-receipt'],
            tags: ['bounded'],
          },
        ],
      },
      postedIds: ['entry-1'],
    })

    expect(selected).toHaveLength(1)
    expect(selected[0]?.id).toBe('entry-2')
    expect(formatPublicShowcaseEntryForDiscord(selected[0]!)).toContain(
      'New activity',
    )
    expect(formatPublicShowcaseEntryForDiscord(selected[0]!)).toContain(
      'Actions: ask_openjaws',
    )
  })

  it('builds a bounded product update digest from the latest changelog section', () => {
    const digest = buildOpenJawsProductUpdateDigest(`# Changelog

## 2.1.86 - 2026-04-21

- Tightened runtime coherence.
- Added ledger-ready public showcase sync.
- Improved Discord operator control.

## 2.1.85 - 2026-04-20

- Older release.
`)

    expect(digest.fingerprint).toContain('2.1.86')
    expect(digest.content).toContain('OpenJaws public product update')
    expect(digest.content).toContain('2.1.86 - 2026-04-21')
    expect(digest.content).toContain('Added ledger-ready public showcase sync.')
  })
})
