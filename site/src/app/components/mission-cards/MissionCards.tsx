import Card from '@codegouvfr/react-dsfr/Card';
import styles from './styles.module.scss';
import spe from '@/images/eligibility-test/spe.png';
import jeVeuxAiderImage from '@/images/eligibility-test/je-veux-aider.jpg';
import snuImage from '@/images/eligibility-test/snu.jpg';
import serviceCiviqueImage from '@/images/eligibility-test/service-civique.jpg';
import cn from 'classnames';

interface Props {
  isUsingSuccessUrls: boolean;
}
const MissionCards = ({ isUsingSuccessUrls }: Props) => {
  const jeVeuxAiderUrl = isUsingSuccessUrls
    ? 'https://api.api-engagement.beta.gouv.fr/r/campaign/6633d05b87fb728a6da32177'
    : 'https://api.api-engagement.beta.gouv.fr/r/campaign/6634911587fb728a6da5d10c';

  const serviceCiviqueUrl = isUsingSuccessUrls
    ? 'https://api.api-engagement.beta.gouv.fr/r/campaign/6633d0bd87fb728a6da322cf'
    : 'https://api.api-engagement.beta.gouv.fr/r/campaign/6634937987fb728a6da5dbc1';

  const snuUrl = isUsingSuccessUrls
    ? 'https://api.api-engagement.beta.gouv.fr/r/campaign/6634907687fb728a6da5cb95'
    : 'https://api.api-engagement.beta.gouv.fr/r/campaign/663a3817971045dffcd3c9b3';

  const speUrl = 'https://santepsy.etudiant.gouv.fr/?mtm_campaign=pass-sport';

  return (
    <div>
      <div className={cn(styles.container, 'fr-mb-6w')}>
        <h2 className="fr-h3 fr-mb-0">
          Pour vous engager dans des missions de volontariat ou de bénévolat :
        </h2>

        <Card
          background
          border={false}
          grey
          desc={
            <>
              <span className="display--block fr-text--sm fr-mb-0">
                La plateforme, qui propose des missions dans tous les domaines de l’intérêt général.
              </span>
              <span className="display--block fr-text--sm fr-mb-0">
                Plus de 18 000 missions de bénévolat sont en ligne !
              </span>
            </>
          }
          enlargeLink
          horizontal
          imageAlt=""
          imageUrl={jeVeuxAiderImage.src}
          linkProps={{
            href: jeVeuxAiderUrl,
            'aria-label': 'Ouvrir une nouvelle fenêtre vers le site Je veux aider.gouv.fr',
          }}
          size="medium"
          title="Je veux aider.gouv.fr"
          titleAs="h3"
          classes={{
            end: styles.end,
          }}
          ratio="33/66"
        />

        <Card
          background
          border={false}
          grey
          desc={
            <>
              <span className="display--block fr-text--sm fr-mb-0">
                Vous souhaitez être volontaire ?
              </span>
              <span className="display--block fr-text--sm fr-mb-0">
                Découvrez les 8 360 missions en ligne.
              </span>
            </>
          }
          enlargeLink
          horizontal
          imageAlt=""
          imageUrl={snuImage.src}
          linkProps={{
            href: snuUrl,
            'aria-label':
              'Ouvrir une nouvelle fenêtre vers le site Le SNU, pour moi, pour les autres, et pour la France.',
          }}
          size="medium"
          title="Le SNU, pour moi, pour les autres, et pour la France."
          titleAs="h3"
          classes={{
            end: styles.end,
          }}
          ratio="33/66"
        />

        <Card
          background
          border={false}
          grey
          desc={
            <>
              <span className="display--block fr-text--sm fr-mb-0">
                Une expérience qui va changer ta vie. Solidarité, santé, éducation, sport,
                environnement… Des milliers de missions indemnisées t’attendent.
              </span>
            </>
          }
          enlargeLink
          horizontal
          imageAlt=""
          imageUrl={serviceCiviqueImage.src}
          linkProps={{
            href: serviceCiviqueUrl,
            'aria-label':
              'Ouvrir une nouvelle fenêtre vers le site le Service Civique, une mission pour chacun au service de tous',
          }}
          size="medium"
          title="Service Civique, une mission pour chacun au service de tous"
          titleAs="h3"
          classes={{
            end: styles.end,
            body: styles['card-body'],
          }}
          ratio="33/66"
        />
      </div>

      <div className={styles.container}>
        <h2 className="fr-h3 fr-mb-0">Pour prendre soin de votre santé mentale : </h2>

        <Card
          background
          border
          desc={
            <>
              <span className="display--block fr-text--sm fr-mb-0">
                Étudiants, étudiantes, bénéficiez de 12 séances gratuites, et sans avance de frais,
                avec un psychologue partenaire.
              </span>
            </>
          }
          enlargeLink
          horizontal
          imageAlt=""
          imageUrl={spe.src}
          linkProps={{
            href: speUrl,
            'aria-label': 'Ouvrir une nouvelle fenêtre vers le site santepsy.etudiant.gouv.fr',
          }}
          size="medium"
          title="Sante Psy Etudiant"
          titleAs="h3"
          classes={{
            end: styles.end,
          }}
          ratio="33/66"
        />
      </div>
    </div>
  );
};

export default MissionCards;
