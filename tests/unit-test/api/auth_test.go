package api_test

import (
	"testing"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/passwords"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/tokens"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
)

func TestPasswordHashAndVerify(t *testing.T) {
	hash, err := passwords.Hash("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "correct horse battery staple" {
		t.Fatal("hash must not equal plaintext")
	}
	if !passwords.Verify(hash, "correct horse battery staple") {
		t.Error("verify should succeed for correct password")
	}
	if passwords.Verify(hash, "wrong password") {
		t.Error("verify should fail for wrong password")
	}
}

func TestTokenIssueAndVerifyRoundTrip(t *testing.T) {
	iss := tokens.NewIssuer("a-very-secret-key", time.Hour)
	now := time.Now()

	tok, err := iss.Issue("user-123", now)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	sub, err := iss.Verify(tok)
	if err != nil {
		t.Fatalf("verify: %v", err)
	}
	if sub != "user-123" {
		t.Errorf("subject = %q, want user-123", sub)
	}
}

func TestTokenRejectsExpired(t *testing.T) {
	iss := tokens.NewIssuer("secret", -time.Minute) // already expired on issue
	tok, err := iss.Issue("u", time.Now())
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	if _, err := iss.Verify(tok); err == nil {
		t.Error("expected expired token to be rejected")
	}
}

func TestTokenRejectsWrongSecret(t *testing.T) {
	signer := tokens.NewIssuer("secret-a", time.Hour)
	verifier := tokens.NewIssuer("secret-b", time.Hour)
	tok, _ := signer.Issue("u", time.Now())
	if _, err := verifier.Verify(tok); err == nil {
		t.Error("expected token signed with a different secret to be rejected")
	}
}

func TestTokenRejectsGarbage(t *testing.T) {
	iss := tokens.NewIssuer("secret", time.Hour)
	if _, err := iss.Verify("not.a.jwt"); err == nil {
		t.Error("expected garbage token to be rejected")
	}
}

func TestValidators(t *testing.T) {
	if validate.Email("nope") == "" {
		t.Error("expected invalid email to report a message")
	}
	if validate.Email("a@b.com") != "" {
		t.Error("expected valid email to pass")
	}
	if validate.Password("short") == "" {
		t.Error("expected too-short password to report a message")
	}
	if validate.Password("longenough") != "" {
		t.Error("expected valid password to pass")
	}
	if got := validate.NormalizeEmail("  A@B.COM "); got != "a@b.com" {
		t.Errorf("NormalizeEmail = %q, want a@b.com", got)
	}
}
