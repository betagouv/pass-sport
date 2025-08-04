'use client';

import styles from './styles.module.scss';
import cn from 'classnames';
import ProContent from '../ProContent/ProContent';
import QrCodeCard from '../QrCodeCard/QrCodeCard';
import { useGetDecryptedCode } from '@/app/v2/code/scan/hooks/use-get-decrypted-code';
import PlaceholderContainer from '../PlaceholderContainer/PlaceholderContainer';

function MainContent() {
  const { error, response, isLoading } = useGetDecryptedCode();

  if (isLoading) return <PlaceholderContainer>En cours de chargement</PlaceholderContainer>;

  if (error) {
    return <PlaceholderContainer>Code invalide</PlaceholderContainer>;
  }

  return (
    response !== null && (
      <>
        <div
          className={cn(
            styles['container'],
            'fr-container--fluid',
            'fr-grid-row',
            'fr-py-6w',
            'fr-px-2w',
          )}
        >
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

          <div className="fr-col-12 fr-col-md-8">
            <QrCodeCard
              data={{
                firstname: response.firstname,
                lastname: response.lastname,
                gender: response.gender,
                code: response.code,
                birthDate: response.birthDate,
              }}
            />
          </div>
        </div>

        {typeof process.env.NEXT_PUBLIC_LCA_APP_URL === 'string' &&
          process.env.NEXT_PUBLIC_LCA_APP_URL.length > 0 && (
            <ProContent redirectionUrl={process.env.NEXT_PUBLIC_LCA_APP_URL} />
          )}
      </>
    )
  );
}

export default MainContent;
