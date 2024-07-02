import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageHeader from '../../../../components/PageHeader/PageHeader';
import styles from './style.module.scss';
import EligibilityTestBanner from '@/components/eligibility-test-banner/EligibilityTestBanner';
import { Metadata } from 'next';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Mentions légales - pass Sport',
};

export default function PolitiqueDeConfidentialite() {
  return (
    <div>
      <PageHeader
        title="Mentions légales"
        subtitle=""
        classes={{
          container: styles['page-header'],
        }}
      />
      <main className={styles.wrapper} tabIndex={-1} id={SKIP_LINKS_ID.mainContent}>
        <section className="fr-mb-6w">
          <p className="fr-mb-2w">
            Le Portail pass Sport est un service du ministère des Sports et des Jeux Olympiques et
            Paralympiques, géré par la direction des sports. Ce service en ligne vise à permettre
            aux bénéficiaires du dispositif pass Sport de vérifier leur éligibilité et le cas
            échéant par la télé déclaration des informations nécessaires à obtenir le code
            alphanumérique individuel à présenter au club sportif lors de leur inscription. Ce
            service en ligne vise également à permettre à la direction des sports de délivrer toutes
            les informations et actualités relatives au pass Sport à leurs bénéficiaires.
          </p>

          <p className="fr-mb-2w">
            Les données renseignées par les bénéficiaires dans ce portail ne sont accessibles
            qu&apos;aux services de l&apos;Etat français chargés d&apos;instruire les demandes.
            L&apos;utilisation de ce service doit faciliter la délivrance du dispositif pass Sport.
          </p>

          <p className="fr-mb-2w">
            Les informations recueillies font l&apos;objet d&apos;un traitement informatique destiné
            à vérifier les conditions d&apos;obtention du pass Sport. Ces informations sont
            susceptibles d&apos;être communiquées aux services de l&apos;Etat et organismes définis
            aux articles 6 et 7 du décret modifié relatif au « pass Sport ».
          </p>

          <p className="fr-mb-2w">
            Sur le fondement de l&apos;article 6-1 e) du Règlement (UE) 2016/679 du Parlement
            européen et du Conseil du 27 avril 2016 relatif à la protection des personnes physiques
            à l&apos;égard du traitement des données à caractère personnel et à la libre circulation
            de ces données (règlement général sur la protection des données, ou RGPD) et en
            application de l&apos;article 32 de la loi du 6 janvier 1978 modifiée, les personnes
            bénéficient notamment d&apos;un droit d&apos;accès, d&apos;information, de limitation,
            d&apos;opposition et de rectification aux informations les concernant, sur simple
            demande à :
          </p>

          <p className="fr-mb-2w">
            Ministère des Sports et des Jeux Olympiques et Paralympiques - Sous-direction du
            pilotage et de l&apos;évolution des politiques publiques du sport - DS.1A
          </p>

          <p className="fr-mb-2w">
            <span className="display--block">95 avenue de France</span>
            <span className="display--block">75 650 Paris CEDEX 13</span>
            <span className="display--block">France</span>
            <span className="display--block">Tél : 01 40 45 90 00</span>
          </p>

          <p>Responsable de publication : Fabienne BOURDAIS, Directrice des sports</p>

          <p className="fr-mb-3w">
            Administrateur du portail : Jean-François HATTE - Sous-direction du pilotage et de
            l&apos;évolution des politiques publiques du sport - DS.1. Contact :{' '}
            <Link href="mailto:passsport@sports.gouv.fr">passsport@sports.gouv.fr</Link>
          </p>

          <p>
            <span className="display--block">Hébergement :</span>
            <span className="display--block">Scalingo</span>
            <span className="display--block">13 rue Jacques Peirotes</span>
            <span className="display--block">67000 Strasbourg</span>
            <span className="display--block">France</span>
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w fr-h4">Accès au site</h2>

          <p>
            L&apos;accès au site est libre et gratuit et ne nécessite pas la création d&apos;un
            compte. Les utilisateurs qui souhaitent bénéficier du pass Sports doivent renseigner des
            informations exactes et à jour.
          </p>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w fr-h4">Contenu du site</h2>

          <p className="fr-mb-2w">
            Le ministère des Sports et des Jeux Olympiques et Paralympiques met à disposition des
            utilisateurs de ce site web des informations et outils disponibles et vérifiés.
          </p>

          <p>
            Il s&apos;efforcera de corriger autant que faire se peut les erreurs ou omissions qui
            lui seront signalées par les utilisateurs (en contactant l&apos;administrateur du
            portail).
          </p>
        </section>
      </main>

      <EligibilityTestBanner />
      <SocialMediaPanel />
    </div>
  );
}
