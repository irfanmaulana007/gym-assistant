// Types mirroring the API contract (apps/api). Keep these in sync with the
// backend responses documented in prd/0001 and prd/0002.

export type MeasurementType = 'weight_reps' | 'reps_only' | 'duration' | 'distance'
export type WeightUnit = 'kg' | 'lb'
export type DistanceUnit = 'km' | 'mi' | 'm'
export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned'
export type SessionExerciseStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type SessionEventType = 'start' | 'pause' | 'resume' | 'complete' | 'abandon'

// Muscle groups grouped by body area so selects can render them under
// scannable <optgroup> sections. MUSCLE_GROUPS (the flat list) is derived from
// this so the two never drift.
export const MUSCLE_GROUP_SECTIONS = [
  { label: 'Chest', groups: ['chest'] },
  { label: 'Back', groups: ['back'] },
  { label: 'Shoulders', groups: ['shoulders'] },
  { label: 'Arms', groups: ['biceps', 'triceps', 'forearms'] },
  { label: 'Legs', groups: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { label: 'Core', groups: ['core'] },
  { label: 'Other', groups: ['full_body', 'cardio', 'other'] },
] as const

export const MUSCLE_GROUPS = MUSCLE_GROUP_SECTIONS.flatMap((s) => s.groups)
export type MuscleGroup = (typeof MUSCLE_GROUP_SECTIONS)[number]['groups'][number]

// Human-readable label for a muscle group value: capitalize and drop the
// snake_case underscores (e.g. `full_body` → `Full body`).
export function muscleGroupLabel(group: string): string {
  const spaced = group.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export interface User {
  id: string
  email: string
  display_name: string
  created_at: string
  updated_at: string
}

export interface AuthResponse {
  token: string
  user: User
}

/** The heaviest set of the most recent prior session — the "weight to beat".
 * Derived server-side; null/absent when the exercise has no weighted history. */
export interface LastSet {
  weight: number
  weight_unit: string
  reps: number
  performed_at: string
}

export interface Exercise {
  id: string
  routine_id: string
  name: string
  measurement_type: MeasurementType
  target_sets: number | null
  target_reps: number | null
  target_weight: number | null
  target_duration_seconds: number | null
  target_distance: number | null
  distance_unit: DistanceUnit | null
  primary_muscle_group: MuscleGroup
  secondary_muscle_groups: MuscleGroup[]
  default_metadata: Record<string, unknown>
  notes: string
  position: number
  created_at: string
  updated_at: string
  // When set, this exercise is linked to a shared catalog entry (PRD 0006) and
  // its muscle groups above are resolved from the catalog on read. Null for a
  // custom exercise, which owns its muscle-group columns.
  catalog_exercise_id: string | null
  catalog_name?: string | null
  last_set?: LastSet | null
}

// A shared catalog movement (PRD 0006): global read-only master data a routine
// exercise can link to instead of re-typing name + muscle groups.
export interface CatalogExercise {
  id: string
  name: string
  primary_muscle_group: MuscleGroup
  secondary_muscle_groups: MuscleGroup[]
  default_measurement_type: MeasurementType
  created_at: string
  updated_at: string
}

export interface Routine {
  id: string
  user_id: string
  name: string
  notes: string
  position: number
  created_at: string
  updated_at: string
  exercises?: Exercise[]
}

export interface SetEntry {
  id: string
  session_exercise_id: string
  entry_number: number
  weight: number | null
  weight_unit: WeightUnit | null
  reps: number | null
  duration_seconds: number | null
  distance: number | null
  distance_unit: DistanceUnit | null
  incline: number | null
  speed: number | null
  rpe: number | null
  is_completed: boolean
  performed_at: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface SessionExercise {
  id: string
  session_id: string
  exercise_id: string | null
  position: number
  name_snapshot: string
  measurement_type: MeasurementType
  target_sets: number | null
  target_reps: number | null
  target_weight: number | null
  target_duration_seconds: number | null
  primary_muscle_group: MuscleGroup
  secondary_muscle_groups: MuscleGroup[]
  status: SessionExerciseStatus
  completed_at: string | null
  sets_completed: number
  total_reps: number | null
  total_volume: number | null
  total_duration_seconds: number | null
  top_set_weight: number | null
  metadata: Record<string, unknown>
  entries?: SetEntry[]
  last_set?: LastSet | null
}

export interface SessionEvent {
  id: string
  session_id: string
  type: SessionEventType
  occurred_at: string
  metadata: Record<string, unknown>
}

export interface WorkoutSession {
  id: string
  user_id: string
  routine_id: string | null
  status: SessionStatus
  performed_at: string
  started_at: string | null
  ended_at: string | null
  total_duration_seconds: number | null
  active_duration_seconds: number | null
  paused_duration_seconds: number | null
  muscle_groups: MuscleGroup[]
  notes: string
  metadata: Record<string, unknown>
  events?: SessionEvent[]
  exercises?: SessionExercise[]
}

export interface Trend {
  metric: string
  direction: 'up' | 'down' | 'flat' | 'none'
  change: number
}

export interface ExerciseHistory {
  exercise: Exercise
  sessions: {
    session_id: string
    performed_at: string
    top_set: { weight: number; weight_unit: string; reps: number } | null
    total_volume: number
    sets: { set_number: number; weight: number | null; reps: number | null }[]
  }[]
  trend: Trend
}

// --- Analytics dashboard (PRD 0007) ---

export type DashboardWindow = 'week' | 'month' | 'quarter' | 'year' | 'all'

export interface AnalyticsWindow {
  key: string
  from: string
  to: string
  bucket: string
}

/** A windowed value with its previous-window value and signed percent delta
 * (null when the previous window is zero or absent — e.g. the "all" window). */
export interface Metric {
  value: number
  previous: number
  delta_pct: number | null
}

export interface AnalyticsSummary {
  workouts: Metric
  training_minutes: Metric
  total_volume: Metric
  current_streak: number
  longest_streak: number
  days_since_last: number | null
}

export interface VolumePoint {
  bucket_start: string
  volume: number
  sets: number
}

export interface MuscleGroupStat {
  muscle_group: string
  sets: number
  volume: number
  frequency: number
  undertrained: boolean
}

export interface ExerciseTrend {
  exercise_id: string
  name: string
  direction: 'up' | 'down' | 'flat' | 'none'
  change: number
  stalled: boolean
  sessions: number
}

export interface PersonalRecord {
  exercise_id: string
  name: string
  heaviest_weight: number
  heaviest_reps: number
  est_one_rm: number
  is_new_this_window: boolean
}

export interface CalendarDay {
  date: string
  count: number
}

export interface Dashboard {
  window: AnalyticsWindow
  volume_unit: string
  summary: AnalyticsSummary
  volume_series: VolumePoint[]
  muscle_groups: MuscleGroupStat[]
  trending_up: ExerciseTrend[]
  stalled: ExerciseTrend[]
  records: PersonalRecord[]
  calendar: CalendarDay[]
}
