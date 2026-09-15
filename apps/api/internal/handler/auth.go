package handler

import (
	"context"
	"net/http"

	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/domain"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/middleware"
	"github.com/irfanmaulana007/gym-assistant/apps/api/internal/service"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/httpx"
)

// authService is the behavior the auth handler needs from the service layer.
type authService interface {
	Register(ctx context.Context, email, password, displayName string, username *string) (*service.AuthResult, error)
	Login(ctx context.Context, identifier, password string) (*service.AuthResult, error)
	Refresh(ctx context.Context, refreshToken string) (*service.AuthResult, error)
	Logout(ctx context.Context, refreshToken string) error
	Me(ctx context.Context, userID string) (*domain.User, error)
	UpdateProfile(ctx context.Context, userID string, in service.ProfileUpdate) (*domain.User, error)
	ChangePassword(ctx context.Context, userID, current, next string) error
}

// AuthHandler handles auth endpoints.
type AuthHandler struct {
	svc authService
}

// NewAuthHandler builds an AuthHandler.
func NewAuthHandler(svc authService) *AuthHandler {
	return &AuthHandler{svc: svc}
}

type registerRequest struct {
	Email       string  `json:"email"`
	Password    string  `json:"password"`
	DisplayName string  `json:"display_name"`
	Username    *string `json:"username"`
}

type loginRequest struct {
	// Identifier is the preferred field: an email OR a username. Email is
	// accepted for backward compatibility and maps to Identifier when set.
	Identifier string `json:"identifier"`
	Email      string `json:"email"`
	Password   string `json:"password"`
}

func (req loginRequest) identifier() string {
	if req.Identifier != "" {
		return req.Identifier
	}
	return req.Email
}

type changePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

type authResponse struct {
	Token        string       `json:"token"`
	RefreshToken string       `json:"refresh_token"`
	User         *domain.User `json:"user"`
}

// Register creates an account and returns a token.
func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Register(r.Context(), req.Email, req.Password, req.DisplayName, req.Username)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusCreated, authResponse{Token: res.Token, RefreshToken: res.RefreshToken, User: res.User})
}

// Login exchanges credentials for a token.
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Login(r.Context(), req.identifier(), req.Password)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, authResponse{Token: res.Token, RefreshToken: res.RefreshToken, User: res.User})
}

// Refresh exchanges a valid refresh token for a new access+refresh pair. The
// presented token is rotated (single-use); the endpoint is public because the
// access token may already be expired.
func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	res, err := h.svc.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, authResponse{Token: res.Token, RefreshToken: res.RefreshToken, User: res.User})
}

// Logout revokes the given refresh token. Idempotent; always returns 204.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.Logout(r.Context(), req.RefreshToken); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}

// Me returns the authenticated user's profile.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "authentication required", nil)
		return
	}
	user, err := h.svc.Me(r.Context(), userID)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

// UpdateProfile applies a partial update to the authenticated user's profile.
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "authentication required", nil)
		return
	}
	var req service.ProfileUpdate
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	user, err := h.svc.UpdateProfile(r.Context(), userID, req)
	if err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusOK, user)
}

// ChangePassword verifies the current password and sets a new one.
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, httpx.CodeUnauthorized, "authentication required", nil)
		return
	}
	var req changePasswordRequest
	if err := httpx.DecodeJSON(r, &req); err != nil {
		httpx.WriteError(w, err)
		return
	}
	if err := h.svc.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword); err != nil {
		httpx.WriteError(w, err)
		return
	}
	httpx.JSON(w, http.StatusNoContent, nil)
}
