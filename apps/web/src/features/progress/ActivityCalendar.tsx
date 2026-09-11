import type { CalendarDay } from '@/types/api'

interface ActivityCalendarProps {
  days: CalendarDay[]
  from: string
}

const MS_PER_DAY = 86_400_000
const MAX_WEEKS = 12

// Month-style contribution heatmap of session days. Columns are weeks
// (Monday-start), rows are weekdays — a native "activity calendar" (PRD §4.2).
// The span is bounded so long windows stay readable.
export function ActivityCalendar({ days, from }: ActivityCalendarProps) {
  const counts = new Map<string, number>()
  for (const d of days) counts.set(d.date, d.count)

  const today = startOfDay(new Date())
  let start = startOfDay(parseISO(from))
  const earliest = new Date(today.getTime() - (MAX_WEEKS * 7 - 1) * MS_PER_DAY)
  if (start < earliest) start = earliest
  start = mondayOf(start)

  const weeks: Date[][] = []
  for (let cursor = new Date(start); cursor <= today; ) {
    const week: Date[] = []
    for (let i = 0; i < 7; i++) {
      week.push(new Date(cursor))
      cursor = new Date(cursor.getTime() + MS_PER_DAY)
    }
    weeks.push(week)
  }

  const totalSessions = days.reduce((sum, d) => sum + d.count, 0)

  return (
    <div className="calendar-wrap">
      {/* Fixed weekday labels so a session's day is readable at a glance. */}
      <div className="calendar-weekdays" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="chart-scroll">
        <div className="calendar" role="img" aria-label={`${totalSessions} sessions across the window`}>
          {weeks.map((week) => (
            <div className="calendar-week" key={week[0].toISOString()}>
              {week.map((day) => {
                const key = isoDate(day)
                const inRange = day <= today
                const count = counts.get(key) ?? 0
                const label = day.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })
                return (
                  <div
                    key={key}
                    className={`calendar-cell tier-${tier(count)}${inRange ? '' : ' is-future'}`}
                    title={`${label} · ${count} session${count === 1 ? '' : 's'}`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Monday-first weekday labels aligned to the calendar rows.
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function tier(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count === 2) return 2
  return 3
}

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('T')[0].split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function mondayOf(d: Date): Date {
  const day = startOfDay(d)
  const offset = (day.getDay() + 6) % 7 // JS weeks start Sunday; shift to Monday=0
  return new Date(day.getTime() - offset * MS_PER_DAY)
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
