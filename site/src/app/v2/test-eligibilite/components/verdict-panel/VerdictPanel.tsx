import cn from 'classnames';
import styles from './styles.module.scss';
import Image from 'next/image';
import code from '@/images/code-2x.svg';
import { Badge } from '@codegouvfr/react-dsfr/Badge';
import Link from 'next/link';
import Actions from '@/app/components/actions/Actions';
import MissionCards from '@/app/components/mission-cards/MissionCards';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import PdfPassSport from '@/app/components/pdf-pass-sport/PdfPassSport';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { push } from '@socialgouv/matomo-next';

interface Props {
  isSuccess: boolean;
  isEligible: boolean;
}

const VerdictPanel = ({ isSuccess, isEligible }: Props) => {
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const { eligibilityData, pspCodeData } = useContext(EligibilityTestContext);

  const onDownloadLinkClicked = useCallback(() => {
    push(['trackEvent', 'Eligibility Test', 'Download link clicked', 'Code pass Sport']);
  }, []);

  useEffect(() => {
    if (isSuccess && successRef.current) {
      successRef.current.focus();
    }

    if (!isSuccess && errorRef.current) {
      errorRef.current.focus();
    }
  }, [isSuccess, isEligible]);

  return (
    <>
      {isSuccess ? (
        <>
          <section
            className={styles['section-success']}
            aria-live="polite"
            ref={successRef}
            tabIndex={-1}
          >
            <div className={styles['section-success__description']}>
              <Badge severity="success">mon pass sport</Badge>
              <p className="fr-text--lg fr-mt-3w">
                <span className="fr-text--bold">Téléchargez</span> votre pass Sport pour le
                présenter à votre club.
              </p>

              <p className="fr-text--lg">
                Code valable jusqu’au <span className="fr-text--bold">31 décembre 2025</span>{' '}
                (strictement personnel)
              </p>

              {eligibilityData?.[0] && pspCodeData?.[0] && (
                <div className={styles['download-section']}>
                  <PDFDownloadLink
                    document={
                      <PdfPassSport
                        benef={{
                          firstname: eligibilityData[0].prenom,
                          lastname: eligibilityData[0].nom,
                          dob: eligibilityData[0].date_naissance,
                          gender: pspCodeData[0].genre,
                          code: pspCodeData[0].id_psp,
                        }}
                      />
                    }
                    fileName={`code-pass-sport-${eligibilityData[0].nom}-${eligibilityData[0].prenom}.pdf`}
                    className="fr-link fr-icon-download-line fr-link--icon-right"
                    onClick={onDownloadLinkClicked}
                  >
                    {({ loading, error }) => {
                      if (loading) {
                        return 'Lien de téléchargement en préparation';
                      }

                      if (error) {
                        return "Le lien de téléchargement n'a pas pû être crée";
                      }

                      return 'Mon pass Sport à télécharger';
                    }}
                  </PDFDownloadLink>
                  <p className="fr-mt-1v fr-text--xs">PDF ~100 KB</p>
                </div>
              )}
            </div>
            <div className={styles['section-success__image']}>
              <Image src={code} className={cn('fr-responsive-img')} alt="" />
            </div>
          </section>

          <section className={styles['section-cta']}>
            <p className="fr-text--bold fr-text--lg">Vous avez plusieurs enfants ?</p>
            <p className="fr-text--lg">
              Vous devez demander un code pour chaque enfant pouvant bénéficier du pass Sport.
            </p>
            <Actions displayHomeBackBtn={false} newTestBtnVariant="tertiary" />
          </section>

          <section className={styles['section-missions']}>
            <hr />
            <MissionCards isUsingSuccessUrls />
          </section>
        </>
      ) : (
        <>
          <section
            className={styles['section-failure']}
            aria-live="assertive"
            ref={errorRef}
            tabIndex={-1}
          >
            {isEligible ? (
              <Alert
                severity="warning"
                title="Les informations que vous avez fournies ne correspondent pas avec nos données"
                description="Vérifiez vos informations puis contactez le support."
              />
            ) : (
              <Alert
                severity="error"
                title="Nous sommes désolés, d’après les informations que vous nous avez fournies, vous n’êtes pas éligible au pass Sport."
              />
            )}
          </section>

          <section className={styles['section-cta']}>
            {/* todo: Put link with pre-selected object */}
            {/* "Je suis éligible mais je n'arrive pas à obtenir mon code" */}
            <Link className={cn(['fr-btn', styles['section-cta__link']])} href="/v2/une-question">
              Contacter le support
            </Link>

            <Actions displayHomeBackBtn newTestBtnVariant="tertiary" />
          </section>

          <section className={styles['section-missions']}>
            <hr />
            <MissionCards isUsingSuccessUrls={false} />
          </section>
        </>
      )}
    </>
  );
};

export default VerdictPanel;
