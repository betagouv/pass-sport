'use client';

import Button from '@codegouvfr/react-dsfr/Button';
import Card from '@codegouvfr/react-dsfr/Card';
import styles from '../styles.module.scss';
import qrCodeImage from '../../../../../public/images/tout-savoir-sur-le-pass-sport/qr-code.svg';

export default function HowToUsePassSport() {
  return (
    <section>
      <h2>Comment utiliser son pass Sport ?</h2>

      <p>
        <span className="display--block">
          Pour utiliser son pass Sport, il suffit de présenter son QR code ou code alphanumérique à
          son club, son association sportive ou sa salle de sport au moment de votre inscription.
        </span>

        <span className="fr-mb-3w display--block">
          Celui-ci déduira automatiquement 50 euros du prix de la licence ou de l&apos;abonnement au
          moment de l&apos;inscription.
        </span>

        <span className="display--block">
          Voici à quoi ressemble votre pass Sport que vous avez reçu par e-mail et / ou sms :
        </span>
      </p>

      <div className={styles['qr-container']}>
        <Card
          background
          title="Nicolas Dupont"
          titleAs="h3"
          horizontal
          imageAlt="Image du QR code"
          desc={
            <span className="fr-text--md">
              <span className="display--block">Né le 10/01/2015</span>
              <span className="display--block">Code: 24 - AAAA - AAAA</span>
            </span>
          }
          imageUrl={qrCodeImage.src}
          classes={{
            root: styles['qr-root'],
            title: styles['qr-root__title'],
            header: styles['qr-root__header'],
            imgTag: styles['qr-root__img'],
          }}
        />
      </div>

      <Button
        priority="secondary"
        linkProps={{
          href: '/v2/une-question',
          'aria-label': 'Visiter la page de foire aux questions',
        }}
      >
        Une question ?
      </Button>
    </section>
  );
}
