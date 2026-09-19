import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight } from 'lucide-react'

/**
 * "Needs your attention" strip — the one row on the Operations Dashboard that
 * answers "what is waiting on me right now?" rather than "how are we doing?".
 *
 * Renders nothing when there is nothing to act on, so a clean day stays clean.
 * Each chip is a deep link straight into the queue it counts.
 */
export default function AttentionStrip({ items = [] }) {
  const navigate = useNavigate()
  const actionable = items.filter(item => item.count > 0)

  if (actionable.length === 0) return null

  const total = actionable.reduce((sum, item) => sum + item.count, 0)

  return (
    <section className="operations-attention" aria-label="Items awaiting your action">
      <div className="operations-attention-lead">
        <span className="operations-attention-icon"><AlertTriangle className="h-4 w-4" /></span>
        <span>
          <strong>{total}</strong> item{total === 1 ? '' : 's'} need your attention
        </span>
      </div>
      <div className="operations-attention-chips">
        {actionable.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => navigate(item.href)}
            className={`operations-chip operations-chip--${item.tone || 'amber'}`}
          >
            <span className="operations-chip-count">{item.count}</span>
            <span className="operations-chip-label">{item.label}</span>
            <ArrowRight className="h-3.5 w-3.5 opacity-60" />
          </button>
        ))}
      </div>
    </section>
  )
}
