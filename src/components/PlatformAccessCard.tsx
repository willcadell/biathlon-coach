import { useEffect, useState } from 'react'
import { accessToMyData } from '../lib/platformAdmin'
import { Dropdown } from './Dropdown'
import { Help } from './Help'

/**
 * When someone from 545 Coach's own team has opened this athlete's training,
 * for support or safety. The operators can look, read-only, and every look is
 * recorded; this is where the athlete reads those records. Nothing is shown
 * when there are none, so most athletes never see it.
 */
export function PlatformAccessCard() {
  const [entries, setEntries] = useState<{ id: number; at: string }[]>([])
  useEffect(() => {
    let cancelled = false
    void accessToMyData().then((e) => { if (!cancelled) setEntries(e) }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  if (entries.length === 0) return null
  return (
    <Dropdown
      title="Who has looked at my training"
      help={
        <Help>
          545 Coach's own team can open your training, read-only, to help with support or keep people safe.
          Each time they do, it's recorded here. Coaches in your clubs aren't listed here: you can see them
          under each club.
        </Help>
      }
    >
      <div className="card">
        {entries.map((e) => (
          <p key={e.id} className="meta" style={{ margin: '0 0 6px' }}>
            545 Coach team · {new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        ))}
      </div>
    </Dropdown>
  )
}
