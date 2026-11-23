import { LegalPage } from '@/components/legal-page';
import { TERMS, TERMS_UPDATED, TERMS_VERSION } from '@/lib/terms';

export default function TermsScreen() {
  return <LegalPage title="Rental terms." lead={`The plain-language rules for renting with us. Updated ${TERMS_UPDATED} (version ${TERMS_VERSION}).`} sections={TERMS} />;
}
