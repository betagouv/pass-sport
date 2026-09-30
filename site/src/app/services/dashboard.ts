import * as Sentry from '@sentry/nextjs';
import { unstable_cache } from 'next/cache';
import { getPool } from './database';
import type {
  EtatTableauxDeBord,
  LigneJour,
  PointSerie,
  Tableau,
} from '@/app/tableau-de-bord/model';

// The table changes once a day and the page is public: an hour of cache keeps the database out
// of reach of the traffic. unstable_cache serialises to JSON, hence dates read as strings.
const REVALIDATE_SECONDS = 3600;

const lireEtat = unstable_cache(
  async (): Promise<EtatTableauxDeBord | null> => {
    const { rows } = await getPool().query<{
      premier_jour: string | null;
      dernier_jour: string | null;
      extrait_le: string | null;
    }>(
      `SELECT to_char(min(jour), 'YYYY-MM-DD') AS premier_jour,
              to_char(max(jour), 'YYYY-MM-DD') AS dernier_jour,
              to_char(max(extrait_le) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS extrait_le
       FROM lca_tableaux_de_bord_publies`,
    );
    const [etat] = rows;
    if (!etat?.premier_jour || !etat.dernier_jour || !etat.extrait_le) {
      return null;
    }
    return {
      premierJour: etat.premier_jour,
      dernierJour: etat.dernier_jour,
      extraitLe: etat.extrait_le,
    };
  },
  ['tableaux-de-bord-etat'],
  { revalidate: REVALIDATE_SECONDS },
);

// Every dashboard's daily rows over a period, in day order then display order.
const lireLignesDeLaPeriode = unstable_cache(
  async (debut: string, fin: string): Promise<LigneJour[]> => {
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
  async (): Promise<PointSerie[]> => {
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

export const getEtatTableauxDeBord = sansErreur(lireEtat, 'tableaux_de_bord_etat');
export const getLignesDeLaPeriode = sansErreur(lireLignesDeLaPeriode, 'tableaux_de_bord_periode');
export const getSeries = sansErreur(lireSeries, 'tableaux_de_bord_series');
