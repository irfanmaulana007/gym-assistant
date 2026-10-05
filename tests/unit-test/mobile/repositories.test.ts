import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryStore } from '@/db/memoryStore'
import type { LocalStore } from '@/db/store'
import {
  addEntry,
  addExercise,
  createRoutine,
  deleteEntry,
  deleteRoutine,
  startSession,
  updateRoutine,
} from '@/db/repositories'
import type { User } from '@/types/api'

let store: LocalStore
beforeEach(() => {
  store = createMemoryStore()
  store.meta.set<User>('user', { id: 'u1' } as User)
})

describe('repositories — optimistic local write + outbox (PRD 0018 §4.5)', () => {
  it('createRoutine writes the row locally and queues one create keyed by the client id', () => {
    const r = createRoutine(store, 'Push Day')
    expect(store.routines.get(r.id)?.name).toBe('Push Day')
    const queued = store.outbox.all()
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ entity: 'routine', op: 'create', entity_id: r.id })
  })

  it('updateRoutine queues an update carrying the base version for LWW', () => {
    const r = createRoutine(store, 'Push Day')
    store.outbox.clear()
    const before = store.routines.get(r.id)!.updated_at
    updateRoutine(store, r.id, { name: 'Pull Day' })
    expect(store.routines.get(r.id)?.name).toBe('Pull Day')
    const rec = store.outbox.all()[0]
    expect(rec).toMatchObject({ entity: 'routine', op: 'update', entity_id: r.id })
    expect(rec.base_version).toBe(before)
  })

  it('deleting an unsynced routine cancels its queued create instead of queuing a server delete', () => {
    const r = createRoutine(store, 'Temp')
    deleteRoutine(store, r.id)
    expect(store.routines.get(r.id)).toBeUndefined()
    expect(store.outbox.all()).toHaveLength(0) // create cancelled, no delete queued
  })

  it('logging a set is a local write that updates derived aggregates and queues an entry create', () => {
    const r = createRoutine(store, 'Push Day')
    addExercise(store, r.id, { name: 'Bench', measurement_type: 'weight_reps', primary_muscle_group: 'chest' })
    const session = startSession(store, { ...r, exercises: store.exercises.all() })
    const se = session.exercises![0]
    store.outbox.clear()

    addEntry(store, se.id, { weight: 100, reps: 8, is_completed: true })
    addEntry(store, se.id, { weight: 100, reps: 6, is_completed: true })

    const updated = store.sessionExercises.get(se.id)!
    expect(updated.sets_completed).toBe(2)
    expect(updated.total_volume).toBe(100 * 8 + 100 * 6)
    expect(updated.top_set_weight).toBe(100)
    expect(updated.status).toBe('in_progress')
    // two distinct append-only entry creates queued
    const creates = store.outbox.all().filter((o) => o.entity === 'entry' && o.op === 'create')
    expect(creates).toHaveLength(2)
    expect(new Set(creates.map((c) => c.entity_id)).size).toBe(2)
  })

  it('deleting a logged set recomputes aggregates', () => {
    const r = createRoutine(store, 'Push Day')
    addExercise(store, r.id, { name: 'Bench', measurement_type: 'weight_reps', primary_muscle_group: 'chest' })
    const session = startSession(store, { ...r, exercises: store.exercises.all() })
    const se = session.exercises![0]
    const e1 = addEntry(store, se.id, { weight: 100, reps: 8 })
    addEntry(store, se.id, { weight: 90, reps: 10 })
    deleteEntry(store, e1.id)
    const updated = store.sessionExercises.get(se.id)!
    expect(updated.sets_completed).toBe(1)
    expect(updated.total_volume).toBe(90 * 10)
  })

  it('starting a session snapshots the routine exercises as client-id child rows', () => {
    const r = createRoutine(store, 'Legs')
    addExercise(store, r.id, { name: 'Squat', measurement_type: 'weight_reps', primary_muscle_group: 'quads' })
    const session = startSession(store, { ...r, exercises: store.exercises.all() })
    expect(session.status).toBe('active')
    expect(session.exercises).toHaveLength(1)
    const create = store.outbox.all().find((o) => o.entity === 'session' && o.op === 'create')!
    expect((create.payload.exercises as unknown[]).length).toBe(1)
  })
})
