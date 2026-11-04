/**
 * Read-only tool definitions. Each tool maps to a GET endpoint on the Gym
 * Assistant API. Keeping them in one declarative table keeps the server wiring
 * trivial and makes the full surface auditable at a glance.
 */

import { z, type ZodRawShape } from 'zod'
import type { GymApiClient } from './client.js'

export interface ToolDef {
  name: string
  title: string
  description: string
  inputSchema: ZodRawShape
  /** Resolve the API path + query string from validated args. */
  request: (args: Record<string, unknown>) => { path: string; query?: Record<string, unknown> }
}

// The API's `muscle_group` enum (apps/api migration 0001).
const MUSCLE_GROUPS = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'full_body',
  'cardio',
  'other',
] as const

const windowArgs = {
  window: z
    .string()
    .optional()
    .describe('Time window, e.g. "7d", "30d", "90d", "1y", "all" (API default if omitted).'),
  tz: z.string().optional().describe('IANA timezone, e.g. "Asia/Jakarta". Defaults to UTC.'),
}

export const TOOLS: ToolDef[] = [
  {
    name: 'get_profile',
    title: 'Get my profile',
    description:
      'Fetch the authenticated user profile: display name, body weight, height, goals, unit preferences, etc.',
    inputSchema: {},
    request: () => ({ path: 'auth/me' }),
  },
  {
    name: 'list_routines',
    title: 'List routines',
    description:
      'List all of the user\'s workout routines (schedule groups like Push/Pull/Legs), with their positions.',
    inputSchema: {},
    request: () => ({ path: 'routines' }),
  },
  {
    name: 'get_routine',
    title: 'Get routine with exercises',
    description:
      'Fetch a single routine by id, including its configured exercises and per-exercise targets (sets/reps/weight/duration/distance).',
    inputSchema: {
      routine_id: z.string().uuid().describe('The routine UUID (from list_routines).'),
    },
    request: (a) => ({ path: `routines/${encodeURIComponent(a.routine_id as string)}` }),
  },
  {
    name: 'get_exercise_history',
    title: 'Get exercise progressive-overload history',
    description:
      'Fetch the derived weight/volume history and progressive-overload trend for one configured exercise across all sessions it appears in.',
    inputSchema: {
      exercise_id: z
        .string()
        .uuid()
        .describe('The exercise UUID (from get_routine → exercises[].id).'),
    },
    request: (a) => ({ path: `exercises/${encodeURIComponent(a.exercise_id as string)}/history` }),
  },
  {
    name: 'search_exercise_catalog',
    title: 'Search the exercise catalog',
    description:
      'Search the shared exercise catalog (master movement list) by name and/or muscle group.',
    inputSchema: {
      search: z.string().optional().describe('Case-insensitive name substring, e.g. "bench".'),
      muscle_group: z
        .enum(MUSCLE_GROUPS)
        .optional()
        .describe('Filter by primary muscle group (one of the API muscle_group enum values).'),
    },
    request: (a) => ({
      path: 'exercise-catalog',
      query: { search: a.search, muscle_group: a.muscle_group },
    }),
  },
  {
    name: 'list_sessions',
    title: 'List workout sessions',
    description:
      'List the user\'s workout sessions (one performance of a routine on a date), most recent first, with status and duration. Supports pagination.',
    inputSchema: {
      limit: z.number().int().positive().max(200).optional().describe('Max sessions to return.'),
      offset: z.number().int().nonnegative().optional().describe('Pagination offset.'),
    },
    request: (a) => ({ path: 'sessions', query: { limit: a.limit, offset: a.offset } }),
  },
  {
    name: 'get_session',
    title: 'Get a workout session',
    description:
      'Fetch one workout session in full: lifecycle events, each exercise performed, every logged set (weight/reps/duration/distance/RPE/heart-rate), and the derived last set.',
    inputSchema: {
      session_id: z.string().uuid().describe('The session UUID (from list_sessions).'),
    },
    request: (a) => ({ path: `sessions/${encodeURIComponent(a.session_id as string)}` }),
  },
  {
    name: 'get_analytics_dashboard',
    title: 'Analytics: dashboard',
    description: 'Fetch the aggregate analytics dashboard (headline training stats) for a window.',
    inputSchema: { ...windowArgs },
    request: (a) => ({ path: 'analytics/dashboard', query: { window: a.window, tz: a.tz } }),
  },
  {
    name: 'get_analytics_summary',
    title: 'Analytics: summary',
    description: 'Fetch summary training metrics (totals, averages) for a window.',
    inputSchema: { ...windowArgs },
    request: (a) => ({ path: 'analytics/summary', query: { window: a.window, tz: a.tz } }),
  },
  {
    name: 'get_analytics_volume',
    title: 'Analytics: volume over time',
    description: 'Fetch training volume bucketed over time for a window.',
    inputSchema: {
      ...windowArgs,
      bucket: z
        .string()
        .optional()
        .describe('Bucket granularity, e.g. "day", "week", "month".'),
    },
    request: (a) => ({
      path: 'analytics/volume',
      query: { window: a.window, tz: a.tz, bucket: a.bucket },
    }),
  },
  {
    name: 'get_analytics_muscle_groups',
    title: 'Analytics: muscle-group distribution',
    description: 'Fetch training volume/sets distribution across muscle groups for a window.',
    inputSchema: { ...windowArgs },
    request: (a) => ({ path: 'analytics/muscle-groups', query: { window: a.window, tz: a.tz } }),
  },
  {
    name: 'get_analytics_consistency',
    title: 'Analytics: consistency',
    description: 'Fetch training consistency/frequency (e.g. sessions per week, streaks) for a window.',
    inputSchema: { ...windowArgs },
    request: (a) => ({ path: 'analytics/consistency', query: { window: a.window, tz: a.tz } }),
  },
  {
    name: 'get_analytics_records',
    title: 'Analytics: personal records',
    description: 'Fetch personal records (e.g. top set weight / best efforts) for a window.',
    inputSchema: { ...windowArgs },
    request: (a) => ({ path: 'analytics/records', query: { window: a.window, tz: a.tz } }),
  },
  {
    name: 'get_analytics_exercise_trends',
    title: 'Analytics: exercise trends',
    description: 'Fetch progressive-overload trends across exercises for a window.',
    inputSchema: { ...windowArgs },
    request: (a) => ({ path: 'analytics/exercise-trends', query: { window: a.window, tz: a.tz } }),
  },
]

/** Execute a tool against the API and return a pretty-printed JSON string. */
export async function runTool(
  client: GymApiClient,
  tool: ToolDef,
  args: Record<string, unknown>,
): Promise<string> {
  const { path, query } = tool.request(args)
  const data = await client.get(path, query)
  return JSON.stringify(data, null, 2)
}
