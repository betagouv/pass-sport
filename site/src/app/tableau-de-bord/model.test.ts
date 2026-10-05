import {
  COULEUR_CONTEXTE,
  abscisses,
  agregerPoints,
  barresDuTableau,
  choisirPas,
  choisirPeriode,
  extractionPerimee,
  formaterIntervalle,
  formaterJour,
  formaterNombre,
  formaterPourcent,
  graduations,
  indexEchelonnes,
  lignesDeLaPeriode,
  lundi,
  periodes,
  seriesParModalite,
  serieTotal,
  type LigneJour,
  type LigneTableau,
  type PointSerie,
} from './model';

const point = (
  jour: string,
  libelle: string,
  codesActives: number,
  tauxRecours: number | null,
  codesActivesDuJour = 0,
): PointSerie => ({
  tableau: 'situation',
  jour,
  libelle,
  codesActives,
  codesActivesDuJour,
  tauxRecours,
});

describe('periodes', () => {
  // 1 August 2026 is a Saturday.
  it('lists every day, oldest first', () => {
    expect(periodes('2026-09-29', '2026-10-01', 'jour').map((p) => p.cle)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
    ]);
  });

  it('cuts weeks from Monday to Sunday, bounded by the days with data', () => {
    expect(periodes('2026-08-01', '2026-08-19', 'semaine')).toEqual([
      { cle: '2026-07-27', debut: '2026-08-01', fin: '2026-08-02' },
      { cle: '2026-08-03', debut: '2026-08-03', fin: '2026-08-09' },
      { cle: '2026-08-10', debut: '2026-08-10', fin: '2026-08-16' },
      { cle: '2026-08-17', debut: '2026-08-17', fin: '2026-08-19' },
    ]);
  });

  it('finds the Monday of any day', () => {
    expect(lundi('2026-08-01')).toBe('2026-07-27');
    expect(lundi('2026-08-03')).toBe('2026-08-03');
    expect(lundi('2026-08-09')).toBe('2026-08-03');
  });
});

describe('choisirPas and choisirPeriode', () => {
  const jours = periodes('2026-08-01', '2026-08-19', 'jour');
  const semaines = periodes('2026-08-01', '2026-08-19', 'semaine');

  it('defaults to days', () => {
    expect(choisirPas(undefined)).toBe('jour');
    expect(choisirPas('mois')).toBe('jour');
    expect(choisirPas(['semaine'])).toBe('semaine');
  });

  it('keeps the reader in place when switching between days and weeks', () => {
    expect(choisirPeriode('2026-08-12', semaines).cle).toBe('2026-08-10');
    expect(choisirPeriode('2026-08-10', jours).cle).toBe('2026-08-10');
    // The first week's key is a Monday before the first day of data.
    expect(choisirPeriode('2026-07-27', jours).cle).toBe('2026-08-01');
  });

  it('falls back on the latest period for anything else', () => {
    expect(choisirPeriode(undefined, jours).cle).toBe('2026-08-19');
    expect(choisirPeriode('2026-09-15', semaines).cle).toBe('2026-08-17');
    expect(choisirPeriode("2026-08-12' or 1=1", jours).cle).toBe('2026-08-19');
  });
});

describe('agregerPoints', () => {
  it('keeps the last day of each week for stocks and rates, and sums activations', () => {
    const points = [
      point('2026-08-08', 'QF', 5, 1, 5),
      point('2026-08-09', 'QF', 8, 1.6, 3),
      point('2026-08-10', 'QF', 12, 2.4, 4),
    ];

    expect(agregerPoints(points, 'semaine')).toEqual([
      point('2026-08-03', 'QF', 8, 1.6, 8),
      point('2026-08-10', 'QF', 12, 2.4, 4),
    ]);
    expect(agregerPoints(points, 'jour')).toBe(points);
  });
});

describe('lignesDeLaPeriode', () => {
  const ligne = (jour: string, libelle: string, codesActives: number, du: number): LigneJour => ({
    tableau: 'genre',
    jour,
    code: null,
    libelle,
    eligibles: null,
    codesActives,
    codesActivesDuJour: du,
    tauxRecours: null,
    partEligibles: null,
    partActives: null,
  });

  it('takes the last day, with the activations of the whole period', () => {
    const lignes = [
      ligne('2026-08-03', 'Fille', 4, 4),
      ligne('2026-08-03', 'Total', 5, 5),
      ligne('2026-08-04', 'Fille', 7, 3),
      ligne('2026-08-04', 'Total', 9, 4),
    ];

    expect(lignesDeLaPeriode(lignes)).toEqual([
      expect.objectContaining({ libelle: 'Fille', codesActives: 7, codesActivesPeriode: 7 }),
      expect.objectContaining({ libelle: 'Total', codesActives: 9, codesActivesPeriode: 9 }),
    ]);
  });
});

describe('extractionPerimee', () => {
  it('flags an extraction older than 48 hours', () => {
    const maintenant = new Date('2026-09-30T08:00:00Z');
    expect(extractionPerimee('2026-09-29T03:00:00Z', maintenant)).toBe(false);
    expect(extractionPerimee('2026-09-28T07:00:00Z', maintenant)).toBe(true);
  });
});

describe('graduations', () => {
  it('rounds the top to a clean step', () => {
    expect(graduations(83)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(graduations(1_234_567)).toEqual([0, 250_000, 500_000, 750_000, 1_000_000, 1_250_000]);
  });

  it('never gives fractional ticks to counts', () => {
    expect(graduations(3, { entier: true })).toEqual([0, 1, 2, 3]);
  });

  it('survives an empty series', () => {
    expect(graduations(0)).toEqual([0, 1]);
  });
});

describe('indexEchelonnes', () => {
  it('spreads ticks over the series, both ends included', () => {
    expect(indexEchelonnes(101)).toEqual([0, 25, 50, 75, 100]);
    expect(indexEchelonnes(3)).toEqual([0, 1, 2]);
  });
});

describe('seriesParModalite', () => {
  const points = [
    point('2026-09-01', 'AEEH', 1, 10),
    point('2026-09-01', 'Total', 3, 5),
    point('2026-09-01', 'QF', 2, 4),
    point('2026-09-02', 'AEEH', 2, 20),
    point('2026-09-02', 'QF', 3, 6),
    point('2026-09-02', 'Total', 5, 8.5),
  ];

  it('gives one series per modality, the Total last, grey and solid', () => {
    const series = seriesParModalite(points, 'situation', (p) => p.tauxRecours);

    expect(series.map((s) => s.nom)).toEqual(['AEEH', 'QF', 'Total']);
    expect(series[0].valeurs).toEqual([10, 20]);
    expect(series[2]).toMatchObject({
      couleur: COULEUR_CONTEXTE,
      contexte: true,
      valeurs: [5, 8.5],
    });
    expect(series[2].trait).toBeUndefined();
  });

  it('tells modalities apart by line pattern too, not by colour alone', () => {
    const [aeeh, qf] = seriesParModalite(points, 'situation', (p) => p.tauxRecours);

    expect(aeeh.trait).not.toBe(qf.trait);
    expect(aeeh.couleur).not.toBe(qf.couleur);
  });

  it('keeps a modality its style whatever the others shown', () => {
    const avecAeeh = seriesParModalite(points, 'situation', (p) => p.tauxRecours);
    const sansAeeh = seriesParModalite(
      points.filter((p) => p.libelle !== 'AEEH'),
      'situation',
      (p) => p.tauxRecours,
    );
    const qf = avecAeeh.find((s) => s.nom === 'QF');

    expect(sansAeeh.find((s) => s.nom === 'QF')).toMatchObject({
      couleur: qf?.couleur,
      trait: qf?.trait,
    });
  });

  it('leaves a gap where a day is missing', () => {
    const series = seriesParModalite(
      points.filter((p) => !(p.libelle === 'QF' && p.jour === '2026-09-01')),
      'situation',
      (p) => p.codesActives,
    );

    expect(series.find((s) => s.nom === 'QF')?.valeurs).toEqual([null, 3]);
  });

  it('extracts the Total as a single series', () => {
    expect(serieTotal(points, 'situation', 'Codes activés', (p) => p.codesActives)).toMatchObject({
      nom: 'Codes activés',
      valeurs: [3, 5],
    });
  });
});

describe('barresDuTableau', () => {
  const ligne = (
    tableau: LigneTableau['tableau'],
    libelle: string,
    codesActives: number,
  ): LigneTableau => ({
    tableau,
    code: null,
    libelle,
    eligibles: null,
    codesActives,
    codesActivesPeriode: 0,
    tauxRecours: null,
    partEligibles: null,
    partActives: null,
  });

  it('keeps the dashboard order of categories, without the Total', () => {
    const lignes = [
      ligne('situation', 'AEEH', 5),
      ligne('situation', 'AAH', 9),
      ligne('situation', 'Total', 14),
      ligne('genre', 'Fille', 7),
    ];

    expect(barresDuTableau(lignes, 'situation')).toEqual([
      { libelle: 'AEEH', valeur: 5, eligibles: null },
      { libelle: 'AAH', valeur: 9, eligibles: null },
    ]);
  });

  it('ranks places by value, unresolved addresses last', () => {
    const lignes = [
      ligne('departement', 'Finistère', 3),
      ligne('departement', 'Non renseigné', 20),
      ligne('departement', 'Morbihan', 8),
      ligne('departement', 'Total', 31),
    ];

    expect(barresDuTableau(lignes, 'departement').map((b) => b.libelle)).toEqual([
      'Morbihan',
      'Finistère',
      'Non renseigné',
    ]);
  });
});

describe('formats', () => {
  it('writes figures the French way', () => {
    expect(formaterNombre(1234567)).toBe('1 234 567');
    expect(formaterPourcent(66.666)).toBe('66,67 %');
    expect(formaterPourcent(null)).toBe('—');
    expect(formaterJour('2026-09-01')).toBe('1 septembre 2026');
  });

  it('names weeks by their bounds', () => {
    expect(formaterIntervalle('2026-08-03', '2026-08-09')).toBe('du 3 au 9 août 2026');
    expect(formaterIntervalle('2026-07-27', '2026-08-02')).toBe('du 27 juillet au 2 août 2026');
    expect(
      abscisses(['2026-08-03'], periodes('2026-08-01', '2026-08-19', 'semaine'), 'semaine'),
    ).toEqual([{ cle: '2026-08-03', courte: '3 août', longue: 'Semaine du 3 au 9 août 2026' }]);
  });
});
