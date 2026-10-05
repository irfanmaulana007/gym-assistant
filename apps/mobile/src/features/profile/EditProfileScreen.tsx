import React, { useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native'
import { color, g, radius, sp } from '@/theme'
import { Screen } from '@/components/Screen'
import { Avatar } from '@/components/Avatar'
import { Segmented } from '@/components/Segmented'
import { Sheet } from '@/components/Sheet'
import { Button, Field, ErrorText } from '@/components/ui'
import { ChevronRight } from '@/components/icons'
import { useAuth } from '@/lib/auth'
import { useSync } from '@/lib/sync'
import { getStore, updateProfile } from '@/db'
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
import type { RootScreenProps } from '@/navigation/types'

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
  if (avatar !== originalAvatar) patch.avatar_url = avatar
  return patch
}

// Native enum picker: a labeled row that opens a Sheet of selectable options —
// never a desktop dropdown (native-mobile-ux). "—" clears the optional field.
function EnumField<T extends string>({
  label,
  value,
  labels,
  onChange,
}: {
  label: string
  value: '' | T
  labels: Record<T, string>
  onChange: (v: '' | T) => void
}) {
  const [open, setOpen] = useState(false)
  const keys = Object.keys(labels) as T[]
  return (
    <View style={g.field}>
      <Text style={g.label}>{label}</Text>
      <Pressable style={s.selectRow} onPress={() => setOpen(true)}>
        <Text style={[g.grow, { color: value ? color.text : color.textFaint, fontSize: 16 }]}>
          {value ? labels[value] : '—'}
        </Text>
        <ChevronRight size={18} color={color.textFaint} />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <Pressable
          style={s.optionRow}
          onPress={() => {
            onChange('')
            setOpen(false)
          }}
        >
          <Text style={{ color: color.textMuted, fontSize: 16 }}>—</Text>
        </Pressable>
        {keys.map((k) => (
          <Pressable
            key={k}
            style={s.optionRow}
            onPress={() => {
              onChange(k)
              setOpen(false)
            }}
          >
            <Text style={{ color: value === k ? color.primary : color.text, fontSize: 16, fontWeight: value === k ? '700' : '400' }}>
              {labels[k]}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  )
}

export function EditProfileScreen({ navigation }: RootScreenProps<'EditProfile'>) {
  const { user, setUser } = useAuth()
  const { commit } = useSync()
  const [form, setForm] = useState<FormState>(() => (user ? initialState(user) : initialState({} as User)))
  const [avatar, setAvatar] = useState<string | null>(user?.avatar_url ?? null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  if (!user) return null
  const originalAvatar = user.avatar_url ?? null
  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }))
  const name = user.display_name || user.email

  const onSave = () => {
    setError('')
    if (form.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(form.date_of_birth)) {
      setError('Date of birth must be YYYY-MM-DD')
      return
    }
    setSaving(true)
    const next = commit(() => updateProfile(getStore(), toPatch(form, originalAvatar, avatar)))
    if (next) setUser(next)
    setSaving(false)
    navigation.goBack()
  }

  return (
    <Screen
      bottomCta={<Button title={saving ? 'Saving…' : 'Save profile'} variant="primary" block disabled={saving} onPress={onSave} />}
    >
      <View style={s.avatarPicker}>
        <Avatar name={name} src={avatar} size="lg" />
        {/* Avatar upload is an online-only path (PRD 0018 non-goal). A native
            image picker + client-side downscale is a follow-up; see CLAUDE.md. */}
        <Button
          title="Change photo"
          variant="ghost"
          size="sm"
          onPress={() =>
            Alert.alert('Change photo', 'Photo upload requires connectivity and is coming in a follow-up build.')
          }
        />
        {avatar ? <Button title="Remove photo" variant="ghost" size="sm" onPress={() => setAvatar(null)} /> : null}
      </View>

      <Text style={g.sectionLabel}>IDENTITY</Text>
      <Field label="Username" autoCapitalize="none" placeholder="letters, numbers, _ and ." value={form.username} onChangeText={(v) => patch('username', v)} />
      <Field label="Full name" value={form.full_name} onChangeText={(v) => patch('full_name', v)} />
      <EnumField label="Gender" value={form.gender} labels={GENDER_LABELS} onChange={(v) => patch('gender', v)} />
      <Field label="Date of birth" placeholder="YYYY-MM-DD" autoCapitalize="none" value={form.date_of_birth} onChangeText={(v) => patch('date_of_birth', v)} />

      <Text style={g.sectionLabel}>BODY</Text>
      <View style={g.field}>
        <Text style={g.label}>Body weight</Text>
        <View style={s.unitRow}>
          <View style={g.grow}>
            <Field label="" keyboardType="decimal-pad" value={form.body_weight} onChangeText={(v) => patch('body_weight', v)} />
          </View>
          <View style={s.unitToggle}>
            <Segmented
              options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
              value={form.body_weight_unit}
              onChange={(v) => patch('body_weight_unit', v)}
            />
          </View>
        </View>
      </View>
      <View style={g.field}>
        <Text style={g.label}>Height</Text>
        <View style={s.unitRow}>
          <View style={g.grow}>
            <Field label="" keyboardType="decimal-pad" value={form.height} onChangeText={(v) => patch('height', v)} />
          </View>
          <View style={s.unitToggle}>
            <Segmented
              options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]}
              value={form.height_unit}
              onChange={(v) => patch('height_unit', v)}
            />
          </View>
        </View>
      </View>

      <Text style={g.sectionLabel}>TRAINING</Text>
      <EnumField label="Goal" value={form.fitness_goal} labels={FITNESS_GOAL_LABELS} onChange={(v) => patch('fitness_goal', v)} />
      <EnumField label="Activity level" value={form.activity_level} labels={ACTIVITY_LEVEL_LABELS} onChange={(v) => patch('activity_level', v)} />

      <Text style={g.sectionLabel}>PREFERRED UNITS</Text>
      <View style={g.field}>
        <Text style={g.label}>Weight</Text>
        <Segmented
          options={[{ value: 'kg', label: 'kg' }, { value: 'lb', label: 'lb' }]}
          value={form.preferred_weight_unit}
          onChange={(v) => patch('preferred_weight_unit', v)}
        />
      </View>
      <View style={g.field}>
        <Text style={g.label}>Height</Text>
        <Segmented
          options={[{ value: 'cm', label: 'cm' }, { value: 'in', label: 'in' }]}
          value={form.preferred_height_unit}
          onChange={(v) => patch('preferred_height_unit', v)}
        />
      </View>

      <ErrorText>{error}</ErrorText>
    </Screen>
  )
}

const s = StyleSheet.create({
  avatarPicker: { alignItems: 'center', gap: sp[2], paddingVertical: sp[2] },
  selectRow: {
    backgroundColor: color.bgElevated,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.base,
    paddingHorizontal: sp[4],
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionRow: { paddingVertical: sp[3], paddingHorizontal: sp[1] },
  unitRow: { flexDirection: 'row', alignItems: 'flex-end', gap: sp[3] },
  unitToggle: { width: 100 },
})
