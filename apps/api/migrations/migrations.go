// Package migrations embeds the ordered SQL migration files so the migration
// runner can apply them from a single binary. The .sql files remain the source
// of truth and are applied in lexical filename order.
package migrations

import "embed"

// FS holds every migration SQL file at its root.
//
//go:embed *.sql
var FS embed.FS
