export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

/** Rider-facing wording for each booking status. */
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  held: { label: 'Awaiting payment', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'success' },
  active: { label: 'On the road', tone: 'accent' },
  overdue: { label: 'Overdue — please return', tone: 'danger' },
  returned: { label: 'Returned', tone: 'neutral' },
  damage_claim: { label: 'Damage review', tone: 'warning' },
  closed: { label: 'Completed', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/** Short names used in the timeline ("Awaiting payment → Confirmed"). */
export const STAGE: Record<string, string> = {
  held: 'Reserved', confirmed: 'Confirmed', active: 'On the road', overdue: 'Overdue', returned: 'Returned',
  damage_claim: 'Damage review', closed: 'Completed', expired: 'Expired', cancelled: 'Cancelled',
};

export const statusOf = (s: string) => STATUS[s] ?? { label: s, tone: 'neutral' as Tone };
