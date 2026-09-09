// Package validate holds small, pure input validators shared by services. Each
// returns a human-readable message ("" when valid) so callers can assemble a
// field->message details map for the error envelope.
package validate

import (
	"net/mail"
	"strings"
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
