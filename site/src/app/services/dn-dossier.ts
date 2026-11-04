import * as Sentry from '@sentry/nextjs';
import { getPool } from './database';
import type { DnDossier } from './dn-dossier-rules';

type DnDossierRow = {
  dossier_number: number;
  dossier_url: string;
  state: string;
  submitted_at: Date | null;
};

// The prefill URL only while nobody claimed the dossier: DN answers 404 to it afterwards, and its
// token must not be handed out again. Its owner then reaches it on their own DN page.
export const dnDossierUrl = ({
  dossier_number,
  dossier_url,
  state,
}: Pick<DnDossierRow, 'dossier_number' | 'dossier_url' | 'state'>): string =>
  state === 'prefilled' ? dossier_url : `${new URL(dossier_url).origin}/dossiers/${dossier_number}`;

export const findDnDossierForSub = async (sub: string): Promise<DnDossier | null> => {
  try {
    const { rows } = await getPool().query<DnDossierRow>(
      'SELECT dossier_number, dossier_url, state, submitted_at FROM fc_dn_dossier_by_sub WHERE sub = $1',
      [sub],
    );

    if (rows.length === 0) {
      return null;
    }

    const [row] = rows;

    return {
      number: row.dossier_number,
      state: row.state,
      url: dnDossierUrl(row),
      submittedAt: row.submitted_at?.toISOString() ?? null,
    };
  } catch (e) {
    console.error(`[pass-sport] DN dossier lookup failed: ${(e as Error).message}`);

    Sentry.withScope((scope) => {
      scope.setLevel('error');
      scope.setTag('lookup', 'fc_dn_dossier_by_sub');
      scope.captureMessage('DN dossier lookup failed — the espace FranceConnect will not show it');
      scope.captureException(e);
    });

    return null;
  }
};
