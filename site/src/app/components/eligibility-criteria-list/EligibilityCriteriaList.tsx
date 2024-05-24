import rootStyles from '@/app/utilities.module.scss';
import cn from 'classnames';

const EligibilityCriteriaList = () => {
  return (
    <ul className="fr-ml-2w">
      <li
        className={cn(
          'fr-mb-3w',
          'fr-text--lg',
          rootStyles['text--black'],
          rootStyles['text--medium'],
        )}
      >
        personnes nées entre le 16 septembre 2006 et le 31 décembre 2018 bénéficiant de
        l&apos;allocation de rentrée scolaire (ARS) (6 à 17 ans révolus)
      </li>
      <li
        className={cn(
          'fr-mb-3w',
          'fr-text--lg',
          rootStyles['text--black'],
          rootStyles['text--medium'],
        )}
      >
        personnes nées entre le 1er juin 2004 et le 31 décembre 2018 bénéficiant de
        l&apos;allocation d&apos;éducation de l&apos;enfant handicapé (AEEH) (6 à 19 ans révolus)
      </li>
      <li
        className={cn(
          'fr-mb-3w',
          'fr-text--lg',
          rootStyles['text--black'],
          rootStyles['text--medium'],
        )}
      >
        personnes nées entre le 16 septembre 1993 et le 31 décembre 2008 bénéficiant de
        l&apos;allocation aux adultes handicapés (AAH) (16 à 30 ans)
      </li>
      <li className={cn('fr-text--lg', rootStyles['text--black'], rootStyles['text--medium'])}>
        étudiants, âgés de 28 ans révolus au plus, et bénéficient au plus tard le 15 octobre 2024,
        d&apos;une bourse de l&apos;état de l&apos;enseignement supérieur sous conditions de
        ressources, d&apos;une aide annuelle du CROUS ou d&apos;une bourse régionale pour les
        formations sanitaires et sociales pour l&apos;année universitaire 2024 - 2025.
      </li>
      <br />
    </ul>
  );
};

export default EligibilityCriteriaList;
