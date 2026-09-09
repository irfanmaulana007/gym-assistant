// Package domain holds plain entity/value types shared across layers. No HTTP,
// no SQL — just data.
package domain

import "time"

// User is an account owner; it scopes all other data.
type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // never serialized to clients
	DisplayName  string    `json:"display_name"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}
