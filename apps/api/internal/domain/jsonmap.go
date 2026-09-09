package domain

import (
	"database/sql/driver"
	"encoding/json"
	"errors"
)

// JSONMap is a free-form JSON object stored in a JSONB column. It implements
// driver.Valuer and sql.Scanner so pgx round-trips it reliably as JSON.
type JSONMap map[string]any

// Value encodes the map as JSON for storage. A nil map stores "{}".
func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return []byte("{}"), nil
	}
	return json.Marshal(m)
}

// Scan decodes JSONB (text or bytes) into the map.
func (m *JSONMap) Scan(src any) error {
	if src == nil {
		*m = JSONMap{}
		return nil
	}
	var data []byte
	switch v := src.(type) {
	case []byte:
		data = v
	case string:
		data = []byte(v)
	default:
		return errors.New("JSONMap: unsupported scan source")
	}
	if len(data) == 0 {
		*m = JSONMap{}
		return nil
	}
	return json.Unmarshal(data, m)
}
