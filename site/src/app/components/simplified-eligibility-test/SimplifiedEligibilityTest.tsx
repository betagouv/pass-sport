'use client';

import styles from './styles.module.scss';
import { Input } from '@codegouvfr/react-dsfr/Input';
import { Select } from '@codegouvfr/react-dsfr/Select';
import Button, { ButtonProps } from '@codegouvfr/react-dsfr/Button';
import { ALLOCATION, isEligible } from '@/utils/eligibility-test';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import cn from 'classnames';
import { push } from '@socialgouv/matomo-next';
import KnowMore from '@/app/components/know-more/KnowMore';
import Link from 'next/link';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import { InputState } from '@/types/form';
import { useEligibilityTestStorage } from '@/app/hooks/use-eligibility-test-storage';
import { CODES_OBTAINABLE } from '@/app/constants/env';

type SimplifiedEligibilityTestProps = {
  display?: 'column' | 'row';
  buttonVariant?: ButtonProps['priority'];
  onCompletion?: (success: boolean) => void;
  headingLevel: 'h1' | 'h2' | 'h3';
  jeDonneMonAvisBtnPadding: boolean;
  displaySeparator: boolean;
  hasBackground?: boolean;
  hasBorder?: boolean;
};

type FormInputsState = {
  dob: InputState;
  allowance: InputState;
};

const initialInputsState: Record<keyof FormInputsState, InputState> = {
  dob: { state: 'default' },
  allowance: { state: 'default' },
};

const defaultOptions = [
  {
    value: '',
    label: 'Sélectionner une option',
  },
  {
    value: ALLOCATION.NONE,
    label: 'Aucune',
  },
  {
    value: ALLOCATION.QF,
    label: 'Quotient familial (CAF ou MSA) du foyer allocataire inférieur ou égal à 699€',
  },
  {
    value: ALLOCATION.AEEH,
    label: `Allocation d'éducation de l'enfant handicapé (AEEH)`,
  },
  {
    value: ALLOCATION.AAH,
    label: 'Allocation aux adultes handicapés (AAH)',
  },

  {
    value: ALLOCATION.CROUS,
    label: 'Bourse ou aide annuelle du CROUS',
  },
  {
    value: ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX,
    label: 'Bourse régionale formations sanitaires et sociales',
  },
];

export default function SimplifiedEligibilityTest({
  display = 'row',
  buttonVariant = 'primary',
  onCompletion,
  jeDonneMonAvisBtnPadding,
  displaySeparator,
  hasBackground = false,
  hasBorder = false,
}: SimplifiedEligibilityTestProps) {
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [allocationName, setAllocationName] = useState<ALLOCATION | null>(null);
  const [knowMoreMeta, setKnowMoreMeta] = useState<{ title: string; description: string } | null>(
    null,
  );
  const [alertMeta, setAlertMeta] = useState<{
    title: string;
    description: string | React.ReactNode;
  } | null>(null);

  const eligibilityTestOnClick = useCallback(() => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Button clicked', 'Submission button']);
  }, []);

  const onCodeObtentionLinkClick = useCallback(() => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Button clicked', 'Code obtention link']);
  }, []);

  const [inputStates, setInputStates] = useState<FormInputsState>(initialInputsState);
  const { save } = useEligibilityTestStorage();

  useEffect(() => {
    // Skip the mount pass, otherwise a previously stored entry gets wiped before any user input
    if (targetDate === null && allocationName === null) {
      return;
    }

    save({
      dob: targetDate,
      situation: allocationName,
    });
  }, [targetDate, allocationName, save]);

  function resetStates() {
    setSuccess(null);
    setAlertMeta(null);
    setKnowMoreMeta(null);
  }

  return (
    <>
      <div
        className={cn({
          [styles['eligibility-test']]: true,
          [styles['eligibility-test--has-background']]: hasBackground,
          [styles['eligibility-test--has-border']]: hasBorder,
        })}
      >
        <p className="fr-h5 fr-mb-0">
          <>Vérifier votre éligibilité ou celle de l&apos;un de vos enfants</>
        </p>

        <form
          onSubmit={(e) => {
            // Prevent submission for required fields to work as intended
            e.preventDefault();
            resetStates();

            const isFormValid = Object.values(inputStates).some((state) => !state.errorMsg);

            if (isFormValid) {
              if (targetDate && allocationName) {
                const isBenefEligible = isEligible({ targetDate, allocationName });
                const successInitialMeta = {
                  title: `Bonne nouvelle, vous êtes éligible au pass Sport.`,
                  description: (
                    <>
                      Les codes pass Sport seront envoyés aux bénéficiaires entre le XX et le XX
                      septembre 2026. À partir du 4 septembre, si vous n’avez pas reçu votre code
                      pass Sport, vous pourrez le récupérer directement sur{' '}
                      <Link href="https://pass.sports.gouv.fr" target="_blank">
                        https://pass.sports.gouv.fr
                      </Link>
                      , sous réserve de remplir les conditions d’éligibilité.
                    </>
                  ),
                };

                const errorInitialMeta = {
                  title: `Vous n’êtes pas éligible au pass Sport.`,
                  description: '',
                };

                if (isBenefEligible && targetDate) {
                  switch (allocationName) {
                    case ALLOCATION.AAH:
                    case ALLOCATION.AEEH:
                    case ALLOCATION.QF:
                      setAlertMeta({
                        title: successInitialMeta.title,
                        description: successInitialMeta.description,
                      });
                      break;
                    case ALLOCATION.CROUS:
                    case ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX:
                      setAlertMeta({
                        title: successInitialMeta.title,
                        description: (
                          <>
                            Les codes pass Sport seront envoyés aux bénéficiaires entre le XX et le
                            XX septembre 2026. À partir du 4 septembre, si vous n&apos;avez pas reçu
                            votre code pass Sport, vous pourrez le récupérer directement sur{' '}
                            <Link href="https://pass.sports.gouv.fr" target="_blank">
                              https://pass.sports.gouv.fr
                            </Link>
                            , sous réserve de remplir les conditions d&apos;éligibilité.
                          </>
                        ),
                      });

                      break;
                  }
                }

                if (!isBenefEligible) {
                  setAlertMeta({
                    title: errorInitialMeta.title,
                    description: errorInitialMeta.description,
                  });
                }

                eligibilityTestOnClick();
                setSuccess(isBenefEligible);
                onCompletion?.(isBenefEligible);
              }
            } else {
              setSuccess(false);
            }
          }}
        >
          <div className="fr-fieldset fr-m-0" aria-describedby="eligibility-notification-message">
            <div
              className={cn(
                styles['eligibility-test__fields'],
                display === 'row'
                  ? styles['eligibility-test__fields--row']
                  : styles['eligibility-test__fields--column'],
              )}
            >
              <div className={cn('fr-fieldset__element', styles['eligibility-test__field'])}>
                <Input
                  label="Date de naissance de la personne éligible"
                  state={inputStates.dob?.state}
                  stateRelatedMessage={inputStates.dob?.errorMsg}
                  hintText="Exemple : 31/12/2015."
                  nativeInputProps={{
                    required: true,
                    type: 'date',
                    min: '1950-01-01',
                    max: '2099-12-31',
                    onChange: (e) => {
                      setTargetDate(e.target.value);
                    },
                    onBlur: (e) => {
                      const inputIsValid = e.target?.checkValidity();

                      setInputStates({
                        ...inputStates,
                        dob: {
                          state: inputIsValid ? 'default' : 'error',
                          errorMsg: !inputIsValid ? 'La date de naissance est invalide' : '',
                        },
                      });

                      setTargetDate(e.target.value);
                    },
                  }}
                />
              </div>

              <div className={cn('fr-fieldset__element', styles['eligibility-test__field'])}>
                <Select
                  label="Dans quelle situation êtes vous ?"
                  state={inputStates.allowance.state}
                  stateRelatedMessage={inputStates.allowance?.errorMsg}
                  nativeSelectProps={{
                    name: 'my-select',
                    required: true,
                    defaultValue: '',
                    onChange: (e) => {
                      setAllocationName(e.target.value as ALLOCATION);
                    },
                    onBlur: (e) => {
                      const inputIsValid = e.target?.checkValidity();
                      setInputStates({
                        ...inputStates,
                        allowance: {
                          state: inputIsValid ? 'default' : 'error',
                          errorMsg: !inputIsValid ? `Le choix de la situation est requise` : '',
                        },
                      });

                      setAllocationName(e.target.value as ALLOCATION);
                    },
                  }}
                >
                  {defaultOptions.map((option) => {
                    return option.value !== '' ? (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ) : (
                      <option key="placeholder" value="" disabled hidden>
                        Sélectionner une option
                      </option>
                    );
                  })}
                </Select>
              </div>

              <div
                className={cn('fr-fieldset__element', styles['eligibility-test__confirm-button'])}
              >
                <Button type="submit" priority={buttonVariant}>
                  Je vérifie
                </Button>
              </div>
            </div>
          </div>

          <div aria-live="polite" aria-atomic="true" id="eligibility-notification-message">
            {success !== null && alertMeta !== null && alertMeta.description !== null && (
              <Alert
                severity={success ? 'success' : 'info'}
                className="fr-mt-2w"
                key={`${allocationName}-success`}
                title={alertMeta.title}
                description={alertMeta.description}
              />
            )}
          </div>

          {knowMoreMeta && (
            <section className="fr-mt-3w">
              <KnowMore variant="purple" knowMore={knowMoreMeta} />
            </section>
          )}

          {CODES_OBTAINABLE && alertMeta !== null && success && (
            <p className="fr-mb-0 fr-mt-3w text-align--center">
              <Link
                href="/v2/test-eligibilite"
                className="fr-btn fr-btn--secondary"
                onClick={onCodeObtentionLinkClick}
              >
                Demander mon pass Sport
              </Link>
            </p>
          )}

          {!success && CODES_OBTAINABLE && alertMeta !== null && (
            <section className="fr-mt-3w">
              <p>Le dispositif est ouvert :</p>
              <ul className="fr-ml-2w">
                <li>
                  Aux jeunes de 6 à 17 ans révolus faisant partie d&apos;un foyer dont le quotient
                  familial est inférieur ou égal à 699 € ;
                </li>
                <li>
                  Aux jeunes en situation de handicap :
                  <ul className="fr-ml-2w">
                    <li>
                      De 6 à 19 ans bénéficiaires de l&apos;AEEH (Allocation d&apos;Education de
                      l&apos;Enfant Handicapé) ;
                    </li>
                    <li>
                      De 16 à 30 ans bénéficiaires de l&apos;AAH (Allocation aux Adultes
                      Handicapés).
                    </li>
                  </ul>
                </li>
                <li>
                  Aux jeunes de moins de 28 ans bénéficiaires d&apos;une bourse attribuée avant le
                  15 octobre 2026 :
                  <ul className="fr-ml-2w">
                    <li>Bourse du CROUS (y compris l&apos;aide annuelle) ;</li>
                    <li>Bourse régionale pour une formation sanitaire et sociale.</li>
                  </ul>
                </li>
              </ul>
            </section>
          )}
        </form>
      </div>
      {success !== null && (
        <section
          className={cn({
            [styles['je-donne-mon-avis-section']]: true,
            [styles['je-donne-mon-avis-section--padding']]: jeDonneMonAvisBtnPadding,
          })}
        >
          {displaySeparator && <hr className="fr-mb-2w" />}

          <JeDonneMonAvisBtn isSuccess={success} />
        </section>
      )}
    </>
  );
}
