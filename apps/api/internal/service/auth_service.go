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
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/optional"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/passwords"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/tokens"
	"github.com/irfanmaulana007/gym-assistant/apps/api/pkg/validate"
)

// avatarMaxBytes caps the stored avatar data URL (PRD 0008 §4.6: ≤ ~200 KB).
const avatarMaxBytes = 200 * 1024

// userRepo is the subset of the user repository AuthService needs.
type userRepo interface {
	Create(ctx context.Context, email, passwordHash, displayName string, username *string) (*domain.User, error)
	GetByEmailOrUsername(ctx context.Context, identifier string) (*domain.User, error)
	GetByID(ctx context.Context, id string) (*domain.User, error)
	Update(ctx context.Context, userID string, in repository.UserUpdate) (*domain.User, error)
	UpdatePasswordHash(ctx context.Context, userID, hash string) error
}

// clock returns the current time; injectable for deterministic tests.
type clock func() time.Time

// AuthService implements registration, login, profile lookup/update, and
// password change.
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
// a token. A duplicate email or username is a 409 conflict. Username is
// optional; when omitted the account has no handle and logs in by email only.
func (s *AuthService) Register(ctx context.Context, email, password, displayName string, username *string) (*AuthResult, error) {
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

	var normUsername *string
	if username != nil && *username != "" {
		u := validate.NormalizeUsername(*username)
		if msg := validate.Username(u); msg != "" {
			details["username"] = msg
		} else {
			normUsername = &u
		}
	}

	if len(details) > 0 {
		return nil, httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation, "invalid registration input").WithDetails(details)
	}

	hash, err := passwords.Hash(password)
	if err != nil {
		return nil, err
	}
	user, err := s.users.Create(ctx, email, hash, displayName, normUsername)
	if err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, "an account with this email or username already exists")
		}
		return nil, err
	}
	return s.issueFor(user)
}

// Login verifies credentials and issues a token. The identifier is an email OR
// a username. An unknown identifier and a wrong password both return the same
// 401 so the endpoint does not reveal which accounts exist.
func (s *AuthService) Login(ctx context.Context, identifier, password string) (*AuthResult, error) {
	identifier = validate.NormalizeIdentifier(identifier)
	user, err := s.users.GetByEmailOrUsername(ctx, identifier)
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

// ProfileUpdate is the wire+service shape of a partial profile update. Every
// field is optional; an absent field is left unchanged, an explicit null clears
// a nullable field, and the preference fields cannot be cleared to null. It is
// decoded directly from the PATCH body (json tags below).
type ProfileUpdate struct {
	Username            optional.Value[string]  `json:"username"`
	FullName            optional.Value[string]  `json:"full_name"`
	Gender              optional.Value[string]  `json:"gender"`
	DateOfBirth         optional.Value[string]  `json:"date_of_birth"`
	BodyWeight          optional.Value[float64] `json:"body_weight"`
	BodyWeightUnit      optional.Value[string]  `json:"body_weight_unit"`
	Height              optional.Value[float64] `json:"height"`
	HeightUnit          optional.Value[string]  `json:"height_unit"`
	FitnessGoal         optional.Value[string]  `json:"fitness_goal"`
	ActivityLevel       optional.Value[string]  `json:"activity_level"`
	PreferredWeightUnit optional.Value[string]  `json:"preferred_weight_unit"`
	PreferredHeightUnit optional.Value[string]  `json:"preferred_height_unit"`
	AvatarURL           optional.Value[string]  `json:"avatar_url"`
}

// UpdateProfile validates a partial update, normalizes value+unit pairings, and
// persists it scoped to userID. A username conflict is a 409; field errors are
// a 422. It returns the full updated user.
func (s *AuthService) UpdateProfile(ctx context.Context, userID string, in ProfileUpdate) (*domain.User, error) {
	current, err := s.Me(ctx, userID)
	if err != nil {
		return nil, err
	}

	details := map[string]any{}
	upd := repository.UserUpdate{}

	// Username — normalize + validate; null clears the handle.
	if in.Username.Present {
		if in.Username.Null {
			upd.SetUsername, upd.Username = true, nil
		} else {
			u := validate.NormalizeUsername(in.Username.Val)
			if msg := validate.Username(u); msg != "" {
				details["username"] = msg
			} else {
				upd.SetUsername, upd.Username = true, &u
			}
		}
	}

	// Full name — free text, max 100; null clears.
	if in.FullName.Present {
		if in.FullName.Null {
			upd.SetFullName, upd.FullName = true, nil
		} else {
			v := in.FullName.Val
			if msg := validate.MaxLen("full_name", v, 100); msg != "" {
				details["full_name"] = msg
			} else {
				upd.SetFullName, upd.FullName = true, &v
			}
		}
	}

	// Enum-validated identity fields.
	applyEnum(&in.Gender, validate.Gender, "gender", details, &upd.SetGender, &upd.Gender)
	applyEnum(&in.FitnessGoal, validate.FitnessGoal, "fitness_goal", details, &upd.SetFitnessGoal, &upd.FitnessGoal)
	applyEnum(&in.ActivityLevel, validate.ActivityLevel, "activity_level", details, &upd.SetActivityLevel, &upd.ActivityLevel)

	// Date of birth — parse YYYY-MM-DD; null clears.
	if in.DateOfBirth.Present {
		if in.DateOfBirth.Null {
			upd.SetDateOfBirth, upd.DateOfBirth = true, nil
		} else {
			dob, perr := time.Parse("2006-01-02", in.DateOfBirth.Val)
			if perr != nil {
				details["date_of_birth"] = "date of birth must be YYYY-MM-DD"
			} else if msg := validate.DateOfBirth(dob, s.now()); msg != "" {
				details["date_of_birth"] = msg
			} else {
				upd.SetDateOfBirth, upd.DateOfBirth = true, &dob
			}
		}
	}

	// Body weight value + unit pairing.
	applyMeasure(&in.BodyWeight, &in.BodyWeightUnit, validate.WeightUnit,
		"body_weight", "body_weight_unit", details,
		&upd.SetBodyWeight, &upd.BodyWeight, &upd.SetBodyWeightUnit, &upd.BodyWeightUnit)

	// Height value + unit pairing.
	applyMeasure(&in.Height, &in.HeightUnit, validate.HeightUnit,
		"height", "height_unit", details,
		&upd.SetHeight, &upd.Height, &upd.SetHeightUnit, &upd.HeightUnit)

	// Preferred units — validated, and never cleared to null.
	applyPref(&in.PreferredWeightUnit, validate.WeightUnit, "preferred_weight_unit", details,
		&upd.SetPreferredWeightUnit, &upd.PreferredWeightUnit)
	applyPref(&in.PreferredHeightUnit, validate.HeightUnit, "preferred_height_unit", details,
		&upd.SetPreferredHeightUnit, &upd.PreferredHeightUnit)

	// Avatar — data URL under the size cap; null clears.
	if in.AvatarURL.Present {
		if in.AvatarURL.Null || in.AvatarURL.Val == "" {
			upd.SetAvatarURL, upd.AvatarURL = true, nil
		} else if msg := validate.AvatarDataURL(in.AvatarURL.Val, avatarMaxBytes); msg != "" {
			details["avatar_url"] = msg
		} else {
			v := in.AvatarURL.Val
			upd.SetAvatarURL, upd.AvatarURL = true, &v
		}
	}

	// Default a body-weight/height unit from the (possibly updated) preferred
	// unit when a value is set without one, and clear the unit when the value
	// is cleared — keeping the DB value+unit CHECK satisfied.
	prefW := effectivePref(current.PreferredWeightUnit, upd.SetPreferredWeightUnit, upd.PreferredWeightUnit)
	prefH := effectivePref(current.PreferredHeightUnit, upd.SetPreferredHeightUnit, upd.PreferredHeightUnit)
	pairUnit(&upd.SetBodyWeight, upd.BodyWeight, &upd.SetBodyWeightUnit, &upd.BodyWeightUnit, prefW)
	pairUnit(&upd.SetHeight, upd.Height, &upd.SetHeightUnit, &upd.HeightUnit, prefH)

	if len(details) > 0 {
		return nil, httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation, "invalid profile update").WithDetails(details)
	}

	user, err := s.users.Update(ctx, userID, upd)
	if err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, httpx.NewAPIError(http.StatusConflict, httpx.CodeConflict, "that username is already taken")
		}
		if errors.Is(err, repository.ErrNotFound) {
			return nil, httpx.NewAPIError(http.StatusNotFound, httpx.CodeNotFound, "user not found")
		}
		return nil, err
	}
	return user, nil
}

// ChangePassword verifies the current password and sets a new one. A wrong
// current password is a generic 401; an invalid or unchanged new password is a
// 422.
func (s *AuthService) ChangePassword(ctx context.Context, userID, current, next string) error {
	user, err := s.Me(ctx, userID)
	if err != nil {
		return err
	}
	if !passwords.Verify(user.PasswordHash, current) {
		return httpx.NewAPIError(http.StatusUnauthorized, httpx.CodeUnauthorized, "current password is incorrect")
	}
	details := map[string]any{}
	if msg := validate.Password(next); msg != "" {
		details["new_password"] = msg
	} else if next == current {
		details["new_password"] = "new password must differ from the current password"
	}
	if len(details) > 0 {
		return httpx.NewAPIError(http.StatusUnprocessableEntity, httpx.CodeValidation, "invalid password change").WithDetails(details)
	}
	hash, err := passwords.Hash(next)
	if err != nil {
		return err
	}
	return s.users.UpdatePasswordHash(ctx, userID, hash)
}

func (s *AuthService) issueFor(user *domain.User) (*AuthResult, error) {
	token, err := s.issuer.Issue(user.ID, s.now())
	if err != nil {
		return nil, err
	}
	return &AuthResult{Token: token, User: user}, nil
}

func invalidCredentials() error {
	return httpx.NewAPIError(http.StatusUnauthorized, httpx.CodeUnauthorized, "invalid credentials")
}

// --- partial-update helpers ---

// applyEnum validates a present, non-null enum field and stages it; null clears.
func applyEnum(in *optional.Value[string], rule func(string) string, field string, details map[string]any, set *bool, out **string) {
	if !in.Present {
		return
	}
	if in.Null {
		*set, *out = true, nil
		return
	}
	if msg := rule(in.Val); msg != "" {
		details[field] = msg
		return
	}
	v := in.Val
	*set, *out = true, &v
}

// applyPref validates a preference field that must not be null.
func applyPref(in *optional.Value[string], rule func(string) string, field string, details map[string]any, set *bool, out **string) {
	if !in.Present {
		return
	}
	if in.Null {
		details[field] = field + " cannot be null"
		return
	}
	if msg := rule(in.Val); msg != "" {
		details[field] = msg
		return
	}
	v := in.Val
	*set, *out = true, &v
}

// applyMeasure validates a value+unit measurement (body weight, height). The
// value must be positive; the unit (when present) must pass its rule.
func applyMeasure(val *optional.Value[float64], unit *optional.Value[string], unitRule func(string) string,
	valField, unitField string, details map[string]any,
	setVal *bool, outVal **float64, setUnit *bool, outUnit **string) {
	if val.Present {
		if val.Null {
			*setVal, *outVal = true, nil
		} else if msg := validate.PositiveNumber(valField, val.Val); msg != "" {
			details[valField] = msg
		} else {
			v := val.Val
			*setVal, *outVal = true, &v
		}
	}
	if unit.Present {
		if unit.Null {
			*setUnit, *outUnit = true, nil
		} else if msg := unitRule(unit.Val); msg != "" {
			details[unitField] = msg
		} else {
			u := unit.Val
			*setUnit, *outUnit = true, &u
		}
	}
}

// effectivePref returns the preference in force for defaulting: the staged new
// value when the request changes it, otherwise the user's current preference.
func effectivePref(current string, set bool, staged *string) string {
	if set && staged != nil {
		return *staged
	}
	return current
}

// pairUnit keeps a measurement's value+unit consistent: when a value is being
// set without a unit, default the unit to pref; when a value is cleared, clear
// the unit too. It never overrides an explicitly-provided unit.
func pairUnit(setVal *bool, val *float64, setUnit *bool, outUnit **string, pref string) {
	if !*setVal {
		return
	}
	if val == nil { // value cleared → clear unit
		*setUnit, *outUnit = true, nil
		return
	}
	if !*setUnit || *outUnit == nil { // value set without a unit → default it
		p := pref
		*setUnit, *outUnit = true, &p
	}
}
