// Types and pure helpers of the public LCA dashboards page, kept apart from data access so they
// can be tested without a database.

export const TABLEAUX = [
  'genre',
  'age',
  'situation',
  'organisme',
  'federation',
  'region',
  'departement',
] as const;
export type Tableau = (typeof TABLEAUX)[number];

export type EtatTableauxDeBord = {
  premierJour: string;
  dernierJour: string;
  // ISO timestamp of the LCA extraction.
  extraitLe: string;
};

// One row of a dashboard on one day, as stored.
export type LigneJour = {
  tableau: Tableau;
  jour: string;
  code: string | null;
  libelle: string;
  eligibles: number | null;
  codesActives: number;
  codesActivesDuJour: number;
  tauxRecours: number | null;
  partEligibles: number | null;
  partActives: number | null;
};

// One row of a dashboard over a period: stocks and rates at its last day, activations summed.
export type LigneTableau = Omit<LigneJour, 'jour' | 'codesActivesDuJour'> & {
  codesActivesPeriode: number;
};

export type PointSerie = {
  tableau: 'situation' | 'organisme';
  jour: string;
  libelle: string;
  codesActives: number;
  codesActivesDuJour: number;
  tauxRecours: number | null;
};

export type Serie = {
  nom: string;
  couleur: string;
  // SVG stroke-dasharray: identity must never rest on colour alone (RGAA 3.1).
  trait?: string;
  valeurs: (number | null)[];
  // A context series (the Total) is drawn in grey, behind the others.
  contexte?: boolean;
};

export type Pas = 'jour' | 'semaine';

// A day, or a Monday-to-Sunday week keyed by its Monday, bounded by the days that have data.
export type Periode = { cle: string; debut: string; fin: string };

export type Abscisse = { cle: string; courte: string; longue: string };

export const TOTAL = 'Total';

// DSFR illustrative colours, each at least 3:1 against white (RGAA 3.3), in the order validated
// for colourblind separation of neighbouring series. A modality keeps its style whatever the
// other series shown.
const PALETTE = ['#6a6af4', '#009081', '#465f9d', '#ce614a', '#a558a0'];
const TRAITS = ['', '10 5', '1 5', '10 4 2 4', '5 3'];
export const COULEUR_CONTEXTE = '#929292';
export const COULEUR_SERIE_UNIQUE = PALETTE[0];

const SLOTS: Record<PointSerie['tableau'], Record<string, number>> = {
  situation: { AEEH: 0, AAH: 1, QF: 2, Boursiers: 3, 'Non renseigné': 4 },
  organisme: { CAF: 0, MSA: 1, CNOUS: 2, 'Non renseigné': 4 },
};

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;
const JOUR_MS = 86_400_000;
const temps = (jour: string) => Date.parse(`${jour}T00:00:00Z`);
const versJour = (t: number) => new Date(t).toISOString().slice(0, 10);
const premier = (valeur: string | string[] | undefined) =>
  Array.isArray(valeur) ? valeur[0] : valeur;

export const lundi = (jour: string): string => {
  const t = temps(jour);
  return versJour(t - ((new Date(t).getUTCDay() + 6) % 7) * JOUR_MS);
};

export const choisirPas = (demande: string | string[] | undefined): Pas =>
  premier(demande) === 'semaine' ? 'semaine' : 'jour';

// Every day or week of the series, oldest first.
export const periodes = (premierJour: string, dernierJour: string, pas: Pas): Periode[] => {
  const liste: Periode[] = [];
  if (pas === 'jour') {
    for (let t = temps(premierJour); t <= temps(dernierJour); t += JOUR_MS) {
      const jour = versJour(t);
      liste.push({ cle: jour, debut: jour, fin: jour });
    }
    return liste;
  }
  for (let t = temps(lundi(premierJour)); t <= temps(dernierJour); t += 7 * JOUR_MS) {
    const cle = versJour(t);
    const dimanche = versJour(t + 6 * JOUR_MS);
    liste.push({
      cle,
      debut: cle < premierJour ? premierJour : cle,
      fin: dimanche > dernierJour ? dernierJour : dimanche,
    });
  }
  return liste;
};

// The period holding the day asked for in ?periode=, the latest one otherwise. A day maps to its
// week and a week to its first day, so switching between the two keeps the reader's place.
export const choisirPeriode = (
  demande: string | string[] | undefined,
  liste: Periode[],
): Periode => {
  const jour = premier(demande);
  const derniere = liste[liste.length - 1];
  if (!jour || !JOUR_ISO.test(jour)) {
    return derniere;
  }
  if (jour < liste[0].debut && jour >= lundi(liste[0].debut)) {
    return liste[0];
  }
  return liste.find((p) => p.cle === jour || (jour >= p.debut && jour <= p.fin)) ?? derniere;
};

export const extractionPerimee = (extraitLe: string, maintenant: Date, heures = 48): boolean =>
  maintenant.getTime() - Date.parse(extraitLe) > heures * 3_600_000;

// Clean axis ticks from 0 to at least max. Counts never get fractional ticks.
export const graduations = (max: number, { entier = false, cible = 5 } = {}): number[] => {
  if (!(max > 0)) {
    return [0, 1];
  }
  const brut = max / cible;
  const magnitude = 10 ** Math.floor(Math.log10(brut));
  let pas = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= brut) ?? 10 * magnitude;
  if (entier) {
    pas = Math.max(1, Math.ceil(pas));
  }
  const haut = Math.ceil(max / pas) * pas;
  const ticks: number[] = [];
  for (let v = 0; v <= haut + pas / 2; v += pas) {
    ticks.push(Math.round(v * 1e6) / 1e6);
  }
  return ticks;
};

// Up to `nombre` evenly spread indexes of a series of `longueur` points, both ends included.
export const indexEchelonnes = (longueur: number, nombre = 5): number[] => {
  if (longueur <= nombre) {
    return Array.from({ length: longueur }, (_, i) => i);
  }
  const indexes = Array.from({ length: nombre }, (_, i) =>
    Math.round((i * (longueur - 1)) / (nombre - 1)),
  );
  return [...new Set(indexes)];
};

// Series points per week, keyed by the week's Monday: stocks and rates at the week's last day,
// activations summed. Points must come in day order.
export const agregerPoints = (points: PointSerie[], pas: Pas): PointSerie[] => {
  if (pas === 'jour') {
    return points;
  }
  const semaines = new Map<string, PointSerie>();
  for (const p of points) {
    const cle = `${p.tableau}|${p.libelle}|${lundi(p.jour)}`;
    semaines.set(cle, {
      ...p,
      jour: lundi(p.jour),
      codesActivesDuJour: (semaines.get(cle)?.codesActivesDuJour ?? 0) + p.codesActivesDuJour,
    });
  }
  return [...semaines.values()];
};

// The rows of every dashboard over a period, from its daily rows in day order.
export const lignesDeLaPeriode = (lignes: LigneJour[]): LigneTableau[] => {
  const fin = lignes.reduce((max, l) => (l.jour > max ? l.jour : max), '');
  const cle = (l: LigneJour) => `${l.tableau}|${l.libelle}`;
  const activations = new Map<string, number>();
  for (const l of lignes) {
    activations.set(cle(l), (activations.get(cle(l)) ?? 0) + l.codesActivesDuJour);
  }
  return lignes
    .filter((l) => l.jour === fin)
    .map(({ jour: _jour, codesActivesDuJour: _du, ...l }) => ({
      ...l,
      codesActivesPeriode: activations.get(`${l.tableau}|${l.libelle}`) ?? 0,
    }));
};

const ordreLibelles = (points: PointSerie[]): string[] => [
  ...new Set(points.map((p) => p.libelle)),
];

// The days (or week keys) of the series, in order.
export const joursDesSeries = (points: PointSerie[]): string[] =>
  [...new Set(points.map((p) => p.jour))].sort();

// One series per modality of a dashboard, the Total last and in grey.
export const seriesParModalite = (
  points: PointSerie[],
  tableau: PointSerie['tableau'],
  mesure: (p: PointSerie) => number | null,
): Serie[] => {
  const duTableau = points.filter((p) => p.tableau === tableau);
  const jours = joursDesSeries(duTableau);
  const index = new Map(duTableau.map((p) => [`${p.libelle}|${p.jour}`, p]));
  const libelles = ordreLibelles(duTableau).sort(
    (a, b) => Number(a === TOTAL) - Number(b === TOTAL),
  );

  return libelles.map((libelle) => {
    const valeurs = jours.map((jour) => {
      const point = index.get(`${libelle}|${jour}`);
      return point ? mesure(point) : null;
    });
    if (libelle === TOTAL) {
      return { nom: TOTAL, couleur: COULEUR_CONTEXTE, valeurs, contexte: true };
    }
    const slot = SLOTS[tableau][libelle] ?? 4;
    return { nom: libelle, couleur: PALETTE[slot], trait: TRAITS[slot], valeurs };
  });
};

// The Total of one dashboard, as a single series.
export const serieTotal = (
  points: PointSerie[],
  tableau: PointSerie['tableau'],
  nom: string,
  mesure: (p: PointSerie) => number | null,
): Serie => ({
  nom,
  couleur: COULEUR_SERIE_UNIQUE,
  valeurs: seriesParModalite(points, tableau, mesure).find((s) => s.nom === TOTAL)?.valeurs ?? [],
});

export type Barre = { libelle: string; valeur: number; eligibles: number | null };

// Places and federations have no natural order, so they are ranked; unresolved ones stay last.
const CLASSES_PAR_VALEUR: Tableau[] = ['federation', 'region', 'departement'];
const EN_FIN = ['Non identifié', 'Autre', 'Non renseigné'];

// Activated codes and eligibles per modality at the end of the rows' period, without the Total.
export const barresDuTableau = (lignes: LigneTableau[], tableau: Tableau): Barre[] => {
  const barres = lignes
    .filter((l) => l.tableau === tableau && l.libelle !== TOTAL)
    .map((l) => ({ libelle: l.libelle, valeur: l.codesActives, eligibles: l.eligibles }));
  if (!CLASSES_PAR_VALEUR.includes(tableau)) {
    return barres;
  }
  const rang = (b: Barre) => EN_FIN.indexOf(b.libelle);
  return [...barres].sort((a, b) => rang(a) - rang(b) || b.valeur - a.valeur);
};

const nombre = new Intl.NumberFormat('fr-FR');
const pourcent = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const jourLong = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'UTC' });
const jourMois = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});
const jourCourt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const horodatage = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});
const date = (jour: string) => new Date(`${jour}T00:00:00Z`);

export const formaterNombre = (valeur: number | null): string =>
  valeur === null ? '—' : nombre.format(valeur);

export const formaterPourcent = (valeur: number | null): string =>
  valeur === null ? '—' : `${pourcent.format(valeur)} %`;

export const formaterJour = (jour: string): string => jourLong.format(date(jour));

export const formaterJourCourt = (jour: string): string => jourCourt.format(date(jour));

export const formaterHorodatage = (iso: string): string => horodatage.format(new Date(iso));

// "du 3 au 9 août 2026", "du 27 juillet au 2 août 2026".
export const formaterIntervalle = (debut: string, fin: string): string => {
  if (debut === fin) {
    return `du ${formaterJour(fin)}`;
  }
  const [a, b] = [date(debut), date(fin)];
  const debutTexte =
    a.getUTCFullYear() !== b.getUTCFullYear()
      ? jourLong.format(a)
      : a.getUTCMonth() !== b.getUTCMonth()
        ? jourMois.format(a)
        : String(a.getUTCDate());
  return `du ${debutTexte} au ${jourLong.format(b)}`;
};

// "29 septembre 2026" or "semaine du 22 au 28 septembre 2026".
export const formaterPeriode = (periode: Periode, pas: Pas): string =>
  pas === 'jour'
    ? formaterJour(periode.fin)
    : `semaine ${formaterIntervalle(periode.debut, periode.fin)}`;

// The x positions of the evolution charts, one per key of the (aggregated) series.
export const abscisses = (cles: string[], liste: Periode[], pas: Pas): Abscisse[] => {
  const parCle = new Map(liste.map((p) => [p.cle, p]));
  return cles.map((cle) => {
    const periode = parCle.get(cle) ?? { cle, debut: cle, fin: cle };
    const longue = formaterPeriode(periode, pas);
    return {
      cle,
      courte: formaterJourCourt(periode.debut),
      longue: longue.charAt(0).toUpperCase() + longue.slice(1),
    };
  });
};
