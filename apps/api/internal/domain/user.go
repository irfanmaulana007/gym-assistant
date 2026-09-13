// Package domain holds plain entity/value types shared across layers. No HTTP,
// no SQL — just data.
package domain

import "time"

// User is an account owner; it scopes all other data.
//
// Beyond the login identity (email, display_name) it carries the optional
// personal/health profile added by PRD 0008. Nullable fields are pointers so
// they serialize as JSON null when unset, mirroring the web `| null` types.
// Age is deliberately NOT stored — it is derived from DateOfBirth at display
// time.
type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"` // never serialized to clients
	DisplayName  string `json:"display_name"`

	// Identity & health data (all optional).
	Username       *string    `json:"username"`
	FullName       *string    `json:"full_name"`
	Gender         *string    `json:"gender"`
	DateOfBirth    *time.Time `json:"date_of_birth"`
	BodyWeight     *float64   `json:"body_weight"`
	BodyWeightUnit *string    `json:"body_weight_unit"`
	Height         *float64   `json:"height"`
	HeightUnit     *string    `json:"height_unit"`
	FitnessGoal    *string    `json:"fitness_goal"`
	ActivityLevel  *string    `json:"activity_level"`

	// Unit preferences (never null; default kg/cm).
	PreferredWeightUnit string `json:"preferred_weight_unit"`
	PreferredHeightUnit string `json:"preferred_height_unit"`

	// Avatar (data URL now, object-storage URL later — PRD 0008 §4.6).
	AvatarURL *string `json:"avatar_url"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
