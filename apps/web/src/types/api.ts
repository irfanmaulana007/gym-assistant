// Types mirroring the API contract (apps/api). Keep these in sync with the
// backend responses documented in prd/0001 and prd/0002.

export type MeasurementType = 'weight_reps' | 'reps_only' | 'duration' | 'distance'
export type WeightUnit = 'kg' | 'lb'
export type DistanceUnit = 'km' | 'mi' | 'm'
export type SessionStatus = 'active' | 'paused' | 'completed' | 'abandoned'
export type SessionExerciseStatus = 'pending' | 'in_progress' | 'completed' | 'skipped'
export type SessionEventType = 'start' | 'pause' | 'resume' | 'complete' | 'abandon'

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body',
  'cardio', 'other',
] as const
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]

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
