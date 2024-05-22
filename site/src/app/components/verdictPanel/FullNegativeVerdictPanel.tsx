import VerdictPanel from './VerdictPanel';
import cn from 'classnames';
import rootStyles from '@/app/styles.module.scss';
import EligibilityCriteriaList from '../eligibility-criteria-list/EligibilityCriteriaList';

interface Props {
  isLean: boolean;
}
const FullNegativeVerdictPanel = ({ isLean }: Props) => (
  <VerdictPanel
    title="Nous sommes désolés, d'après les informations que vous nous avez transmises, vous n'êtes
pas éligible au pass Sport."
    isSuccess={false}
    isLean={isLean}
  >
    <p
      className={cn(
        'fr-mb-2w',
        'fr-text--lg',
        rootStyles['text--black'],
        rootStyles['text--medium'],
      )}
    >
      En effet, ce dispositif est ouvert aux:
    </p>
    <EligibilityCriteriaList />
    <p className={cn('fr-text--lg', 'fr-text--bold', rootStyles['text--black'])}>
      Pour autant, vous avez peut-être droit à d&apos;autres aides. N&apos;hésitez pas à vous
      rapprocher de votre région, département ou commune de résidence.
    </p>
  </VerdictPanel>
);

export default FullNegativeVerdictPanel;
