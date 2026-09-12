package api_test

import (
	"strings"
	"testing"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/units"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
)

func TestUsernameValidation(t *testing.T) {
	cases := []struct {
		name  string
		in    string
		valid bool
	}{
		{"ok simple", "irfan", true},
		{"ok with dot and underscore", "irfan_m.007", true},
		{"too short", "ab", false},
		{"too long", strings.Repeat("a", 31), false},
		{"uppercase rejected", "Irfan", false},
		{"space rejected", "irfan m", false},
		{"symbol rejected", "irfan!", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			msg := validate.Username(tc.in)
			if tc.valid && msg != "" {
				t.Fatalf("expected %q valid, got %q", tc.in, msg)
			}
			if !tc.valid && msg == "" {
				t.Fatalf("expected %q invalid", tc.in)
			}
		})
	}
}

func TestNormalizeUsername(t *testing.T) {
	if got := validate.NormalizeUsername("  Irfan_M  "); got != "irfan_m" {
		t.Fatalf("NormalizeUsername = %q, want irfan_m", got)
	}
}

func TestEnumValidators(t *testing.T) {
	if validate.Gender("male") != "" || validate.Gender("prefer_not_to_say") != "" {
		t.Fatal("valid genders rejected")
	}
	if validate.Gender("banana") == "" {
		t.Fatal("invalid gender accepted")
	}
	if validate.FitnessGoal("build_muscle") != "" || validate.FitnessGoal("nope") == "" {
		t.Fatal("fitness goal validation wrong")
	}
	if validate.ActivityLevel("very_active") != "" || validate.ActivityLevel("nope") == "" {
		t.Fatal("activity level validation wrong")
	}
	if validate.WeightUnit("kg") != "" || validate.WeightUnit("lb") != "" || validate.WeightUnit("stone") == "" {
		t.Fatal("weight unit validation wrong")
	}
	if validate.HeightUnit("cm") != "" || validate.HeightUnit("in") != "" || validate.HeightUnit("ft") == "" {
		t.Fatal("height unit validation wrong")
	}
}

func TestPositiveNumber(t *testing.T) {
	if validate.PositiveNumber("body_weight", 72.5) != "" {
		t.Fatal("positive number rejected")
	}
	if validate.PositiveNumber("body_weight", 0) == "" || validate.PositiveNumber("body_weight", -1) == "" {
		t.Fatal("non-positive number accepted")
	}
}

func TestDateOfBirth(t *testing.T) {
	now := time.Date(2026, time.September, 12, 0, 0, 0, 0, time.UTC)
	if msg := validate.DateOfBirth(time.Date(1990, 5, 15, 0, 0, 0, 0, time.UTC), now); msg != "" {
		t.Fatalf("valid DOB rejected: %s", msg)
	}
	if validate.DateOfBirth(now.AddDate(1, 0, 0), now) == "" {
		t.Fatal("future DOB accepted")
	}
	if validate.DateOfBirth(time.Date(1800, 1, 1, 0, 0, 0, 0, time.UTC), now) == "" {
		t.Fatal("implausibly early DOB accepted")
	}
}

func TestAvatarDataURL(t *testing.T) {
	const cap = 100
	if validate.AvatarDataURL("data:image/png;base64,AAAA", cap) != "" {
		t.Fatal("valid image data URL rejected")
	}
	if validate.AvatarDataURL("data:text/plain;base64,AAAA", cap) == "" {
		t.Fatal("non-image data URL accepted")
	}
	if validate.AvatarDataURL("https://example.com/a.png", cap) == "" {
		t.Fatal("plain URL accepted as avatar")
	}
	oversized := "data:image/png;base64," + strings.Repeat("A", cap)
	if validate.AvatarDataURL(oversized, cap) == "" {
		t.Fatal("oversized avatar accepted")
	}
}

func TestConvertWeight(t *testing.T) {
	if got := units.ConvertWeight(100, "kg", "lb"); got != 220.5 {
		t.Fatalf("100kg -> %v lb, want 220.5", got)
	}
	if got := units.ConvertWeight(220.5, "lb", "kg"); got != 100 {
		t.Fatalf("220.5lb -> %v kg, want ~100", got)
	}
	if got := units.ConvertWeight(60, "kg", "kg"); got != 60 {
		t.Fatalf("same-unit weight changed: %v", got)
	}
}

func TestConvertHeight(t *testing.T) {
	if got := units.ConvertHeight(180, "cm", "in"); got != 70.9 {
		t.Fatalf("180cm -> %v in, want 70.9", got)
	}
	if got := units.ConvertHeight(70.9, "in", "cm"); got != 180.1 {
		t.Fatalf("70.9in -> %v cm, want ~180", got)
	}
	if got := units.ConvertHeight(175, "cm", "cm"); got != 175 {
		t.Fatalf("same-unit height changed: %v", got)
	}
}
