package service

import (
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/overload"
)

// indexLastSets reduces candidate set rows to each exercise's "last set to
// beat" — the heaviest set of its most recent session — keyed by exercise id.
// The progression rule itself lives in pkg/overload.LastTopSet; this just groups
// by exercise and carries the weight unit / date of the winning set through.
func indexLastSets(rows []repository.LastSetRow) map[string]domain.LastSet {
	byExercise := map[string][]repository.LastSetRow{}
	for _, r := range rows {
		byExercise[r.ExerciseID] = append(byExercise[r.ExerciseID], r)
	}

	out := make(map[string]domain.LastSet, len(byExercise))
	for exerciseID, candidates := range byExercise {
		sets := make([]overload.SessionSet, 0, len(candidates))
		for _, c := range candidates {
			sets = append(sets, overload.SessionSet{
				SessionID:   c.SessionID,
				PerformedAt: c.PerformedAt,
				Weight:      c.Weight,
				Reps:        c.Reps,
			})
		}
		top, ok := overload.LastTopSet(sets)
		if !ok {
			continue
		}
		// Recover the unit and date from the winning row. The winner is the top
		// set of the most recent session, so among rows matching (weight, reps)
		// take the latest — an equal set in an older session must not win the date.
		last := domain.LastSet{Weight: top.Weight, WeightUnit: "kg", Reps: top.Reps}
		matched := false
		for _, c := range candidates {
			if c.Weight != top.Weight || c.Reps != top.Reps {
				continue
			}
			if !matched || c.PerformedAt.After(last.PerformedAt) {
				last.WeightUnit = c.WeightUnit
				last.PerformedAt = c.PerformedAt
				matched = true
			}
		}
		out[exerciseID] = last
	}
	return out
}
