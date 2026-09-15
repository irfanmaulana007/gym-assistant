package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

// RefreshTokenRepository persists and retrieves refresh tokens (PRD 0010).
type RefreshTokenRepository struct {
	pool *pgxpool.Pool
}

// NewRefreshTokenRepository builds a RefreshTokenRepository.
func NewRefreshTokenRepository(pool *pgxpool.Pool) *RefreshTokenRepository {
	return &RefreshTokenRepository{pool: pool}
}

const refreshTokenCols = `id, user_id, token_hash, expires_at, created_at, revoked_at`

func scanRefreshToken(row pgx.Row) (*domain.RefreshToken, error) {
	var rt domain.RefreshToken
	err := row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.CreatedAt, &rt.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &rt, nil
}

// Create stores a new refresh token (its hash) for a user and returns the row.
func (r *RefreshTokenRepository) Create(ctx context.Context, userID, tokenHash string, expiresAt time.Time) (*domain.RefreshToken, error) {
	const q = `
		INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
		VALUES ($1, $2, $3)
		RETURNING ` + refreshTokenCols
	return scanRefreshToken(r.pool.QueryRow(ctx, q, userID, tokenHash, expiresAt))
}

// GetByHash looks up a token by its stored hash. Missing -> ErrNotFound.
func (r *RefreshTokenRepository) GetByHash(ctx context.Context, tokenHash string) (*domain.RefreshToken, error) {
	const q = `SELECT ` + refreshTokenCols + ` FROM refresh_tokens WHERE token_hash = $1`
	return scanRefreshToken(r.pool.QueryRow(ctx, q, tokenHash))
}

// Revoke marks a single token revoked. Idempotent: revoking an already-revoked
// token is a no-op.
func (r *RefreshTokenRepository) Revoke(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, id)
	return err
}

// RevokeAllForUser revokes every active token for a user — used for reuse
// detection (token theft) and would back a future "log out everywhere" action.
func (r *RefreshTokenRepository) RevokeAllForUser(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, userID)
	return err
}
