import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pushRecord } from '@/sync/push'
import { SyncError } from '@/sync/types'
import { setTokenStore, type TokenStore } from '@/api/client'
import type { OutboxOp, OutboxRecord } from '@/db/store'

function resp(status: number, body: unknown) {
  const text = body === undefined ? '' : JSON.stringify(body)
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => body } as unknown as Response
}
function memStore(): TokenStore {
  let t: string | null = 'tok'
  let r: string | null = 'ref'
  return { getToken: () => t, setToken: (v) => { t = v }, getRefreshToken: () => r, setRefreshToken: (v) => { r = v } }
}
function rec(entity: OutboxRecord['entity'], op: OutboxOp, payload: Record<string, unknown>, entity_id = 'id1'): OutboxRecord {
  return { id: 'o1', seq: 1, entity, op, entity_id, payload, base_version: null, created_at: '', state: 'pending', attempts: 0, next_attempt_at: 0, last_error: null }
}

describe('sync push mapper — outbox record → /api/v1 call + idempotency (PRD 0018 §4.5)', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setTokenStore(memStore())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('maps a routine create to POST /routines carrying the client-supplied id', async () => {
    fetchMock.mockResolvedValue(resp(201, { id: 'id1', name: 'Push' }))
    await pushRecord(rec('routine', 'create', { name: 'Push', notes: '' }))
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/routines')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toMatchObject({ name: 'Push', id: 'id1' })
  })

  it('treats a 409 on create as an idempotent success (replay already landed)', async () => {
    fetchMock.mockResolvedValue(resp(409, { error: { code: 'conflict', message: 'exists' } }))
    await expect(pushRecord(rec('routine', 'create', { name: 'Push', notes: '' }))).resolves.toBeUndefined()
  })

  it('treats a 404 on delete as an idempotent success (already gone)', async () => {
    fetchMock.mockResolvedValue(resp(404, { error: { code: 'not_found', message: 'gone' } }))
    await expect(pushRecord(rec('routine', 'delete', {}))).resolves.toBeUndefined()
  })

  it('classifies 5xx as retryable and 4xx (validation) as non-retryable', async () => {
    fetchMock.mockResolvedValue(resp(500, { error: { code: 'server', message: 'boom' } }))
    await expect(pushRecord(rec('routine', 'update', { name: 'x' }))).rejects.toMatchObject({ retryable: true })

    fetchMock.mockResolvedValue(resp(422, { error: { code: 'invalid', message: 'bad' } }))
    await expect(pushRecord(rec('routine', 'update', { name: 'x' }))).rejects.toMatchObject({ retryable: false })
  })

  it('classifies a network failure (no HTTP status) as retryable', async () => {
    fetchMock.mockRejectedValue(new Error('Network request failed'))
    await expect(pushRecord(rec('entry', 'create', { session_exercise_id: 's1', reps: 8 }))).rejects.toBeInstanceOf(SyncError)
    await expect(pushRecord(rec('entry', 'create', { session_exercise_id: 's1', reps: 8 }))).rejects.toMatchObject({ retryable: true })
  })
})
