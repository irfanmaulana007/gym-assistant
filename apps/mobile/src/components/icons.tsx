import React from 'react'
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'
import { color as tokens } from '@/theme/tokens'

// Stroke-based icon set mirroring apps/web/src/components/icons.tsx, rendered
// with react-native-svg. Inherits `color` (default currentColor-equivalent).
export interface IconProps {
  size?: number
  color?: string
}

function Icon({ size = 24, color = tokens.text, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  )
}

export const ChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <Polyline points="15 18 9 12 15 6" />
  </Icon>
)
export const ChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <Polyline points="9 18 15 12 9 6" />
  </Icon>
)
export const LogOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <Polyline points="16 17 21 12 16 7" />
    <Line x1="21" y1="12" x2="9" y2="12" />
  </Icon>
)
export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Polyline points="12 7 12 12 15 14" />
  </Icon>
)
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Line x1="12" y1="5" x2="12" y2="19" />
    <Line x1="5" y1="12" x2="19" y2="12" />
  </Icon>
)
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 20h9" />
    <Path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </Icon>
)
export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <Circle cx="12" cy="7" r="4" />
  </Icon>
)
export const DumbbellIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6.5 6.5v11" />
    <Path d="M3.5 8.5v7" />
    <Path d="M17.5 6.5v11" />
    <Path d="M20.5 8.5v7" />
    <Line x1="6.5" y1="12" x2="17.5" y2="12" />
  </Icon>
)
export const ChartIcon = (p: IconProps) => (
  <Icon {...p}>
    <Line x1="3" y1="21" x2="21" y2="21" />
    <Rect x="5" y="12" width="3.5" height="6" rx="1" />
    <Rect x="10.25" y="8" width="3.5" height="10" rx="1" />
    <Rect x="15.5" y="4" width="3.5" height="14" rx="1" />
  </Icon>
)
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Polyline points="20 6 9 17 4 12" />
  </Icon>
)
export const XIcon = (p: IconProps) => (
  <Icon {...p}>
    <Line x1="18" y1="6" x2="6" y2="18" />
    <Line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
)
export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M6 4l14 8-14 8z" />
  </Icon>
)
export const PauseIcon = (p: IconProps) => (
  <Icon {...p}>
    <Line x1="8" y1="5" x2="8" y2="19" />
    <Line x1="16" y1="5" x2="16" y2="19" />
  </Icon>
)
export const FlagIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M4 21V4h12l-2 4 2 4H4" />
  </Icon>
)
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <Polyline points="3 6 5 6 21 6" />
    <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <Path d="M10 11v6M14 11v6" />
  </Icon>
)
