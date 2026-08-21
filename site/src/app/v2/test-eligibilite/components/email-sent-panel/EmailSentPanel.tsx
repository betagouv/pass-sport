import { useContext, useEffect, useRef } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import Actions from '@/app/components/actions/Actions';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import styles from './styles.module.scss';

/**
 * What the usager sees once step two went through. Deliberately says nothing about what LCA
 * answered: the browser is not told, so the wording has to hold for a confirmed beneficiary
 * and an unknown one alike. The code, when there is one, is in the mailbox and nowhere else.
 */
const EmailSentPanel = () => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { submittedEmail } = useContext(EligibilityTestContext);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  return (
    <div className={styles.container}>
      <section aria-live="polite" ref={panelRef} tabIndex={-1}>
        <Alert
          severity="success"
          title="Votre demande a bien été prise en compte."
          description={
            <>
              <p>
                Un e-mail vient d&apos;être envoyé à{' '}
                <span className="fr-text--bold">{submittedEmail}</span>. Il contient le résultat de
                votre demande.
              </p>
              <p className="fr-mb-0">
                Pensez à vérifier vos courriers indésirables. L&apos;e-mail peut mettre quelques
                minutes à arriver.
              </p>
            </>
          }
        />
      </section>

      <section className={styles['section-cta']}>
        <p className="fr-text--bold fr-text--lg fr-mb-0">Vous avez plusieurs enfants&nbsp;?</p>
        <p className="fr-text--lg fr-mb-0">
          Vous devez faire une demande pour chaque enfant pouvant bénéficier du pass Sport.
        </p>
        <Actions displayHomeBackBtn={false} newTestBtnVariant="tertiary" />
      </section>

      <section className={styles['section-je-donne-mon-avis']}>
        <hr className="fr-mb-2w" />
        <JeDonneMonAvisBtn isSuccess />
      </section>
    </div>
  );
};

export default EmailSentPanel;
