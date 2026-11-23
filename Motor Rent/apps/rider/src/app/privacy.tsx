import { LegalPage } from '@/components/legal-page';
import { PRIVACY, PRIVACY_UPDATED } from '@/lib/privacy';

export default function PrivacyScreen() {
  return <LegalPage title="Privacy policy." lead={`What we collect, why, and the choices you have. Updated ${PRIVACY_UPDATED}.`} sections={PRIVACY} />;
}
