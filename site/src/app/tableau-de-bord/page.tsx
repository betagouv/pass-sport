import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import PageTitle from '@/components/PageTitle/PageTitle';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';
import { getEtatTableauxDeBord, getLignesDeLaPeriode, getSeries } from '@/app/services/dashboard';
import {
  COULEUR_SERIE_UNIQUE,
  TABLEAUX,
  TOTAL,
  type Tableau,
  abscisses,
  agregerPoints,
  barresDuTableau,
  choisirPas,
  choisirPeriode,
  extractionPerimee,
  formaterHorodatage,
  formaterIntervalle,
  formaterJour,
  formaterNombre,
  formaterPeriode,
  formaterPourcent,
  joursDesSeries,
  lignesDeLaPeriode,
  periodes,
  seriesParModalite,
  serieTotal,
} from './model';
import { Barres, Colonnes, Courbes, DonneesGraphique } from './components/Graphiques';
import TableauDetail, { TITRES } from './components/TableauDetail';
import styles from './style.module.scss';

// The exercice the LCA export is fixed to (specs/dashboard/).
const CAMPAGNE = '2026';

// Rendered per request, never at build time: the figures live in the database, and the hour of
// caching is done by the service (unstable_cache).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Tableau de bord - pass Sport',
  description: `Les chiffres du pass Sport ${CAMPAGNE}, jour par jour ou semaine par semaine : public éligible, codes activés et taux de recours par genre, âge, situation, organisme, région et département.`,
};

type Props = {
  searchParams: Promise<{ pas?: string | string[]; periode?: string | string[] }>;
};

const Page = ({ sousTitre, children }: { sousTitre?: string; children: ReactNode }) => (
  <main tabIndex={-1} id={SKIP_LINKS_ID.mainContent} role="main">
    <PageTitle
      title={`Tableau de bord du pass Sport ${CAMPAGNE}`}
      subtitle={sousTitre}
      classes={{ container: styles['page-header'] }}
    />
    <div className="fr-container fr-my-4w">{children}</div>
  </main>
);

const pourcentAxe = (v: number) => `${formaterNombre(v)} %`;

// Long lists, folded so the page stays readable.
const REPLIES: Tableau[] = ['federation', 'departement'];

export default async function TableauxDeBord({ searchParams }: Props) {
  const etat = await getEtatTableauxDeBord();
  if (!etat) {
    return (
      <Page>
        <Alert
          severity="info"
          title="Aucune donnée disponible"
          description="Le tableau de bord sera publié dès la première mise à jour des chiffres."
        />
      </Page>
    );
  }

  const params = await searchParams;
  const pas = choisirPas(params.pas);
  const liste = periodes(etat.premierJour, etat.dernierJour, pas);
  const periode = choisirPeriode(params.periode, liste);
  const [lignesDernierJour, lignesPeriode, points] = await Promise.all([
    getLignesDeLaPeriode(etat.dernierJour, etat.dernierJour),
    getLignesDeLaPeriode(periode.debut, periode.fin),
    getSeries(),
  ]);
  const sousTitre = `Données au ${formaterJour(etat.dernierJour)}, extraites le ${formaterHorodatage(etat.extraitLe)}`;

  if (!lignesDernierJour || !lignesPeriode || !points) {
    return (
      <Page sousTitre={sousTitre}>
        <Alert
          severity="error"
          title="Tableau de bord momentanément indisponible"
          description="Les chiffres n'ont pas pu être chargés. Merci de réessayer dans quelques minutes."
        />
      </Page>
    );
  }

  const total = lignesDeLaPeriode(lignesDernierJour).find(
    (l) => l.tableau === 'situation' && l.libelle === TOTAL,
  );
  const detail = lignesDeLaPeriode(lignesPeriode);

  const parJour = pas === 'jour';
  const agreges = agregerPoints(points, pas);
  const axe = abscisses(joursDesSeries(agreges), liste, pas);
  const enTete = parJour ? 'Jour' : 'Semaine';
  const unite = parJour ? 'jour' : 'semaine';
  const cumul = serieTotal(agreges, 'situation', 'Codes activés', (p) => p.codesActives);
  const activations = serieTotal(
    agreges,
    'situation',
    `Codes activés dans la ${unite}`,
    (p) => p.codesActivesDuJour,
  );
  const tauxParSituation = seriesParModalite(agreges, 'situation', (p) => p.tauxRecours);
  const tauxParOrganisme = seriesParModalite(agreges, 'organisme', (p) => p.tauxRecours);
  const etendue = `${unite} par ${unite}, ${formaterIntervalle(etat.premierJour, etat.dernierJour)}`;
  const libellePeriode = parJour
    ? `au ${formaterJour(periode.fin)}`
    : `de la ${formaterPeriode(periode, pas)}`;
  const titreActivations = parJour ? 'Codes activés du jour' : 'Codes activés dans la semaine';

  return (
    <Page sousTitre={sousTitre}>
      {extractionPerimee(etat.extraitLe, new Date()) && (
        <Alert
          className="fr-mb-4w"
          severity="warning"
          small
          description={`Les chiffres n'ont pas été mis à jour depuis le ${formaterHorodatage(etat.extraitLe)}.`}
        />
      )}

      <section aria-labelledby="chiffres-cles">
        <h2 id="chiffres-cles">Chiffres clés au {formaterJour(etat.dernierJour)}</h2>
        {total && (
          <ul className={styles.tuiles}>
            <li>
              <span className={styles.tuileLibelle}>Public éligible</span>
              <span className={styles.tuileValeur}>{formaterNombre(total.eligibles)}</span>
            </li>
            <li>
              <span className={styles.tuileLibelle}>Codes activés</span>
              <span className={styles.tuileValeur}>{formaterNombre(total.codesActives)}</span>
            </li>
            <li>
              <span className={styles.tuileLibelle}>Taux de recours</span>
              <span className={styles.tuileValeur}>{formaterPourcent(total.tauxRecours)}</span>
            </li>
            <li>
              <span className={styles.tuileLibelle}>Codes activés ce jour-là</span>
              <span className={styles.tuileValeur}>
                {formaterNombre(total.codesActivesPeriode)}
              </span>
            </li>
          </ul>
        )}
      </section>

      <form method="get" className={styles.filtres}>
        <fieldset className="fr-fieldset fr-mb-0">
          <legend className="fr-fieldset__legend fr-fieldset__legend--regular">
            Présenter les évolutions et le détail
          </legend>
          <div className="fr-fieldset__element fr-fieldset__element--inline">
            <div className="fr-radio-group">
              <input type="radio" id="pas-jour" name="pas" value="jour" defaultChecked={parJour} />
              <label className="fr-label" htmlFor="pas-jour">
                Jour par jour
              </label>
            </div>
          </div>
          <div className="fr-fieldset__element fr-fieldset__element--inline">
            <div className="fr-radio-group">
              <input
                type="radio"
                id="pas-semaine"
                name="pas"
                value="semaine"
                defaultChecked={!parJour}
              />
              <label className="fr-label" htmlFor="pas-semaine">
                Semaine par semaine
              </label>
            </div>
          </div>
        </fieldset>
        <div className="fr-select-group">
          <label className="fr-label" htmlFor="periode">
            {parJour ? 'Jour du détail' : 'Semaine du détail'}
          </label>
          <select className="fr-select" id="periode" name="periode" defaultValue={periode.cle}>
            {[...liste].reverse().map((p) => (
              <option key={p.cle} value={p.cle}>
                {parJour ? formaterJour(p.fin) : `Semaine ${formaterIntervalle(p.debut, p.fin)}`}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="fr-btn fr-btn--secondary">
          Afficher
        </button>
      </form>

      <section aria-labelledby="evolution">
        <h2 id="evolution">Évolution depuis l&apos;ouverture de la campagne</h2>

        <h3 className="fr-h5">Codes activés, en cumul</h3>
        <Courbes
          id="cumul"
          resume={`Courbe du nombre cumulé de codes activés, ${etendue}.`}
          abscisses={axe}
          series={[cumul]}
          format={formaterNombre}
          entier
          aire
        />
        <DonneesGraphique
          titre="Codes activés, en cumul"
          enTete={enTete}
          abscisses={axe}
          series={[cumul]}
          format={formaterNombre}
        />

        <h3 className="fr-h5">Codes activés chaque {unite}</h3>
        <Colonnes
          id="activations"
          resume={`Histogramme du nombre de codes activés chaque ${unite}, ${etendue}.`}
          abscisses={axe}
          valeurs={activations.valeurs.map((v) => v ?? 0)}
          couleur={activations.couleur}
          format={formaterNombre}
        />
        <DonneesGraphique
          titre={`Codes activés chaque ${unite}`}
          enTete={enTete}
          abscisses={axe}
          series={[activations]}
          format={formaterNombre}
        />

        <h3 className="fr-h5">Taux de recours par situation</h3>
        <Courbes
          id="taux-situation"
          resume={`Courbes du taux de recours de chaque situation et de l'ensemble, ${etendue}.`}
          abscisses={axe}
          series={tauxParSituation}
          format={formaterPourcent}
          formatAxe={pourcentAxe}
        />
        <DonneesGraphique
          titre="Taux de recours par situation"
          enTete={enTete}
          abscisses={axe}
          series={tauxParSituation}
          format={formaterPourcent}
        />

        <h3 className="fr-h5">Taux de recours par organisme</h3>
        <Courbes
          id="taux-organisme"
          resume={`Courbes du taux de recours de chaque organisme et de l'ensemble, ${etendue}.`}
          abscisses={axe}
          series={tauxParOrganisme}
          format={formaterPourcent}
          formatAxe={pourcentAxe}
        />
        <DonneesGraphique
          titre="Taux de recours par organisme"
          enTete={enTete}
          abscisses={axe}
          series={tauxParOrganisme}
          format={formaterPourcent}
        />
      </section>

      <section aria-labelledby="detail">
        <h2 id="detail">Détail {libellePeriode}</h2>
        {TABLEAUX.map((tableau) => {
          const duTableau = detail.filter((l) => l.tableau === tableau);
          const barres = barresDuTableau(detail, tableau);
          const avecEligibles = barres.some((b) => b.eligibles !== null);
          const au = `au ${formaterJour(periode.fin)}`;
          const contenu = (
            <>
              <Barres
                id={`barres-${tableau}`}
                titre={
                  avecEligibles ? `Codes activés et public éligible ${au}` : `Codes activés ${au}`
                }
                resume={`Diagramme en barres du nombre cumulé de codes activés${avecEligibles ? ', rapporté au public éligible,' : ''} par ${TITRES[tableau].toLowerCase()}, ${au}.`}
                barres={barres}
                couleur={COULEUR_SERIE_UNIQUE}
                format={formaterNombre}
              />
              <TableauDetail
                tableau={tableau}
                periode={libellePeriode}
                titreActivations={titreActivations}
                lignes={duTableau}
              />
            </>
          );
          return (
            <div key={tableau} className="fr-mb-4w">
              <h3 className="fr-h5">{TITRES[tableau]}</h3>
              {REPLIES.includes(tableau) ? (
                <details className={styles.replie}>
                  <summary>
                    Afficher le graphique et les {duTableau.length} lignes par{' '}
                    {TITRES[tableau].toLowerCase()}
                  </summary>
                  {contenu}
                </details>
              ) : (
                contenu
              )}
            </div>
          );
        })}
      </section>

      <section aria-labelledby="definitions">
        <h2 id="definitions">Définitions</h2>
        <ul>
          <li>
            <strong>Public éligible</strong> : les bénéficiaires de la campagne {CAMPAGNE} à qui un
            code pass Sport a été attribué, hors refus. C&apos;est un effectif fixe, le même chaque
            jour.
          </li>
          <li>
            <strong>Codes activés</strong> : les bénéficiaires dont le code a été utilisé pour une
            inscription dans un club, comptés à partir du jour de leur première inscription, en
            cumul depuis l&apos;ouverture de la campagne.
          </li>
          <li>
            <strong>Codes activés du jour, dans la semaine</strong> : les activations de la période
            seulement. Les semaines vont du lundi au dimanche.
          </li>
          <li>
            <strong>Taux de recours</strong> : les codes activés rapportés au public éligible.
          </li>
          <li>
            <strong>Âge</strong> : celui atteint au 31 décembre {CAMPAGNE}, en années révolues,
            comme dans les critères d&apos;éligibilité : {CAMPAGNE} moins l&apos;année de naissance,
            quelle que soit la date d&apos;anniversaire.
          </li>
          <li>
            <strong>Semaine par semaine</strong> : les cumuls, les taux et les parts sont ceux du
            dernier jour de chaque semaine.
          </li>
          <li>
            <strong>Fédération</strong> : celle de l&apos;inscription qui a activé le code.
          </li>
          <li>
            <strong>Parts et poids dans le dispositif</strong> : rapportés à la ligne Total du même
            jour.
          </li>
          <li>
            <strong>Région et département</strong> : ceux de l&apos;adresse de l&apos;allocataire,
            d&apos;après son code INSEE ou, à défaut, son code postal. Pour les régions, « Autre »
            regroupe les adresses sans aucun de ces codes et « Non identifié » les codes qui ne
            correspondent à aucun département. Pour les départements, ces deux cas sont réunis sous
            « Non renseigné ».
          </li>
          <li>
            Les chiffres s&apos;arrêtent à la veille de chaque mise à jour quotidienne : seules les
            journées complètes sont comptées.
          </li>
        </ul>
      </section>
    </Page>
  );
}
