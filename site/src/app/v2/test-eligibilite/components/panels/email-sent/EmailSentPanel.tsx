import Actions from '@/app/components/actions/Actions';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import styles from '../styles.module.scss';

/**
 * What follows the verdict once step two went through. The verdict itself is announced above the
 * form by EmailSentAlert.
 */
const EmailSentPanel = () => (
  <div className={styles.container}>
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

export default EmailSentPanel;
