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
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { push } from '@socialgouv/matomo-next';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';
import { CONTACT_PAGE_QUERYPARAMS } from '@/app/constants/search-query-params';

interface Props {
  isSuccess: boolean;
  isEligible: boolean;
}

const VerdictPanel = ({ isSuccess, isEligible }: Props) => {
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const { eligibilityData, pspCodeData } = useContext(EligibilityTestContext);
  const linkSource = pspCodeData?.[0]?.pdf_base_64
    ? `data:application/pdf;base64,${pspCodeData?.[0]?.pdf_base_64}`
    : null;

  const onDownloadLinkClicked = useCallback(() => {
    push(['trackEvent', 'Eligibility Test', 'Link clicked', 'Download link clicked']);
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

              <p className="fr-my-3w">Votre code pass Sport est le :</p>
              <p className="fr-text--xl fr-text--bold fr-mb-0">
                {eligibilityData?.[0] && pspCodeData?.[0] && pspCodeData[0].id_psp}
              </p>
              <p className="fr-text--lg fr-mt-3w">
                <span className="fr-text--bold">
                  Notez ce numéro ou téléchargez votre pass Sport
                </span>{' '}
                pour le présenter à votre club.
              </p>

              {eligibilityData?.[0] && pspCodeData?.[0] && (
                <div className={styles['download-section']}>
                  {linkSource ? (
                    <>
                      <DownloadLink
                        details="PDF ~100 KB"
                        label="Télécharger mon pass Sport"
                        href={linkSource}
                        filename={`code-pass-sport-${eligibilityData[0].nom}-${eligibilityData[0].prenom}.pdf`}
                        onClick={onDownloadLinkClicked}
                      />

                      {/*<Link*/}
                      {/*  href={linkSource}*/}
                      {/*  download={`code-pass-sport-${eligibilityData[0].nom}-${eligibilityData[0].prenom}.pdf`}*/}
                      {/*  className="fr-link fr-icon-download-line fr-link--icon-right"*/}
                      {/*  onClick={onDownloadLinkClicked}*/}
                      {/*  target="_blank"*/}
                      {/*>*/}
                      {/*  Télécharger mon pass Sport*/}
                      {/*</Link>*/}

                      {/*<p className="fr-mt-1v fr-text--xs">PDF ~100 KB</p>*/}
                    </>
                  ) : (
                    <Alert
                      severity="error"
                      title={"Le lien de téléchargement n'a pas pû être crée"}
                    />
                  )}
                </div>
              )}

              <p className="fr-text--lg">
                Code valable jusqu’au <span className="fr-text--bold">31 décembre 2025</span>{' '}
                (strictement personnel).
              </p>
            </div>
            <div className={styles['section-success__image']}>
              <Image src={code} className={cn('fr-responsive-img')} alt="" />
            </div>
          </section>

          <section className={styles['section-cta']}>
            <p className="fr-text--bold fr-text--lg fr-mb-0">Vous avez plusieurs enfants ?</p>
            <p className="fr-text--lg fr-mb-0">
              Vous devez demander un code pour chaque enfant pouvant bénéficier du pass Sport.
            </p>
            <Actions displayHomeBackBtn={false} newTestBtnVariant="tertiary" />
          </section>

          <section className={styles['section-je-donne-mon-avis']}>
            <hr className="fr-mb-2w" />
            <JeDonneMonAvisBtn isSuccess />
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
                title="Les informations que vous avez fournies ne correspondent pas à nos données"
                description="Vérifiez vos informations avant de contacter le support."
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
            <Link
              className={cn(['fr-btn', styles['section-cta__link']])}
              href={`/v2/une-question?${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}
            >
              Contacter le support
            </Link>

            <Actions displayHomeBackBtn newTestBtnVariant="tertiary" />
          </section>

          <section className={styles['section-je-donne-mon-avis']}>
            <hr className="fr-mb-2w" />
            <JeDonneMonAvisBtn isSuccess={false} />
          </section>
        </>
      )}
    </>
  );
};

export default VerdictPanel;
