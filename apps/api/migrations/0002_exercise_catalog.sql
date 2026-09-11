-- 0002_exercise_catalog.sql
-- Shared exercise catalog (master data) — PRD 0006.
--
-- Adds a global, read-only `exercise_catalog` of well-known movements so that
-- adding an exercise to a routine becomes "pick a known movement" instead of
-- re-typing its name and re-selecting muscle groups every time. A routine
-- exercise may LINK to a catalog entry (source of truth for its muscle groups)
-- or stay CUSTOM (owns its own muscle-group columns, exactly today's behavior).
--
-- Reference-only by design: a linked exercise resolves its muscle groups from
-- the catalog on read (§4.2). Immutable history is preserved separately by the
-- session snapshot (§4.4), which copies the *resolved* values at session start.

-- ---------------------------------------------------------------------------
-- exercise_catalog (global master data — NOT user-scoped, read-only to users)
-- ---------------------------------------------------------------------------
CREATE TABLE exercise_catalog (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                      TEXT NOT NULL UNIQUE,
    primary_muscle_group      muscle_group NOT NULL,
    secondary_muscle_groups   muscle_group[] NOT NULL DEFAULT '{}',
    default_measurement_type  measurement_type NOT NULL DEFAULT 'weight_reps',
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercise_catalog_primary ON exercise_catalog (primary_muscle_group);

-- ---------------------------------------------------------------------------
-- exercises: gain an optional link to a catalog entry.
--   * linked  → catalog_exercise_id set, own muscle columns left NULL
--   * custom  → catalog_exercise_id NULL, own muscle columns populated
-- primary_muscle_group becomes nullable; a CHECK guarantees a resolvable
-- muscle group always exists. All existing rows keep a non-null
-- primary_muscle_group and a NULL catalog_exercise_id, so they satisfy the
-- CHECK unchanged (backward-compatible).
-- ---------------------------------------------------------------------------
ALTER TABLE exercises
    ADD COLUMN catalog_exercise_id UUID REFERENCES exercise_catalog(id) ON DELETE SET NULL;

ALTER TABLE exercises
    ALTER COLUMN primary_muscle_group DROP NOT NULL,
    ALTER COLUMN primary_muscle_group DROP DEFAULT;

ALTER TABLE exercises
    ADD CONSTRAINT exercises_muscle_group_resolvable
    CHECK (catalog_exercise_id IS NOT NULL OR primary_muscle_group IS NOT NULL);

CREATE INDEX idx_exercises_catalog ON exercises (catalog_exercise_id);

-- ---------------------------------------------------------------------------
-- Seed: a focused starter set of well-known movements.
-- primary_muscle_group is the prime mover; secondary_muscle_groups are the
-- notable assisting groups. measurement_type is the sensible default for the
-- movement (weight_reps for lifts, duration/distance for conditioning).
-- ---------------------------------------------------------------------------
INSERT INTO exercise_catalog (name, primary_muscle_group, secondary_muscle_groups, default_measurement_type) VALUES
    -- Chest
    ('Barbell Bench Press',          'chest',      ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Incline Barbell Bench Press',  'chest',      ARRAY['shoulders','triceps']::muscle_group[], 'weight_reps'),
    ('Dumbbell Bench Press',         'chest',      ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Incline Dumbbell Press',       'chest',      ARRAY['shoulders','triceps']::muscle_group[], 'weight_reps'),
    ('Dumbbell Fly',                 'chest',      ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    ('Cable Crossover',              'chest',      ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    ('Chest Dip',                    'chest',      ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Push-Up',                      'chest',      ARRAY['triceps','shoulders','core']::muscle_group[], 'reps_only'),
    -- Back
    ('Deadlift',                     'back',       ARRAY['hamstrings','glutes','forearms']::muscle_group[], 'weight_reps'),
    ('Pull-Up',                      'back',       ARRAY['biceps','forearms']::muscle_group[],   'reps_only'),
    ('Chin-Up',                      'back',       ARRAY['biceps','forearms']::muscle_group[],   'reps_only'),
    ('Lat Pulldown',                 'back',       ARRAY['biceps','forearms']::muscle_group[],   'weight_reps'),
    ('Bent-Over Barbell Row',        'back',       ARRAY['biceps','forearms']::muscle_group[],   'weight_reps'),
    ('Seated Cable Row',             'back',       ARRAY['biceps','forearms']::muscle_group[],   'weight_reps'),
    ('Single-Arm Dumbbell Row',      'back',       ARRAY['biceps','forearms']::muscle_group[],   'weight_reps'),
    ('T-Bar Row',                    'back',       ARRAY['biceps','forearms']::muscle_group[],   'weight_reps'),
    ('Face Pull',                    'back',       ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    -- Shoulders
    ('Overhead Barbell Press',       'shoulders',  ARRAY['triceps','core']::muscle_group[],      'weight_reps'),
    ('Seated Dumbbell Shoulder Press','shoulders', ARRAY['triceps']::muscle_group[],             'weight_reps'),
    ('Arnold Press',                 'shoulders',  ARRAY['triceps']::muscle_group[],             'weight_reps'),
    ('Lateral Raise',                'shoulders',  ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Front Raise',                  'shoulders',  ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Rear Delt Fly',                'shoulders',  ARRAY['back']::muscle_group[],                'weight_reps'),
    ('Barbell Shrug',                'shoulders',  ARRAY['forearms']::muscle_group[],            'weight_reps'),
    -- Biceps
    ('Barbell Curl',                 'biceps',     ARRAY['forearms']::muscle_group[],            'weight_reps'),
    ('Dumbbell Curl',                'biceps',     ARRAY['forearms']::muscle_group[],            'weight_reps'),
    ('Hammer Curl',                  'biceps',     ARRAY['forearms']::muscle_group[],            'weight_reps'),
    ('Preacher Curl',                'biceps',     ARRAY['forearms']::muscle_group[],            'weight_reps'),
    ('Cable Curl',                   'biceps',     ARRAY['forearms']::muscle_group[],            'weight_reps'),
    -- Triceps
    ('Close-Grip Bench Press',       'triceps',    ARRAY['chest','shoulders']::muscle_group[],   'weight_reps'),
    ('Triceps Pushdown',             'triceps',    ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Overhead Triceps Extension',   'triceps',    ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Skull Crusher',                'triceps',    ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Triceps Dip',                  'triceps',    ARRAY['chest','shoulders']::muscle_group[],   'weight_reps'),
    -- Forearms
    ('Wrist Curl',                   'forearms',   ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Farmer''s Carry',              'forearms',   ARRAY['core','full_body']::muscle_group[],    'distance'),
    -- Quads
    ('Barbell Back Squat',           'quads',      ARRAY['glutes','hamstrings','core']::muscle_group[], 'weight_reps'),
    ('Front Squat',                  'quads',      ARRAY['glutes','core']::muscle_group[],       'weight_reps'),
    ('Leg Press',                    'quads',      ARRAY['glutes','hamstrings']::muscle_group[], 'weight_reps'),
    ('Leg Extension',                'quads',      ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Walking Lunge',                'quads',      ARRAY['glutes','hamstrings']::muscle_group[], 'weight_reps'),
    ('Bulgarian Split Squat',        'quads',      ARRAY['glutes','hamstrings']::muscle_group[], 'weight_reps'),
    -- Hamstrings
    ('Romanian Deadlift',            'hamstrings', ARRAY['glutes','back']::muscle_group[],       'weight_reps'),
    ('Lying Leg Curl',               'hamstrings', ARRAY['calves']::muscle_group[],              'weight_reps'),
    ('Seated Leg Curl',              'hamstrings', ARRAY['calves']::muscle_group[],              'weight_reps'),
    ('Good Morning',                 'hamstrings', ARRAY['glutes','back']::muscle_group[],       'weight_reps'),
    -- Glutes
    ('Hip Thrust',                   'glutes',     ARRAY['hamstrings']::muscle_group[],          'weight_reps'),
    ('Glute Bridge',                 'glutes',     ARRAY['hamstrings']::muscle_group[],          'weight_reps'),
    -- Calves
    ('Standing Calf Raise',          'calves',     ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Seated Calf Raise',            'calves',     ARRAY[]::muscle_group[],                      'weight_reps'),
    -- Core
    ('Plank',                        'core',       ARRAY[]::muscle_group[],                      'duration'),
    ('Hanging Leg Raise',            'core',       ARRAY['forearms']::muscle_group[],            'reps_only'),
    ('Cable Crunch',                 'core',       ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Russian Twist',                'core',       ARRAY[]::muscle_group[],                      'reps_only'),
    -- Cardio / conditioning
    ('Treadmill Run',                'cardio',     ARRAY['quads','hamstrings','calves']::muscle_group[], 'distance'),
    ('Stationary Bike',              'cardio',     ARRAY['quads','hamstrings']::muscle_group[],  'duration'),
    ('Rowing Machine',               'cardio',     ARRAY['back','quads','core']::muscle_group[], 'distance'),
    ('Jump Rope',                    'cardio',     ARRAY['calves']::muscle_group[],              'duration'),
    ('Burpee',                       'full_body',  ARRAY['chest','quads','core']::muscle_group[], 'reps_only');
