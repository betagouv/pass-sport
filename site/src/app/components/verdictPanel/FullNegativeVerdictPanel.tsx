import VerdictPanel from './VerdictPanel';
import cn from 'classnames';
import rootStyles from '@/app/utilities.module.scss';
import EligibilityCriteriaList from '../eligibility-criteria-list/EligibilityCriteriaList';
import Link from 'next/link';
import { CONTACT_PAGE_QUERYPARAMS } from '@/app/constants/search-query-params';
import Actions from '@/app/components/actions/Actions';

interface Props {
  isLean: boolean;
}
const FullNegativeVerdictPanel = ({ isLean }: Props) => (
  <VerdictPanel
    title="Nous sommes désolés, d'après les informations que vous nous avez fournies, vous n'êtes pas éligible au pass Sport."
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
      Si vous souhaitez modifier des informations, vous avez la possibilité de refaire le test.
    </p>
  </VerdictPanel>
);

export default FullNegativeVerdictPanel;
