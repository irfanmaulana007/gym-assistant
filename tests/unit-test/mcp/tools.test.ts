import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { TOOLS } from '@/tools'

const UUID = '11111111-1111-4111-8111-111111111111'

function byName(name: string) {
  const t = TOOLS.find((t) => t.name === name)
  if (!t) throw new Error(`tool ${name} not found`)
  return t
}

describe('TOOLS table', () => {
  it('registers 14 uniquely-named tools', () => {
    expect(TOOLS).toHaveLength(14)
    expect(new Set(TOOLS.map((t) => t.name)).size).toBe(14)
  })

  it.each([
    ['get_profile', {}, 'auth/me'],
    ['list_routines', {}, 'routines'],
    ['get_routine', { routine_id: UUID }, `routines/${UUID}`],
    ['get_exercise_history', { exercise_id: UUID }, `exercises/${UUID}/history`],
    ['get_session', { session_id: UUID }, `sessions/${UUID}`],
    ['search_exercise_catalog', {}, 'exercise-catalog'],
    ['list_sessions', {}, 'sessions'],
    ['get_analytics_dashboard', {}, 'analytics/dashboard'],
    ['get_analytics_summary', {}, 'analytics/summary'],
    ['get_analytics_volume', {}, 'analytics/volume'],
    ['get_analytics_muscle_groups', {}, 'analytics/muscle-groups'],
    ['get_analytics_consistency', {}, 'analytics/consistency'],
    ['get_analytics_records', {}, 'analytics/records'],
    ['get_analytics_exercise_trends', {}, 'analytics/exercise-trends'],
  ])('%s maps to the expected API path', (name, args, expectedPath) => {
    const { path } = byName(name).request(args as Record<string, unknown>)
    expect(path).toBe(expectedPath)
  })

  it('passes pagination and filter args through as query', () => {
    expect(byName('list_sessions').request({ limit: 10, offset: 5 }).query).toEqual({
      limit: 10,
      offset: 5,
    })
    expect(byName('search_exercise_catalog').request({ search: 'bench', muscle_group: 'chest' }).query).toEqual(
      { search: 'bench', muscle_group: 'chest' },
    )
    expect(byName('get_analytics_volume').request({ window: '30d', tz: 'UTC', bucket: 'week' }).query).toEqual(
      { window: '30d', tz: 'UTC', bucket: 'week' },
    )
  })

  it('rejects non-UUID id args at the schema layer', () => {
    const schema = z.object(byName('get_routine').inputSchema)
    expect(schema.safeParse({ routine_id: 'missing' }).success).toBe(false)
    expect(schema.safeParse({ routine_id: '../auth/me' }).success).toBe(false)
    expect(schema.safeParse({ routine_id: UUID }).success).toBe(true)
  })

  it('rejects an unknown muscle_group enum value', () => {
    const schema = z.object(byName('search_exercise_catalog').inputSchema)
    expect(schema.safeParse({ muscle_group: 'wings' }).success).toBe(false)
    expect(schema.safeParse({ muscle_group: 'chest' }).success).toBe(true)
    expect(schema.safeParse({}).success).toBe(true)
  })
})
