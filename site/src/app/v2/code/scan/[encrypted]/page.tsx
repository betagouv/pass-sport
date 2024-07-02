'use server';

import styles from './styles.module.scss';
import cn from 'classnames';
import { URLSearchParams } from 'next/dist/compiled/@edge-runtime/primitives';
import QrCodeCard from './components/QrCodeCard/QrCodeCard';
import { decryptData } from '../../../../../../utils/decryption';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

interface Props {
  params: {
    encrypted: string;
  };
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Résultat de votre QR pass Sport',
  };
}

function Page({ params: { encrypted } }: Props) {
  if (!process.env.QR_CODE_BASE_URL) {
    throw new Error('QR_CODE_BASE_URL missing');
  }

  if (!process.env.BASE_64_KEY) {
    throw new Error('BASE_64_KEY missing');
  }

  const base64Key = process.env.BASE_64_KEY;
  encrypted = decodeURIComponent(encrypted.replace(/\+/g, ' '));

  const decryptedParams = decryptData(encrypted, base64Key);

  if (decryptedParams === null) return <InvalidContainer />;

  const searchParams = new URLSearchParams(decryptedParams);
  const replaceDoubleQuotes = (input: string | null) => input?.replaceAll(`''`, `'`) || input;

  const [firstname, lastname, gender, birthDate, code] = [
    replaceDoubleQuotes(searchParams.get('bp')),
    replaceDoubleQuotes(searchParams.get('bn')),
    searchParams.get('bg'),
    searchParams.get('bdn'),
    searchParams.get('c'),
  ];

  if (!firstname || !lastname || !gender || !birthDate || !code) {
    return <InvalidContainer />;
  }

  const qrCodeValue = `${process.env.QR_CODE_BASE_URL}/${encodeURIComponent(encrypted)}`;

  return (
    <div className={cn(styles['page'], 'fr-px-2w')}>
      <div className={cn(styles['container'], 'fr-container--fluid', 'fr-grid-row', 'fr-py-6w')}>
        <div className="fr-container fr-col-sm-12 fr-col-md-4 fr-px-md-2 fr-col--middle fr-mb-2w fr-mb-md-0">
          <h1 className="fr-mb-2vw fr-h2">Voici votre pass Sport</h1>

          <p className="fr-mb-2w">
            Vous avez fait la demande de votre pass Sport. Il est strictement confidentiel.
          </p>
          <p className="fr-mb-2w">
            Le pass Sport est à présenter à votre club ou salle de sport au moment de votre
            inscription.
          </p>

          <p>
            Il vous permettra de bénéficier d&apos;une réduction de 50 euros sur le prix de votre
            licence ou abonnement.
          </p>
        </div>

        <main className="fr-col-12 fr-col-md-8" tabIndex={-1} id={SKIP_LINKS_ID.mainContent}>
          <QrCodeCard
            data={{
              firstname,
              lastname,
              gender,
              birthDate,
              code,
            }}
            qrCodeValue={qrCodeValue}
          />
        </main>
      </div>
    </div>
  );
}

function InvalidContainer() {
  return (
    <div className={cn(styles['page'], 'fr-px-2w')}>
      <div className={cn(styles['container'], 'fr-container--fluid', 'fr-grid-row', 'fr-py-6w')}>
        Code invalide
      </div>
    </div>
  );
}

export default Page;
