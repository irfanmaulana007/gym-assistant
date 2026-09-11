# PRD 0008 — User Profile Enrichment (Identity, Health Data & Avatar)

| Field | Value |
|-------|-------|
| Author | Irfan Maulana |
| Status | Draft |
| Created | 2026-09-11 |
| Updated | 2026-09-11 |
| App | api, web |
| Extends | [PRD 0001 — Workout Tracking Foundation](0001-workout-tracking-foundation.md), [PRD 0003 — Native-Mobile Profile Screen](0003-native-mobile-profile-screen.md), [PRD 0005 — Bottom Tab Bar & Clean Native Header](0005-bottom-tab-bar-and-clean-header.md) |

## 1. Summary

Enrich the **User** entity from a bare login identity (`email`, `display_name`)
into a proper personal/health profile for a workout app. Specifically:

- **Username** — an optional, unique handle. **Login accepts username *or* email**
  (with the same password); registration gains an optional username field.
- **Personal & health data** — `full_name`, `gender`, `date_of_birth` (age is
  derived, never stored), `body_weight` + unit, `height` + unit, `fitness_goal`,
  and `activity_level`. These are the fields commonly used to contextualize
  training and to power future analytics (BMI, volume-per-bodyweight, calorie
  estimates).
- **Unit preferences** — a **per-user preferred weight unit** (`kg`/`lb`) and
  **preferred height unit** (`cm`/`in`). The preferred unit is the **default for
  every measurement input** (body weight, height, *and* logged lifting weights)
  and the **display unit used consistently across every page** — set logging,
  exercise history, analytics, and the profile. Values stored in a different unit
  are converted to the preferred unit for display.
- **Change password** — the user can change their password from the Profile
  screen by supplying their current password and a new one.
- **Avatar** — the user can set a profile picture. The avatar is shown on the
  **Profile screen** and on the **Profile tab of the bottom navigation** (PRD
  0005), replacing the generic tab icon with the user's face.

The Profile screen (today read-only, PRD 0003) gains an **Edit Profile** flow
(identity + health data + unit preferences), an **avatar picker**, and a
**Change password** action, so all of the above is viewable and editable in the
app.

This spans **api** (new columns, username-or-email login, a profile-update
endpoint, avatar upload, a change-password endpoint) and **web** (register/login
form changes, an editable profile screen, avatar picker, change-password flow,
the avatar on the bottom nav, and applying the preferred unit app-wide).

## 2. Motivation

The current `users` table holds only `email`, `password_hash`, `display_name`
(`migrations/0001_initial_schema.sql`). That is enough to authenticate but not to
be a *health* app:

- There is **no username** — users can only be addressed by a display name and
  can only log in by email. A handle is table-stakes for a social/identity-bearing
  app and is a friendlier login credential than an email address.
- There is **no body data** (weight, height, gender, age, goals). Progressive
  overload is the product's core (see root `CLAUDE.md`), and the most-requested
  next step — relative-strength trends, BMI, goal-aware suggestions (PRD 0007
  Analytics) — all need baseline body metrics that we do not currently capture.
- **Weight units are per-row and defaulted to a hardcoded `kg`.** Set logs and
  targets already carry a `weight_unit` (`domain.SetLog.WeightUnit`,
  `WeightUnit = 'kg' | 'lb'` in `web/src/types/api.ts`), but there is **no user
  preference**: the set-logging input hardcodes a `kg` placeholder
  (`features/sessions/ExerciseCard.tsx`) and history/analytics render whatever
  unit each row happened to store. An `lb`-first user has to re-pick the unit
  constantly and still sees mixed units across pages. A single per-user
  preference that defaults every input and normalizes every display fixes this.
- The Profile screen is a **read-only** identity card (PRD 0003) with no way to
  edit anything — including **no way to change a password** — and the bottom-nav
  Profile tab (PRD 0005) shows a generic icon rather than the user's avatar,
  which every mainstream fitness app does.

Capturing this data now, behind a clean optional-field design, unblocks the
analytics roadmap without forcing existing users through a migration wall.

## 3. Scope

**In scope:**

- **api** — migration `0004` adding nullable user columns: `username`,
  `full_name`, `gender`, `date_of_birth`, `body_weight`, `body_weight_unit`,
  `height`, `height_unit`, `fitness_goal`, `activity_level`, `avatar_url`; a
  **partial-unique** index on `username` (unique when present, many NULLs
  allowed).
- **api** — **login by username *or* email**: resolve the identifier to a user,
  keeping the existing anti-enumeration behavior (one generic 401).
- **api** — register accepts an **optional** `username` (+ the new fields are
  *not* required at registration; they are filled later in the profile editor).
- **api** — a **profile-update endpoint** `PATCH /api/v1/auth/me` that updates any
  subset of the enrichable fields for the authenticated user (never `email`
  changes here — that is a separate concern).
- **api** — per-user **`preferred_weight_unit`** (`kg`/`lb`) and
  **`preferred_height_unit`** (`cm`/`in`) columns, set via `PATCH /auth/me`,
  returned on the user object, and used as the default when a client omits a unit.
- **api** — a **change-password endpoint** `POST /api/v1/auth/change-password`
  that verifies the current password and sets a new (bcrypt-hashed) one.
- **api** — **avatar upload**: the user sends an image; the API validates
  type/size and stores it, returning an `avatar_url` on the user object.
- **web** — register form gains an optional **Username** field; the login form's
  first field becomes **Username or email**.
- **web** — the Profile screen shows the new data and gains **Edit Profile**
  (username, full name, gender, DOB, weight+unit, height+unit, goal, activity
  level, **preferred units**) plus an **avatar picker** and a **Change password**
  action.
- **web** — the preferred unit is applied **app-wide**: it is the default unit for
  the set-logging weight input and profile measurement inputs, and the display
  unit on session, exercise-history, and analytics screens (converting rows
  stored in another unit).
- **web** — the bottom-nav **Profile tab shows the avatar** (falling back to the
  initials/generic icon when none is set).
- **Tests** — unit + e2e per [`.claude/rules/testing.md`](../.claude/rules/testing.md).

**Out of scope:**

- **Changing email** from the profile editor, and **password *reset*** (the
  forgot-password / email-link flow). This PRD covers an authenticated
  **password *change*** (current + new password) only; email change +
  verification and reset-by-email are their own PRD.
- **Username as a public/social handle** (profiles of *other* users, @-mentions,
  search-by-username). Username is unique and login-capable, but there is no
  public profile surface in this PRD.
- **Re-storing historical rows in the preferred unit.** Setting/changing a
  preferred unit is a **display + input-default** concern: existing set-log and
  target rows keep their stored `weight_unit`, and we convert to the preferred
  unit at display time (§4.4). We do **not** rewrite stored values or migrate
  past data when the preference changes — history stays faithful to what was
  entered (consistent with PRD 0002's immutable-history stance).
- **Multiple avatars / image cropping editor.** One current avatar; the client
  may downscale but a full crop-and-rotate editor is out of scope.
- **Backfilling usernames** for existing users. Username stays NULL until a user
  sets one; email login keeps working unchanged.

## 4. Design

### 4.1 Data model — `users` new columns (migration `0004`)

All columns are **nullable** (or defaulted) so the migration is backward
compatible and no existing row breaks.

| Column | Type | Notes |
|--------|------|-------|
| `username` | `TEXT NULL` | 3–30 chars, `^[a-z0-9_.]+$` (lowercased on write); unique when present |
| `full_name` | `TEXT NULL` | free text, max 100 |
| `gender` | `TEXT NULL` | enum-validated: `male` / `female` / `other` / `prefer_not_to_say` |
| `date_of_birth` | `DATE NULL` | age is **derived** at read/display time, never stored |
| `body_weight` | `NUMERIC(6,2) NULL` | > 0; paired with unit |
| `body_weight_unit` | `TEXT NULL` | `kg` / `lb`; required iff `body_weight` set (`CHECK`) |
| `height` | `NUMERIC(6,2) NULL` | > 0; paired with unit |
| `height_unit` | `TEXT NULL` | `cm` / `in`; required iff `height` set (`CHECK`) |
| `fitness_goal` | `TEXT NULL` | `lose_fat` / `build_muscle` / `maintain` / `gain_strength` |
| `activity_level` | `TEXT NULL` | `sedentary` / `light` / `moderate` / `active` / `very_active` |
| `preferred_weight_unit` | `TEXT NOT NULL DEFAULT 'kg'` | `kg` / `lb`; default input + display unit for all weights (body + lifting) |
| `preferred_height_unit` | `TEXT NOT NULL DEFAULT 'cm'` | `cm` / `in`; default input + display unit for height |
| `avatar_url` | `TEXT NULL` | see §4.6 (data URL now, object-storage URL later) |

**Username uniqueness** — a *partial* unique index so multiple users can have no
username while set usernames stay unique:

```sql
CREATE UNIQUE INDEX users_username_key ON users (username) WHERE username IS NOT NULL;
```

**Value+unit per field (per the product decision):** weight and height each store
a raw value *and* its unit rather than normalizing to a canonical unit. This
keeps "what the user entered" faithful and avoids lossy round-trips. Derived
metrics that need a common unit (BMI, cross-user comparison) convert at
computation time via a small pure helper — they do not rewrite the stored value.

> **Trade-off noted:** value+unit is friendlier for input fidelity but means any
> future aggregate analytics must normalize on read. We accept this; a pure
> `kg`/`cm` conversion helper (`pkg/units`) centralizes it and is unit-tested.

### 4.2 Domain, repository, validation (api)

- `domain.User` (`internal/domain/user.go`) gains the fields above with JSON tags
  (`avatar_url`, `date_of_birth`, …). `password_hash` stays `json:"-"`. Age is
  **not** a stored field; if surfaced, it is computed in a helper, not persisted.
- `repository/user_repo.go`:
  - `Create` / `scanOne` `SELECT`/`INSERT` column lists + `Scan` targets extend to
    the new columns (all parameterized — CLAUDE.md non-negotiable).
  - New lookup **`GetByEmailOrUsername(ctx, identifier)`** — a single parameterized
    query: `WHERE email = $1 OR username = $1` (identifier lowercased/normalized).
  - New **`Update(ctx, userID, fields)`** — parameterized partial update scoped to
    the authenticated user id; unique-violation on `username` → `ErrConflict`.
- `pkg/validate`: add `Username`, `Gender`, `FitnessGoal`, `ActivityLevel`,
  `WeightUnit` (`kg`/`lb`), `HeightUnit` (`cm`/`in`), `PositiveNumber`, and a
  `DateOfBirth` (valid date, not in the future, sane lower bound) validator —
  each returning the existing `"" == valid` human-readable-message convention.
  `WeightUnit`/`HeightUnit` are reused for both the per-field units
  (`body_weight_unit`, `height_unit`) and the new preference columns. Validation
  stays in the **service** layer, accumulating into the `details` map →
  `422 validation_error` envelope, exactly like `auth_service.go` today.

### 4.3 Login by username or email (api)

`auth_service.Login` currently does `users.GetByEmail(normalizedEmail)`. It
changes to:

1. Take a single `identifier` (the DTO's field is renamed/duplicated — see the
   contract note below), normalize it (trim + lowercase).
2. `users.GetByEmailOrUsername(ctx, identifier)`.
3. `passwords.Verify` — **unchanged anti-enumeration**: unknown identifier and
   wrong password both return the same generic `401` via `invalidCredentials()`.

**Wire contract:** `loginRequest` accepts `identifier` (preferred). For backward
compatibility the handler also accepts the legacy `email` field and maps it to
`identifier` when `identifier` is absent, so existing clients/tests keep working.

### 4.4 Unit preferences & app-wide conversion

Two per-user columns — `preferred_weight_unit` (`kg`/`lb`, default `kg`) and
`preferred_height_unit` (`cm`/`in`, default `cm`) — become the single source of
truth for **how measurements are entered and shown everywhere**. They are set via
`PATCH /auth/me` (§4.7) and returned on the user object, so the web auth context
holds them for the whole session.

**Storage is unchanged — this is a display + input-default layer.** Weights are
already stored value+unit per row (`SetLog.weight` + `weight_unit`,
`TargetWeight` + unit; body weight/height store their own value+unit). We do not
add a canonical-unit column or rewrite data. Instead:

- **Input default (write path).** When a client omits the unit on a weight/height
  write (set log, target, body weight, height), the service fills it from the
  user's preferred unit rather than a hardcoded `kg`. An explicit unit in the
  request still wins (so a user can log a one-off `lb` lift).
- **Display (read path).** The web renders every measurement in the user's
  preferred unit, converting any row whose stored unit differs via a **pure
  conversion helper** — `pkg/units` on the API side (unit-tested) and a mirrored
  `src/lib/units.ts` on the web side for client-only formatting. Conversions:
  `kg↔lb` (`1 kg = 2.2046226 lb`) and `cm↔in` (`1 in = 2.54 cm`), rounded to a
  sensible precision (weights to 0.5/1 unit for display, configurable).

Because most rows will already be stored in the preferred unit (it drives the
default), conversion is the exception (mixed-unit history), not the common path.
This keeps history faithful (§3 out-of-scope) while giving a consistent app-wide
unit — the pages affected are set logging (`ExerciseCard`), exercise history
(`ExerciseHistoryPage`, `formatLastSet`), analytics (PRD 0007), and the profile.

> **Why not store canonical + convert on read everywhere?** The schema already
> commits to value+unit per row, and PRD 0002 makes logged history immutable.
> Reinterpreting existing rows as a canonical unit would be a lossy, assumption-
> laden backfill. Preference-as-display-layer is additive, reversible, and needs
> no data migration.

### 4.5 Change password

`POST /api/v1/auth/change-password` (authenticated group):

- Body: `{ current_password, new_password }`.
- The service loads the authenticated user (`middleware.UserID(ctx)`), verifies
  `current_password` with `passwords.Verify` against the stored hash; a mismatch
  returns `401 unauthorized` (generic — no hint about which field).
- `new_password` is validated with the existing `validate.Password` rule (8–200
  chars) → `422 validation_error` on failure; it must differ from the current
  password.
- On success the service hashes the new password (`passwords.Hash`, bcrypt cost
  12) and persists it via a scoped `UpdatePasswordHash(ctx, userID, hash)` repo
  method. Returns `204 No Content`.
- The existing token stays valid (no forced re-login in this PRD); token
  revocation on password change is noted as a future enhancement (§7).

Kept as its own endpoint (not part of `PATCH /auth/me`) because it requires the
current password and returns no body — a distinct contract from the partial
profile update.

### 4.6 Avatar storage

**Decision for this PRD: store a client-downscaled image as a data URL in
`users.avatar_url`.** The web client resizes the picked image to a small square
(≤ 256×256) and encodes it; the API validates it is an `image/*` data URL under a
hard size cap (**≤ ~200 KB** after encoding) and stores the string. The user
object then carries `avatar_url` directly — no separate fetch, no object-storage
infra, and it renders inline in an `<img src>` on both the Profile screen and the
bottom-nav tab.

> **Why not object storage now?** The app has no S3/R2 wiring today and this is a
> personal-scale app; a data URL keeps the change self-contained and fully
> covered by the existing e2e harness (embedded Postgres, no external services).
> `avatar_url` is deliberately a **URL-shaped string** so a later PRD can switch
> to Cloudflare R2 / object storage (upload → return a real URL) **without a
> schema change** — only the write path changes. The ≤200 KB cap keeps rows and
> the `/me` payload small.

Endpoint: avatar is set through the same `PATCH /api/v1/auth/me` (an `avatar_url`
field) so there is one write path; the size/type validation lives in the service.
Sending `avatar_url: null`/empty clears it.

### 4.7 Profile-update endpoint (api)

`PATCH /api/v1/auth/me` (authenticated group, `internal/router/router.go`):

- Body is a **partial** update over the enrichable fields — username, full name,
  gender, DOB, body weight+unit, height+unit, fitness goal, activity level,
  **`preferred_weight_unit`**, **`preferred_height_unit`**, and `avatar_url`.
  Every field optional; only present fields change (JSON `null` explicitly clears
  a nullable field where allowed; the preference columns are `NOT NULL` and
  cannot be cleared to null, only switched between valid values).
- **Does not** change `email` or password — password is its own endpoint (§4.5),
  email change is out of scope.
- Scoped to `middleware.UserID(ctx)` — the client never sends a user id.
- Validates each present field (§4.2); `username` conflict → `409 conflict`;
  field errors → `422 validation_error`.
- Returns the full updated `domain.User` (same shape as `GET /me`), so the web
  auth context can refresh in place.

`GET /api/v1/auth/me` is unchanged except it now returns the new fields.

### 4.8 Web — forms, profile editor, avatar on nav

- **Types** (`src/types/api.ts`): extend `User` with the new fields (all
  optional). Add `RegisterRequest` / `LoginRequest` / `UpdateProfileRequest` DTO
  types (currently inline literals in `api/auth.ts`).
- **Register** (`features/auth/RegisterPage.tsx`): add an **optional** "Username"
  field (helper text: "letters, numbers, _ and . — you can log in with this").
  Server field errors map into `fieldErrors` as today.
- **Login** (`features/auth/LoginPage.tsx`): the first field becomes **"Username
  or email"** (`autoComplete="username"`, no `type="email"`), sent as
  `identifier`.
- **API client** (`api/auth.ts`): `register` gains optional `username`; `login`
  takes `(identifier, password)`; new `updateProfile(patch)` → `PATCH /auth/me`
  and `changePassword(current, next)` → `POST /auth/change-password`.
  `lib/auth.tsx` widens `login`/`register` signatures and adds an
  `updateProfile`/`refresh` action that applies the returned user into context.
- **Profile screen** (`features/profile/ProfilePage.tsx`): show avatar (large),
  display name/full name, username (`@handle`), and grouped rows for the health
  data (gender, age from DOB, weight, height, goal, activity — each rendered in
  the preferred unit). Add an **Edit Profile** entry and a **Change password**
  entry.
- **Edit Profile**: a pushed full screen (`/profile/edit`, native-mobile per
  [`.claude/rules/native-mobile-ux.md`](../.claude/rules/native-mobile-ux.md) —
  back chevron + title, sticky Save CTA). Uses existing primitives: `Field` for
  text/number, `Segmented` for gender/goal and for the **preferred-unit** toggles
  (kg/lb, cm/in), the hand-rolled `select` pattern where a segmented control is
  too wide, and an **avatar picker** (tap avatar → file input → client downscale
  → preview). Measurement inputs default their unit to the preferred unit. Reuses
  form CSS tokens (`.field`, `.input`, `.select`, `.segmented`); no inlined raw
  values.
- **Change password**: a pushed full screen (`/profile/password`, same
  native-mobile pattern) with current-password, new-password, and confirm fields;
  submit → `changePassword`. On success it pops back with a confirmation; a wrong
  current password surfaces the `401` as an inline error.
- **Preferred unit applied app-wide** (`src/lib/units.ts` + the existing
  `formatLastSet`/`format.ts` helpers): the set-logging weight input
  (`features/sessions/ExerciseCard.tsx`) defaults its unit to
  `user.preferred_weight_unit` instead of the hardcoded `kg` placeholder;
  exercise history (`ExerciseHistoryPage`, `formatLastSet`) and analytics (PRD
  0007) render weights converted to the preferred unit. `units.ts` provides pure
  `convertWeight`/`convertHeight`/`formatMeasurement` mirroring the API's
  `pkg/units`.
- **Avatar on bottom nav** (`components/BottomNav.tsx`, PRD 0005): the Profile
  tab renders the user's `avatar_url` in a small round `<img>` when set (tinted
  ring when active), falling back to the current generic icon / initials
  `Avatar` when unset. `BottomNav` reads the user from `useAuth()`.
- Small display helpers in `src/lib/` (unit-tested): `useAge(dob)` and the
  `units.ts` measurement formatters above.

## 5. Testing

Per [`.claude/rules/testing.md`](../.claude/rules/testing.md), ships with unit
**and** e2e tests under the root `tests/` tree, on dedicated ports.

**API**

- **Unit** (`tests/unit-test/api/`): new validators (username format/length,
  gender/goal/activity/unit enums, DOB not-in-future, positive weight/height,
  avatar size/type cap); the `pkg/units` conversion helper (`kg↔lb`, `cm↔in`
  round-trips + rounding); age derivation.
- **E2E** (`tests/e2e/api/`, embedded Postgres): register with a username →
  **login by that username** and **by email** both succeed; register without a
  username still works; duplicate username → `409`; `PATCH /auth/me` updates the
  health fields **and the preferred units** and reads them back on `GET /me`;
  omitting a unit on a weight write falls back to `preferred_weight_unit`; `/me`
  never leaks `password_hash`; setting/clearing `avatar_url`; oversized avatar →
  `422`; username-taken via PATCH → `409`. **Change password**: correct current
  password → `204` and the new password logs in while the old one is rejected;
  wrong current password → `401`; too-short new password → `422`. Update the
  shared `registerUser` helper (`tests/e2e/api/client.go`) and existing
  `auth_test.go` for the DTO change.

**Web**

- **Unit** (`tests/unit-test/web/`): Register posts optional `username`; Login
  posts `identifier`; the Edit Profile form validates and PATCHes the subset
  (including preferred units); the Change-password form posts current/new and
  handles the `401`; `BottomNav` shows the avatar `<img>` when `user.avatar_url`
  is set and the fallback icon otherwise; `useAge` and the `units.ts` formatters;
  `ExerciseCard` defaults its weight-unit input to `user.preferred_weight_unit`.
  Update existing `LoginPage.test.tsx` / `ProfilePage.test.tsx`.
- **E2E** (`tests/e2e/web/`, `auth.spec.ts` + a new `profile.spec.ts`): register
  (with username) → log out → **log in with the username** → edit profile (set
  gender/weight/goal + avatar + **preferred unit = lb**) → assert the values
  render on the Profile screen, the avatar appears on the bottom-nav Profile tab,
  and a newly logged set **defaults to lb**; then **change password** and confirm
  the new password logs in. Update `auth.spec.ts` which currently fills exactly
  the three old register fields.

A new test must fail without the change and pass with it; never bind the local
dev ports (`:5173`/`:8080`/`:5432`).

## 6. Rollout

- **PR 1 — `[migration]`**: `0004_user_profile_fields.sql` — add the nullable
  columns plus the `NOT NULL DEFAULT` preference columns
  (`preferred_weight_unit`/`preferred_height_unit`), `CHECK`s
  (unit-required-with-value, enum guards optional at DB level), and the
  partial-unique username index. Backward compatible (all existing rows satisfy
  every constraint; the preference defaults backfill automatically).
- **PR 2 — `[api][feat]`**: domain/repo/service/handler/router changes —
  username-or-email login, `PATCH /auth/me` (incl. preferred units),
  `POST /auth/change-password`, avatar validation, new validators + `pkg/units`,
  unit-default-on-write, tests.
- **PR 3 — `[web][feat]`**: register/login form changes, editable Profile screen +
  `/profile/edit`, change-password screen (`/profile/password`), avatar picker,
  avatar on bottom nav, **preferred unit applied app-wide** (`units.ts`,
  `ExerciseCard`/history/analytics), client helpers, tests.

No feature flag: every new field is optional and additive; the preference columns
default to today's implicit units (`kg`/`cm`), so existing email login, existing
registrations, existing logged weights, and the read-only-then-editable Profile
screen all keep working unchanged. The stacked PRs merge bottom-up (migration →
api → web), consistent with the Phase-1 stacking approach.

## 7. Open questions

1. **Avatar storage ceiling.** Is a ≤200 KB data URL acceptable long-term, or do
   we want to prioritize the object-storage (R2) path sooner? Proposal: ship the
   data URL now; `avatar_url` staying URL-shaped keeps the door open.
2. **Username immutability / rename cadence.** Do we allow changing username
   freely, or rate-limit/lock it? Proposal: freely editable via `PATCH /me` for
   now (uniqueness still enforced); revisit if it becomes a public handle.
3. **Gender vocabulary.** The proposed set is
   `male / female / other / prefer_not_to_say` — confirm this is the desired list
   (some apps use "sex" for biological metrics vs "gender" for identity; this PRD
   uses a single `gender` field).
4. **Which fields (if any) to nudge at registration** vs. purely in the editor.
   Proposal: registration stays minimal (email + password + display name +
   *optional* username); all health data is filled in the profile editor.
5. **Token revocation on password change.** This PRD keeps the current token valid
   after a password change (simplest). Should a password change instead invalidate
   existing sessions (e.g. a token version / `password_changed_at` check in
   `RequireAuth`)? Proposal: defer to a dedicated session-management PRD.
6. **Default preferred unit.** Defaults are `kg`/`cm` (matching today's implicit
   behavior). Should we instead infer an initial default from locale at
   registration? Proposal: default to `kg`/`cm` and let the user switch it in the
   profile editor.
7. **Rounding precision for converted weights.** Displaying an `lb`-preferred view
   of a `kg`-logged set needs a rounding rule (nearest 0.5 lb? whole lb?).
   Proposal: round display to 1 decimal and never round the *stored* value.
