.PHONY: run dev migrate build fmt vet test tidy

# Load variables from .env (if present) so local targets pick up DATABASE_URL,
# JWT_SECRET, etc. without a separate `export`/`source` step. Ambient env still
# works when there is no .env file.
ifneq (,$(wildcard .env))
include .env
export
endif

GOBIN := $(shell go env GOPATH)/bin

run:
	go run ./cmd/server

# dev runs the server with hot reload via air (https://github.com/air-verse/air),
# rebuilding and restarting on source changes. Installs air on first use if it
# is not already on PATH.
dev:
	@command -v air >/dev/null 2>&1 || test -x "$(GOBIN)/air" || go install github.com/air-verse/air@latest
	@PATH="$(GOBIN):$$PATH" air

# migrate applies the embedded SQL migrations to $DATABASE_URL and exits
# (idempotent — already-applied migrations are skipped).
migrate:
	go run ./cmd/migrate

build:
	go build -o bin/server ./cmd/server

fmt:
	gofmt -l -w .

vet:
	go vet ./...

# Unit tests co-located with the API packages (fast, no DB).
test:
	go test ./...

tidy:
	go mod tidy
