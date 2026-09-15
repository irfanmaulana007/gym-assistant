// Package refreshtoken generates and hashes opaque refresh tokens (PRD 0010).
//
// A refresh token is 32 random bytes returned to the client exactly once. Only
// its SHA-256 hash is persisted, so a database leak cannot be replayed as a
// valid token. Lookups hash the presented raw value and match against the
// stored hash.
package refreshtoken

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
)

// rawBytes is the entropy of a raw token (256 bits).
const rawBytes = 32

// Generate returns a new random raw token (base64url, unpadded) and its hash.
// The raw value is shown to the client once; only the hash is stored.
func Generate() (raw, hash string, err error) {
	b := make([]byte, rawBytes)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	raw = base64.RawURLEncoding.EncodeToString(b)
	return raw, Hash(raw), nil
}

// Hash returns the hex-encoded SHA-256 of a raw token, used for both storage and
// lookup so the same raw value always maps to the same stored hash.
func Hash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
