// Age derivation from a date of birth (PRD 0008 — age is derived, never
// stored). Pure so it is trivially unit-tested; `now` is injectable.

/** Whole years from an ISO date-of-birth to `now`, or null when unparseable. */
export function ageFrom(dob: string | null | undefined, now: Date = new Date()): number | null {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null
  let age = now.getFullYear() - born.getFullYear()
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) {
    age--
  }
  return age >= 0 ? age : null
}
