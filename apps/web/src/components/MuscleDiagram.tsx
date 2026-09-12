import { useState } from 'react'
import { muscleGroupLabel, type MuscleGroup } from '@/types/api'
import { buildMuscleDiagramUrl } from '@/lib/muscleDiagram'

interface MuscleDiagramProps {
  primary: MuscleGroup
  secondary: readonly MuscleGroup[]
}

// Accessible alt text describing the worked muscles, reusing muscleGroupLabel so
// the description matches the visible badges.
function altText(primary: MuscleGroup, secondary: readonly MuscleGroup[]): string {
  const parts = [`${muscleGroupLabel(primary).toLowerCase()} (primary)`]
  if (secondary.length > 0) {
    const names = secondary.map((g) => muscleGroupLabel(g).toLowerCase())
    const joined =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    parts.push(`${joined} (secondary)`)
  }
  return `Muscles worked: ${parts.join(', ')}`
}

// Renders anatome's raw muscle-diagram SVG for an exercise (PRD 0009). The
// diagram is additive on top of the text badges: when the muscle groups don't
// map to anything, or the SVG fails to load, this renders nothing and the badges
// remain the source of truth.
export function MuscleDiagram({ primary, secondary }: MuscleDiagramProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const src = buildMuscleDiagramUrl(primary, secondary)
  if (src == null || failed) return null

  return (
    <div className="muscle-diagram">
      <div className="muscle-diagram-figure" data-loaded={loaded}>
        {!loaded ? <div className="muscle-diagram-skeleton" aria-hidden="true" /> : null}
        <img
          src={src}
          alt={altText(primary, secondary)}
          className="muscle-diagram-img"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </div>
      <div className="muscle-diagram-legend" aria-hidden="true">
        <span className="muscle-legend-item">
          <span className="muscle-swatch muscle-swatch-primary" />
          Primary
        </span>
        {secondary.length > 0 ? (
          <span className="muscle-legend-item">
            <span className="muscle-swatch muscle-swatch-secondary" />
            Secondary
          </span>
        ) : null}
      </div>
    </div>
  )
}
