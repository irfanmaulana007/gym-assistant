-- Refresh tokens (PRD 0010): long-lived, opaque, rotated-on-use, revocable
-- credentials that mint fresh access tokens without re-login.
--
-- The raw token is never stored — only its SHA-256 hash — so a database leak
-- cannot be replayed. Rotation revokes the old row and inserts a new one; a
-- NULL revoked_at means the token is still active.
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id);
