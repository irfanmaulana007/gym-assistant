package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

// RoutineRepository persists routines. Every method is scoped to a user_id so a
// client can never read or mutate another user's routines.
type RoutineRepository struct {
	pool *pgxpool.Pool
}

// NewRoutineRepository builds a RoutineRepository.
func NewRoutineRepository(pool *pgxpool.Pool) *RoutineRepository {
	return &RoutineRepository{pool: pool}
}

const routineCols = `id, user_id, name, notes, position, created_at, updated_at`

func scanRoutine(row pgx.Row) (*domain.Routine, error) {
	var r domain.Routine
	err := row.Scan(&r.ID, &r.UserID, &r.Name, &r.Notes, &r.Position, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

// ListByUser returns the user's routines ordered by position.
func (r *RoutineRepository) ListByUser(ctx context.Context, userID string) ([]domain.Routine, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+routineCols+` FROM routines WHERE user_id = $1 ORDER BY position, created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Routine{}
	for rows.Next() {
		var rt domain.Routine
		if err := rows.Scan(&rt.ID, &rt.UserID, &rt.Name, &rt.Notes, &rt.Position, &rt.CreatedAt, &rt.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, rt)
	}
	return out, rows.Err()
}

// Create inserts a routine at the end (max position + 1) for the user.
func (r *RoutineRepository) Create(ctx context.Context, userID, name, notes string) (*domain.Routine, error) {
	const q = `
		INSERT INTO routines (user_id, name, notes, position)
		VALUES ($1, $2, $3, COALESCE((SELECT MAX(position) + 1 FROM routines WHERE user_id = $1), 0))
		RETURNING ` + routineCols
	return scanRoutine(r.pool.QueryRow(ctx, q, userID, name, notes))
}

// GetByID returns a routine owned by the user, or ErrNotFound.
func (r *RoutineRepository) GetByID(ctx context.Context, userID, id string) (*domain.Routine, error) {
	const q = `SELECT ` + routineCols + ` FROM routines WHERE id = $1 AND user_id = $2`
	return scanRoutine(r.pool.QueryRow(ctx, q, id, userID))
}

// Update applies non-nil fields to a routine owned by the user.
func (r *RoutineRepository) Update(ctx context.Context, userID, id string, name, notes *string, position *int) (*domain.Routine, error) {
	const q = `
		UPDATE routines SET
			name = COALESCE($3, name),
			notes = COALESCE($4, notes),
			position = COALESCE($5, position),
			updated_at = now()
		WHERE id = $1 AND user_id = $2
		RETURNING ` + routineCols
	return scanRoutine(r.pool.QueryRow(ctx, q, id, userID, name, notes, position))
}

// Delete removes a routine owned by the user. Missing -> ErrNotFound.
func (r *RoutineRepository) Delete(ctx context.Context, userID, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM routines WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Reorder sets each routine's position to its index in orderedIDs. All IDs must
// belong to the user; the whole change is atomic.
func (r *RoutineRepository) Reorder(ctx context.Context, userID string, orderedIDs []string) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for i, id := range orderedIDs {
		tag, err := tx.Exec(ctx,
			`UPDATE routines SET position = $3, updated_at = now() WHERE id = $1 AND user_id = $2`,
			id, userID, i)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
	}
	return tx.Commit(ctx)
}
