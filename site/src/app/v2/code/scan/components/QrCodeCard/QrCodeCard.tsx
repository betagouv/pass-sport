'use client';

import cn from 'classnames';
import { QRCodeSVG } from 'qrcode.react';
import styles from './styles.module.scss';
import Button from '@codegouvfr/react-dsfr/Button';
import { push } from '@socialgouv/matomo-next';
import { useCopyToClipboard } from '@uidotdev/usehooks';
import { useCallback, useRef, useState } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import Link from 'next/link';
import { CONTACT_PAGE_QUERYPARAMS } from '@/app/constants/search-query-params';

interface Props {
  data: {
    firstname: string;
    lastname: string;
    gender: string;
    code: string;
    birthDate: string;
  };
  qrCodeValue: string;
}

const QrCodeCard = ({ data, qrCodeValue }: Props) => {
  const { firstname, lastname, gender, code, birthDate } = data;
  const notifRef = useRef<HTMLDivElement | null>(null);
  const [isNotificationDisplayed, setIsNotificationDisplayed] = useState(false);

  const formatBirthDate = (rawDate: string | undefined, gender: string | undefined) => {
    if (!rawDate) {
      return '';
    }

    let bornAt = gender === 'F' ? 'Née le ' : 'Né le ';

    return `${bornAt} ${rawDate}`;
  };

  const formatPspCode = (rawCode: string) => {
    const codeRegex = /^24-[A-NP-Z]{4}-[A-NP-Z]{4}$/;

    if (!codeRegex.test(rawCode)) {
      return null;
    }

    return `${rawCode.replaceAll('-', ' - ')}`;
  };

  const printQRCode = () => {
    window.print();
    push(['trackEvent', 'Print Button', 'Clicked', 'QR Recap page']);
  };

  const [, copyToClipboard] = useCopyToClipboard();

  const onCopyCallback = useCallback(() => {
    push(['trackEvent', 'Copy Code', 'Clicked', 'QR Recap page']);

    setIsNotificationDisplayed(true);
    notifRef.current?.focus();

    return copyToClipboard(data.code);
  }, [copyToClipboard, data.code]);

  const formattedCode = formatPspCode(code);

  return (
    <div className={styles.wrapper}>
      <div className={styles.container}>
        <div>
          <QRCodeSVG
            value={qrCodeValue}
            size={240}
            aria-label="Image de votre QR Code - votre pass Sport, à montrer à un club partenaire lors de votre inscription"
          />
        </div>

        <div>
          <h2 className={cn('fr-mb-1w', 'fr-h6', styles.fullname)}>
            <span className={styles['text-casing']}>{firstname}</span>{' '}
            <span className={styles['text-casing']}>{lastname}</span>
          </h2>

          <p className="fr-mb-2w fr-text--md">{formatBirthDate(birthDate, gender)}</p>
          <p className="fr-text--md fr-text--bold fr-mb-0">Code:</p>
          <p className="fr-text--md fr-text--bold fr-mb-2w">
            {formattedCode !== null ? (
              formattedCode
            ) : (
              <Link
                href={`/v2/une-question?${CONTACT_PAGE_QUERYPARAMS.modalOpened}=1`}
                target="_blank"
              >
                Code invalide, veuillez contacter le support
              </Link>
            )}
          </p>

          <Button
            priority="secondary"
            iconPosition="right"
            iconId="fr-icon-clipboard-line"
            onClick={onCopyCallback}
            size="small"
          >
            Copier le code
          </Button>

          <Alert
            className="fr-mt-2w"
            ref={notifRef}
            severity="success"
            title="Code copié"
            description=""
            closable
            small
            isClosed={!isNotificationDisplayed}
            onClose={() => setIsNotificationDisplayed(false)}
          />
        </div>
      </div>

      <div className="fr-grid-row fr-grid-row--center fr-mt-3w">
        <Button id="print-button" size="large" onClick={printQRCode}>
          Imprimer mon pass Sport au format PDF
        </Button>
      </div>
    </div>
  );
};

export default QrCodeCard;
