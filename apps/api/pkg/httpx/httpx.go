// Package httpx holds reusable HTTP request/response helpers shared by handlers:
// the standard JSON error envelope, JSON encoding, and strict request decoding.
//
// It lives under pkg/ (not internal/) so it is importable by the repository's
// shared test suite under tests/.
package httpx

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

// Common, stable error codes returned in the envelope's `code` field.
const (
	CodeBadRequest    = "bad_request"
	CodeValidation    = "validation_error"
	CodeUnauthorized  = "unauthorized"
	CodeForbidden     = "forbidden"
	CodeNotFound      = "not_found"
	CodeConflict      = "conflict"
	CodeInternal      = "internal_error"
	CodeUnprocessable = "unprocessable"
)

// ErrorBody is the inner object of the error envelope.
type ErrorBody struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details,omitempty"`
}

// ErrorEnvelope is the consistent error shape every endpoint returns:
// {"error": {"code": "...", "message": "...", "details": {}}}.
type ErrorEnvelope struct {
	Error ErrorBody `json:"error"`
}

// APIError is an error carrying an HTTP status and a stable code so services can
// signal precise failures that handlers translate directly into the envelope.
type APIError struct {
	Status  int
	Code    string
	Message string
	Details map[string]any
}

func (e *APIError) Error() string { return fmt.Sprintf("%s: %s", e.Code, e.Message) }

// NewAPIError builds an APIError.
func NewAPIError(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

// WithDetails attaches a details map and returns the same error for chaining.
func (e *APIError) WithDetails(details map[string]any) *APIError {
	e.Details = details
	return e
}

// JSON writes v as a JSON response with the given status code.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if v == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes the standard error envelope with the given status and code.
func Error(w http.ResponseWriter, status int, code, message string, details map[string]any) {
	JSON(w, status, ErrorEnvelope{Error: ErrorBody{Code: code, Message: message, Details: details}})
}

// WriteError inspects err: if it is an *APIError its status/code/message/details
// are used; otherwise a generic 500 internal_error envelope is written (so
// internal error text never leaks to clients).
func WriteError(w http.ResponseWriter, err error) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		Error(w, apiErr.Status, apiErr.Code, apiErr.Message, apiErr.Details)
		return
	}
	Error(w, http.StatusInternalServerError, CodeInternal, "an unexpected error occurred", nil)
}

// DecodeJSON strictly decodes the request body into dst. Unknown fields and
// trailing data are rejected, and an empty body is a bad_request APIError.
func DecodeJSON(r *http.Request, dst any) error {
	if r.Body == nil {
		return NewAPIError(http.StatusBadRequest, CodeBadRequest, "request body is required")
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		if errors.Is(err, io.EOF) {
			return NewAPIError(http.StatusBadRequest, CodeBadRequest, "request body is required")
		}
		return NewAPIError(http.StatusBadRequest, CodeBadRequest, "invalid JSON: "+err.Error())
	}
	// Reject any trailing content after the first JSON value.
	if dec.More() {
		return NewAPIError(http.StatusBadRequest, CodeBadRequest, "request body must contain a single JSON object")
	}
	return nil
}
