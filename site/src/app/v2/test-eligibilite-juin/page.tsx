import AllowanceStep from './components/allowance-step/AllowanceStep';
import styles from './styles.module.scss';
import cn from 'classnames';

const EligibilityTest = () => {
  return (
    <div>
      <h1 className={cn('fr-mt-8w', 'fr-mb-4w', 'fr-px-2w', styles.title)}>
        Puis-je bénéficier du pass Sport?
      </h1>

      <div className={cn('fr-mb-8w', 'fr-mx-auto', 'fr-px-2w', styles.background)}>
        <div className={cn('fr-py-7w', 'fr-mx-auto', styles.wrapper)}>
          <AllowanceStep />
        </div>
      </div>
    </div>
  );
};

export default EligibilityTest;
