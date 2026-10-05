import { formaterNombre, formaterPourcent, type LigneTableau, type Tableau, TOTAL } from '../model';
import styles from './graphiques.module.scss';

type Colonne = {
  titre: string;
  valeur: (ligne: LigneTableau) => string;
  numerique?: boolean;
};

const eligibles = (titre: string): Colonne => ({
  titre,
  valeur: (l) => formaterNombre(l.eligibles),
  numerique: true,
});
const codesActives: Colonne = {
  titre: 'Codes activés',
  valeur: (l) => formaterNombre(l.codesActives),
  numerique: true,
};
// Filled in with the period's name: « du jour », « dans la semaine ».
const ACTIVATIONS = 'activations';
const activations: Colonne = {
  titre: ACTIVATIONS,
  valeur: (l) => formaterNombre(l.codesActivesPeriode),
  numerique: true,
};
const tauxRecours: Colonne = {
  titre: 'Taux de recours',
  valeur: (l) => formaterPourcent(l.tauxRecours),
  numerique: true,
};
const partEligibles: Colonne = {
  titre: 'Part des éligibles',
  valeur: (l) => formaterPourcent(l.partEligibles),
  numerique: true,
};
const partActives = (titre: string): Colonne => ({
  titre,
  valeur: (l) => formaterPourcent(l.partActives),
  numerique: true,
});
const libelle = (titre: string): Colonne => ({ titre, valeur: (l) => l.libelle });

export const TITRES: Record<Tableau, string> = {
  genre: 'Genre',
  age: 'Âge',
  situation: 'Situation',
  organisme: 'Organisme',
  federation: 'Fédération',
  region: 'Région',
  departement: 'Département',
};

const COLONNES: Record<Tableau, Colonne[]> = {
  genre: [
    libelle('Genre'),
    eligibles('Public éligible'),
    codesActives,
    activations,
    tauxRecours,
    partEligibles,
    partActives('Part des codes activés'),
  ],
  age: [
    libelle('Âge'),
    eligibles('Public éligible'),
    codesActives,
    activations,
    tauxRecours,
    partEligibles,
    partActives('Part des codes activés'),
  ],
  situation: [
    libelle('Situation'),
    eligibles('Public éligible'),
    codesActives,
    activations,
    tauxRecours,
    partEligibles,
    partActives('Part des codes activés'),
  ],
  organisme: [
    libelle('Organisme'),
    eligibles('Public éligible'),
    codesActives,
    activations,
    tauxRecours,
    partEligibles,
    partActives('Part des codes activés'),
  ],
  federation: [
    libelle('Fédération'),
    codesActives,
    activations,
    partActives('Poids dans le dispositif'),
  ],
  region: [
    libelle('Région'),
    eligibles('Éligibles'),
    codesActives,
    activations,
    tauxRecours,
    partActives('Poids dans le dispositif'),
  ],
  departement: [
    { titre: 'Code', valeur: (l) => l.code ?? '' },
    libelle('Département'),
    eligibles('Éligibles'),
    codesActives,
    activations,
    tauxRecours,
    partActives('Poids dans le dispositif'),
  ],
};

type Props = {
  tableau: Tableau;
  // « au 29 septembre 2026 », « de la semaine du 22 au 28 septembre 2026 ».
  periode: string;
  titreActivations: string;
  lignes: LigneTableau[];
};

export default function TableauDetail({ tableau, periode, titreActivations, lignes }: Props) {
  const colonnes = COLONNES[tableau].map((c) =>
    c.titre === ACTIVATIONS ? { ...c, titre: titreActivations } : c,
  );
  // The libelle cell heads its row.
  const enTete = colonnes.findIndex((c) => !c.numerique && c.titre !== 'Code');
  return (
    <div className="fr-table fr-table--bordered fr-table--no-caption">
      <div className="fr-table__wrapper">
        <div className="fr-table__container">
          <div className="fr-table__content">
            <table>
              <caption>
                {TITRES[tableau]}, {periode}
              </caption>
              <thead>
                <tr>
                  {colonnes.map((c) => (
                    <th
                      key={c.titre}
                      scope="col"
                      className={c.numerique ? styles.nombre : undefined}
                    >
                      {c.titre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne) => {
                  const estTotal = ligne.libelle === TOTAL;
                  return (
                    <tr key={ligne.libelle}>
                      {colonnes.map((c, n) =>
                        n === enTete ? (
                          <th key={c.titre} scope="row">
                            {estTotal ? <strong>{c.valeur(ligne)}</strong> : c.valeur(ligne)}
                          </th>
                        ) : (
                          <td key={c.titre} className={c.numerique ? styles.nombre : undefined}>
                            {estTotal ? <strong>{c.valeur(ligne)}</strong> : c.valeur(ligne)}
                          </td>
                        ),
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
