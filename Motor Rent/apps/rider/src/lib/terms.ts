/** Bump when the wording changes; riders accept a specific version when booking (stored on the booking). */
export const TERMS_VERSION = '2026-11-v3';
export const TERMS_UPDATED = '22 November 2026';

export type TermsSection = { title: string; body: string[] };

// Plain-language rental terms. Have them reviewed by a Maldivian lawyer before relying on them.
export const TERMS: TermsSection[] = [
  { title: 'Who can rent', body: [
    'You must be at least 18, hold a driving licence valid for the vehicle, and pass our identity check (licence, ID card or passport, and a selfie).',
    'The person who books is the only person allowed to ride the vehicle.',
  ] },
  { title: 'Booking and payment', body: [
    'A booking is reserved for a short time and confirmed only once we receive full payment. Unpaid reservations expire automatically.',
    'Prices are shown before you book and include everything listed in the quote.',
    'We keep 15 minutes between rentals of the same vehicle for cleaning and handover.',
  ] },
  { title: 'Pickup and return', body: [
    'Pick up and return the vehicle at our counter during opening hours (07:00 to 22:00, Maldives time).',
    'At pickup and return we photograph the vehicle and record the odometer, running hours and fuel. You and our staff both sign these records.',
    'Return the vehicle on time and with the same fuel level. Late returns are charged for each started hour after a short grace period, at the rate in your price plan.',
  ] },
  { title: 'Cancellations', body: [
    'You can cancel an unpaid reservation at any time. For paid bookings, contact us and we will apply the refund shown at the time of booking.',
    'We may cancel a booking if the vehicle becomes unsafe or unavailable; you then get a full refund.',
  ] },
  { title: 'Your responsibilities', body: [
    'Ride safely, follow Maldivian traffic law, and do not carry more passengers than allowed. A helmet is not included with the bike; ask for one when you book if you want it.',
    'You are responsible for fines, damage and loss caused while the vehicle is in your care. We show you the evidence (photos, readings, signed records) before charging for damage.',
    'Report any accident, breakdown or theft to us and, where required, to the police straight away.',
  ] },
  { title: 'Blocklist', body: [
    'We may refuse future rentals to a rider who has not paid money they owe us, seriously damaged or misused a vehicle, gave false identity details, or behaved abusively towards staff.',
    'The blocklist is internal. It is seen only by Rent a Motor staff and is never published or shown to other riders.',
    'If you are on it, you can see that and the reason on your Account page. You can settle what is owed or tell us why you think it is wrong, and we will review it and remove the entry once it is resolved.',
  ] },
  { title: 'Your data', body: [
    'We use your identity documents only to check who you are and that you may ride. Only our staff can see them, and you can delete your account at any time (except while a rental is open).',
    'We send booking updates and reminders by WhatsApp to the number you give us.',
  ] },
  { title: 'Contact', body: [
    'Questions or complaints: use the message thread on your rental, or the contact details on your Account page.',
  ] },
];
