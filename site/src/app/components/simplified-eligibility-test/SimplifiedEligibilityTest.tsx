'use client';

import styles from './styles.module.scss';
import { Input } from '@codegouvfr/react-dsfr/Input';
import { Select } from '@codegouvfr/react-dsfr/SelectNext';
import Button, { ButtonProps } from '@codegouvfr/react-dsfr/Button';
import { ALLOCATION, isEligible } from '@/utils/eligibility-test';
import { useEffect, useState } from 'react';
import { Alert } from '@codegouvfr/react-dsfr/Alert';
import cn from 'classnames';
import { push } from '@socialgouv/matomo-next';
import KnowMore from '@/app/components/know-more/KnowMore';
import Link from 'next/link';
import { CODES_OBTAINABLE, CODES_OBTAINABLE_FOR_CROUS } from '@/app/constants/env';
import { JEUNES_PARENTS_PAGE_AEEH_PARAMS } from '@/app/constants/search-query-params';
import { SKIP_LINKS_ID } from '@/app/constants/skip-links';

type SimplifiedEligibilityTestProps = {
  display?: 'column' | 'row';
  buttonVariant?: ButtonProps['priority'];
  onCompletion?: (success: boolean) => void;
  headingLevel: 'h1' | 'h2';
};

export default function SimplifiedEligibilityTest({
  display = 'row',
  buttonVariant = 'primary',
  onCompletion,
  headingLevel,
}: SimplifiedEligibilityTestProps) {
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean | null>(null);
  const [allocationName, setAllocationName] = useState<ALLOCATION | null>(null);
  const [knowMoreMeta, setKnowMoreMeta] = useState<{ title: string; description: string } | null>(
    null,
  );
  const [alertMeta, setAlertMeta] = useState<{ title: string; description: string } | null>(null);
  const eligibilityTestOnClick = () => {
    push(['trackEvent', 'Simplified Eligibility Test', 'Button clicked']);
  };

  const [displayEligibilityLink, setDisplayEligibilityLink] = useState<boolean>(false);
  const [displayAeehLink, setDisplayAeehLink] = useState<boolean>(false);
  const [displayObtainCodeButton, setDisplayObtainCodeButton] = useState<boolean>(false);

  function resetStates() {
    setDisplayEligibilityLink(false);
    setDisplayAeehLink(false);
    setDisplayObtainCodeButton(false);
    setSuccess(null);
    setAlertMeta(null);
    setKnowMoreMeta(null);
  }

  useEffect(() => {
    if (!allocationName) return;

    const successInitialMeta = {
      title:
        'Bonne nouvelle, d’après les informations que vous nous avez fournies, vous êtes éligible au pass Sport.',
      description:
        "Disponible à partir du 1er septembre jusqu’au 31 décembre 2025, ce dispositif vous permet de bénéficier d'une réduction immédiate de 70 € sur votre inscription dans l’un des 85 000 clubs, associations sportives ou salles de sport partenaires.",
    };

    const errorInitialMeta = {
      title:
        'Nous sommes désolés, d’après les informations que vous nous avez fournies, vous n’êtes pas éligible au pass Sport.',
      description: '',
    };

    if (CODES_OBTAINABLE && success === true) {
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
          setAlertMeta({
            title: successInitialMeta.title,
            description: successInitialMeta.description,
          });
          setDisplayAeehLink(true);
          break;
        case ALLOCATION.CROUS:
        case ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX:
          if (!CODES_OBTAINABLE_FOR_CROUS) {
            setAlertMeta({
              title: successInitialMeta.title,
              description:
                'En tant qu’étudiant boursier, vous recevrez votre code progressivement à partir du 1er novembre au lieu de 1er septembre. Nous nous excusons pour la gêne occasionnée.',
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

      setDisplayEligibilityLink(true);
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
            description:
              'Le pass Sport 2025 sera progressivement disponible par mail ou SMS à partir du 1er septembre. Si vous n’avez rien reçu, revenez sur le site à partir du 1er septembre pour en bénéficier.',
          });
          break;
        case ALLOCATION.CROUS:
        case ALLOCATION.FORMATIONS_SANITAIRES_SOCIAUX:
          setAlertMeta({
            title: successInitialMeta.title,
            description:
              'En tant qu’étudiant boursier, vous recevrez votre code progressivement à partir du 1er novembre au lieu de 1er septembre. Nous nous excusons pour la gêne occasionnée.',
          });
          setKnowMoreMeta({
            title: 'A savoir',
            description:
              'Le pass Sport 2025 sera progressivement disponible par mail ou SMS à partir du 1er novembre. Si vous n’avez rien reçu, revenez sur le site à partir du 1er novembre pour en bénéficier.',
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
  }, [success, allocationName]);

  return (
    <div className={cn(styles['eligibility-test'])}>
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
                  onChange: (e) => {
                    setTargetDate(e.target.value);
                    resetStates();
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
            <Link href="/v2/test-eligibilite" className="fr-btn fr-btn--secondary">
              Demander mon pass Sport
            </Link>
          </p>
        )}

        {displayAeehLink && (
          <p className="fr-mb-0 fr-mt-3w text-align--center">
            <Link
              href={`/v2/jeunes-et-parents?${JEUNES_PARENTS_PAGE_AEEH_PARAMS.aeehModalOpened}=1#${SKIP_LINKS_ID.aeehContent}`}
              className="fr-link"
            >
              Contactez-nous pour demander votre pass Sport
            </Link>
          </p>
        )}

        {displayEligibilityLink && (
          <p className="fr-mb-0 fr-mt-3w text-align--center">
            <Link href="/v2/une-question" className="fr-link">
              En savoir plus sur les conditions d’éligibilité
            </Link>
          </p>
        )}
      </form>
    </div>
  );
}
