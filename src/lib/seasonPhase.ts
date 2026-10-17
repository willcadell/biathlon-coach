/**
 * Where an athlete is in the biathlon year, from the date alone (northern
 * hemisphere). The shooting advice library uses it to pick what is timely.
 *
 *   April, May          transition: recover, low-stakes technique, rifle service
 *   June to August      general preparation: foundations at rest and low intensity
 *   September, October  specific preparation: shooting under load, range approach
 *   November, December  early season: first races, from experimenting to repeating
 *   January to March    competition: repeat routines, taper, race tactics
 *
 * The months are a first cut agreed for now and expected to be refined.
 */
export type SeasonPhase = 'transition' | 'general' | 'specific' | 'early' | 'competition'

export const SEASON_PHASE_LABEL: Record<SeasonPhase, string> = {
  transition: 'Transition',
  general: 'General preparation',
  specific: 'Specific preparation',
  early: 'Early season',
  competition: 'Competition',
}

export function seasonPhase(date: Date): SeasonPhase {
  const month = date.getMonth() + 1
  if (month >= 6 && month <= 8) return 'general'
  if (month === 9 || month === 10) return 'specific'
  if (month === 11 || month === 12) return 'early'
  if (month >= 1 && month <= 3) return 'competition'
  return 'transition'
}
