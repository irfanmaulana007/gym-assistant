// Package validate holds small, pure input validators shared by services. Each
// returns a human-readable message ("" when valid) so callers can assemble a
// field->message details map for the error envelope.
package validate

import (
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/vocab"
)

// Email reports a message if s is not a syntactically valid email address.
func Email(s string) string {
	if strings.TrimSpace(s) == "" {
		return "email is required"
	}
	if _, err := mail.ParseAddress(s); err != nil {
		return "email is not valid"
	}
	return ""
}

// Password enforces a minimum length. We deliberately keep the policy simple
// (length only) rather than imposing composition rules.
func Password(s string) string {
	if len(s) < 8 {
		return "password must be at least 8 characters"
	}
	if len(s) > 200 {
		return "password must be at most 200 characters"
	}
	return ""
}

// Required reports a message when s is empty or whitespace-only.
func Required(field, s string) string {
	if strings.TrimSpace(s) == "" {
		return field + " is required"
	}
	return ""
}

// MaxLen reports a message when s exceeds max runes.
func MaxLen(field, s string, max int) string {
	if len([]rune(s)) > max {
		return field + " is too long"
	}
	return ""
}

// NormalizeEmail lowercases and trims an email for consistent storage/uniqueness.
func NormalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// --- PRD 0008 profile-enrichment validators ---

// usernamePattern is the allowed username character set: lowercase letters,
// digits, underscore and dot (PRD 0008 §4.1).
var usernamePattern = regexp.MustCompile(`^[a-z0-9_.]+$`)

// NormalizeUsername lowercases and trims a username for consistent storage and
// uniqueness (usernames are stored lowercased).
func NormalizeUsername(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// NormalizeIdentifier trims and lowercases a login identifier (email or
// username) so both lookups are case-insensitive.
func NormalizeIdentifier(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// Username enforces the 3–30 char length and character set. Assumes the value
// is already normalized (lowercased/trimmed).
func Username(s string) string {
	n := len([]rune(s))
	if n < 3 {
		return "username must be at least 3 characters"
	}
	if n > 30 {
		return "username must be at most 30 characters"
	}
	if !usernamePattern.MatchString(s) {
		return "username may only contain lowercase letters, numbers, _ and ."
	}
	return ""
}

// Gender reports a message when s is not a recognized gender value.
func Gender(s string) string {
	if !vocab.IsGender(s) {
		return "unknown gender"
	}
	return ""
}

// FitnessGoal reports a message when s is not a recognized fitness goal.
func FitnessGoal(s string) string {
	if !vocab.IsFitnessGoal(s) {
		return "unknown fitness goal"
	}
	return ""
}

// ActivityLevel reports a message when s is not a recognized activity level.
func ActivityLevel(s string) string {
	if !vocab.IsActivityLevel(s) {
		return "unknown activity level"
	}
	return ""
}

// WeightUnit reports a message when s is not a valid weight unit (kg/lb).
func WeightUnit(s string) string {
	if !vocab.IsWeightUnit(s) {
		return "weight unit must be kg or lb"
	}
	return ""
}

// HeightUnit reports a message when s is not a valid height unit (cm/in).
func HeightUnit(s string) string {
	if !vocab.IsHeightUnit(s) {
		return "height unit must be cm or in"
	}
	return ""
}

// PositiveNumber reports a message when v is not strictly greater than zero.
func PositiveNumber(field string, v float64) string {
	if v <= 0 {
		return field + " must be greater than 0"
	}
	return ""
}

// dobLowerBound is the earliest plausible date of birth — anything before this
// is almost certainly a typo (no living user is ~150 years old).
var dobLowerBound = time.Date(1900, time.January, 1, 0, 0, 0, 0, time.UTC)

// DateOfBirth reports a message when dob is in the future or implausibly early.
// now is injected so the rule is deterministic in tests.
func DateOfBirth(dob, now time.Time) string {
	if dob.After(now) {
		return "date of birth cannot be in the future"
	}
	if dob.Before(dobLowerBound) {
		return "date of birth is not valid"
	}
	return ""
}

// dataURLImagePattern matches an image data URL (base64-encoded) — the avatar
// storage format for PRD 0008 §4.6.
var dataURLImagePattern = regexp.MustCompile(`^data:image/[a-zA-Z0-9.+-]+;base64,`)

// AvatarDataURL validates an avatar value: it must be a base64-encoded image
// data URL under maxBytes (measured on the whole string). maxBytes is the hard
// cap from PRD 0008 §4.6.
func AvatarDataURL(s string, maxBytes int) string {
	if !dataURLImagePattern.MatchString(s) {
		return "avatar must be a base64-encoded image data URL"
	}
	if len(s) > maxBytes {
		return "avatar image is too large"
	}
	return ""
}
