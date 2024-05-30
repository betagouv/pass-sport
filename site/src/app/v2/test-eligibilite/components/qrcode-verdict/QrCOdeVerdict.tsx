import VerdictPanel from '@/app/components/verdictPanel/VerdictPanel';
import cn from 'classnames';
import rootStyles from '@/app/utilities.module.scss';
import { QRCodeSVG } from 'qrcode.react';
import styles from './styles.module.scss';
import { EnhancedConfirmResponseBodyItem } from 'types/EligibilityTest';
import Button from '@codegouvfr/react-dsfr/Button';
import Link from 'next/link';

interface Props {
  data: EnhancedConfirmResponseBodyItem;
}

const QrCodePanel = ({ data }: Props) => {
  const { nom, prenom, date_naissance, qrcodeUrl, genre, id_psp } = data;

  const formatBirthDate = (rawDate: string | undefined, gender: string | undefined) => {
    if (!rawDate) {
      return '';
    }

    const date = new Date(rawDate);
    if (Number.isNaN(date.valueOf)) {
      return '';
    }

    const formatedBirthDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

    let bornAt = gender === 'F' ? 'Née le ' : 'Né le ';

    return bornAt + formatedBirthDate;
  };

  const formatPspCode = (rawCode: string) => {
    return `Code: ${rawCode.replaceAll('-', ' - ')}`;
  };

  return (
    <>
      <div className={cn('fr-mx-4w', 'fr-p-3w', 'fr-mb-3w', styles.container)}>
        <div>
          <QRCodeSVG value={qrcodeUrl} size={240} />
        </div>
        <div className={styles.center}>
          <h6 className={cn('fr-mb-1w', styles.blue)}>
            <span className={styles['text-casing']}>{prenom}</span>{' '}
            <span className={styles['text-casing']}>{nom}</span>
          </h6>

          <p className={cn('fr-mb-3w', rootStyles['text--medium'])}>
            {formatBirthDate(date_naissance, genre)}
          </p>

          <p className={cn('fr-text--lg', 'fr-text--bold')}>{formatPspCode(id_psp)}</p>
        </div>
      </div>

      <div className={cn('fr-mb-4w', styles['centered-text'])}>
        <Button
          priority="primary"
          size="large"
          iconPosition="right"
          iconId="fr-icon-external-link-line"
          linkProps={{
            href: qrcodeUrl,
            target: '_blank',
          }}
        >
          Télécharger mon QR Code pass Sport au format pdf
        </Button>
      </div>
    </>
  );
};
const QrCodeVerdict = (props: Props) => {
  return (
    <div>
      <VerdictPanel
        title="Bonne nouvelle ! D'après les informations que vous nous avez transmises, vous êtes éligible au pass Sport."
        isSuccess
        isLean
        qrCodeComponent={<QrCodePanel {...props} />}
      >
        <p
          className={cn(
            'fr-text--lg',
            'fr-mb-4w',
            rootStyles['text--black'],
            rootStyles['text--medium'],
          )}
        >
          Il vous permettra de déduire 50 euros de votre adhésion sportif dans plus de 85 000 clubs
          et associations sportives partenaires dans toute la France.
        </p>
        <p
          className={cn(
            'fr-text--lg',
            'fr-mb-4w',
            rootStyles['text--black'],
            rootStyles['text--medium'],
          )}
        >
          Ci-dessous votre pass Sport qui sera envoyé également par e-mail à l’adresse indiquée
          précédemment.
        </p>

        <p className={cn('fr-text--lg', 'fr-text--bold', rootStyles['text--black'])}>
          Votre QR Code pass Sport est strictement confidentiel.
        </p>
      </VerdictPanel>
    </div>
  );
};

export default QrCodeVerdict;
