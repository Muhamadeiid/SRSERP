/**
 * Tiny inline trend line for a KPI tile.
 *
 * Deliberately axis-free and label-free: it exists to say "this number has
 * been climbing / flat / falling", not to be read off. Decorative to assistive
 * tech — the KPI value and its delta pill carry the meaning.
 */
export default function Sparkline({ values = [], tone = '#005782', height = 22 }) {
  const points = values.filter(value => Number.isFinite(value))
  if (points.length < 2) return null

  const max = Math.max(...points)
  const min = Math.min(...points)
  const span = max - min || 1
  const width = 100

  // Map each sample into the 0..100 × 0..height box, flipping Y for SVG.
  const coords = points.map((value, index) => {
    const x = (index / (points.length - 1)) * width
    const y = height - ((value - min) / span) * (height - 4) - 2
    return [x, y]
  })

  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`
  const gradientId = `spark-${tone.replace('#', '')}-${points.length}`

  return (
    <svg
      className="operations-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={tone} stopOpacity="0.22" />
          <stop offset="100%" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={tone} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
