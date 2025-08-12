import SocialMediaPanel from '@/app/components/social-media-panel/SocialMediaPanel';
import PageTitle from '../../../../components/PageTitle/PageTitle';
import styles from './style.module.scss';
import Link from 'next/link';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { CHATBOT_EXTERNAL_URL, CHATBOT_EXTERNAL_URL_TITLE } from '@/app/constants/urls';
import { shouldDisplayChatbot } from '@/utils/date';

export default function PlanDuSite() {
  return (
    <>
      <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
        <PageTitle
          title="Plan du site"
          subtitle=""
          classes={{
            container: styles['page-header'],
          }}
        />
        <section className="fr-container fr-my-4w">
          <ul>
            <li>
              <Link href="/v2/accueil">Accueil</Link>
            </li>
            <li>
              <Link href="/v2/jeunes-et-parents">Jeunes et parents</Link>
            </li>
            <li>
              <Link href="/v2/structures">Structures sportives</Link>
            </li>
            <li>
              <Link href="/v2/partenaires">Partenaires</Link>
            </li>
            <li>
              <Link href="/v2/trouver-un-club">Trouver un club partenaire</Link>
            </li>
            <li>
              <Link href="/v2/une-question">Une question ?</Link>
            </li>
            {/* todo: enable later */}
            {/*<li>*/}
            {/*  <Link href="/v2/budget">Budget</Link>*/}
            {/*</li>*/}
            <li>
              <Link href="/v2/mentions-legales">Mentions légales</Link>
            </li>
            <li>
              <Link href="/v2/politique-de-confidentialite">Données personnelles</Link>
            </li>
          </ul>

          {shouldDisplayChatbot() && (
            <p>
              <Link href={CHATBOT_EXTERNAL_URL} target="_blank">
                {CHATBOT_EXTERNAL_URL_TITLE}
              </Link>
            </p>
          )}
        </section>
      </main>

      <SocialMediaPanel />
    </>
  );
}
