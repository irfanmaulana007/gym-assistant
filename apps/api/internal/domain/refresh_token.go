package domain

import "time"

// RefreshToken is a long-lived, opaque credential that mints fresh access
// tokens without re-login (PRD 0010). Only the SHA-256 hash of the raw token is
// stored; the raw value never lives in the database. A nil RevokedAt means the
// token is still active.
type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	CreatedAt time.Time
	RevokedAt *time.Time
}
