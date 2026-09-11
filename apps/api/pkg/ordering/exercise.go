// Package ordering holds the pure, dependency-light rules for the order in which
// a routine's exercises are presented. Keeping the rule as a pure function lets
// the repository reuse it and the test module (which cannot import internal/)
// unit-test it directly.
package ordering

// ExerciseLess reports whether the exercise identified by (aMuscle, aName) sorts
// before the one identified by (bMuscle, bName) in a routine's exercise list:
// primary muscle group ASC, then exercise name ASC. Muscle groups must already
// be resolved to their concrete values (from the catalog when linked).
func ExerciseLess(aMuscle, aName, bMuscle, bName string) bool {
	if aMuscle != bMuscle {
		return aMuscle < bMuscle
	}
	return aName < bName
}
