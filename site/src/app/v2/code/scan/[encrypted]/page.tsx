'use server';

import styles from './styles.module.scss';
import cn from 'classnames';
import { URLSearchParams } from 'next/dist/compiled/@edge-runtime/primitives';
import QrCodeCard from './components/QrCodeCard/QrCodeCard';
import { decryptData } from '../../../../../../utils/decryption';

interface Props {
  params: {
    encrypted: string;
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

  const [firstname, lastname, gender, birthDate, code] = [
    searchParams.get('bp'),
    searchParams.get('bn'),
    searchParams.get('bg'),
    searchParams.get('bdn'),
    searchParams.get('c'),
  ];

  if (!firstname || !lastname || !gender || !birthDate || !code) {
    return <InvalidContainer />;
  }

  const qrCodeValue = `${process.env.QR_CODE_BASE_URL}/${encrypted}`;

  return (
    <div className={cn(styles['page'], 'fr-px-2w')}>
      <div className={cn(styles['container'], 'fr-container--fluid', 'fr-grid-row', 'fr-py-6w')}>
        <div className="fr-container fr-col-sm-12 fr-col-md-4 fr-px-md-2 fr-col--middle fr-mb-2w fr-mb-md-0">
          <h2 className="fr-mb-2vw">Voici votre pass Sport</h2>

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

        <div className="fr-col-12 fr-col-md-8">
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
        </div>
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
