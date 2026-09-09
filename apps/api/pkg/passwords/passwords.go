// Package passwords wraps bcrypt hashing/verification so callers never touch the
// crypto primitives directly. Plaintext passwords are never stored or logged.
package passwords

import "golang.org/x/crypto/bcrypt"

// Cost is the bcrypt work factor. 12 is a sensible default for interactive logins.
const Cost = 12

// Hash returns a bcrypt hash of the plaintext password.
func Hash(plaintext string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plaintext), Cost)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Verify reports whether plaintext matches the stored bcrypt hash.
func Verify(hash, plaintext string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plaintext)) == nil
}
