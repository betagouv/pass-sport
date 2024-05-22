import AllowanceStep from './components/allowance-step/AllowanceStep';
import styles from './styles.module.scss';
import cn from 'classnames';

const EligibilityTest = () => {
  return (
    <main className={cn('fr-pb-4w', styles.main)}>
      <h1 className={cn('fr-pt-2w', 'fr-pb-3w', 'fr-px-2w', styles.title)}>
        Puis-je bénéficier du pass Sport?
      </h1>

      <div className={cn('fr-pb-4w', 'fr-mx-auto', 'fr-px-2w', styles.background)}>
        <div className={cn('fr-pt-7w', 'fr-mx-auto', styles.wrapper)}>
          <AllowanceStep />
        </div>
      </div>
    </main>
  );
};

export default EligibilityTest;
