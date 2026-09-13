import { useState } from 'react'
import { muscleGroupLabel, type MuscleGroupStat } from '@/types/api'
import { buildMuscleUsageDiagramUrl } from '@/lib/muscleDiagram'

interface MuscleUsageDiagramProps {
  groups: MuscleGroupStat[]
}

// Accessible alt text naming the most-trained groups so the description matches
// the visual without reading out every muscle.
function altText(groups: MuscleGroupStat[]): string {
  const top = [...groups]
    .filter((g) => g.sets > 0)
    .sort((a, b) => b.sets - a.sets)
    .slice(0, 3)
    .map((g) => muscleGroupLabel(g.muscle_group).toLowerCase())
  if (top.length === 0) return 'Muscle-usage body diagram: nothing trained yet'
  return `Muscle-usage body diagram, colored by training volume. Most trained: ${top.join(', ')}.`
}

// Renders anatome's dual-view body SVG colored by how much each muscle group was
// trained, on a yellow → orange → red gradient relative to the user's own
// most-trained group (PRD 0011). Reuses the muscle-diagram figure/skeleton styles
// from PRD 0009. Renders an empty note when nothing maps or the image fails.
export function MuscleUsageDiagram({ groups }: MuscleUsageDiagramProps) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  const src = buildMuscleUsageDiagramUrl(groups)

  if (src == null || failed) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        No muscles trained in this window yet.
      </p>
    )
  }

  return (
    <div className="muscle-diagram">
      <div className="muscle-diagram-figure" data-loaded={loaded}>
        {!loaded ? <div className="muscle-diagram-skeleton" aria-hidden="true" /> : null}
        <img
          src={src}
          alt={altText(groups)}
          className="muscle-diagram-img"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      </div>
      <div className="muscle-usage-legend" aria-hidden="true">
        <span className="muscle-usage-legend-label">Less</span>
        <span className="muscle-usage-legend-bar" />
        <span className="muscle-usage-legend-label">More</span>
      </div>
    </div>
  )
}
