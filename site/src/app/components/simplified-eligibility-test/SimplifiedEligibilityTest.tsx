'use client';

import styles from './styles.module.scss';
import { Input } from '@codegouvfr/react-dsfr/Input';
import { Select } from '@codegouvfr/react-dsfr/SelectNext';
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
import { AAH, AEEH, ARS } from '@/app/v2/accueil/components/acronymes/Acronymes';

type SimplifiedEligibilityTestProps = {
  display?: 'column' | 'row';
  buttonVariant?: ButtonProps['priority'];
  onCompletion?: (success: boolean) => void;
  headingLevel: 'h1' | 'h2';
  jeDonneMonAvisBtnPadding: boolean;
  displaySeparator: boolean;
};

export default function SimplifiedEligibilityTest({
  display = 'row',
  buttonVariant = 'primary',
  onCompletion,
  headingLevel,
  jeDonneMonAvisBtnPadding,
  displaySeparator,
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

  function resetStates() {
    setDisplayEligibilityConditions(false);
    setDisplayAeehLink(false);
    setDisplayObtainCodeButton(false);
    setSuccess(null);
    setAlertMeta(null);
    setKnowMoreMeta(null);
  }

  useEffect(() => {
    if (!allocationName) return;

    const successInitialMeta = {
      title: `Bonne nouvelle, d'après les informations que vous nous avez fournies, vous êtes éligible au pass Sport.`,
      description:
        "Disponible à partir du 1er septembre et jusqu'au 31 décembre 2025, ce dispositif vous permet de bénéficier d'une réduction immédiate de 70 € sur votre inscription dans l'un des 85 000 clubs, associations sportives ou salles de sport partenaires.",
    };

    const errorInitialMeta = {
      title: `Nous sommes désolés, d'après les informations que vous nous avez fournies, vous n'êtes pas éligible au pass Sport.`,
      description: '',
    };

    if (CODES_OBTAINABLE && success === true && targetDate) {
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
              description: `En tant qu'étudiant boursier, vous recevrez votre code progressivement à partir du 1er novembre au lieu du 1er septembre. Nous nous excusons pour la gêne occasionnée.`,
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

    if (CODES_OBTAINABLE && success === false) {
      setAlertMeta({
        title: errorInitialMeta.title,
        description: errorInitialMeta.description,
      });

      setDisplayEligibilityConditions(true);
    }

    if (!CODES_OBTAINABLE && success === true) {
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

    if (!CODES_OBTAINABLE && success === false) {
      setAlertMeta({
        title: errorInitialMeta.title,
        description: errorInitialMeta.description,
      });
    }
  }, [success, allocationName, targetDate]);

  return (
    <>
      <div className={styles['eligibility-test']}>
        {headingLevel === 'h1' && (
          <h1 className="fr-h2 fr-mb-0">Vérifier mon éligibilité en 1 min</h1>
        )}

        {headingLevel === 'h2' && (
          <h2 className="fr-h2 fr-mb-0">Vérifier mon éligibilité en 1 min</h2>
        )}

        <p className="fr-text--sm fr-text-default--grey fr-ml-1w fr-mt-1w fr-mb-0">
          Vérifiez votre éligibilité ou celle votre enfant. Ces informations ne sont pas conservées.
        </p>

        <form
          onSubmit={(e) => {
            // Prevent submission for required fields to work as intended
            e.preventDefault();
          }}
        >
          <fieldset className="fr-fieldset" aria-describedby="eligibility-notification-message">
            <div
              className={cn(
                styles['eligibility-test__fields'],
                display === 'row'
                  ? styles['eligibility-test__fields--row']
                  : styles['eligibility-test__fields--column'],
              )}
            >
              <div className={cn('fr-fieldset__element', styles['eligibility-test__fields-date'])}>
                <Input
                  label="Date de naissance"
                  stateRelatedMessage="Veuillez sélectionnez votre date de naissance"
                  nativeInputProps={{
                    required: true,
                    type: 'date',
                    min: '1950-01-01',
                    max: '2099-12-31',
                    onChange: (e) => {
                      setTargetDate(e.target.value);
                      resetStates();
                    },
                  }}
                />
              </div>

              <div className="fr-fieldset__element">
                <Select
                  label="Êtes-vous bénéficiaire d'une aide ?"
                  nativeSelectProps={{
                    name: 'my-select',
                    required: true,
                    onChange: (e) => {
                      setAllocationName(e.target.value as ALLOCATION);
                      resetStates();
                    },
                  }}
                  options={[
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
                  ]}
                  placeholder="Sélectionner une option"
                />
              </div>
              <div className="fr-fieldset__element flex--min-content">
                <Button
                  type="submit"
                  priority={buttonVariant}
                  onClick={() => {
                    if (targetDate && allocationName) {
                      const result = isEligible({ targetDate, allocationName });

                      setSuccess(result);
                      eligibilityTestOnClick();
                      onCompletion?.(result);
                    }
                  }}
                >
                  Vérifier
                </Button>
              </div>
            </div>
          </fieldset>

          <section id="eligibility-notification-message" role="alert">
            {success !== null && alertMeta !== null && (
              <Alert
                severity={success ? 'success' : 'info'}
                className="fr-mt-2w"
                key={`${allocationName}-success`}
                title={alertMeta.title}
                description={alertMeta.description}
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
                  className="fr-link"
                  href="https://www.demarches-simplifiees.fr/commencer/code-pass-sport-aeeh"
                  target="_blank"
                  title="Faites-en la demande sur démarches-simplifiées - Nouvelle fenêtre"
                  onClick={() => {
                    onAeehLinkClick();
                  }}
                >
                  Faites-en la demande sur démarches-simplifiées
                </Link>
              </p>

              <p>En attente du code, vous pouvez proposer cette solution à votre club :</p>

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
