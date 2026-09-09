// Package config loads runtime configuration from environment variables.
// Secrets never have hardcoded defaults — see .env.example for the contract.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"time"
)

// Config holds all runtime configuration for the API server.
type Config struct {
	// Env is the deployment environment: "development", "test", or "production".
	Env string
	// Port the HTTP server listens on.
	Port int
	// DatabaseURL is the PostgreSQL connection string.
	DatabaseURL string
	// JWTSecret signs and verifies access tokens. Required, no default.
	JWTSecret string
	// AccessTokenTTL is how long an issued access token stays valid.
	AccessTokenTTL time.Duration
}

// Load reads configuration from the environment and validates it.
// It returns an error listing every missing/invalid required variable so the
// operator can fix them all at once, rather than failing one at a time.
func Load() (*Config, error) {
	var problems []string

	cfg := &Config{
		Env:         getEnv("APP_ENV", "development"),
		DatabaseURL: os.Getenv("DATABASE_URL"),
		JWTSecret:   os.Getenv("JWT_SECRET"),
	}

	port, err := getEnvInt("PORT", 8080)
	if err != nil {
		problems = append(problems, err.Error())
	}
	cfg.Port = port

	ttlMinutes, err := getEnvInt("ACCESS_TOKEN_TTL_MINUTES", 60)
	if err != nil {
		problems = append(problems, err.Error())
	}
	cfg.AccessTokenTTL = time.Duration(ttlMinutes) * time.Minute

	if cfg.DatabaseURL == "" {
		problems = append(problems, "DATABASE_URL is required")
	}
	if cfg.JWTSecret == "" {
		problems = append(problems, "JWT_SECRET is required")
	}

	if len(problems) > 0 {
		return nil, fmt.Errorf("invalid configuration: %v", problems)
	}
	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) (int, error) {
	v := os.Getenv(key)
	if v == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, errors.New(key + " must be an integer")
	}
	return n, nil
}
