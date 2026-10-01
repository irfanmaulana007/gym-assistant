-- Session-scoped catalog exercise (PRD 0017): let an exercise added on the spot
-- during a running session link to a shared catalog entry, exactly like a
-- routine exercise can (PRD 0006).
--
-- The row stays session-scoped — it keeps exercise_id = NULL (the ad-hoc rule,
-- so it never persists to the routine) — but a non-NULL catalog_exercise_id
-- gives it a shared movement identity, so its logged sets join that movement's
-- history and trend (PRD 0014). Nullable + no backfill: existing routine-snapshot
-- and legacy free-text ad-hoc rows keep catalog_exercise_id = NULL. ON DELETE SET
-- NULL mirrors exercises.catalog_exercise_id so removing a catalog entry never
-- deletes session history.
ALTER TABLE session_exercises
    ADD COLUMN catalog_exercise_id UUID REFERENCES exercise_catalog(id) ON DELETE SET NULL;

-- Index the resolved-catalog lookups used by shared history and the
-- active-session "last time" hint (PRD 0017 §4.3/§4.4).
CREATE INDEX idx_session_exercises_catalog ON session_exercises (catalog_exercise_id)
    WHERE catalog_exercise_id IS NOT NULL;
