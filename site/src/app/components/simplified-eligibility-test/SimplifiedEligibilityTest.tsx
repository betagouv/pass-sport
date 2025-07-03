'use client';

import styles from './styles.module.scss';
import { Input } from '@codegouvfr/react-dsfr/Input';
import { Select } from '@codegouvfr/react-dsfr/SelectNext';
import Button from '@codegouvfr/react-dsfr/Button';
import { ALLOCATION, isEligible } from '@/utils/eligibility-test';
import { useState } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import cn from 'classnames';
import { push } from '@socialgouv/matomo-next';

export default function SimplifiedEligibilityTest() {
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [allocationName, setAllocationName] = useState<ALLOCATION | null>(null);
  const eligibilityTestOnClick = () => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Button clicked']);
  };

  return (
    <div className={styles['eligibility-test']}>
      <h1 className="fr-h2">Vérifier mon éligibilité en 2 min</h1>

      <form
        onSubmit={(e) => {
          // Prevent submission for required fields to work as intended
          e.preventDefault();
        }}
      >
        <fieldset
          className="fr-fieldset"
          aria-describedby="eligibility-notification eligibility-notification-message"
        >
          <legend
            className="fr-fieldset__legend--regular fr-fieldset__legend"
            id="eligibility-notification"
          >
            Vérifiez votre éligibilité ou celle votre enfant. Ces informations ne sont pas
            conservées.
          </legend>

          <div className={styles['eligibility-test__fields']}>
            <div className={cn('fr-fieldset__element', styles['eligibility-test__fields-date'])}>
              <Input
                label="Date de naissance"
                stateRelatedMessage="Veuillez sélectionnez votre date de naissance"
                nativeInputProps={{
                  required: true,
                  type: 'date',
                  onChange: (e) => {
                    setTargetDate(e.target.value);
                    setSuccess(null);
                  },
                }}
              />
            </div>

            <div className="fr-fieldset__element">
              <Select
                label="Êtes-vous bénéficiaire d’une aide ?"
                nativeSelectProps={{
                  name: 'my-select',
                  required: true,
                  onChange: (e) => {
                    setAllocationName(e.target.value);
                    setSuccess(null);
                  },
                }}
                options={[
                  {
                    value: ALLOCATION.NONE,
                    label: 'Aucune',
                  },
                  {
                    value: ALLOCATION.AEEH,
                    label: `L'allocation d’éducation de l’enfant handicapé (AEEH)`,
                  },
                  {
                    value: ALLOCATION.ARS,
                    label: 'Allocation de rentrée scolaire (ARS)',
                  },
                  {
                    value: ALLOCATION.AAH,
                    label: 'Allocation aux adultes handicapés (AAH)',
                  },

                  {
                    value: ALLOCATION.CROUS,
                    label: 'CROUS',
                  },
                  {
                    value: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
                    label: 'Formations sanitaires et sociales',
                  },
                ]}
                placeholder="Sélectionner une option"
              />
            </div>

            <Button
              type="submit"
              onClick={() => {
                if (targetDate && allocationName) {
                  setSuccess(isEligible({ targetDate, allocationName }));
                  eligibilityTestOnClick();
                }
              }}
            >
              Vérifier
            </Button>
          </div>

          <div className="fr-messages-group" id="eligibility-notification-message" role="alert">
            {success !== null && (
              <Alert
                severity={success ? 'success' : 'error'}
                className="fr-mt-2w"
                key={`${allocationName}-success`}
                title={
                  success
                    ? 'Bonne nouvelle, d’après les informations que vous nous avez fournies, vous êtes éligible au pass Sport.'
                    : 'Nous sommes désolés, d’après les informations que vous nous avez fournies, vous n’êtes pas éligible au pass Sport'
                }
                description={
                  success
                    ? "Disponible du 1er septembre au 31 décembre 2025, ce dispositif vous permet de bénéficier d'une réduction de 70 € sur votre inscription dans l’un des 85 000 clubs, associations sportives ou salles de sport partenaires."
                    : ''
                }
              />
            )}
          </div>
        </fieldset>
      </form>
    </div>
  );
}
