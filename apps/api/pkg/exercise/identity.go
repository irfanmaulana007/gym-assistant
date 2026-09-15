// Package exercise holds pure, dependency-light rules about exercise identity —
// specifically, whether two per-routine exercise rows represent the *same*
// movement so their weight history can be aggregated across workout groups
// (PRD 0014).
//
// A user may add the same movement (e.g. "Lateral Raise") to several routines
// (Push, Upper, …). Each add creates a separate `exercises` row, but the user
// thinks of them as one exercise with one progression. These functions define
// the single rule for "same exercise", kept pure so the repository reuses it and
// the test module (which cannot import internal/) can unit-test it directly.
package exercise

import "strings"

// NormalizeName folds a custom exercise name to its identity key: lowercased and
// with leading/trailing whitespace removed. It deliberately mirrors Postgres
// `lower(btrim(name))` so Go-side grouping and any SQL comparison agree.
func NormalizeName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

// SameIdentity reports whether two exercises are the same movement for the
// purpose of shared history:
//
//   - Both catalog-linked → same iff they point at the same catalog entry.
//   - Both custom (no link) → same iff their normalized names match.
//   - One linked and one custom → never the same (a deliberate link is a
//     stronger signal than an incidental name collision).
//
// catalogID is nil for a custom exercise and the catalog entry id otherwise.
func SameIdentity(catalogIDA *string, nameA string, catalogIDB *string, nameB string) bool {
	aLinked := catalogIDA != nil
	bLinked := catalogIDB != nil
	if aLinked != bLinked {
		return false
	}
	if aLinked {
		return *catalogIDA == *catalogIDB
	}
	return NormalizeName(nameA) == NormalizeName(nameB)
}
