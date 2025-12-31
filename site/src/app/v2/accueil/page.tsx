import styles from './styles.module.scss';
import cn from 'classnames';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Image from 'next/image';
import passSportLogoWhite from '@/images/pass-sport-logo-white.svg';
import leftLines from '@/images/homepage/left-lines.svg';
import rightLines from '@/images/homepage/right-lines.svg';
import lucie from '@/images/homepage/lucie.jpg';
import Link from 'next/link';
import Video from '@/app/v2/accueil/components/video/Video';

export const metadata: Metadata = {
  title: 'Accueil - pass Sport',
  description: "Page d'accueil du site pass.sports.gouv.fr pour les particuliers",
};

export default async function Accueil() {
  return (
    <>
      <main className={styles.main} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <section className={styles['top-section__wrapper']}>
          <div className="fr-container">
            <Image src={leftLines} className={styles['top-section__wrapper-left-image']} alt="" />
            <Image src={rightLines} className={styles['top-section__wrapper-right-image']} alt="" />

            <div className={styles['top-section__content']}>
              <section className={styles['top-section__content-title']}>
                <Image src={passSportLogoWhite} alt="" />
                <h1 className="fr-text--heavy">
                  70 € de réduction immédiate
                  <span className="display--block">sur l&apos;inscription sportive</span>
                </h1>
              </section>
            </div>
          </div>
        </section>

        <section className="fr-container">
          <div className={styles['benef-faq']}>
            <h2 className="fr-mb-5w fr-h1">Qu&apos;est-ce que le pass Sport ?</h2>
            <p className="fr-mb-2w">
              Le pass Sport est une aide financière de 70 € par jeune éligible pour couvrir tout ou
              partie des frais d&apos;inscription dans un club, association sportive ou salle de
              sport partenaire. Il prend la forme d&apos;une réduction immédiate lors de
              l&apos;inscription.
            </p>

            <p>
              Cette aide du ministère chargé des Sports s&apos;adresse aux enfants et aux jeunes qui
              rencontrent des obstacles à la pratique sportive – qu’ils soient d’ordre financier,
              social ou liés à un handicap. L’objectif : leur permettre d’accéder durablement à une
              activité physique encadrée, au sein d’un environnement structurant, éducatif et
              sécurisé.
            </p>

            <section className="fr-my-4w">
              <h3>Vidéo de présentation du pass Sport</h3>
              <Video videoFullUrl="https://vimeo.com/1113160982?share=copy#t=0" />
            </section>

            <h2 className="fr-my-5w fr-h1">Une question ?</h2>
            <p className="fr-mb-2w">
              Vous avez consulté les différentes pages sans trouver l’information que vous cherchiez
              ? Vous vous posez des questions sur le pass Sport ?
            </p>
            <Link href="/v2/une-question" className="fr-icon-arrow-right-line fr-link--icon-right">
              Consulter la liste des questions fréquemment posées
            </Link>
          </div>
        </section>

        <section className={cn('fr-container', styles['handiguide-section'])}>
          <div className={styles['handiguide-section__description']}>
            <h2 className="fr-h1">Handiguide</h2>
            <p>
              Le guide des activités physiques et sportives pour les personnes en situation de
              handicap.
            </p>

            <span>
              <Link
                href="https://www.handiguide.sports.gouv.fr/"
                target="_blank"
                className="fr-link"
              >
                Consulter le site de l&apos;Handiguide
              </Link>
            </span>

            <p className={cn(['fr-text--sm', styles['handiguide-section__legend']])}>
              Sur la photo : Lucie Hautiere, médaillée d’or des championnats d’Europe en 2023 et
              participation aux Jeux Paralympiques de Paris 2024 en para tennis de table.
            </p>
          </div>

          <Image
            src={lucie}
            className={cn('fr-responsive-img', styles['handiguide-section__image'])}
            alt=""
          />
        </section>
      </main>
    </>
  );
}
