import { createElement } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Loader2 } from 'lucide-react'

/**
 * Shared module summary card used on the Operations Dashboard.
 *
 * Each department (HR, Procurement, Maintenance, Material Control) reuses the
 * same card so the root dashboard reads as one system: identical header rhythm,
 * KPI band, and recent-items list, distinguished only by icon and content.
 *
 * Props:
 *   icon           — lucide icon component for the header tile
 *   title, subtitle — header text
 *   href           — where the whole card header links to (Open Module)
 *   primaryAction  — optional secondary CTA in the header (e.g. "New PRF")
 *   kpis           — [{ label, value, tone?: 'green'|'amber'|'red'|'primary', onClick? }]
 *   recent         — [{ id, title, sub, badge, href }]
 *   emptyRecent    — copy shown when the recent list is empty
 *   loading        — swaps KPI values and rows for a skeleton
 */
export default function ModuleCard({
  icon: Icon, title, subtitle,
  href, primaryAction,
  kpis = [], recent = [], emptyRecent = 'Nothing to show yet',
  loading = false,
  className = '',
  accent = 'people', recentLabel = 'Recent activity',
  children, showRecent = true,
}) {
  const navigate = useNavigate()

  return (
    <section className={`operations-module operations-module--${accent} flex min-w-0 flex-col overflow-hidden rounded-2xl border border-neutral-100 bg-white ${className}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="operations-module-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            {createElement(Icon, { className: 'h-5 w-5' })}
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-secondary-700">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-neutral-500">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {primaryAction && (
            <button
              type="button"
              onClick={() => navigate(primaryAction.href)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-3 text-[10px] font-bold text-secondary-700 hover:bg-neutral-50"
            >
              {primaryAction.icon && <primaryAction.icon className="h-3.5 w-3.5" />}
              {primaryAction.label}
            </button>
          )}
          {href && (
            <button
              type="button"
              onClick={() => navigate(href)}
              aria-label={`Explore ${title}`}
              className="operations-explore inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-white hover:bg-primary/90"
            >
              Explore <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      {kpis.length > 0 && (
        // md-grid columns are pinned to a fixed set of classnames so Tailwind's
        // JIT actually picks them up — dynamic md:grid-cols-${n} would purge.
        <div className={`operations-kpis grid grid-cols-2 border-b border-neutral-100 ${KPI_MD_COLS[Math.min(kpis.length, 4)] || 'md:grid-cols-4'}`}>
          {kpis.map((kpi, index) => {
            const tone = KPI_TONES[kpi.tone] || KPI_TONES.default
            const Base = kpi.onClick ? 'button' : 'div'
            return (
              <Base
                key={kpi.label}
                type={kpi.onClick ? 'button' : undefined}
                onClick={kpi.onClick}
                className={`
                  px-4 py-3 text-left transition-colors
                  ${kpi.onClick ? 'hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25' : ''}
                  ${index % 2 === 0 ? 'border-r border-neutral-100' : ''}
                  ${index < 2 ? 'border-b border-neutral-100 md:border-b-0' : ''}
                  md:border-r md:last:border-r-0
                `}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{kpi.label}</p>
                <p className={`mt-3 text-3xl font-bold tracking-tight leading-none ${tone}`}>
                  {loading ? <span className="inline-block h-6 w-10 animate-pulse rounded bg-neutral-100" /> : kpi.value}
                </p>
                {kpi.sub && <p className="mt-1 truncate text-[10px] text-neutral-400">{kpi.sub}</p>}
              </Base>
            )
          })}
        </div>
      )}

      {children}
      {showRecent && <>
      <p className="operations-activity-label">{recentLabel}</p>
      <div className="operations-recent-list flex-1 divide-y divide-neutral-100">
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-300" />
          </div>
        ) : recent.length === 0 ? (
          <div className="operations-empty"><Icon className="h-7 w-7" /><p>{emptyRecent}</p></div>
        ) : recent.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => item.href && navigate(item.href)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/25"
          >
            {item.icon && (
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${item.iconTone || 'bg-neutral-100 text-neutral-500'}`}>
                <item.icon className="h-4 w-4" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-xs text-secondary-700">{item.title}</strong>
              {item.sub && <span className="mt-0.5 block truncate text-[10px] text-neutral-400">{item.sub}</span>}
            </span>
            {item.badge}
          </button>
        ))}
      </div>
      </>}
    </section>
  )
}

const KPI_TONES = {
  default: 'text-secondary-700',
  primary: 'text-primary',
  green:   'text-emerald-600',
  amber:   'text-amber-600',
  red:     'text-red-600',
  blue:    'text-blue-600',
}

const KPI_MD_COLS = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
}
