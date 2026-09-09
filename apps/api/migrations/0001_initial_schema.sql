-- 0001_initial_schema.sql
-- Combined Phase-1 schema for Gym Assistant.
--
-- This single migration lands the full Phase-1 data model defined by PRD 0001
-- (Workout Tracking Foundation) as revised by PRD 0002 (Session Lifecycle,
-- Exercise Types & Metrics). Because PRD 0001 was never implemented, 0002's
-- revisions are folded in here rather than applied as later ALTERs:
--   * exercises gain measurement_type, muscle groups, extra targets, metadata
--   * workout_sessions gain a lifecycle (status/durations/muscle_groups)
--   * session_events, session_exercises, and set_entries are new
--   * set_entries generalizes PRD 0001's set_logs (weight/reps OR duration/etc.)
--
-- Progressive overload is DERIVED from set_entries, never stored denormalized.

-- Enable UUID generation (gen_random_uuid) from the built-in pgcrypto module.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Controlled vocabularies (enums)
-- ---------------------------------------------------------------------------

-- Muscle groups: a controlled vocabulary so dashboard metrics aggregate cleanly
-- instead of fighting free-text typos (PRD 0002 §5.6).
CREATE TYPE muscle_group AS ENUM (
    'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body',
    'cardio', 'other'
);

-- How an exercise is measured; drives which targets/metrics apply (PRD 0002 §5.1).
CREATE TYPE measurement_type AS ENUM (
    'weight_reps', 'reps_only', 'duration', 'distance'
);

CREATE TYPE weight_unit AS ENUM ('kg', 'lb');
CREATE TYPE distance_unit AS ENUM ('km', 'mi', 'm');

-- Session lifecycle status (PRD 0002 §5.2).
CREATE TYPE session_status AS ENUM ('active', 'paused', 'completed', 'abandoned');

-- Session lifecycle event types (PRD 0002 §5.3).
CREATE TYPE session_event_type AS ENUM ('start', 'pause', 'resume', 'complete', 'abandon');

-- Per-exercise checklist state within a session (PRD 0002 §5.4).
CREATE TYPE session_exercise_status AS ENUM ('pending', 'in_progress', 'completed', 'skipped');

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- routines (workout days / schedule groups)
-- ---------------------------------------------------------------------------
CREATE TABLE routines (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    notes      TEXT NOT NULL DEFAULT '',
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_routines_user_position ON routines (user_id, position);

-- ---------------------------------------------------------------------------
-- exercises (movement definitions/templates within a routine)
-- ---------------------------------------------------------------------------
CREATE TABLE exercises (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    routine_id               UUID NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    name                     TEXT NOT NULL,
    measurement_type         measurement_type NOT NULL DEFAULT 'weight_reps',
    target_sets              INTEGER,
    target_reps              INTEGER,
    target_weight            NUMERIC(7,2),
    target_duration_seconds  INTEGER,
    target_distance          NUMERIC(9,3),
    distance_unit            distance_unit,
    primary_muscle_group     muscle_group NOT NULL DEFAULT 'other',
    secondary_muscle_groups  muscle_group[] NOT NULL DEFAULT '{}',
    default_metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes                    TEXT NOT NULL DEFAULT '',
    position                 INTEGER NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercises_routine_position ON exercises (routine_id, position);

-- ---------------------------------------------------------------------------
-- workout_sessions (a stateful activity: one performance of a routine)
-- ---------------------------------------------------------------------------
CREATE TABLE workout_sessions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    routine_id               UUID REFERENCES routines(id) ON DELETE SET NULL,
    status                   session_status NOT NULL DEFAULT 'active',
    performed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at               TIMESTAMPTZ,
    ended_at                 TIMESTAMPTZ,
    total_duration_seconds   INTEGER,
    active_duration_seconds  INTEGER,
    paused_duration_seconds  INTEGER,
    muscle_groups            muscle_group[] NOT NULL DEFAULT '{}',
    notes                    TEXT NOT NULL DEFAULT '',
    metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user_started ON workout_sessions (user_id, started_at);
CREATE INDEX idx_sessions_user_status ON workout_sessions (user_id, status);

-- ---------------------------------------------------------------------------
-- session_events (append-only lifecycle timeline; source of truth for duration)
-- ---------------------------------------------------------------------------
CREATE TABLE session_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    type        session_event_type NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata    JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_session_events_session_time ON session_events (session_id, occurred_at);

-- ---------------------------------------------------------------------------
-- session_exercises (checklist item + snapshot + per-exercise aggregates)
-- ---------------------------------------------------------------------------
CREATE TABLE session_exercises (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id               UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id              UUID REFERENCES exercises(id) ON DELETE SET NULL,
    position                 INTEGER NOT NULL DEFAULT 0,
    name_snapshot            TEXT NOT NULL,
    measurement_type         measurement_type NOT NULL DEFAULT 'weight_reps',
    target_sets              INTEGER,
    target_reps              INTEGER,
    target_weight            NUMERIC(7,2),
    target_duration_seconds  INTEGER,
    primary_muscle_group     muscle_group NOT NULL DEFAULT 'other',
    secondary_muscle_groups  muscle_group[] NOT NULL DEFAULT '{}',
    status                   session_exercise_status NOT NULL DEFAULT 'pending',
    completed_at             TIMESTAMPTZ,
    -- Derived aggregates, persisted on completion (dashboard read-model):
    sets_completed           INTEGER NOT NULL DEFAULT 0,
    total_reps               INTEGER,
    total_volume             NUMERIC(12,2),
    total_duration_seconds   INTEGER,
    top_set_weight           NUMERIC(7,2),
    metadata                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_exercises_session_position ON session_exercises (session_id, position);
CREATE INDEX idx_session_exercises_exercise ON session_exercises (exercise_id);

-- ---------------------------------------------------------------------------
-- set_entries (generalized performed unit: a strength set OR a timed/distance bout)
-- Supersedes PRD 0001's set_logs.
-- ---------------------------------------------------------------------------
CREATE TABLE set_entries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_exercise_id  UUID NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    entry_number         INTEGER NOT NULL,
    weight               NUMERIC(7,2),
    weight_unit          weight_unit,
    reps                 INTEGER,
    duration_seconds     INTEGER,
    distance             NUMERIC(9,3),
    distance_unit        distance_unit,
    incline              NUMERIC(5,2),
    speed                NUMERIC(5,2),
    rpe                  NUMERIC(3,1),
    is_completed         BOOLEAN NOT NULL DEFAULT true,
    performed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata             JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_set_entries_sx_number ON set_entries (session_exercise_id, entry_number);
