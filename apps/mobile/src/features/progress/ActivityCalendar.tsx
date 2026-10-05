import React from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { color, sp } from '@/theme'
import type { CalendarDay } from '@/types/api'

const MS_PER_DAY = 86_400_000
const MAX_WEEKS = 12
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Month-style contribution heatmap of session days (ported from apps/web
// ActivityCalendar). Columns are weeks (Monday-start), rows are weekdays. Tier
// colors mirror the web --calendar tiers built from --primary.
export function ActivityCalendar({ days, from }: { days: CalendarDay[]; from: string }) {
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

  return (
    <View style={s.wrap}>
      <View style={s.weekdays}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={s.weekdayText}>
            {d}
          </Text>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.calendar}>
          {weeks.map((week) => (
            <View style={s.week} key={week[0].toISOString()}>
              {week.map((day) => {
                const key = isoDate(day)
                const inRange = day <= today
                const count = counts.get(key) ?? 0
                return <View key={key} style={[s.cell, tierStyle(count), !inRange && s.future]} />
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

function tierStyle(count: number) {
  if (count <= 0) return { backgroundColor: color.surface2 }
  if (count === 1) return { backgroundColor: color.primarySoft }
  if (count === 2) return { backgroundColor: 'rgba(47, 212, 119, 0.55)' }
  return { backgroundColor: color.primary }
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
  const offset = (day.getDay() + 6) % 7
  return new Date(day.getTime() - offset * MS_PER_DAY)
}
function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const s = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-start', gap: sp[2] },
  weekdays: { gap: 4 },
  weekdayText: { height: 14, lineHeight: 14, fontSize: 10, color: color.textFaint, textAlign: 'right' },
  calendar: { flexDirection: 'row', gap: 4 },
  week: { gap: 4 },
  cell: { width: 14, height: 14, borderRadius: 3, backgroundColor: color.surface2 },
  future: { opacity: 0.25 },
})
