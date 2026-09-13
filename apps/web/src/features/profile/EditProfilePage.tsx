import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Layout } from '@/components/Layout'
import { Avatar } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import { Button, Field, ErrorText } from '@/components/ui'
import { downscaleImageToDataURL } from '@/lib/image'
import {
  ACTIVITY_LEVEL_LABELS,
  FITNESS_GOAL_LABELS,
  GENDER_LABELS,
  type ActivityLevel,
  type FitnessGoal,
  type Gender,
  type HeightUnit,
  type UpdateProfileRequest,
  type User,
  type WeightUnit,
} from '@/types/api'

// Local form state — strings for inputs, so empty means "clear".
interface FormState {
  username: string
  full_name: string
  gender: '' | Gender
  date_of_birth: string
  body_weight: string
  body_weight_unit: WeightUnit
  height: string
  height_unit: HeightUnit
  fitness_goal: '' | FitnessGoal
  activity_level: '' | ActivityLevel
  preferred_weight_unit: WeightUnit
  preferred_height_unit: HeightUnit
}

function initialState(user: User): FormState {
  return {
    username: user.username ?? '',
    full_name: user.full_name ?? '',
    gender: user.gender ?? '',
    // The <input type="date"> wants YYYY-MM-DD; slice off any time component.
    date_of_birth: user.date_of_birth ? user.date_of_birth.slice(0, 10) : '',
    body_weight: user.body_weight != null ? String(user.body_weight) : '',
    body_weight_unit: user.body_weight_unit ?? user.preferred_weight_unit,
    height: user.height != null ? String(user.height) : '',
    height_unit: user.height_unit ?? user.preferred_height_unit,
    fitness_goal: user.fitness_goal ?? '',
    activity_level: user.activity_level ?? '',
    preferred_weight_unit: user.preferred_weight_unit,
    preferred_height_unit: user.preferred_height_unit,
  }
}

// Build the PATCH body: empty strings clear nullable fields; measurement units
// ride along with their value (the API pairs/clears them).
function toPatch(f: FormState, originalAvatar: string | null, avatar: string | null): UpdateProfileRequest {
  const patch: UpdateProfileRequest = {
    username: f.username.trim() || null,
    full_name: f.full_name.trim() || null,
    gender: f.gender || null,
    date_of_birth: f.date_of_birth || null,
    body_weight: f.body_weight.trim() === '' ? null : Number(f.body_weight),
    body_weight_unit: f.body_weight.trim() === '' ? null : f.body_weight_unit,
    height: f.height.trim() === '' ? null : Number(f.height),
    height_unit: f.height.trim() === '' ? null : f.height_unit,
    fitness_goal: f.fitness_goal || null,
    activity_level: f.activity_level || null,
    preferred_weight_unit: f.preferred_weight_unit,
    preferred_height_unit: f.preferred_height_unit,
  }
  // Only send the avatar when it changed, so an unchanged large data URL isn't
  // re-posted every save.
  if (avatar !== originalAvatar) patch.avatar_url = avatar
  return patch
}

// Pushed full screen (native pattern): back chevron + title, grouped fields,
// avatar picker, and a sticky Save CTA (PRD 0008 §4.8). The outer component
// waits for the auth context to hydrate so the inner form can initialize its
// state from a guaranteed-present user (a useState initializer runs only once).
export function EditProfilePage() {
  const { user } = useAuth()
  if (!user) return null
  return <EditProfileForm user={user} />
}

function EditProfileForm({ user }: { user: User }) {
  const { setUser } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(() => initialState(user))
  const [avatar, setAvatar] = useState<string | null>(user.avatar_url ?? null)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const originalAvatar = user.avatar_url ?? null
  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))

  const saveMut = useMutation({
    mutationFn: () => authApi.updateProfile(toPatch(form, originalAvatar, avatar)),
    onSuccess: (updated) => {
      setUser(updated)
      navigate('/profile')
    },
    onError: (e) => {
      if (e instanceof ApiError) {
        setError(e.message)
        if (e.details) {
          const fe: Record<string, string> = {}
          for (const [k, v] of Object.entries(e.details)) fe[k] = String(v)
          setFieldErrors(fe)
        }
      } else {
        setError('Could not save your profile')
      }
    },
  })

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    try {
      setAvatar(await downscaleImageToDataURL(file))
    } catch {
      setError('Could not read that image')
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})
    saveMut.mutate()
  }

  const name = user.display_name || user.email

  return (
    <Layout title="Edit profile" back="/profile" backLabel="Profile">
      <form className="stack" onSubmit={onSubmit}>
        <div className="avatar-picker">
          <button
            type="button"
            className="avatar-picker-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile photo"
          >
            <Avatar name={name} src={avatar} size="lg" />
            <span className="avatar-picker-hint">Change photo</span>
          </button>
          {avatar ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAvatar(null)}>
              Remove photo
            </Button>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            aria-label="Profile photo"
            onChange={onPickAvatar}
          />
        </div>

        <div className="section-label">Identity</div>
        <Field
          label="Username"
          name="username"
          autoCapitalize="none"
          placeholder="letters, numbers, _ and ."
          value={form.username}
          onChange={(e) => patch('username', e.target.value)}
          error={fieldErrors.username}
        />
        <Field
          label="Full name"
          name="full_name"
          value={form.full_name}
          onChange={(e) => patch('full_name', e.target.value)}
          error={fieldErrors.full_name}
        />
        <div className="field">
          <label htmlFor="gender">Gender</label>
          <select
            id="gender"
            className="select"
            value={form.gender}
            onChange={(e) => patch('gender', e.target.value as FormState['gender'])}
          >
            <option value="">—</option>
            {(Object.keys(GENDER_LABELS) as Gender[]).map((g) => (
              <option key={g} value={g}>{GENDER_LABELS[g]}</option>
            ))}
          </select>
        </div>
        <Field
          label="Date of birth"
          name="date_of_birth"
          type="date"
          value={form.date_of_birth}
          onChange={(e) => patch('date_of_birth', e.target.value)}
          error={fieldErrors.date_of_birth}
        />

        <div className="section-label">Body</div>
        <div className="field">
          <label htmlFor="body_weight">Body weight</label>
          <div className="row">
            <input
              id="body_weight"
              className="input"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              value={form.body_weight}
              onChange={(e) => patch('body_weight', e.target.value)}
            />
            <Segmented
              ariaLabel="Body weight unit"
              options={[
                { value: 'kg', label: 'kg' },
                { value: 'lb', label: 'lb' },
              ]}
              value={form.body_weight_unit}
              onChange={(v) => patch('body_weight_unit', v)}
            />
          </div>
          {fieldErrors.body_weight ? <span className="error-text">{fieldErrors.body_weight}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="height">Height</label>
          <div className="row">
            <input
              id="height"
              className="input"
              type="number"
              min={0}
              step="0.1"
              inputMode="decimal"
              value={form.height}
              onChange={(e) => patch('height', e.target.value)}
            />
            <Segmented
              ariaLabel="Height unit"
              options={[
                { value: 'cm', label: 'cm' },
                { value: 'in', label: 'in' },
              ]}
              value={form.height_unit}
              onChange={(v) => patch('height_unit', v)}
            />
          </div>
          {fieldErrors.height ? <span className="error-text">{fieldErrors.height}</span> : null}
        </div>

        <div className="section-label">Training</div>
        <div className="field">
          <label htmlFor="fitness_goal">Goal</label>
          <select
            id="fitness_goal"
            className="select"
            value={form.fitness_goal}
            onChange={(e) => patch('fitness_goal', e.target.value as FormState['fitness_goal'])}
          >
            <option value="">—</option>
            {(Object.keys(FITNESS_GOAL_LABELS) as FitnessGoal[]).map((g) => (
              <option key={g} value={g}>{FITNESS_GOAL_LABELS[g]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="activity_level">Activity level</label>
          <select
            id="activity_level"
            className="select"
            value={form.activity_level}
            onChange={(e) => patch('activity_level', e.target.value as FormState['activity_level'])}
          >
            <option value="">—</option>
            {(Object.keys(ACTIVITY_LEVEL_LABELS) as ActivityLevel[]).map((a) => (
              <option key={a} value={a}>{ACTIVITY_LEVEL_LABELS[a]}</option>
            ))}
          </select>
        </div>

        <div className="section-label">Preferred units</div>
        <div className="field">
          <label>Weight</label>
          <Segmented
            ariaLabel="Preferred weight unit"
            options={[
              { value: 'kg', label: 'kg' },
              { value: 'lb', label: 'lb' },
            ]}
            value={form.preferred_weight_unit}
            onChange={(v) => patch('preferred_weight_unit', v)}
          />
        </div>
        <div className="field">
          <label>Height</label>
          <Segmented
            ariaLabel="Preferred height unit"
            options={[
              { value: 'cm', label: 'cm' },
              { value: 'in', label: 'in' },
            ]}
            value={form.preferred_height_unit}
            onChange={(v) => patch('preferred_height_unit', v)}
          />
        </div>

        <ErrorText>{error && Object.keys(fieldErrors).length === 0 ? error : ''}</ErrorText>
        <div className="sticky-cta">
          <Button type="submit" variant="primary" block disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </form>
    </Layout>
  )
}
