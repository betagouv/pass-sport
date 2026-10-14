// Server-rendered SVG charts: no client JavaScript, so they render under the nonce CSP and
// without JS.
//
// RGAA: each SVG is an image (role="img") whose short alternative ends by pointing to the table
// right after it, which holds every value (1.6, detailed description); series differ by line
// pattern as well as colour (3.1), in colours of at least 3:1 against white (3.3); a chart with
// a visible caption is a figure labelled by that caption (1.9).

import { graduations, indexEchelonnes, type Abscisse, type Barre, type Serie } from '../model';
import styles from './graphiques.module.scss';

// Drawn at 1:1 up to this width, so that text keeps its CSS size.
const LARGEUR = 960;
const HAUTEUR = 320;
const MARGE = { haut: 16, droite: 180, bas: 32, gauche: 72 };
const PLOT_W = LARGEUR - MARGE.gauche - MARGE.droite;
const PLOT_H = HAUTEUR - MARGE.haut - MARGE.bas;
const ECART_ETIQUETTES = 18;
const RENVOI_TABLEAU = 'Toutes les valeurs figurent dans le tableau qui suit le graphique.';

type Echelles = { x: (i: number) => number; y: (v: number) => number; ticks: number[] };

const echelles = (longueur: number, max: number, entier: boolean): Echelles => {
  const ticks = graduations(max, { entier });
  const haut = ticks[ticks.length - 1];
  const pas = longueur > 1 ? PLOT_W / (longueur - 1) : 0;
  return {
    x: (i) => MARGE.gauche + (longueur > 1 ? i * pas : PLOT_W / 2),
    y: (v) => MARGE.haut + PLOT_H - (v / haut) * PLOT_H,
    ticks,
  };
};

const Axes = ({
  abscisses,
  echelle,
  format,
  centre,
}: {
  abscisses: Abscisse[];
  echelle: Echelles;
  format: (v: number) => string;
  centre: (i: number) => number;
}) => (
  <g>
    {echelle.ticks.map((t) => (
      <g key={t}>
        <line
          className={t === 0 ? styles.base : styles.grille}
          x1={MARGE.gauche}
          x2={MARGE.gauche + PLOT_W}
          y1={echelle.y(t)}
          y2={echelle.y(t)}
        />
        <text
          className={styles.graduation}
          x={MARGE.gauche - 8}
          y={echelle.y(t) + 4}
          textAnchor="end"
        >
          {format(t)}
        </text>
      </g>
    ))}
    {indexEchelonnes(abscisses.length).map((i, n, tous) => (
      <text
        key={i}
        className={styles.graduation}
        x={centre(i)}
        y={HAUTEUR - 8}
        textAnchor={
          tous.length > 1 && n === 0 ? 'start' : n === tous.length - 1 && n > 0 ? 'end' : 'middle'
        }
      >
        {abscisses[i].courte}
      </text>
    ))}
  </g>
);

const trace = (valeurs: (number | null)[], echelle: Echelles): string =>
  valeurs
    .map((v, i) => (v === null ? null : `${echelle.x(i).toFixed(1)},${echelle.y(v).toFixed(1)}`))
    .reduce<string[]>((segments, point, i, tous) => {
      if (point !== null) {
        segments.push(`${i === 0 || tous[i - 1] === null ? 'M' : 'L'}${point}`);
      }
      return segments;
    }, [])
    .join(' ');

const dernierPoint = (valeurs: (number | null)[]) => {
  for (let i = valeurs.length - 1; i >= 0; i--) {
    const valeur = valeurs[i];
    if (valeur !== null) {
      return { i, valeur };
    }
  }
  return null;
};

// End labels are pushed apart so they never overlap, a leader line keeping each on its line.
const etiquettesSansChevauchement = <T extends { y: number }>(
  etiquettes: T[],
): (T & { yEtiquette: number })[] => {
  const triees = [...etiquettes].sort((a, b) => a.y - b.y).map((e) => ({ ...e, yEtiquette: e.y }));
  triees.forEach((e, n) => {
    if (n > 0) {
      e.yEtiquette = Math.max(e.yEtiquette, triees[n - 1].yEtiquette + ECART_ETIQUETTES);
    }
  });
  const depassement = (triees.at(-1)?.yEtiquette ?? 0) - (MARGE.haut + PLOT_H);
  if (depassement > 0) {
    triees.forEach((e) => (e.yEtiquette -= depassement));
  }
  return triees;
};

// Visual key only: the table after the chart names every series for assistive technologies.
const Legende = ({ series }: { series: Serie[] }) => (
  <ul className={styles.legende} aria-hidden="true">
    {series.map((s) => (
      <li key={s.nom}>
        <svg width="32" height="8" focusable="false">
          <line
            x1="1"
            x2="31"
            y1="4"
            y2="4"
            stroke={s.couleur}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={s.trait || undefined}
          />
        </svg>
        {s.nom}
      </li>
    ))}
  </ul>
);

type PropsCourbes = {
  id: string;
  resume: string;
  abscisses: Abscisse[];
  series: Serie[];
  format: (v: number) => string;
  formatAxe?: (v: number) => string;
  entier?: boolean;
  aire?: boolean;
};

export const Courbes = ({
  id,
  resume,
  abscisses,
  series,
  format,
  formatAxe = format,
  entier = false,
  aire = false,
}: PropsCourbes) => {
  const max = Math.max(
    0,
    ...series.flatMap((s) => s.valeurs.filter((v): v is number => v !== null)),
  );
  const echelle = echelles(abscisses.length, max, entier);
  const ordre = [...series].sort((a, b) => Number(!!b.contexte) - Number(!!a.contexte));
  const plusieurs = series.length > 1;

  const etiquettes = etiquettesSansChevauchement(
    series.flatMap((s) => {
      const fin = dernierPoint(s.valeurs);
      return fin ? [{ serie: s, ...fin, y: echelle.y(fin.valeur) }] : [];
    }),
  );
  const demiPas = abscisses.length > 1 ? PLOT_W / (abscisses.length - 1) / 2 : PLOT_W / 2;

  return (
    <figure className={styles.figure}>
      {plusieurs && <Legende series={series} />}
      <div className={styles.defilement}>
        <svg
          className={styles.graphique}
          viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
          role="img"
          aria-labelledby={`${id}-resume`}
        >
          <title id={`${id}-resume`}>{`${resume} ${RENVOI_TABLEAU}`}</title>
          <Axes abscisses={abscisses} echelle={echelle} format={formatAxe} centre={echelle.x} />
          {aire && !plusieurs && series[0] && (
            <path
              d={`${trace(series[0].valeurs, echelle)} L${echelle.x(abscisses.length - 1)},${echelle.y(0)} L${echelle.x(0)},${echelle.y(0)} Z`}
              fill={series[0].couleur}
              opacity={0.1}
            />
          )}
          {ordre.map((s) => (
            <path
              key={s.nom}
              d={trace(s.valeurs, echelle)}
              fill="none"
              stroke={s.couleur}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={s.trait || undefined}
            />
          ))}
          {etiquettes.map((e) => (
            <g key={e.serie.nom}>
              <circle
                className={styles.point}
                cx={echelle.x(e.i)}
                cy={e.y}
                r="4"
                fill={e.serie.couleur}
              />
              {Math.abs(e.yEtiquette - e.y) > 2 && (
                <line
                  className={styles.renvoi}
                  x1={echelle.x(e.i) + 6}
                  x2={MARGE.gauche + PLOT_W + 12}
                  y1={e.y}
                  y2={e.yEtiquette}
                />
              )}
              <text
                className={styles.etiquette}
                x={MARGE.gauche + PLOT_W + 18}
                y={e.yEtiquette + 4}
              >
                {plusieurs && <tspan className={styles.etiquetteNom}>{e.serie.nom} </tspan>}
                <tspan>{format(e.valeur)}</tspan>
              </text>
            </g>
          ))}
          {abscisses.map((a, i) => (
            <rect
              key={a.cle}
              className={styles.survol}
              x={echelle.x(i) - demiPas}
              y={MARGE.haut}
              width={demiPas * 2}
              height={PLOT_H}
            >
              <title>
                {[
                  a.longue,
                  ...series.map(
                    (s) =>
                      `${s.nom} : ${s.valeurs[i] === null ? '—' : format(s.valeurs[i] as number)}`,
                  ),
                ].join('\n')}
              </title>
            </rect>
          ))}
        </svg>
      </div>
    </figure>
  );
};

type PropsColonnes = {
  id: string;
  resume: string;
  abscisses: Abscisse[];
  valeurs: number[];
  couleur: string;
  format: (v: number) => string;
};

export const Colonnes = ({ id, resume, abscisses, valeurs, couleur, format }: PropsColonnes) => {
  const max = Math.max(0, ...valeurs);
  const ticks = graduations(max, { entier: true });
  const haut = ticks[ticks.length - 1];
  const bande = PLOT_W / Math.max(1, abscisses.length);
  // Capped at 24px, and always leaving at least a 2px gap between neighbours.
  const largeur = Math.max(1, Math.min(24, bande - 2));
  const rayon = Math.min(4, largeur / 2);
  const centre = (i: number) => MARGE.gauche + bande * (i + 0.5);
  const y = (v: number) => MARGE.haut + PLOT_H - (v / haut) * PLOT_H;
  const echelle: Echelles = { x: centre, y, ticks };
  const iMax = valeurs.indexOf(max);

  return (
    <figure className={styles.figure}>
      <div className={styles.defilement}>
        <svg
          className={styles.graphique}
          viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
          role="img"
          aria-labelledby={`${id}-resume`}
        >
          <title id={`${id}-resume`}>{`${resume} ${RENVOI_TABLEAU}`}</title>
          <Axes abscisses={abscisses} echelle={echelle} format={format} centre={centre} />
          {valeurs.map((v, i) => {
            const x = centre(i) - largeur / 2;
            const hauteur = y(0) - y(v);
            const r = Math.min(rayon, hauteur);
            // Rounded data end, square at the baseline.
            const d =
              v > 0
                ? `M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + largeur - r} Q${x + largeur},${y(v)} ${x + largeur},${y(v) + r} V${y(0)} Z`
                : '';
            return (
              <g key={abscisses[i].cle} className={styles.colonne}>
                {d && <path d={d} fill={couleur} />}
                <rect
                  x={centre(i) - bande / 2}
                  y={MARGE.haut}
                  width={bande}
                  height={PLOT_H}
                  fill="transparent"
                >
                  <title>{`${abscisses[i].longue} : ${format(v)}`}</title>
                </rect>
              </g>
            );
          })}
          {max > 0 && (
            <text
              className={styles.etiquette}
              x={Math.min(centre(iMax), MARGE.gauche + PLOT_W)}
              y={y(max) - 6}
              textAnchor="middle"
            >
              {format(max)}
            </text>
          )}
        </svg>
      </div>
    </figure>
  );
};

const BARRE = { epaisseur: 16, pas: 26, valeurs: 150 };
// Roughly the width of an upper-case character at the chart's 13px, so no label gets clipped.
const LARGEUR_CARACTERE = 8;

// A horizontal bar with a rounded data end, square at the baseline.
const barre = (x0: number, y: number, longueur: number, epaisseur: number): string => {
  const r = Math.min(4, epaisseur / 2, longueur);
  const x = x0 + longueur;
  return `M${x0},${y} H${x - r} Q${x},${y} ${x},${y + r} V${y + epaisseur - r} Q${x},${y + epaisseur} ${x - r},${y + epaisseur} H${x0} Z`;
};

type PropsBarres = {
  id: string;
  titre: string;
  resume: string;
  barres: Barre[];
  couleur: string;
  format: (v: number) => string;
};

// One gauge per modality: the outlined track is the eligible public, the filled bar inside it
// the activated codes. Outline versus fill tells the two apart without colour (RGAA 3.1), and
// both carry the bar's colour, at least 3:1 against white (RGAA 3.3). Long place names stay
// readable horizontally, and each gauge is labelled, so no value axis is needed.
export const Barres = ({ id, titre, resume, barres, couleur, format }: PropsBarres) => {
  const max = Math.max(0, ...barres.map((b) => Math.max(b.valeur, b.eligibles ?? 0)));
  const hauteur = MARGE.haut + barres.length * BARRE.pas + 8;
  const plusLong = Math.max(0, ...barres.map((b) => b.libelle.length));
  const x0 = Math.min(440, Math.max(120, plusLong * LARGEUR_CARACTERE + 16));
  const longueurMax = LARGEUR - x0 - BARRE.valeurs;
  const longueur = (v: number) => (max > 0 ? (v / max) * longueurMax : 0);
  const e = BARRE.epaisseur;
  // Federations have no eligibles: plain bars then, with no key to explain the gauge.
  const avecEligibles = barres.some((b) => b.eligibles !== null);

  return (
    <figure className={styles.figure} role="figure" aria-label={titre}>
      <figcaption className={styles.titreFigure}>{titre}</figcaption>
      {avecEligibles && (
        <ul className={styles.legende} aria-hidden="true">
          <li>
            <svg width="24" height="12" focusable="false">
              <rect x="0.5" y="0.5" width="23" height="11" rx="2" fill="white" stroke={couleur} />
            </svg>
            Public éligible
          </li>
          <li>
            <svg width="24" height="12" focusable="false">
              <rect x="0" y="0" width="24" height="12" rx="2" fill={couleur} />
            </svg>
            Codes activés
          </li>
        </ul>
      )}
      <div className={styles.defilement}>
        <svg
          className={styles.graphique}
          viewBox={`0 0 ${LARGEUR} ${hauteur}`}
          role="img"
          aria-labelledby={`${id}-resume`}
        >
          <title id={`${id}-resume`}>{`${resume} ${RENVOI_TABLEAU}`}</title>
          <line
            className={styles.base}
            x1={x0}
            x2={x0}
            y1={MARGE.haut - 4}
            y2={MARGE.haut + barres.length * BARRE.pas + 4}
          />
          {barres.map((b, i) => {
            const y = MARGE.haut + i * BARRE.pas + (BARRE.pas - e) / 2;
            const lActives = longueur(b.valeur);
            const lEligibles = b.eligibles === null ? 0 : longueur(b.eligibles);
            const fin = Math.max(lActives, lEligibles);
            return (
              <g key={b.libelle} className={styles.barre}>
                <text className={styles.libelleBarre} x={x0 - 8} y={y + e / 2 + 4} textAnchor="end">
                  {b.libelle}
                </text>
                {lEligibles > 0 && (
                  <path
                    d={barre(x0, y + 0.5, lEligibles - 0.5, e - 1)}
                    fill="white"
                    stroke={couleur}
                    strokeWidth="1"
                  />
                )}
                {lActives > 0 && <path d={barre(x0, y, lActives, e)} fill={couleur} />}
                <text className={styles.etiquette} x={x0 + fin + 6} y={y + e / 2 + 4}>
                  {format(b.valeur)}
                  {b.eligibles !== null && (
                    <tspan className={styles.etiquetteNom}> / {format(b.eligibles)}</tspan>
                  )}
                </text>
                <rect
                  x={0}
                  y={MARGE.haut + i * BARRE.pas}
                  width={LARGEUR}
                  height={BARRE.pas}
                  fill="transparent"
                >
                  <title>
                    {b.eligibles === null
                      ? `${b.libelle} : ${format(b.valeur)} codes activés`
                      : `${b.libelle} : ${format(b.valeur)} codes activés sur ${format(b.eligibles)} éligibles`}
                  </title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
    </figure>
  );
};

type PropsDonnees = {
  titre: string;
  enTete: string;
  abscisses: Abscisse[];
  series: Serie[];
  format: (v: number | null) => string;
};

// The table view of a chart: every value, readable without the picture.
export const DonneesGraphique = ({ titre, enTete, abscisses, series, format }: PropsDonnees) => (
  <details className={styles.donnees}>
    <summary>Voir les données du graphique « {titre} »</summary>
    <div className="fr-table fr-table--sm fr-table--no-caption">
      <div className="fr-table__wrapper">
        <div className="fr-table__container">
          <div className="fr-table__content">
            <table>
              <caption>{titre}</caption>
              <thead>
                <tr>
                  <th scope="col">{enTete}</th>
                  {series.map((s) => (
                    <th key={s.nom} scope="col">
                      {s.nom}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abscisses.map((a, i) => (
                  <tr key={a.cle}>
                    <th scope="row">{a.longue}</th>
                    {series.map((s) => (
                      <td key={s.nom} className={styles.nombre}>
                        {format(s.valeurs[i])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </details>
);
