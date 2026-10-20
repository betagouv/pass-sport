import * as Sentry from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { getPool } from './database';
import type {
  EtatTableauxDeBord,
  LigneJour,
  PointSerie,
  Tableau,
} from '@/app/tableau-de-bord/model';

// Entries are keyed by extraction (lireExtraction): the hour only bounds how long a fix made in
// place, without a new load, takes to show. unstable_cache serialises to JSON, hence dates read
// as strings.
const REVALIDATE_SECONDS = 3600;

// Each load replaces the whole table in one transaction, so every row carries the same
// extrait_le. Read on every request and passed to the cached lookups as their first argument, it
// keys their entries by extraction: every container switches to a new load at once, and a page
// never mixes two extractions. Its own cost is a single row.
const lireExtraction = async (): Promise<string | null> => {
  const { rows } = await getPool().query<{ extrait_le: string }>(
    `SELECT to_char(extrait_le AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS extrait_le
     FROM lca_tableaux_de_bord_publies
     LIMIT 1`,
  );
  return rows[0]?.extrait_le ?? null;
};

const lireEtat = unstable_cache(
  async (extraitLe: string): Promise<EtatTableauxDeBord | null> => {
    const { rows } = await getPool().query<{
      premier_jour: string | null;
      dernier_jour: string | null;
    }>(
      `SELECT to_char(min(jour), 'YYYY-MM-DD') AS premier_jour,
              to_char(max(jour), 'YYYY-MM-DD') AS dernier_jour
       FROM lca_tableaux_de_bord_publies`,
    );
    const [etat] = rows;
    if (!etat?.premier_jour || !etat.dernier_jour) {
      return null;
    }
    return { premierJour: etat.premier_jour, dernierJour: etat.dernier_jour, extraitLe };
  },
  ['tableaux-de-bord-etat'],
  { revalidate: REVALIDATE_SECONDS },
);

// Every dashboard's daily rows over a period, in day order then display order.
const lireLignesDeLaPeriode = unstable_cache(
  async (_extraitLe: string, debut: string, fin: string): Promise<LigneJour[]> => {
    const { rows } = await getPool().query<{
      tableau: Tableau;
      jour: string;
      code: string | null;
      libelle: string;
      eligibles: number | null;
      codes_actives: number;
      codes_actives_du_jour: number;
      taux_recours: number | null;
      part_eligibles: number | null;
      part_actives: number | null;
    }>(
      `SELECT tableau, to_char(jour, 'YYYY-MM-DD') AS jour, code, libelle, eligibles,
              codes_actives, codes_actives_du_jour, taux_recours::float8 AS taux_recours,
              part_eligibles::float8 AS part_eligibles, part_actives::float8 AS part_actives
       FROM lca_tableaux_de_bord_publies
       WHERE jour BETWEEN $1 AND $2
       ORDER BY jour, tableau, rang`,
      [debut, fin],
    );
    return rows.map((r) => ({
      tableau: r.tableau,
      jour: r.jour,
      code: r.code,
      libelle: r.libelle,
      eligibles: r.eligibles,
      codesActives: r.codes_actives,
      codesActivesDuJour: r.codes_actives_du_jour,
      tauxRecours: r.taux_recours,
      partEligibles: r.part_eligibles,
      partActives: r.part_actives,
    }));
  },
  ['tableaux-de-bord-periode'],
  { revalidate: REVALIDATE_SECONDS },
);

const lireSeries = unstable_cache(
  async (_extraitLe: string): Promise<PointSerie[]> => {
    const { rows } = await getPool().query<{
      tableau: PointSerie['tableau'];
      jour: string;
      libelle: string;
      codes_actives: number;
      codes_actives_du_jour: number;
      taux_recours: number | null;
    }>(
      `SELECT tableau, to_char(jour, 'YYYY-MM-DD') AS jour, libelle, codes_actives,
              codes_actives_du_jour, taux_recours::float8 AS taux_recours
       FROM lca_tableaux_de_bord_publies
       WHERE tableau IN ('situation', 'organisme')
       ORDER BY jour, tableau, rang`,
    );
    return rows.map((r) => ({
      tableau: r.tableau,
      jour: r.jour,
      libelle: r.libelle,
      codesActives: r.codes_actives,
      codesActivesDuJour: r.codes_actives_du_jour,
      tauxRecours: r.taux_recours,
    }));
  },
  ['tableaux-de-bord-series'],
  { revalidate: REVALIDATE_SECONDS },
);

// Outside the cached functions, so that a failure is reported and never cached.
const sansErreur =
  <A extends unknown[], R>(lecture: (...args: A) => Promise<R>, nom: string) =>
  async (...args: A): Promise<R | null> => {
    try {
      return await lecture(...args);
    } catch (e) {
      console.error(`[pass-sport] ${nom} failed: ${(e as Error).message}`);
      Sentry.withScope((scope) => {
        scope.setLevel('error');
        scope.setTag('lookup', nom);
        scope.captureMessage('Dashboards lookup failed — the public page shows no figures');
        scope.captureException(e);
      });
      return null;
    }
  };

export const getEtatTableauxDeBord = sansErreur(async () => {
  const extraitLe = await lireExtraction();
  return extraitLe ? lireEtat(extraitLe) : null;
}, 'tableaux_de_bord_etat');
export const getLignesDeLaPeriode = sansErreur(lireLignesDeLaPeriode, 'tableaux_de_bord_periode');
export const getSeries = sansErreur(lireSeries, 'tableaux_de_bord_series');
