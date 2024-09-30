import Link from 'next/link';
import styles from './styles.module.scss';
import Card from '@codegouvfr/react-dsfr/Card';
import cn from 'classnames';
import image from '@/images/medical-certificate/medical-certificate.jpg';
import utilsStyles from '../../../../../utilities.module.scss';

const MedicalCertificatePanel = () => {
  return (
    <>
      <Card
        border={false}
        desc={
          <>
            <span className="fr-text--lg">
              Ce simulateur vous indique si vous devez obtenir un certificat médical pour pratiquer
              une activité sportive (loisir ou compétition).
            </span>

            <br />
            <br />

            <Link
              href="https://www.service-public.fr/simulateur/calcul/certificatMedical"
              target="_blank"
              className={cn('fr-text--lg', styles.blue, utilsStyles['text--medium'])}
              title="faire le simulateur de certificat médical - nouvelle fenêtre"
            >
              Faire le simulateur de certificat médical
            </Link>
          </>
        }
        horizontal
        imageAlt=""
        imageUrl={image.src}
        size="medium"
        title="Besoin d'un certificat médical ?"
        titleAs="h2"
        classes={{
          end: 'fr-hidden',
          title: cn('fr-mb-2w', styles.blue),
          body: styles.body,
        }}
        ratio="33/66"
      />
    </>
  );
};

export default MedicalCertificatePanel;
