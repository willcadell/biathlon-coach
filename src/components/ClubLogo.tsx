import { clubLogoUrl } from '../lib/coaching'

/** A club's own branding, or a plain placeholder for a club that hasn't
 *  set one — used everywhere a club is listed, not just the Coach tab. */
export function ClubLogo({ logoPath, size }: { logoPath: string | null; size: number }) {
  const style = { width: size, height: size, borderRadius: size / 5, flex: 'none' as const, objectFit: 'cover' as const }
  if (!logoPath) {
    return (
      <div
        style={{
          ...style, background: 'var(--grid)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-muted)', fontSize: size * 0.5,
        }}
        aria-hidden="true"
      >
        🎯
      </div>
    )
  }
  return <img src={clubLogoUrl(logoPath)} alt="" style={style} />
}
