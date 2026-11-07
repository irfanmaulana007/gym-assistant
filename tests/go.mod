module github.com/irfanmaulana007/gym-assistant/tests

go 1.26

require (
	github.com/fergusstrange/embedded-postgres v1.34.0
	github.com/getsentry/sentry-go v0.50.0
	github.com/irfanmaulana007/gym-assistant/apps/api v0.0.0
	github.com/jackc/pgx/v5 v5.7.1
)

require (
	github.com/go-chi/chi/v5 v5.1.0 // indirect
	github.com/golang-jwt/jwt/v5 v5.3.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/xi2/xz v0.0.0-20171230120015-48954b6210f8 // indirect
	golang.org/x/crypto v0.31.0 // indirect
	golang.org/x/sync v0.22.0 // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.41.0 // indirect
)

replace github.com/irfanmaulana007/gym-assistant/apps/api => ../apps/api
