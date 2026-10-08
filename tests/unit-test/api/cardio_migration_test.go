package api_test

import (
	"io/fs"
	"strings"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/migrations"
)

// TestCardioLoggingMigration guards PRD 0019's schema change: migration 0008 must
// add the distance-target columns to session_exercises (so a routine's distance
// target survives the session snapshot) and the heart-rate columns to set_entries
// (so a logged cardio bout can record HR). A missing column here would surface far
// later as a scan/insert error against a real DB — this fails fast at unit level.
func TestCardioLoggingMigration(t *testing.T) {
	const name = "0008_cardio_session_logging.sql"
	data, err := fs.ReadFile(migrations.FS, name)
	if err != nil {
		t.Fatalf("read %s: %v", name, err)
	}
	sql := strings.ToLower(string(data))

	mustContain := []string{
		"alter table session_exercises",
		"target_distance",
		"distance_unit",
		"alter table set_entries",
		"avg_heart_rate",
		"max_heart_rate",
	}
	for _, needle := range mustContain {
		if !strings.Contains(sql, needle) {
			t.Errorf("migration %s is missing %q", name, needle)
		}
	}
}
