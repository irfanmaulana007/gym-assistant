// Package optional provides a JSON value that distinguishes three states of a
// field in a PATCH body: absent (leave unchanged), explicit null (clear), and
// present with a value (set). Standard encoding/json collapses the first two to
// a nil pointer; PRD 0008's partial profile update needs to tell them apart so
// `avatar_url: null` can clear the avatar while an omitted field is untouched.
package optional

import (
	"bytes"
	"encoding/json"
)

// Value[T] captures whether a JSON field was present and, if so, whether it was
// null. The zero value is "absent".
type Value[T any] struct {
	Present bool // the key appeared in the JSON body
	Null    bool // the key appeared with an explicit null
	Val     T    // the decoded value (meaningful only when Present && !Null)
}

// UnmarshalJSON records presence/null and decodes the value when non-null.
func (o *Value[T]) UnmarshalJSON(b []byte) error {
	o.Present = true
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		o.Null = true
		return nil
	}
	return json.Unmarshal(b, &o.Val)
}

// Set reports whether the field carried a concrete value (present and not null).
func (o Value[T]) Set() bool { return o.Present && !o.Null }
