-- 0009_more_catalog_chest_triceps.sql
-- Extend the shared exercise catalog (PRD 0006) with the common chest-machine
-- and triceps movements requested after the initial seed: a machine chest
-- press, pec-deck / seated fly ("flight") machines, more barbell/dumbbell/cable
-- press & fly variants, and a single-arm triceps pushdown plus friends. The
-- initial seed (0002) only covered free-weight and a couple of cable chest
-- movements, so the machine side (Chest Press, Pec Deck, Flight fly) was missing.
--
-- The catalog is curated via migration (PRD 0006 §3 — no admin UI yet). Because
-- 0002's INSERT is an already-applied migration, new rows are added here rather
-- than by editing that file, so existing databases pick them up too.
--
-- Vocabulary notes (see 0001_initial_schema.sql for the enums):
--   * Pressing movements are primary `chest` with `triceps`/`shoulders` as the
--     notable assisting groups, matching Barbell Bench Press.
--   * Fly / pec-deck movements isolate the chest, so they carry only `shoulders`
--     as secondary, matching Dumbbell Fly / Cable Crossover.
--   * Pushdown / kickback variants are primary `triceps`, matching the existing
--     Triceps Pushdown entry.
--
-- ON CONFLICT keeps this insert idempotent and safe against name collisions
-- with the existing seed (name is UNIQUE).
INSERT INTO exercise_catalog (name, primary_muscle_group, secondary_muscle_groups, default_measurement_type) VALUES
    -- Chest — machine / cable presses
    ('Machine Chest Press',        'chest',   ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Hammer Strength Chest Press','chest',   ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Smith Machine Bench Press',  'chest',   ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Decline Barbell Bench Press','chest',   ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Decline Dumbbell Press',     'chest',   ARRAY['triceps','shoulders']::muscle_group[], 'weight_reps'),
    ('Landmine Press',             'chest',   ARRAY['shoulders','triceps']::muscle_group[], 'weight_reps'),
    -- Chest — pec-deck / fly ("flight") machines & cable flys
    ('Pec Deck',                   'chest',   ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    ('Seated Machine Fly',         'chest',   ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    ('Incline Cable Fly',          'chest',   ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    ('Low Cable Fly',              'chest',   ARRAY['shoulders']::muscle_group[],           'weight_reps'),
    -- Triceps — pushdown & isolation variants
    ('Single-Arm Triceps Pushdown','triceps', ARRAY[]::muscle_group[],                     'weight_reps'),
    ('Rope Triceps Pushdown',      'triceps', ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Reverse-Grip Triceps Pushdown','triceps', ARRAY[]::muscle_group[],                    'weight_reps'),
    ('Dumbbell Triceps Kickback',  'triceps', ARRAY[]::muscle_group[],                      'weight_reps'),
    ('Bench Dip',                  'triceps', ARRAY['chest','shoulders']::muscle_group[],   'weight_reps')
ON CONFLICT (name) DO NOTHING;
