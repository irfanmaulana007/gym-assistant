import { describe, expect, it } from 'vitest'
import { resolveLWW, versionTime } from '@/sync/resolve'

const at = (iso: string) => ({ updated_at: iso })

describe('LWW conflict resolver (PRD 0018 §4.5)', () => {
  it('adopts server-only rows and keeps local-only rows', () => {
    expect(resolveLWW(undefined, at('2026-01-01'), false)).toBe('server')
    expect(resolveLWW(at('2026-01-01'), undefined, true)).toBe('local')
  })

  it('a synced local row (no pending edit) always defers to the server', () => {
    expect(resolveLWW(at('2026-02-01'), at('2026-01-01'), false)).toBe('server')
  })

  it('with a pending local edit, the newer updated_at wins', () => {
    // local edit newer → local wins (the outbox push will carry it)
    expect(resolveLWW(at('2026-02-02'), at('2026-02-01'), true)).toBe('local')
    // server newer → server wins (drop the stale local edit)
    expect(resolveLWW(at('2026-02-01'), at('2026-02-02'), true)).toBe('server')
  })

  it('breaks ties toward the server for determinism across devices', () => {
    expect(resolveLWW(at('2026-02-01'), at('2026-02-01'), true)).toBe('server')
  })

  it('treats unparseable/absent timestamps as oldest', () => {
    expect(versionTime(undefined)).toBe(-Infinity)
    expect(versionTime(at('not-a-date'))).toBe(-Infinity)
  })
})
