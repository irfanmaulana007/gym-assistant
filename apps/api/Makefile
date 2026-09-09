.PHONY: run build fmt vet test tidy

run:
	go run ./cmd/server

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
