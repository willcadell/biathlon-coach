import type { MetalTarget } from '../lib/types'
import { METAL_TARGETS } from '../lib/metal'

/** A compact, read-only row of the five targets — a glance at WHICH ones
 *  fell, not just how many, wherever a metal bout is listed. */
export function MiniTargets({ hits }: { hits: Record<MetalTarget, boolean> }) {
  return (
    <span
      style={{ display: 'inline-flex', gap: 3 }}
      title={METAL_TARGETS.filter((t) => !hits[t]).map((t) => `${t} missed`).join(', ') || 'all hit'}
    >
      {METAL_TARGETS.map((t) => (
        <span
          key={t}
          style={{
            width: 9, height: 9, borderRadius: '50%', flex: 'none',
            background: hits[t] ? 'var(--raised)' : 'var(--series-1)',
            border: '1.5px solid var(--series-1)', boxSizing: 'border-box',
          }}
        />
      ))}
    </span>
  )
}
