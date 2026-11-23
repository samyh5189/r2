import type { TermsSection } from './terms';

export const PRIVACY_UPDATED = '22 November 2026';

// Plain-language privacy policy. Have it reviewed by a Maldivian lawyer before relying on it.
export const PRIVACY: TermsSection[] = [
  { title: 'Who we are', body: [
    'EasyRide (Kulhudhuffushi MotoRentals) rents scooters, motorbikes and cars in Kulhudhuffushi, Maldives. This policy explains what we collect when you use our app or website, why, and what you can do about it.',
  ] },
  { title: 'What we collect', body: [
    'Account details: your name, email address, phone and WhatsApp number. If you sign in with Google or Apple, we receive your name, email address and profile picture from them, and nothing else.',
    'Identity check: photos of your driving licence and ID card or passport, a selfie, your date of birth and licence expiry date. We need these by law and to protect our vehicles.',
    'Rentals: bookings, pickup and return times, the vehicle, inspection photos, odometer and fuel readings, signatures, messages with our staff and payment records (bank transfer slips or card payment references; we never see or store full card numbers).',
  ] },
  { title: 'How we use it', body: [
    'To create your account, verify your identity, take bookings and payments, hand over and collect vehicles, and send you booking updates and sign-in codes by email, WhatsApp or, if you open our Viber chat, Viber. On Viber we keep your Viber ID and name to send you updates; stop them by leaving the chat.',
    'To keep records the law requires, to settle damage or unpaid charges, and to keep an internal blocklist described in our rental terms.',
    'We do not sell your data or use it for advertising.',
  ] },
  { title: 'Who can see it', body: [
    'Only our staff who need it for your rental. Identity documents are visible to managers who check them.',
    'Service providers that run the app for us: Supabase (database, sign-in and file storage), Vercel (website hosting), Meta (WhatsApp messages), Rakuten Viber (Viber messages, only if you open our chat) and our payment providers. They process data only on our instructions.',
    'Police or other authorities when the law requires it, for example after an accident or a traffic offence.',
  ] },
  { title: 'How long we keep it', body: [
    'Account and rental records are kept while you have an account and for as long as the law requires after your last rental. Identity documents are deleted once they are no longer needed for that purpose.',
  ] },
  { title: 'Your choices', body: [
    'You can see and update your details in the app, and delete your account from the Account page. Deleting removes your profile and documents, except records we must keep by law or for an open claim.',
    'You can ask us for a copy of your data or to correct it by messaging us on WhatsApp or at the counter.',
  ] },
  { title: 'Security', body: [
    'Data is sent over encrypted connections, sign-in sessions are stored securely on your device, and access in our systems is limited by role.',
  ] },
  { title: 'Changes', body: [
    'If we change this policy we will update the date above and, for important changes, tell you in the app.',
  ] },
];
