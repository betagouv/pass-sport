import styles from '../styles.module.scss';
import Link from 'next/link';

const LegalTextReference = () => (
  <section>
    <h2>Texte de référence</h2>
    <Link
      className={styles['section__reference-link']}
      href="https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000049643030"
      target="_blank"
    >
      {/* todo: to update */}
      Décret n° 2024-500 du 31 mai 2024 relatif au « pass Sport » 2024
    </Link>
  </section>
);

export default LegalTextReference;
