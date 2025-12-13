import cn from 'classnames';
import styles from './styles.module.scss';
import Image from 'next/image';
import code from '@/images/code-2x.svg';
import { Badge } from '@codegouvfr/react-dsfr/Badge';
import Link from 'next/link';
import Actions from '@/app/components/actions/Actions';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import { useCallback, useContext, useEffect, useRef } from 'react';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { push } from '@socialgouv/matomo-next';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import { DownloadLink } from '@/app/components/download-link/DownloadLink';
import { CONTACT_PAGE_QUERYPARAMS } from '@/app/constants/search-query-params';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';

interface Props {
  isSuccess: boolean;
  isEligible: boolean;
}

const VerdictPanel = ({ isSuccess, isEligible }: Props) => {
  const successRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const { eligibilityData, pspCodeData, allowance } = useContext(EligibilityTestContext);
  const linkSource = pspCodeData?.[0]?.pdf_base_64
    ? `data:application/pdf;base64,${pspCodeData?.[0]?.pdf_base_64}`
    : null;

  const onDownloadLinkClicked = useCallback(() => {
    push(['trackEvent', 'Eligibility Test', 'Link clicked', 'Download link clicked']);
  }, []);

  const onAeehLinkClick = useCallback(() => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Clicked', 'Button to open AEEH form']);
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
                    </>
                  ) : (
                    <Alert
                      severity="error"
                      title="Le lien de téléchargement n'a pas pû être crée"
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
              <>
                {allowance === ALLOWANCE.AEEH ? (
                  <>
                    <Alert
                      severity="info"
                      title="Nous n'avons pas retrouvé votre code."
                      description={`Vérifiez les informations que vous avez remplies avant de cliquer sur "Récupérer mon pass Sport". Vous serez redirigés vers le service démarches-simplifiées qui nous permettra de traiter votre demande.`}
                    />
                    <p className="fr-my-3w text-align--center">
                      <Link
                        className="fr-btn fr-btn--secondary"
                        href="https://www.demarches-simplifiees.fr/commencer/code-pass-sport-aeeh"
                        target="_blank"
                        title="Récupérer le pass Sport sur démarches-simplifiées - Nouvelle fenêtre"
                        onClick={() => {
                          onAeehLinkClick();
                        }}
                      >
                        Récupérer mon pass Sport
                      </Link>
                    </p>

                    <p>
                      Dans l&apos;attente du code, vous pouvez proposer cette solution à votre club
                      :
                    </p>

                    <ul className="fr-ml-2w">
                      <li>Régler l&apos;inscription avec la déduction immédiate de 70 € ;</li>
                      <li>
                        Fournir un chèque de 70 € (non encaissé), restitué dès réception du code
                        pass Sport.
                      </li>
                    </ul>

                    <p>
                      Si vous n&apos;êtes finalement pas éligible, le club pourra encaisser le
                      chèque. Chaque club reste libre d&apos;accepter ou non cette solution.
                    </p>
                  </>
                ) : (
                  <Alert
                    severity="warning"
                    title="Les informations que vous avez fournies ne correspondent pas à nos données."
                    description="Vérifiez vos informations avant de contacter le support."
                  />
                )}
              </>
            ) : (
              <>
                <Alert
                  severity="error"
                  title="Nous sommes désolés, d’après les informations que vous nous avez fournies, vous n’êtes pas éligible au pass Sport."
                />
                <section className="fr-mt-3w">
                  <p>Le dispositif est ouvert :</p>
                  <ul className="fr-ml-2w">
                    <li>
                      Aux jeunes de 14 à 17 ans bénéficiaires de l&apos;ARS (Allocation de Rentrée
                      Scolaire) ;
                    </li>
                    <li>
                      Aux jeunes en situation de handicap :
                      <ul className="fr-ml-2w">
                        <li>
                          De 6 à 19 ans bénéficiaires de l&apos;AEEH (Allocation d&apos;Education de
                          l&apos;Enfant Handicapé) ;
                        </li>
                        <li>
                          De 16 à 30 ans bénéficiaires de l&apos;AAH (Allocation aux Adultes
                          Handicapés).
                        </li>
                      </ul>
                    </li>
                    <li>
                      Aux jeunes de moins de 28 ans bénéficiaires d&apos;une bourse attribuée avant
                      le 15 octobre 2025 :
                      <ul className="fr-ml-2w">
                        <li>Bourse du CROUS (y compris l&apos;aide annuelle) ;</li>
                        <li>Bourse régionale pour une formation sanitaire et sociale.</li>
                      </ul>
                    </li>
                  </ul>
                </section>
              </>
            )}
          </section>

          <section className={styles['section-cta']}>
            {isEligible && allowance && (
              <Link
                className={cn(['fr-btn', styles['section-cta__link']])}
                href={`/v2/une-question?${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}
              >
                Contacter le support
              </Link>
            )}
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
