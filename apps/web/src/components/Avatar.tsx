import { initialsFor } from '@/lib/initials'

// Circular avatar: renders the user's picture when `src` is set (PRD 0008),
// otherwise falls back to initials derived from a name (or email).
export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'md' | 'lg' }) {
  const cls = `avatar ${size === 'lg' ? 'avatar-lg' : ''}`
  if (src) {
    return <img className={`${cls} avatar-img`} src={src} alt="" aria-hidden />
  }
  return (
    <span className={cls} aria-hidden>
      {initialsFor(name)}
    </span>
  )
}
