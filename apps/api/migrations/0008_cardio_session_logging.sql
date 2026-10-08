-- Cardio session logging (PRD 0019): make the `distance` measurement type work
-- inside a workout session.
--
-- The template layer already supports distance (exercises.target_distance /
-- distance_unit, the catalog, describeTarget), but the session layer never did.
-- session_exercises had no distance-target columns, so a routine's "5 km" target
-- was dropped the moment a session started. set_entries could already store
-- distance / duration / incline but had nowhere to record heart rate.
--
-- All columns are additive and nullable; no backfill. Existing strength/duration
-- rows are unaffected.

-- Carry the per-workout distance target onto the session snapshot, mirroring the
-- exercises table so the start-session copy and ad-hoc picks can set it.
ALTER TABLE session_exercises
    ADD COLUMN target_distance NUMERIC(9,3),
    ADD COLUMN distance_unit   distance_unit;

-- Heart rate captured per logged bout. Average and max beats-per-minute.
ALTER TABLE set_entries
    ADD COLUMN avg_heart_rate INTEGER,
    ADD COLUMN max_heart_rate INTEGER;
