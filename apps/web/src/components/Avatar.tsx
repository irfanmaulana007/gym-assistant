import { initialsFor } from '@/lib/initials'

// Circular initials avatar derived from a name (or email fallback).
export function Avatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`avatar ${size === 'lg' ? 'avatar-lg' : ''}`} aria-hidden>
      {initialsFor(name)}
    </span>
  )
}
