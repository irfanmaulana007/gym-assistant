package repository

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
)

// CatalogRepository reads the shared exercise catalog (global master data,
// PRD 0006). The catalog is read-only to users — seeded by migration — so this
// repository exposes only reads.
type CatalogRepository struct {
	pool *pgxpool.Pool
}

// NewCatalogRepository builds a CatalogRepository.
func NewCatalogRepository(pool *pgxpool.Pool) *CatalogRepository {
	return &CatalogRepository{pool: pool}
}

// CatalogListParams filters the catalog list. Empty fields mean "no filter".
type CatalogListParams struct {
	// Search matches the movement name case-insensitively (substring).
	Search string
	// MuscleGroup filters to entries whose primary muscle group equals it.
	MuscleGroup string
}

const catalogCols = `
	id, name, primary_muscle_group,
	COALESCE(secondary_muscle_groups, '{}')::text[] AS secondary_muscle_groups,
	default_measurement_type, created_at, updated_at`

func scanCatalogExercise(row pgx.Row) (*domain.CatalogExercise, error) {
	var c domain.CatalogExercise
	if err := row.Scan(
		&c.ID, &c.Name, &c.PrimaryMuscleGroup,
		&c.SecondaryMuscleGroups,
		&c.DefaultMeasurementType, &c.CreatedAt, &c.UpdatedAt,
	); err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if c.SecondaryMuscleGroups == nil {
		c.SecondaryMuscleGroups = []string{}
	}
	return &c, nil
}

// List returns catalog entries ordered by name, honoring the optional search and
// muscle-group filters. Filters are applied in SQL with parameterized queries.
func (r *CatalogRepository) List(ctx context.Context, params CatalogListParams) ([]domain.CatalogExercise, error) {
	const q = `
		SELECT ` + catalogCols + `
		FROM exercise_catalog
		WHERE ($1 = '' OR name ILIKE '%' || $1 || '%')
			AND ($2 = '' OR primary_muscle_group = $2::muscle_group)
		ORDER BY name`
	rows, err := r.pool.Query(ctx, q, params.Search, params.MuscleGroup)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.CatalogExercise{}
	for rows.Next() {
		c, err := scanCatalogExercise(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

// GetByID returns a single catalog entry. Missing -> ErrNotFound.
func (r *CatalogRepository) GetByID(ctx context.Context, id string) (*domain.CatalogExercise, error) {
	const q = `SELECT ` + catalogCols + ` FROM exercise_catalog WHERE id = $1`
	return scanCatalogExercise(r.pool.QueryRow(ctx, q, id))
}
