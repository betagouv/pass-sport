import PresentationTile from './components/PresentationTile';
import { presentationTiles } from './page.messages';
import styles from './styles.module.scss';
import SocialMediaPanel from '../../../components/social-media-panel/SocialMediaPanel';
import cn from 'classnames';
import PageTitle from '@/components/PageTitle/PageTitle';
import mainImage from '@/images/pro/homepage/main.webp';
import secondaryImage from '@/images/pro/homepage/secondary.webp';
import { Card } from '@codegouvfr/react-dsfr/Card';
import Button from '@codegouvfr/react-dsfr/Button';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

export const metadata: Metadata = {
  title: 'Accueil - pass Sport',
  description: "Page d'accueil du site pass.sports.gouv.fr pour les structures partenaires",
};

export default function Accueil() {
  return (
    <>
      <main className={styles['main']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title={<>L&apos;État et le mouvement sportif se mobilisent pour vous accompagner</>}
          classes={{
            container: styles['page-header'],
          }}
        />
        <div className={cn(styles['main-wrapper'])}>
          <Card
            className={styles['main-card__highlight']}
            classes={{
              desc: styles['main-card__desc'],
              title: styles['main-card__title'],
              header: styles['main-card__header'],
              content: styles['main-card__content'],
              end: styles['main-card__end'],
            }}
            title="Clubs et structures sportives"
            titleAs="h2"
            imageUrl={mainImage.src}
            imageAlt=""
            horizontal
            border={false}
            desc={
              <>
                <span>
                  Grâce au pass Sport contribuez à accueillir encore plus de jeunes dans vos clubs
                  et offrez leur la possibilité de bénéficier d&apos;une aide à la pratique sportive
                  par une déduction de 50 € à l&apos;inscription qui vous sera intégralement
                  remboursée par l&apos;Etat.
                </span>

                <Button
                  priority="primary"
                  className="fr-mt-4w"
                  size="large"
                  linkProps={{
                    href: 'https://vimeo.com/949861035?share=copy',
                    'aria-label':
                      "Ouvrir une nouvelle fenêtre vers une vidéo expliquant comment s'inscrire au Compte Asso",
                    target: '_blank',
                  }}
                >
                  S&apos;inscrire au Compte Asso
                </Button>
              </>
            }
          />

          <section className={cn('fr-container', 'fr-px-0')}>
            <div className="fr-grid-row fr-grid-row--gutters">
              {presentationTiles.map((tile) => (
                <div key={tile.id} className="fr-col-12 fr-col-lg-4">
                  <PresentationTile {...tile} />
                </div>
              ))}
            </div>
          </section>

          <Card
            className={styles['secondary-card']}
            classes={{
              desc: styles['secondary-card__desc'],
              title: styles['secondary-card__title'],
              header: styles['secondary-card__header'],
              content: styles['secondary-card__content'],
              end: styles['secondary-card__end'],
            }}
            title="Faire la promotion du pass Sport"
            titleAs="h2"
            imageUrl={secondaryImage.src}
            imageAlt=""
            border={false}
            horizontal
            desc={
              <>
                <span className="fr-text--md">
                  Le ministère des sports et des jeux Olympiques et Paralympiques a élaboré tout un
                  ensemble d&apos;outils et supports de communication qui sont mis à dispositif de
                  l&apos;ensemble des acteurs et peuvent être utilisés pour assurer la promotion du
                  dispositif.
                </span>

                <Button
                  priority="secondary"
                  size="large"
                  className="fr-btn"
                  iconId="fr-icon-arrow-right-line"
                  iconPosition="right"
                  linkProps={{
                    href: '/v2/pro/ressources',
                    'aria-label': 'Visiter la page des ressources',
                  }}
                >
                  Ressources
                </Button>
              </>
            }
          />
        </div>
      </main>

      <SocialMediaPanel isProVersion />
    </>
  );
}
