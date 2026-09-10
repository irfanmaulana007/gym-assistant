package api_test

import (
	"io/fs"
	"strings"
	"testing"

	"github.com/irfanmaulana007/gym-assistant/apps/api/migrations"
)

// TestMigrationsEmbed guards the embedded migration set that both the server
// startup step and the `make migrate` command (cmd/migrate) apply. If the
// embed is empty or picks up non-SQL files, migrations would silently do
// nothing or fail — this fails fast instead.
func TestMigrationsEmbed(t *testing.T) {
	entries, err := fs.ReadDir(migrations.FS, ".")
	if err != nil {
		t.Fatalf("read embedded migrations: %v", err)
	}

	var sqlFiles []string
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasSuffix(name, ".sql") {
			sqlFiles = append(sqlFiles, name)
		}
	}

	if len(sqlFiles) == 0 {
		t.Fatal("no .sql migrations embedded in migrations.FS")
	}

	const first = "0001_initial_schema.sql"
	found := false
	for _, name := range sqlFiles {
		if name == first {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("embedded migrations %v missing expected %q", sqlFiles, first)
	}
}
