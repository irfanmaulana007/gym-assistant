-- 0007_more_catalog_forearms_running.sql
-- Extend the shared exercise catalog (PRD 0006) with more forearm/grip
-- movements and a proper set of running/cardio movements. The initial seed
-- (0002) had only two forearm entries (Wrist Curl, Farmer's Carry) and no
-- outdoor running movement (only Treadmill Run / Incline Walk), so both are
-- thin for anyone training grip or running.
--
-- The catalog is curated via migration (PRD 0006 §3 — no admin UI yet). Because
-- 0002/0003's INSERTs are already-applied migrations, new rows are added here
-- rather than by editing those files, so existing databases pick them up too.
--
-- Vocabulary notes (see 0001_initial_schema.sql for the enums):
--   * Running movements are primary `cardio` with the working legs as
--     secondary (quads/hamstrings/glutes/calves), matching Treadmill Run.
--     Distance-based runs use `distance`; drills with no natural distance
--     (High Knees) use `duration`.
--   * Forearm movements are primary `forearms`. Curl variants that also drive
--     the elbow flexors carry `biceps` as secondary.
--
-- ON CONFLICT keeps this insert idempotent and safe against name collisions
-- with the existing seed (name is UNIQUE).
INSERT INTO exercise_catalog (name, primary_muscle_group, secondary_muscle_groups, default_measurement_type) VALUES
    -- Forearms / grip
    ('Reverse Wrist Curl',        'forearms', ARRAY[]::muscle_group[],          'weight_reps'),
    ('Behind-the-Back Wrist Curl','forearms', ARRAY[]::muscle_group[],          'weight_reps'),
    ('Cable Wrist Curl',          'forearms', ARRAY[]::muscle_group[],          'weight_reps'),
    ('Wrist Roller',              'forearms', ARRAY[]::muscle_group[],          'weight_reps'),
    ('Reverse Barbell Curl',      'forearms', ARRAY['biceps']::muscle_group[],  'weight_reps'),
    ('Zottman Curl',              'forearms', ARRAY['biceps']::muscle_group[],  'weight_reps'),
    ('Plate Pinch Hold',          'forearms', ARRAY[]::muscle_group[],          'duration'),
    ('Dead Hang',                 'forearms', ARRAY['back']::muscle_group[],    'duration'),
    -- Running / cardio
    ('Outdoor Run',     'cardio', ARRAY['quads','hamstrings','glutes','calves']::muscle_group[], 'distance'),
    ('Jogging',         'cardio', ARRAY['quads','hamstrings','glutes','calves']::muscle_group[], 'distance'),
    ('Trail Run',       'cardio', ARRAY['quads','hamstrings','glutes','calves']::muscle_group[], 'distance'),
    ('Tempo Run',       'cardio', ARRAY['quads','hamstrings','glutes','calves']::muscle_group[], 'distance'),
    ('Interval Sprints','cardio', ARRAY['quads','hamstrings','glutes','calves']::muscle_group[], 'distance'),
    ('Hill Sprints',    'cardio', ARRAY['quads','glutes','calves']::muscle_group[],              'distance'),
    ('Treadmill Sprint','cardio', ARRAY['quads','hamstrings','glutes','calves']::muscle_group[], 'distance'),
    ('High Knees',      'cardio', ARRAY['quads','core','calves']::muscle_group[],                'duration')
ON CONFLICT (name) DO NOTHING;
