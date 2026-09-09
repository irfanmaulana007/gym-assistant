// Package repository is the data-access layer. It uses parameterized queries
// only and returns sentinel errors that services translate into API errors.
package repository

import "errors"

var (
	// ErrNotFound is returned when a row does not exist (or is not visible to
	// the scoping user).
	ErrNotFound = errors.New("not found")
	// ErrConflict is returned on a unique-constraint violation (e.g. duplicate
	// email).
	ErrConflict = errors.New("conflict")
)
