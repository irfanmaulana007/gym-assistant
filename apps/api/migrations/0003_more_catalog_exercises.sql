-- 0003_more_catalog_exercises.sql
-- Extend the shared exercise catalog (PRD 0006) with a few more well-known
-- movements requested after the initial seed: a leg machine (Hack Squat),
-- two cardio/conditioning entries (Incline Walk, Stair Climber), and the two
-- hip-machine movements (Hip Adductor, Hip Abductor).
--
-- The catalog is curated via migration (PRD 0006 §3 — no admin UI yet). Because
-- 0002's INSERT is an already-applied migration, new rows are added here rather
-- than by editing that file, so existing databases pick them up too.
--
-- Note on muscle groups: the `muscle_group` enum has no dedicated
-- adductor/abductor value (see 0001_initial_schema.sql). We map the inner-thigh
-- Hip Adductor to `quads` and the hip/outer-glute Hip Abductor to `glutes` — the
-- closest existing groups — rather than extend the enum for two entries.
--
-- ON CONFLICT keeps this insert idempotent and safe against name collisions
-- with the existing seed (name is UNIQUE).
INSERT INTO exercise_catalog (name, primary_muscle_group, secondary_muscle_groups, default_measurement_type) VALUES
    -- Quads
    ('Hack Squat',     'quads',  ARRAY['glutes','hamstrings']::muscle_group[], 'weight_reps'),
    -- Cardio / conditioning
    ('Incline Walk',   'cardio', ARRAY['quads','glutes','calves']::muscle_group[], 'duration'),
    ('Stair Climber',  'cardio', ARRAY['quads','glutes','calves']::muscle_group[], 'duration'),
    -- Hip machines (no adductor/abductor enum value — see note above)
    ('Hip Adductor',   'quads',  ARRAY[]::muscle_group[], 'weight_reps'),
    ('Hip Abductor',   'glutes', ARRAY[]::muscle_group[], 'weight_reps')
ON CONFLICT (name) DO NOTHING;
