import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import Link from 'next/link';

export const metadata = {
  title: 'Point de situation - pass Sport',
  description: 'Page pour le point de situation du dispositif pass Sport',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default async function Communication() {
  return (
    <>
      <main className="fr-py-4w" tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <section className="fr-container">
          <h1 className="fr-mb-2w">Point de situation</h1>

          <p className="fr-mb-2w">
            Le ministère des Sports, de la Jeunesse et de la Vie associative a pris connaissance
            d&apos;une exfiltration de données issue de l&apos;un de ses systèmes
            d&apos;information.
          </p>

          <p className="fr-mb-2w">
            Dès la détection de l&apos;incident, les équipes techniques spécialisées du ministère
            ont été mobilisées afin de vérifier la nature et l&apos;ampleur des données concernées,
            et de mettre en œuvre les mesures de sécurité adaptées pour faire cesser toute fuite de
            données.
          </p>
          <p className="fr-mb-2w">
            Un dépôt de plainte a été effectué auprès des autorités compétentes et la Commission
            nationale de l&apos;informatique et des libertés (CNIL) a été saisie conformément aux
            obligations réglementaires.
          </p>

          <p className="fr-mb-2w">
            L&apos;ensemble des foyers concernés ont été destinataires d&apos;un message
            d&apos;information avec les recommandations et consignes de sécurité à suivre.
          </p>

          <p>
            Besoin d&apos;informations complémentaires ?{' '}
            <Link href="/v2/une-question" className="fr-link">
              Consultez les réponses aux questions les plus fréquentes
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
