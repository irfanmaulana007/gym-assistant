package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/exercise"
)

// The "last set to beat" (PRD 0016) is shared across every routine that contains
// the same movement, exactly like exercise history: a set logged for "Lateral
// Raise" in one routine seeds the starting weight when the same movement is
// performed in another. The helpers below let both LastSetsByRoutine and
// LastSetsBeforeSession fetch candidate sets from all peer exercises (same
// identity) and then attribute them back to the target exercise ids the caller
// displays. Identity is "catalog id, else normalized name" (exercise.IdentityKey).

// userExerciseIdentities maps every exercise the user owns to its movement
// identity key, and inverts that to the exercise ids per key. Both views are
// small (a user's own exercises) and drive peer discovery without a second DB
// round-trip per exercise.
type userExerciseIdentities struct {
	keyByExercise map[string]string   // exercise id -> identity key
	idsByKey      map[string][]string // identity key -> exercise ids
}

// loadUserExerciseIdentities reads all of the user's exercises and buckets them
// by movement identity. Ownership is enforced by joining routines.user_id.
func loadUserExerciseIdentities(ctx context.Context, pool *pgxpool.Pool, userID string) (userExerciseIdentities, error) {
	rows, err := pool.Query(ctx, `
		SELECT e.id, e.catalog_exercise_id, e.name
		FROM exercises e
		JOIN routines rt ON rt.id = e.routine_id
		WHERE rt.user_id = $1`, userID)
	if err != nil {
		return userExerciseIdentities{}, err
	}
	defer rows.Close()

	ids := userExerciseIdentities{
		keyByExercise: map[string]string{},
		idsByKey:      map[string][]string{},
	}
	for rows.Next() {
		var id string
		var catalogID *string
		var name string
		if err := rows.Scan(&id, &catalogID, &name); err != nil {
			return userExerciseIdentities{}, err
		}
		key := exercise.IdentityKey(catalogID, name)
		ids.keyByExercise[id] = key
		ids.idsByKey[key] = append(ids.idsByKey[key], id)
	}
	return ids, rows.Err()
}

// peerIDsForTargets returns the union of exercise ids that share identity with
// any of the target exercises — i.e. every exercise whose logged sets are
// candidates for the targets' "last set". Order is unspecified.
func (u userExerciseIdentities) peerIDsForTargets(targetIDs []string) []string {
	wantedKeys := map[string]struct{}{}
	for _, id := range targetIDs {
		if key, ok := u.keyByExercise[id]; ok {
			wantedKeys[key] = struct{}{}
		}
	}
	peers := []string{}
	for key := range wantedKeys {
		peers = append(peers, u.idsByKey[key]...)
	}
	return peers
}

// retagByIdentity re-attributes candidate set rows (each tagged with its source
// exercise id) to every target exercise that shares the source's identity. The
// caller then reduces the result per target id (indexLastSets) — so a set logged
// under the same movement in another routine becomes the target's last set.
func (u userExerciseIdentities) retagByIdentity(candidates []LastSetRow, targetIDs []string) []LastSetRow {
	targetsByKey := map[string][]string{}
	for _, id := range targetIDs {
		if key, ok := u.keyByExercise[id]; ok {
			targetsByKey[key] = append(targetsByKey[key], id)
		}
	}

	out := []LastSetRow{}
	for _, c := range candidates {
		key, ok := u.keyByExercise[c.ExerciseID]
		if !ok {
			continue
		}
		for _, targetID := range targetsByKey[key] {
			rc := c
			rc.ExerciseID = targetID
			out = append(out, rc)
		}
	}
	return out
}
