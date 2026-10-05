// Local repositories — the offline-first write/read path (PRD 0018 §4.5).
//
// Every mutation (a) applies OPTIMISTICALLY to the local store and (b) appends
// a record to the persisted outbox. Reads join the normalized tables back into
// the nested API entity shapes the screens expect. Nothing here touches the
// network — the sync worker (src/sync) drains the outbox when online.
//
// All functions take the `store` explicitly so they are unit-tested against the
// in-memory store; the app passes the singleton (src/db/index.ts).

import { newId } from './id'
import type { LocalStore, OutboxEntity, OutboxOp, OutboxRecord } from './store'
import type {
  Exercise,
  MeasurementType,
  MuscleGroup,
  Routine,
  SessionExercise,
  SessionStatus,
  SetEntry,
  UpdateProfileRequest,
  User,
  WeightUnit,
  WorkoutSession,
} from '@/types/api'

const now = () => new Date().toISOString()

function enqueue(
  store: LocalStore,
  rec: { entity: OutboxEntity; op: OutboxOp; entity_id: string; payload: Record<string, unknown>; base_version: string | null },
): OutboxRecord {
  return store.outbox.enqueue({
    id: newId(),
    entity: rec.entity,
    op: rec.op,
    entity_id: rec.entity_id,
    payload: rec.payload,
    base_version: rec.base_version,
    created_at: now(),
    state: 'pending',
    attempts: 0,
    next_attempt_at: 0,
    last_error: null,
  })
}

/** If an entity still has an unsynced create queued, it never reached the
 * server — cancel its whole outbox trail instead of queueing a server delete. */
function cancelIfPendingCreate(store: LocalStore, entityId: string): boolean {
  const recs = store.outbox.forEntity(entityId)
  const hasCreate = recs.some((r) => r.op === 'create')
  if (!hasCreate) return false
  for (const r of recs) store.outbox.remove(r.id)
  return true
}

function currentUserId(store: LocalStore): string {
  return store.meta.get<User>('user')?.id ?? ''
}

// ---------- Routines ----------

export function listRoutines(store: LocalStore): Routine[] {
  return store.routines
    .all()
    .sort((a, b) => a.position - b.position)
    .map((r) => ({ ...r, exercises: exercisesForRoutine(store, r.id) }))
}

export function getRoutine(store: LocalStore, id: string): Routine | undefined {
  const r = store.routines.get(id)
  if (!r) return undefined
  return { ...r, exercises: exercisesForRoutine(store, id) }
}

function exercisesForRoutine(store: LocalStore, routineId: string): Exercise[] {
  return store.exercises
    .all()
    .filter((e) => e.routine_id === routineId)
    .sort((a, b) => a.position - b.position)
}

export function createRoutine(store: LocalStore, name: string, notes = ''): Routine {
  const ts = now()
  const row: Routine = {
    id: newId(),
    user_id: currentUserId(store),
    name,
    notes,
    position: store.routines.all().length,
    created_at: ts,
    updated_at: ts,
  }
  store.transaction(() => {
    store.routines.upsert(row)
    enqueue(store, { entity: 'routine', op: 'create', entity_id: row.id, payload: { name, notes }, base_version: null })
  })
  return row
}

export function updateRoutine(store: LocalStore, id: string, patch: Partial<Pick<Routine, 'name' | 'notes' | 'position'>>): Routine | undefined {
  const existing = store.routines.get(id)
  if (!existing) return undefined
  const row: Routine = { ...existing, ...patch, updated_at: now() }
  store.transaction(() => {
    store.routines.upsert(row)
    enqueue(store, { entity: 'routine', op: 'update', entity_id: id, payload: { ...patch }, base_version: existing.updated_at })
  })
  return row
}

export function deleteRoutine(store: LocalStore, id: string): void {
  store.transaction(() => {
    for (const e of exercisesForRoutine(store, id)) store.exercises.delete(e.id)
    store.routines.delete(id)
    if (cancelIfPendingCreate(store, id)) return
    enqueue(store, { entity: 'routine', op: 'delete', entity_id: id, payload: {}, base_version: null })
  })
}

// ---------- Exercises ----------

export interface ExerciseDraft {
  name: string
  measurement_type: MeasurementType
  target_sets?: number | null
  target_reps?: number | null
  target_weight?: number | null
  target_duration_seconds?: number | null
  primary_muscle_group: MuscleGroup
  secondary_muscle_groups?: MuscleGroup[]
  notes?: string
  catalog_exercise_id?: string | null
}

export function addExercise(store: LocalStore, routineId: string, draft: ExerciseDraft): Exercise {
  const ts = now()
  const row: Exercise = {
    id: newId(),
    routine_id: routineId,
    name: draft.name,
    measurement_type: draft.measurement_type,
    target_sets: draft.target_sets ?? null,
    target_reps: draft.target_reps ?? null,
    target_weight: draft.target_weight ?? null,
    target_duration_seconds: draft.target_duration_seconds ?? null,
    target_distance: null,
    distance_unit: null,
    primary_muscle_group: draft.primary_muscle_group,
    secondary_muscle_groups: draft.secondary_muscle_groups ?? [],
    default_metadata: {},
    notes: draft.notes ?? '',
    position: exercisesForRoutine(store, routineId).length,
    created_at: ts,
    updated_at: ts,
    catalog_exercise_id: draft.catalog_exercise_id ?? null,
    last_set: null,
  }
  store.transaction(() => {
    store.exercises.upsert(row)
    enqueue(store, {
      entity: 'exercise',
      op: 'create',
      entity_id: row.id,
      payload: {
        routine_id: routineId,
        name: draft.name,
        measurement_type: draft.measurement_type,
        target_sets: draft.target_sets ?? null,
        target_reps: draft.target_reps ?? null,
        target_weight: draft.target_weight ?? null,
        target_duration_seconds: draft.target_duration_seconds ?? null,
        primary_muscle_group: draft.primary_muscle_group,
        secondary_muscle_groups: draft.secondary_muscle_groups ?? [],
        notes: draft.notes ?? '',
        catalog_exercise_id: draft.catalog_exercise_id ?? null,
      },
      base_version: null,
    })
  })
  return row
}

export function updateExercise(store: LocalStore, id: string, patch: Partial<ExerciseDraft>): Exercise | undefined {
  const existing = store.exercises.get(id)
  if (!existing) return undefined
  const row: Exercise = { ...existing, ...patch, secondary_muscle_groups: patch.secondary_muscle_groups ?? existing.secondary_muscle_groups, updated_at: now() }
  store.transaction(() => {
    store.exercises.upsert(row)
    enqueue(store, { entity: 'exercise', op: 'update', entity_id: id, payload: { ...patch }, base_version: existing.updated_at })
  })
  return row
}

export function deleteExercise(store: LocalStore, id: string): void {
  store.transaction(() => {
    store.exercises.delete(id)
    if (cancelIfPendingCreate(store, id)) return
    enqueue(store, { entity: 'exercise', op: 'delete', entity_id: id, payload: {}, base_version: null })
  })
}

/** Reorder a routine's exercises to the given id order (position-only updates). */
export function reorderExercises(store: LocalStore, ids: string[]): void {
  store.transaction(() => {
    ids.forEach((id, index) => {
      const ex = store.exercises.get(id)
      if (!ex || ex.position === index) return
      store.exercises.upsert({ ...ex, position: index, updated_at: now() })
      enqueue(store, { entity: 'exercise', op: 'update', entity_id: id, payload: { position: index }, base_version: ex.updated_at })
    })
  })
}

// ---------- Sessions ----------

export function getSession(store: LocalStore, id: string): WorkoutSession | undefined {
  const s = store.sessions.get(id)
  if (!s) return undefined
  const exercises = store.sessionExercises
    .all()
    .filter((se) => se.session_id === id)
    .sort((a, b) => a.position - b.position)
    .map((se) => ({ ...se, entries: entriesFor(store, se.id) }))
  return { ...s, exercises }
}

export function listSessions(store: LocalStore): WorkoutSession[] {
  return store.sessions
    .all()
    .sort((a, b) => Date.parse(b.performed_at) - Date.parse(a.performed_at))
}

/** The single live (active or paused) session, if any — backs the resume banner. */
export function activeSession(store: LocalStore): WorkoutSession | undefined {
  const live = store.sessions.all().find((s) => s.status === 'active' || s.status === 'paused')
  return live ? getSession(store, live.id) : undefined
}

function entriesFor(store: LocalStore, sessionExerciseId: string): SetEntry[] {
  return store.entries
    .all()
    .filter((e) => e.session_exercise_id === sessionExerciseId)
    .sort((a, b) => a.entry_number - b.entry_number)
}

/** Start a session from a routine: snapshot its exercises into session rows
 * (all client-id'd so the replayed start reproduces them). */
export function startSession(store: LocalStore, routine: Routine): WorkoutSession {
  const ts = now()
  const sessionId = newId()
  const exercises = (routine.exercises ?? exercisesForRoutine(store, routine.id))
    .slice()
    .sort((a, b) => a.position - b.position)
  const snapshots = exercises.map<SessionExercise>((ex, i) => ({
    id: newId(),
    session_id: sessionId,
    exercise_id: ex.id,
    position: i,
    name_snapshot: ex.catalog_name ?? ex.name,
    measurement_type: ex.measurement_type,
    target_sets: ex.target_sets,
    target_reps: ex.target_reps,
    target_weight: ex.target_weight,
    target_duration_seconds: ex.target_duration_seconds,
    primary_muscle_group: ex.primary_muscle_group,
    secondary_muscle_groups: ex.secondary_muscle_groups,
    status: 'pending',
    completed_at: null,
    sets_completed: 0,
    total_reps: null,
    total_volume: null,
    total_duration_seconds: null,
    top_set_weight: null,
    metadata: {},
    last_set: ex.last_set ?? null,
  }))
  const session: WorkoutSession = {
    id: sessionId,
    user_id: currentUserId(store),
    routine_id: routine.id,
    status: 'active',
    performed_at: ts,
    started_at: ts,
    ended_at: null,
    total_duration_seconds: null,
    active_duration_seconds: null,
    paused_duration_seconds: null,
    muscle_groups: [],
    notes: '',
    metadata: {},
  }
  store.transaction(() => {
    store.sessions.upsert(session)
    for (const se of snapshots) store.sessionExercises.upsert(se)
    enqueue(store, {
      entity: 'session',
      op: 'create',
      entity_id: sessionId,
      payload: {
        routine_id: routine.id,
        exercises: snapshots.map((s) => ({
          id: s.id,
          exercise_id: s.exercise_id,
          position: s.position,
          name_snapshot: s.name_snapshot,
          measurement_type: s.measurement_type,
          target_sets: s.target_sets,
          target_reps: s.target_reps,
          target_duration_seconds: s.target_duration_seconds,
          primary_muscle_group: s.primary_muscle_group,
          secondary_muscle_groups: s.secondary_muscle_groups,
        })),
      },
      base_version: null,
    })
  })
  return getSession(store, sessionId)!
}

function setSessionStatus(store: LocalStore, id: string, status: SessionStatus, action: 'pause' | 'resume' | 'complete' | 'abandon'): WorkoutSession | undefined {
  const s = store.sessions.get(id)
  if (!s) return undefined
  const ended = status === 'completed' || status === 'abandoned'
  const ts = now()
  const row: WorkoutSession = {
    ...s,
    status,
    ended_at: ended ? ts : s.ended_at,
  }
  store.transaction(() => {
    store.sessions.upsert(row)
    enqueue(store, { entity: 'session_lifecycle', op: 'update', entity_id: id, payload: { action }, base_version: s.updated_at ?? null })
  })
  return getSession(store, id)
}

export const pauseSession = (store: LocalStore, id: string) => setSessionStatus(store, id, 'paused', 'pause')
export const resumeSession = (store: LocalStore, id: string) => setSessionStatus(store, id, 'active', 'resume')
export const completeSession = (store: LocalStore, id: string) => setSessionStatus(store, id, 'completed', 'complete')
export const abandonSession = (store: LocalStore, id: string) => setSessionStatus(store, id, 'abandoned', 'abandon')

// ---------- Set entries (the core offline-logging path) ----------

export interface EntryDraft {
  weight?: number | null
  weight_unit?: WeightUnit | null
  reps?: number | null
  duration_seconds?: number | null
  is_completed?: boolean
}

/** Log a set. A local, synchronous write that can never fail for lack of
 * signal — the defining property of the app (PRD 0018 §2). */
export function addEntry(store: LocalStore, sessionExerciseId: string, draft: EntryDraft): SetEntry {
  const ts = now()
  const existing = entriesFor(store, sessionExerciseId)
  const row: SetEntry = {
    id: newId(),
    session_exercise_id: sessionExerciseId,
    entry_number: existing.length + 1,
    weight: draft.weight ?? null,
    weight_unit: draft.weight_unit ?? null,
    reps: draft.reps ?? null,
    duration_seconds: draft.duration_seconds ?? null,
    distance: null,
    distance_unit: null,
    incline: null,
    speed: null,
    rpe: null,
    is_completed: draft.is_completed ?? true,
    performed_at: ts,
    metadata: {},
    created_at: ts,
  }
  store.transaction(() => {
    store.entries.upsert(row)
    enqueue(store, {
      entity: 'entry',
      op: 'create',
      entity_id: row.id,
      payload: {
        session_exercise_id: sessionExerciseId,
        weight: row.weight,
        weight_unit: row.weight_unit,
        reps: row.reps,
        duration_seconds: row.duration_seconds,
        is_completed: row.is_completed,
      },
      base_version: null,
    })
    recomputeSessionExercise(store, sessionExerciseId)
  })
  return row
}

export function updateEntry(store: LocalStore, id: string, draft: EntryDraft): SetEntry | undefined {
  const existing = store.entries.get(id)
  if (!existing) return undefined
  const row: SetEntry = { ...existing, ...draft }
  store.transaction(() => {
    store.entries.upsert(row)
    enqueue(store, { entity: 'entry', op: 'update', entity_id: id, payload: { ...draft }, base_version: existing.created_at })
    recomputeSessionExercise(store, existing.session_exercise_id)
  })
  return row
}

export function deleteEntry(store: LocalStore, id: string): void {
  const existing = store.entries.get(id)
  if (!existing) return
  store.transaction(() => {
    store.entries.delete(id)
    if (!cancelIfPendingCreate(store, id)) {
      enqueue(store, { entity: 'entry', op: 'delete', entity_id: id, payload: {}, base_version: null })
    }
    recomputeSessionExercise(store, existing.session_exercise_id)
  })
}

/** Recompute a session exercise's derived aggregates from its logged entries,
 * so the live UI reflects progress immediately (the server recomputes the same
 * on sync). Mirrors the API's session-exercise rollups. */
export function recomputeSessionExercise(store: LocalStore, sessionExerciseId: string): void {
  const se = store.sessionExercises.get(sessionExerciseId)
  if (!se) return
  const entries = entriesFor(store, sessionExerciseId)
  const completed = entries.filter((e) => e.is_completed)
  let totalReps = 0
  let totalVolume = 0
  let totalDuration = 0
  let topWeight = 0
  for (const e of completed) {
    if (e.reps != null) totalReps += e.reps
    if (e.weight != null && e.reps != null) totalVolume += e.weight * e.reps
    if (e.duration_seconds != null) totalDuration += e.duration_seconds
    if (e.weight != null && e.weight > topWeight) topWeight = e.weight
  }
  store.sessionExercises.upsert({
    ...se,
    sets_completed: completed.length,
    total_reps: totalReps || null,
    total_volume: totalVolume || null,
    total_duration_seconds: totalDuration || null,
    top_set_weight: topWeight || null,
    status: completed.length > 0 ? (se.status === 'pending' ? 'in_progress' : se.status) : se.status,
  })
}

// ---------- Profile ----------

export function updateProfile(store: LocalStore, patch: UpdateProfileRequest): User | undefined {
  const user = store.meta.get<User>('user')
  if (!user) return undefined
  const next: User = { ...user, ...patch, updated_at: now() } as User
  store.transaction(() => {
    store.meta.set('user', next)
    enqueue(store, { entity: 'profile', op: 'update', entity_id: user.id, payload: { ...patch }, base_version: user.updated_at })
  })
  return next
}
