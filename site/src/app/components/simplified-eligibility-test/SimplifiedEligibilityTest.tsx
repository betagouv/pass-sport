import styles from './styles.module.scss';
import { Input } from '@codegouvfr/react-dsfr/Input';
import { Select } from '@codegouvfr/react-dsfr/SelectNext';
import Button from '@codegouvfr/react-dsfr/Button';

export default function SimplifiedEligibilityTest() {
  return (
    <div className={styles['eligibility-test']}>
      <h1 className="fr-h2">Vérifier mon éligibilité en 2 min</h1>
      <p className="fr-text--sm">
        Vérifiez votre éligibilité ou celle votre enfant. Ces informations ne sont pas conservées.
      </p>

      <div className={styles['eligibility-test__fields']}>
        <Input
          label="Date de naissance"
          nativeInputProps={{
            type: 'date',
          }}
        />

        <Select
          label="Êtes-vous bénéficiaire d’une aide ?"
          nativeSelectProps={{
            name: 'my-select',
          }}
          options={[
            {
              value: 'ars',
              label: 'Allocation de rentrée scolaire (ARS)',
            },
            {
              value: 'aah',
              label: 'Allocation aux adultes handicapés (AAH)',
            },
            {
              value: 'aeeh',
              label: `L'allocation d’éducation de l’enfant handicapé (AEEH)`,
            },
            {
              value: 'crous',
              label: 'CROUS',
            },
            {
              value: 'formations-sanitaires-et-sociales',
              label: 'Formations sanitaires et sociales',
            },
          ]}
          placeholder="Sélectionner une option"
        />

        <Button>Vérifier</Button>
      </div>
    </div>
  );
}
