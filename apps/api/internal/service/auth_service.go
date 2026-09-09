// Package service holds business rules. No HTTP, no raw SQL — it orchestrates
// repositories and pure helpers, and returns *httpx.APIError for precise
// client-facing failures.
package service

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/repository"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/passwords"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/tokens"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
)

// userRepo is the subset of the user repository AuthService needs.
type userRepo interface {
	Create(ctx context.Context, email, passwordHash, displayName string) (*domain.User, error)
	GetByEmail(ctx context.Context, email string) (*domain.User, error)
	GetByID(ctx context.Context, id string) (*domain.User, error)
}

// clock returns the current time; injectable for deterministic tests.
type clock func() time.Time

// AuthService implements registration, login, and profile lookup.
type AuthService struct {
	users  userRepo
	issuer *tokens.Issuer
	now    clock
}

// NewAuthService builds an AuthService.
func NewAuthService(users userRepo, issuer *tokens.Issuer) *AuthService {
	return &AuthService{users: users, issuer: issuer, now: time.Now}
}

// AuthResult bundles an issued token with the authenticated user.
type AuthResult struct {
	Token string
	User  *domain.User
}

// Register validates input, creates the user with a hashed password, and issues
// a token. A duplicate email is a 409 conflict.
func (s *AuthService) Register(ctx context.Context, email, password, displayName string) (*AuthResult, error) {
	email = validate.NormalizeEmail(email)
	details := map[string]any{}
	if msg := validate.Email(email); msg != "" {
		details["email"] = msg
	}
	if msg := validate.Password(password); msg != "" {
		details["password"] = msg
	}
	if msg := validate.Required("display_name", displayName); msg != "" {
		details["display_name"] = msg
	} else if msg := validate.MaxLen("display_name", displayName, 100); msg != "" {
		details["display_name"] = msg
	}
	if len(details) > 0 {
		return nil, httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation, "invalid registration input").WithDetails(details)
	}

	hash, err := passwords.Hash(password)
	if err != nil {
		return nil, err
	}
	user, err := s.users.Create(ctx, email, hash, displayName)
	if err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, "an account with this email already exists")
		}
		return nil, err
	}
	return s.issueFor(user)
}

// Login verifies credentials and issues a token. Invalid email or password both
// return the same 401 so the endpoint does not reveal which accounts exist.
func (s *AuthService) Login(ctx context.Context, email, password string) (*AuthResult, error) {
	email = validate.NormalizeEmail(email)
	user, err := s.users.GetByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, invalidCredentials()
		}
		return nil, err
	}
	if !passwords.Verify(user.PasswordHash, password) {
		return nil, invalidCredentials()
	}
	return s.issueFor(user)
}

// Me returns the user for the given id.
func (s *AuthService) Me(ctx context.Context, userID string) (*domain.User, error) {
	user, err := s.users.GetByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrNotFound) {
			return nil, httpx.NewAPIError(http.StatusNotFound, httpx.CodeNotFound, "user not found")
		}
		return nil, err
	}
	return user, nil
}

func (s *AuthService) issueFor(user *domain.User) (*AuthResult, error) {
	token, err := s.issuer.Issue(user.ID, s.now())
	if err != nil {
		return nil, err
	}
	return &AuthResult{Token: token, User: user}, nil
}

func invalidCredentials() error {
	return httpx.NewAPIError(http.StatusUnauthorized, httpx.CodeUnauthorized, "invalid email or password")
}
