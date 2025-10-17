'use client';

import styles from './styles.module.scss';
import { Input } from '@codegouvfr/react-dsfr/Input';
import { Select } from '@codegouvfr/react-dsfr/Select';
import Button, { ButtonProps } from '@codegouvfr/react-dsfr/Button';
import {
  AEEH_CODE_OBTENTION_TYPE,
  ALLOCATION,
  getAeehCodeObtentionType,
  isEligible,
} from '@/utils/eligibility-test';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import cn from 'classnames';
import { push } from '@socialgouv/matomo-next';
import KnowMore from '@/app/components/know-more/KnowMore';
import Link from 'next/link';
import { CODES_OBTAINABLE, CODES_OBTAINABLE_FOR_CROUS } from '@/app/constants/env';
import { JeDonneMonAvisBtn } from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';
import { InputState } from '@/types/form';
import { Heading } from '@/app/components/heading/Heading';

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
    value: ALLOCATION.AEEH,
    label: `Allocation d'éducation de l'enfant handicapé (AEEH)`,
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
    label: 'Bourse ou aide annuelle CROUS',
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
  headingLevel,
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
  const [alertMeta, setAlertMeta] = useState<{ title: string; description: string } | null>(null);

  const eligibilityTestOnClick = useCallback(() => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Button clicked', 'Submission button']);
  }, []);

  const onAeehLinkClick = useCallback(() => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Clicked', 'Button to open AEEH form']);
  }, []);

  const onCodeObtentionLinkClick = useCallback(() => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Button clicked', 'Code obtention link']);
  }, []);

  const [displayEligibilityConditions, setDisplayEligibilityConditions] = useState<boolean>(false);
  const [displayAeehLink, setDisplayAeehLink] = useState<boolean>(false);
  const [displayObtainCodeButton, setDisplayObtainCodeButton] = useState<boolean>(false);
  const [inputStates, setInputStates] = useState<FormInputsState>(initialInputsState);
  const [formHasInvalidInput, setFormHasInvalidInput] = useState(false);

  function resetStates() {
    setDisplayEligibilityConditions(false);
    setDisplayAeehLink(false);
    setDisplayObtainCodeButton(false);
    setSuccess(null);
    setAlertMeta(null);
    setKnowMoreMeta(null);
  }

  useEffect(() => {
    // Boolean to apply margin to align the button "Verifier" ........
    setFormHasInvalidInput(Object.values(inputStates).some((state) => state.errorMsg));
  }, [inputStates]);

  return (
    <>
      <div
        className={cn({
          [styles['eligibility-test']]: true,
          [styles['eligibility-test--has-background']]: hasBackground,
          [styles['eligibility-test--has-border']]: hasBorder,
        })}
      >
        <Heading headingLevel={headingLevel} className="fr-h5 fr-mb-0">
          <>Testez votre éligibilité en 1 min</>
        </Heading>

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
                  description: '',
                };

                const errorInitialMeta = {
                  title: `Vous n’êtes pas éligible au pass Sport.`,
                  description: '',
                };

                if (CODES_OBTAINABLE && isBenefEligible && targetDate) {
                  switch (allocationName) {
                    case ALLOCATION.AAH:
                    case ALLOCATION.ARS:
                      setAlertMeta({
                        title: successInitialMeta.title,
                        description: successInitialMeta.description,
                      });
                      setDisplayObtainCodeButton(true);
                      break;
                    case ALLOCATION.AEEH:
                      const { displayType } = getAeehCodeObtentionType(targetDate);

                      setAlertMeta({
                        title: successInitialMeta.title,
                        description: successInitialMeta.description,
                      });

                      if (displayType === AEEH_CODE_OBTENTION_TYPE.LINK) {
                        setDisplayAeehLink(true);
                      } else if (displayType === AEEH_CODE_OBTENTION_TYPE.FORM) {
                        setDisplayObtainCodeButton(true);
                      }
                      break;
                    case ALLOCATION.CROUS:
                    case ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX:
                      if (!CODES_OBTAINABLE_FOR_CROUS) {
                        setAlertMeta({
                          title: successInitialMeta.title,
                          description: `En tant qu'étudiant boursier, vous recevrez un code par mail entre mi-octobre et fin novembre.`,
                        });
                      } else {
                        setAlertMeta({
                          title: successInitialMeta.title,
                          description: successInitialMeta.description,
                        });
                        setDisplayObtainCodeButton(true);
                      }
                      break;
                  }
                }

                if (!CODES_OBTAINABLE && isBenefEligible) {
                  switch (allocationName) {
                    case ALLOCATION.AAH:
                    case ALLOCATION.AEEH:
                    case ALLOCATION.ARS:
                      setAlertMeta({
                        title: successInitialMeta.title,
                        description: successInitialMeta.description,
                      });
                      setKnowMoreMeta({
                        title: 'A savoir',
                        description: `Le pass Sport 2025 sera progressivement disponible par mail ou SMS à partir du 1er septembre. Si vous n'avez rien reçu, revenez sur le site à partir du 1er septembre pour en bénéficier.`,
                      });
                      break;
                    case ALLOCATION.CROUS:
                    case ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX:
                      setAlertMeta({
                        title: successInitialMeta.title,
                        description: `En tant qu'étudiant boursier, vous recevrez votre code progressivement à partir du 1er novembre au lieu du 1er septembre. Nous nous excusons pour la gêne occasionnée.`,
                      });
                      setKnowMoreMeta({
                        title: 'A savoir',
                        description: `Le pass Sport 2025 sera progressivement disponible par mail ou SMS à partir du 1er novembre. Si vous n'avez rien reçu, revenez sur le site à partir du 1er novembre pour en bénéficier.`,
                      });
                      break;
                  }
                }

                if (CODES_OBTAINABLE && !isBenefEligible) {
                  setAlertMeta({
                    title: errorInitialMeta.title,
                    description: errorInitialMeta.description,
                  });

                  setDisplayEligibilityConditions(true);
                } else if (!CODES_OBTAINABLE && !isBenefEligible) {
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
          <div className="fr-fieldset" aria-describedby="eligibility-notification-message">
            <div
              className={cn(
                styles['eligibility-test__fields'],
                display === 'row'
                  ? styles['eligibility-test__fields--row']
                  : styles['eligibility-test__fields--column'],
              )}
            >
              <div
                className={cn(
                  'fr-fieldset__element align-self--baseline',
                  styles['eligibility-test__fields-date'],
                )}
              >
                <Input
                  label="Date de naissance"
                  state={inputStates.dob?.state}
                  stateRelatedMessage={inputStates.dob?.errorMsg}
                  nativeInputProps={{
                    required: true,
                    type: 'date',
                    min: '1950-01-01',
                    max: '2099-12-31',
                    onChange: (e) => {
                      setTargetDate(e.target.value);
                    },
                    onBlur: (e) => {
                      const inputIsValid = !!e.target?.checkValidity();

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

              <div className="fr-fieldset__element align-self--baseline">
                <Select
                  label="Êtes-vous bénéficiaire d'une aide ?"
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
                      const inputIsValid = !!e.target?.checkValidity();

                      setInputStates({
                        ...inputStates,
                        allowance: {
                          state: inputIsValid ? 'default' : 'error',
                          errorMsg: !inputIsValid ? `Le choix de l'aide est requise` : '',
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
              <div className="fr-fieldset__element flex--min-content">
                <Button
                  type="submit"
                  priority={buttonVariant}
                  className={cn({
                    [styles['button-margin--error']]: formHasInvalidInput,
                  })}
                >
                  Vérifier
                </Button>
              </div>
            </div>
          </div>

          <section id="eligibility-notification-message">
            {success !== null && alertMeta !== null && (
              <Alert
                severity={success ? 'success' : 'info'}
                className="fr-mt-2w"
                key={`${allocationName}-success`}
                title={alertMeta.title}
                description={alertMeta.description}
                // @ts-ignore
                // ts ignored because the lib doesn't handle role properly
                role="alert"
              />
            )}
          </section>

          {knowMoreMeta && (
            <section className="fr-mt-3w">
              <KnowMore variant="purple" knowMore={knowMoreMeta} />
            </section>
          )}

          {displayObtainCodeButton && (
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

          {displayAeehLink && (
            <>
              <p className="fr-my-3w text-align--center">
                <Link
                  className="fr-btn fr-btn--secondary"
                  href="https://www.demarches-simplifiees.fr/commencer/code-pass-sport-aeeh"
                  target="_blank"
                  title="Récupérer le pass Sport sur démarches-simplifiées - Nouvelle fenêtre"
                  onClick={() => {
                    onAeehLinkClick();
                  }}
                >
                  Récupérer mon pass Sport
                </Link>
              </p>

              <p className="text-align--center fr-mb-2w fr-text--sm">
                La demande est à effectuer sur démarches-simplifiées.
              </p>

              <p>Dans l&apos;attente du code, vous pouvez proposer cette solution à votre club :</p>

              <ul className="fr-ml-2w">
                <li>Régler l&apos;inscription avec la déduction immédiate de 70 € ;</li>
                <li>
                  Fournir un chèque de 70 € (non encaissé), restitué dès réception du code pass
                  Sport.
                </li>
              </ul>

              <p>
                Si vous n&apos;êtes finalement pas éligible, le club pourra encaisser le chèque.
                Chaque club reste libre d&apos;accepter ou non cette solution.
              </p>
            </>
          )}

          {displayEligibilityConditions && (
            <section className="fr-mt-3w">
              <p>Le dispositif est ouvert :</p>
              <ul className="fr-ml-2w">
                <li>
                  Aux jeunes de 14 à 17 ans bénéficiaires de l&apos;ARS (Allocation de Rentrée
                  Scolaire) ;
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
                  15 octobre 2025 :
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
