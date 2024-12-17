'use server';

import { Metadata } from 'next';
import styles from './styles.module.scss';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import PageTitle from '@/components/PageTitle/PageTitle';
import Link from 'next/link';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Budget pass Sport',
  };
}

function Page() {
  return (
    <main className={styles['container']} tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
      <PageTitle
        title="Budget"
        subtitle={
          <p>
            Le site pass Sport 2024 est un service public numérique, c’est pourquoi nous sommes
            transparents sur les ressources allouées et la manière dont elles sont employées.
          </p>
        }
        classes={{
          container: styles['page-header'],
        }}
      />

      <div className={styles.wrapper}>
        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Principes</h2>
          <p>
            Nous suivons le{' '}
            <Link href="https://beta.gouv.fr/manifeste" target="_blank">
              manifeste beta.gouv
            </Link>{' '}
            dont nous rappelons les principes ici :
          </p>
          <ul>
            <li>
              Les besoins des utilisateurs sont prioritaires sur les besoins de l’administration
            </li>
            <li>Le mode de gestion de l’équipe repose sur la confiance</li>
            <li>L&apos;équipe adopte une approche itérative et d’amélioration en continu</li>
          </ul>
        </section>

        <section className="fr-mb-6w">
          <h2 className="fr-mb-2w">Fonctionnement</h2>
          <p>
            L&apos;équipe est portée par un intrapreneur qui est responsable du service numérique
            développé.
          </p>
          <p>
            Son rôle est multiple : déploiement, gestion des produits, référent auprès de son
            administration (budget, compte rendus d&apos;avancement).
          </p>
          <p>
            L&apos;ensemble de l&apos;équipe et le descriptif du produit est décrit sur la{' '}
            <Link href="https://beta.gouv.fr/startups/pass-sport.html" target="_blank">
              fiche du produit beta.gouv.fr.
            </Link>
          </p>
        </section>

        <section className="fr-mb-6w">
          <div className="fr-table  fr-col-12">
            <div className="fr-table__wrapper">
              <div className="fr-table__container">
                <div className="fr-table__content">
                  <table className="fr-cell--multiline">
                    <caption>Dépenses 2024</caption>
                    <thead className="fr-col-6">
                      <tr>
                        <th>Intitulé</th>
                        <th>Somme</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="fr-col-6 fr-col-md-8">
                          Fonctionnement Direction des Sports
                        </td>
                        <td className="fr-col-6 fr-col-md-4">984 000 €</td>
                      </tr>
                      <tr>
                        <td className="fr-col-6 fr-col-md-8">
                          Fonctionnement Équipe produit (product owner, développeurs, designer)
                        </td>
                        <td className="fr-col-6 fr-col-md-4">483 538 €</td>
                      </tr>
                      <tr>
                        <td className="fr-col-6 fr-col-md-8">
                          Communication & Campagnes d'email/sms
                        </td>
                        <td className="fr-col-6 fr-col-md-4">2 010 948 €</td>
                      </tr>
                      <tr>
                        <td className="fr-col-6 fr-col-md-8">
                          Subvention{' '}
                          <abbr title="Comité national olympique et sportif français (CNOSF)">
                            CNOSF
                          </abbr>
                        </td>
                        <td className="fr-col-6 fr-col-md-4">250 000 €</td>
                      </tr>
                      <tr>
                        <td className="fr-col-6 fr-col-md-8">Assistance usagers</td>
                        <td className="fr-col-6 fr-col-md-4">257 990 €</td>
                      </tr>

                      <tr className="fr-text--bold">
                        <td className="fr-col-6 fr-col-md-8">Coût total de fonctionnement</td>
                        <td className="fr-col-6 fr-col-md-4">3 986 476 €</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

export default Page;
