-- 0010_more_catalog_legs.sql
-- Extend the shared exercise catalog (PRD 0006) with more leg (quad/hamstring/
-- glute/calf) movements. The earlier seeds (0002/0003) covered the big barbell/
-- machine basics but were thin on unilateral leg work and isometrics, and the
-- requested chest/triceps movements are already covered by 0009.
--
-- The catalog is curated via migration (PRD 0006 §3 — no admin UI yet). Because
-- earlier INSERTs are already-applied migrations, new rows are added here rather
-- than by editing those files, so existing databases pick them up too.
--
-- Vocabulary notes (see 0001_initial_schema.sql for the enums; there is no
-- "legs" group — leg movements use quads/hamstrings/glutes/calves):
--   * Single-Leg Romanian Deadlift is a hip hinge — primary hamstrings with
--     glutes/core as secondary (matches Romanian Deadlift's emphasis).
--   * Tibialis Raise trains the front-of-shin tibialis anterior; the enum has
--     no shin group, so it maps to the nearest lower-leg group `calves`.
--   * Reverse Lunge / Cossack Squat / Goblet Squat are quad-dominant with
--     glutes (and hamstrings/calves for the deeper ranges) as secondary.
--   * Isometric Single-Leg Hold has no reps/weight by nature → `duration`.
--   * Hip Flexor Raise trains the iliopsoas/hip flexors; nearest enum is `core`
--     (trunk flexion), with quads as secondary.
--
-- ON CONFLICT keeps this insert idempotent and safe against name collisions
-- with the existing seed (name is UNIQUE).
INSERT INTO exercise_catalog (name, primary_muscle_group, secondary_muscle_groups, default_measurement_type) VALUES
    ('Single-Leg Romanian Deadlift', 'hamstrings', ARRAY['glutes','core']::muscle_group[],               'weight_reps'),
    ('Tibialis Raise',               'calves',     ARRAY[]::muscle_group[],                               'weight_reps'),
    ('Reverse Lunge',                'quads',      ARRAY['glutes','hamstrings']::muscle_group[],          'weight_reps'),
    ('Cossack Squat',                'quads',      ARRAY['glutes','hamstrings','calves']::muscle_group[], 'weight_reps'),
    ('Isometric Single-Leg Hold',    'quads',      ARRAY['glutes','core']::muscle_group[],                'duration'),
    ('Goblet Squat',                 'quads',      ARRAY['glutes','core']::muscle_group[],                'weight_reps'),
    ('Hip Flexor Raise',             'core',       ARRAY['quads']::muscle_group[],                        'weight_reps')
ON CONFLICT (name) DO NOTHING;
