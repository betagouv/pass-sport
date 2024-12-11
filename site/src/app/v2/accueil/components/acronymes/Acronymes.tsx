export const AAH = () => <abbr title="Allocation Adulte Handicapé">AAH</abbr>;
export const AEEH = () => <abbr title="allocation d'Education de l'Enfant Handicapé">AEEH</abbr>;
export const ARS = () => <abbr title="Allocation de Rentrée Scolaire">ARS</abbr>;
export const CAF = () => <abbr title="Caisse d'Allocations Familiales">CAF</abbr>;
export const CROUS = ({ includeSanitairesEtSociaux = false }) => (
  <>
    <span>
      <abbr title="Centre Régional des Oeuvres Universitaires et Scolaires">CROUS </abbr>
      {includeSanitairesEtSociaux &&
        'ou bourse régionale pour les formations sanitaires et sociales'}
    </span>
  </>
);
export const MSA = () => <abbr title="Mutualité Sociale Agricole">MSA</abbr>;
