import Actions from '@/app/components/actions/Actions';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import NotEligibleAlert from './NotEligibleAlert';
import styles from '../styles.module.scss';

const NotEligiblePanel = () => (
  <>
    <NotEligibleAlert />

    <section className={styles['section-cta']}>
      <Actions displayHomeBackBtn newTestBtnVariant="tertiary" />
    </section>

    <section className={styles['section-je-donne-mon-avis']}>
      <hr className="fr-mb-2w" />
      <JeDonneMonAvisBtn isSuccess={false} />
    </section>
  </>
);

export default NotEligiblePanel;
