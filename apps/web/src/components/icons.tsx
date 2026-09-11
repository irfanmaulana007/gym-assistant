import type { SVGProps } from 'react'

// Lightweight inline icon set (stroke-based, inherits currentColor). Keeping
// these in one place avoids pulling in an icon dependency for a handful of glyphs.
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function ChevronLeft(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

export function ChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

export function LogOutIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  )
}

export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

export function PencilIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function HomeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}

export function UserIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} aria-hidden {...props}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}
