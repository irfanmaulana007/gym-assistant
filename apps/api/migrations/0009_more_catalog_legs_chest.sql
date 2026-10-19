-- 0009_more_catalog_legs_chest.sql
-- Extend the shared exercise catalog (PRD 0006) with more leg (quad/hamstring/
-- glute/calf) movements and a few chest/triceps machine movements. The earlier
-- seeds (0002/0003) covered the big barbell/machine basics but were thin on
-- unilateral leg work, isometrics, and the fixed-path chest machines many gyms
-- have (chest press / pec deck).
--
-- The catalog is curated via migration (PRD 0006 §3 — no admin UI yet). Because
-- 0002/0003/0007's INSERTs are already-applied migrations, new rows are added
-- here rather than by editing those files, so existing databases pick them up.
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
--   * Chest Press is primary `chest` with triceps/shoulders as pressing
--     secondaries; Pec Deck is a chest isolation (shoulders secondary);
--     Single-Arm Triceps Pushdown is primary `triceps`.
--   * "Lateral Raise" and "Pec Deck"-equivalent fly ("pectoral") already exist
--     in the catalog, so they are intentionally not re-added here (ON CONFLICT
--     would drop them anyway, but the seed is kept to genuinely new names).
--
-- ON CONFLICT keeps this insert idempotent and safe against name collisions
-- with the existing seed (name is UNIQUE).
INSERT INTO exercise_catalog (name, primary_muscle_group, secondary_muscle_groups, default_measurement_type) VALUES
    -- Legs
    ('Single-Leg Romanian Deadlift', 'hamstrings', ARRAY['glutes','core']::muscle_group[],               'weight_reps'),
    ('Tibialis Raise',               'calves',     ARRAY[]::muscle_group[],                               'weight_reps'),
    ('Reverse Lunge',                'quads',      ARRAY['glutes','hamstrings']::muscle_group[],          'weight_reps'),
    ('Cossack Squat',                'quads',      ARRAY['glutes','hamstrings','calves']::muscle_group[], 'weight_reps'),
    ('Isometric Single-Leg Hold',    'quads',      ARRAY['glutes','core']::muscle_group[],                'duration'),
    ('Goblet Squat',                 'quads',      ARRAY['glutes','core']::muscle_group[],                'weight_reps'),
    ('Hip Flexor Raise',             'core',       ARRAY['quads']::muscle_group[],                        'weight_reps'),
    -- Chest / triceps
    ('Chest Press',                  'chest',      ARRAY['triceps','shoulders']::muscle_group[],          'weight_reps'),
    ('Pec Deck',                     'chest',      ARRAY['shoulders']::muscle_group[],                    'weight_reps'),
    ('Single-Arm Triceps Pushdown',  'triceps',    ARRAY[]::muscle_group[],                               'weight_reps')
ON CONFLICT (name) DO NOTHING;
