package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

// UserRepository persists and retrieves users.
type UserRepository struct {
	pool *pgxpool.Pool
}

// NewUserRepository builds a UserRepository.
func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

// userCols is the full column list (order matters — scanUser mirrors it).
const userCols = `id, email, password_hash, display_name,
	username, full_name, gender, date_of_birth,
	body_weight, body_weight_unit, height, height_unit,
	fitness_goal, activity_level,
	preferred_weight_unit, preferred_height_unit, avatar_url,
	created_at, updated_at`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(
		&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName,
		&u.Username, &u.FullName, &u.Gender, &u.DateOfBirth,
		&u.BodyWeight, &u.BodyWeightUnit, &u.Height, &u.HeightUnit,
		&u.FitnessGoal, &u.ActivityLevel,
		&u.PreferredWeightUnit, &u.PreferredHeightUnit, &u.AvatarURL,
		&u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

// Create inserts a new user and returns the stored row. A duplicate email
// yields ErrConflict.
func (r *UserRepository) Create(ctx context.Context, email, passwordHash, displayName string, username *string) (*domain.User, error) {
	const q = `
		INSERT INTO users (email, password_hash, display_name, username)
		VALUES ($1, $2, $3, $4)
		RETURNING ` + userCols
	user, err := scanUser(r.pool.QueryRow(ctx, q, email, passwordHash, displayName, username))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
			return nil, ErrConflict
		}
		return nil, err
	}
	return user, nil
}

// GetByEmail looks up a user by (normalized) email. Missing -> ErrNotFound.
func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	const q = `SELECT ` + userCols + ` FROM users WHERE email = $1`
	return scanUser(r.pool.QueryRow(ctx, q, email))
}

// GetByEmailOrUsername resolves a login identifier to a user by matching either
// column in one parameterized query. The identifier is expected pre-normalized
// (trimmed + lowercased). Missing -> ErrNotFound.
func (r *UserRepository) GetByEmailOrUsername(ctx context.Context, identifier string) (*domain.User, error) {
	const q = `SELECT ` + userCols + ` FROM users WHERE email = $1 OR username = $1`
	return scanUser(r.pool.QueryRow(ctx, q, identifier))
}

// GetByID looks up a user by id. Missing -> ErrNotFound.
func (r *UserRepository) GetByID(ctx context.Context, id string) (*domain.User, error) {
	const q = `SELECT ` + userCols + ` FROM users WHERE id = $1`
	return scanUser(r.pool.QueryRow(ctx, q, id))
}

// UserUpdate is a partial profile update. For each column, Set* reports whether
// the field is part of this update; the paired value pointer is the new value
// (a nil pointer with Set* true clears the column to NULL). The service builds
// this after validating/normalizing the request.
type UserUpdate struct {
	SetUsername            bool
	Username               *string
	SetFullName            bool
	FullName               *string
	SetGender              bool
	Gender                 *string
	SetDateOfBirth         bool
	DateOfBirth            *time.Time
	SetBodyWeight          bool
	BodyWeight             *float64
	SetBodyWeightUnit      bool
	BodyWeightUnit         *string
	SetHeight              bool
	Height                 *float64
	SetHeightUnit          bool
	HeightUnit             *string
	SetFitnessGoal         bool
	FitnessGoal            *string
	SetActivityLevel       bool
	ActivityLevel          *string
	SetPreferredWeightUnit bool
	PreferredWeightUnit    *string
	SetPreferredHeightUnit bool
	PreferredHeightUnit    *string
	SetAvatarURL           bool
	AvatarURL              *string
}

// Update applies the present fields to a user scoped by id and returns the full
// updated row. A username unique-violation yields ErrConflict. When nothing is
// set it re-reads the row unchanged.
func (r *UserRepository) Update(ctx context.Context, userID string, in UserUpdate) (*domain.User, error) {
	sets := []string{}
	args := []any{}
	i := 1
	add := func(set bool, expr string, val any) {
		if !set {
			return
		}
		sets = append(sets, fmt.Sprintf(expr, i))
		args = append(args, val)
		i++
	}

	add(in.SetUsername, "username = $%d", in.Username)
	add(in.SetFullName, "full_name = $%d", in.FullName)
	add(in.SetGender, "gender = $%d", in.Gender)
	add(in.SetDateOfBirth, "date_of_birth = $%d", in.DateOfBirth)
	add(in.SetBodyWeight, "body_weight = $%d", in.BodyWeight)
	add(in.SetBodyWeightUnit, "body_weight_unit = $%d::weight_unit", in.BodyWeightUnit)
	add(in.SetHeight, "height = $%d", in.Height)
	add(in.SetHeightUnit, "height_unit = $%d::height_unit", in.HeightUnit)
	add(in.SetFitnessGoal, "fitness_goal = $%d", in.FitnessGoal)
	add(in.SetActivityLevel, "activity_level = $%d", in.ActivityLevel)
	add(in.SetPreferredWeightUnit, "preferred_weight_unit = $%d::weight_unit", in.PreferredWeightUnit)
	add(in.SetPreferredHeightUnit, "preferred_height_unit = $%d::height_unit", in.PreferredHeightUnit)
	add(in.SetAvatarURL, "avatar_url = $%d", in.AvatarURL)

	if len(sets) == 0 {
		return r.GetByID(ctx, userID)
	}

	sets = append(sets, "updated_at = now()")
	q := `UPDATE users SET ` + strings.Join(sets, ", ") +
		fmt.Sprintf(` WHERE id = $%d RETURNING `, i) + userCols
	args = append(args, userID)

	user, err := scanUser(r.pool.QueryRow(ctx, q, args...))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation (username)
			return nil, ErrConflict
		}
		return nil, err
	}
	return user, nil
}

// UpdatePasswordHash sets a new bcrypt hash for the user. Missing -> ErrNotFound.
func (r *UserRepository) UpdatePasswordHash(ctx context.Context, userID, hash string) error {
	tag, err := r.pool.Exec(ctx,
		`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, userID, hash)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
