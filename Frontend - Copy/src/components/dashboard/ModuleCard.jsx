import { createElement } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react'
import Sparkline from './Sparkline'

/**
 * Shared department summary card on the Operations Dashboard.
 *
 * One headline number per department, a trend line under it, and three
 * supporting figures — nothing else. The detail (who, which request, when)
 * lives in the module itself and in the shared activity feed, so the card
 * answers a single question: "is this department healthy right now?"
 *
 * The whole card is the link, via the stretched-link pattern: a real anchor on
 * the title carries the accessible name and keyboard focus, and its ::after
 * overlay makes the entire card surface clickable. A <button> wrapper would be
 * invalid here — a button may only contain phrasing content, not <header>/<dl>.
 *
 * Props:
 *   icon, title, subtitle — header identity
 *   href                  — where the card navigates
 *   accent                — people | procurement | maintenance | materials
 *   hero                  — { label, value, delta?, spark?, tone? } the headline
 *   stats                 — up to three { label, value, tone? } supporting figures
 *   loading               — swaps numbers for skeletons
 */
export default function ModuleCard({
  icon: Icon, title, subtitle, href,
  accent = 'people',
  hero = null, stats = [],
  loading = false,
  className = '',
}) {
  const heroValue = hero?.value ?? '—'
  const delta = Number.isFinite(hero?.delta) && hero.delta !== 0 ? hero.delta : null

  return (
    <article className={`operations-module operations-module--${accent} ${className}`}>
      <header>
        <span className="operations-module-icon">
          {createElement(Icon, { className: 'h-5 w-5' })}
        </span>
        <span className="operations-module-identity">
          <strong>
            <Link to={href} className="operations-module-link">{title}</Link>
          </strong>
          {subtitle && <small>{subtitle}</small>}
        </span>
        <ArrowUpRight className="operations-module-go h-4 w-4" aria-hidden="true" />
      </header>

      {hero && (
        <div className="operations-module-hero">
          <span className="operations-module-figure">
            {loading
              ? <span className="operations-skeleton-number" />
              : <span className={`operations-module-value ${HERO_TONES[hero.tone] || ''}`}>{heroValue}</span>}
            {!loading && delta !== null && (
              <span className={`operations-delta ${delta > 0 ? 'operations-delta--up' : 'operations-delta--down'}`}>
                {createElement(delta > 0 ? TrendingUp : TrendingDown, { className: 'h-3 w-3' })}
                {Math.abs(delta)}
              </span>
            )}
          </span>
          <p className="operations-module-caption">{hero.label}</p>
        </div>
      )}

      <div className="operations-module-trend">
        {!loading && hero?.spark?.length > 1
          ? <Sparkline values={hero.spark} tone={ACCENT_HEX[accent] || ACCENT_HEX.people} height={34} />
          : <span className="operations-module-rule" />}
      </div>

      {stats.length > 0 && (
        <dl className="operations-module-stats">
          {stats.slice(0, 3).map(stat => (
            <div key={stat.label}>
              <dt>{stat.label}</dt>
              <dd className={HERO_TONES[stat.tone] || ''}>
                {loading ? <span className="operations-skeleton-chip" /> : stat.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}

const ACCENT_HEX = {
  people:      '#005782',
  procurement: '#177b78',
  maintenance: '#b5843b',
  materials:   '#58738f',
}

const HERO_TONES = {
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  red:   'text-red-600',
}
