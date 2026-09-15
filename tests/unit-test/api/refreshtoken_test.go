package api_test

import (
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/refreshtoken"
)

// TestRefreshTokenGenerateHashesRaw verifies Generate returns a raw token whose
// hash matches Hash(raw), and that the stored hash never equals the raw value.
func TestRefreshTokenGenerateHashesRaw(t *testing.T) {
	raw, hash, err := refreshtoken.Generate()
	if err != nil {
		t.Fatalf("generate: %v", err)
	}
	if raw == "" || hash == "" {
		t.Fatal("generate returned an empty raw or hash")
	}
	if raw == hash {
		t.Fatal("stored hash must not equal the raw token")
	}
	if got := refreshtoken.Hash(raw); got != hash {
		t.Errorf("Hash(raw) = %q, want %q", got, hash)
	}
}

// TestRefreshTokenHashDeterministic verifies the same raw always hashes the same
// (so lookups by hash work) and different raws hash differently.
func TestRefreshTokenHashDeterministic(t *testing.T) {
	if refreshtoken.Hash("abc") != refreshtoken.Hash("abc") {
		t.Error("Hash must be deterministic for the same input")
	}
	if refreshtoken.Hash("abc") == refreshtoken.Hash("abd") {
		t.Error("Hash must differ for different inputs")
	}
}

// TestRefreshTokenGenerateUnique verifies successive Generate calls produce
// distinct tokens (256 bits of entropy — collisions are effectively impossible).
func TestRefreshTokenGenerateUnique(t *testing.T) {
	seen := make(map[string]struct{}, 100)
	for i := 0; i < 100; i++ {
		raw, _, err := refreshtoken.Generate()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		if _, dup := seen[raw]; dup {
			t.Fatalf("duplicate raw token generated: %q", raw)
		}
		seen[raw] = struct{}{}
	}
}
