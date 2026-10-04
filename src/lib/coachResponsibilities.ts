import { supabase } from './supabase'

/**
 * The coach responsibilities a coach agrees to before they can create a club,
 * ask to join one, ask to follow an athlete, or write on anyone's training.
 * The database holds the record and enforces it (see coach_acknowledgements);
 * this is just reading and writing it.
 *
 * Keep VERSION in step with required_coach_ack_version() in the database.
 * Raise both when the wording changes materially, and every coach agrees again.
 */
export const RESPONSIBILITIES_VERSION = 1

/** Where the Universal Code of Conduct to Prevent and Address Maltreatment in
 *  Sport (UCCMS) is published: the master copy, on Sport Integrity Canada's
 *  site. The CCES address it used to live at now redirects to a 404, so if this
 *  breaks too, check sportintegrity.ca for the current document. */
export const UCCMS_URL = 'https://sportintegrity.ca/media/567'

export async function hasAcknowledgedResponsibilities(coachId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('coach_acknowledgements').select('version').eq('coach_id', coachId).maybeSingle()
  if (error) throw error
  return data !== null && (data.version as number) >= RESPONSIBILITIES_VERSION
}

export async function acknowledgeResponsibilities(): Promise<void> {
  const { error } = await supabase.rpc('accept_coach_responsibilities', { p_version: RESPONSIBILITIES_VERSION })
  if (error) throw error
}
