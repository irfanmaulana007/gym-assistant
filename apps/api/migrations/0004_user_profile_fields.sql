-- 0004_user_profile_fields.sql
-- User profile enrichment (PRD 0008).
--
-- Grows the bare login identity (email, display_name) into a personal/health
-- profile: an optional unique username (login by username OR email), health
-- data (name, gender, DOB, body weight, height, goal, activity level), per-user
-- preferred display/input units, and an avatar. Every added column is nullable
-- or carries a DEFAULT, so the migration is backward compatible: existing rows
-- satisfy every constraint and the preference defaults backfill automatically.
--
-- Storage decision (PRD 0008 §4.1): weight and height each store a raw value
-- AND its unit rather than normalizing to a canonical unit, keeping "what the
-- user entered" faithful. Derived metrics convert at computation time.

-- Reuse the existing weight_unit enum ('kg','lb') for both the per-field body
-- weight and the preference column. Height needs its own unit enum.
CREATE TYPE height_unit AS ENUM ('cm', 'in');

ALTER TABLE users
    ADD COLUMN username              TEXT,
    ADD COLUMN full_name             TEXT,
    ADD COLUMN gender                TEXT,
    ADD COLUMN date_of_birth         DATE,
    ADD COLUMN body_weight           NUMERIC(6,2),
    ADD COLUMN body_weight_unit      weight_unit,
    ADD COLUMN height                NUMERIC(6,2),
    ADD COLUMN height_unit           height_unit,
    ADD COLUMN fitness_goal          TEXT,
    ADD COLUMN activity_level        TEXT,
    ADD COLUMN preferred_weight_unit weight_unit NOT NULL DEFAULT 'kg',
    ADD COLUMN preferred_height_unit height_unit NOT NULL DEFAULT 'cm',
    ADD COLUMN avatar_url            TEXT;

-- A value+unit pair must be complete: a body weight/height requires its unit,
-- and a stray unit without a value is rejected.
ALTER TABLE users
    ADD CONSTRAINT users_body_weight_unit_ck
        CHECK ((body_weight IS NULL) = (body_weight_unit IS NULL)),
    ADD CONSTRAINT users_height_unit_ck
        CHECK ((height IS NULL) = (height_unit IS NULL)),
    ADD CONSTRAINT users_body_weight_positive_ck
        CHECK (body_weight IS NULL OR body_weight > 0),
    ADD CONSTRAINT users_height_positive_ck
        CHECK (height IS NULL OR height > 0);

-- Enum guards at the DB level as a second line of defence behind service-layer
-- validation (both allow NULL, which means "not set").
ALTER TABLE users
    ADD CONSTRAINT users_gender_ck
        CHECK (gender IS NULL OR gender IN ('male', 'female', 'other', 'prefer_not_to_say')),
    ADD CONSTRAINT users_fitness_goal_ck
        CHECK (fitness_goal IS NULL OR fitness_goal IN ('lose_fat', 'build_muscle', 'maintain', 'gain_strength')),
    ADD CONSTRAINT users_activity_level_ck
        CHECK (activity_level IS NULL OR activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active'));

-- Partial-unique username: many users may have NULL usernames, but any set
-- username is globally unique. Stored lowercased by the service.
CREATE UNIQUE INDEX users_username_key ON users (username) WHERE username IS NOT NULL;
