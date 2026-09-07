'use client';

import { FormEvent, useState } from 'react';
import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import Button from '@codegouvfr/react-dsfr/Button';
import CityFinder from '@/app/v2/test-eligibilite/components/city-finder/CityFinder';
import { useRemoveAttributeById } from '@/app/hooks/useRemoveAttributeById';
import { InputState } from '@/types/form';
import type { Allowance } from '@/app/services/queue';

const AIDES_FIELDSET_ID = 'post-login-aides';

const AIDE_OPTIONS: { label: string; hint?: string; allowances: Allowance[] }[] = [
  {
    label: 'J’ai un ou plusieurs enfants de 6 à 19 ans',
    hint: 'Cochez cette case même si vous ne connaissez pas votre quotient familial. Nous le vérifions pour vous auprès de la CAF.',
    allowances: ['QF', 'AEEH'],
  },
  { label: 'Je touche l’allocation aux adultes handicapés (AAH)', allowances: ['AAH'] },
  {
    label: 'Je suis étudiant ou étudiante et je touche une bourse du CROUS',
    allowances: ['CROUS'],
  },
];

const labelsFromAllowances = (aides: Allowance[]): string[] =>
  AIDE_OPTIONS.filter((opt) => opt.allowances.some((a) => aides.includes(a))).map((o) => o.label);

interface Props {
  // Prefill values (empty on first render; the session is identity-only).
  initialAides?: Allowance[];
  initialResidenceInsee?: string;
  // Called once the eligibility job has been queued (202).
  onQueued?: () => void;
}

export default function PostLoginInfoForm({
  initialAides = [],
  initialResidenceInsee = '',
  onQueued,
}: Props) {
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    labelsFromAllowances(initialAides),
  );
  // RGAA: empty selection is allowed to be *attempted*, but Confirmer then surfaces
  // an error on the group rather than silently doing nothing / disabling the button.
  const [error, setError] = useState<string | undefined>(undefined);
  const [cityInputState, setCityInputState] = useState<InputState>({ state: 'default' });
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // DSFR points the fieldset's aria-labelledby at both the legend and the messages group,
  // which overrides the native <legend> and folds the error text into the group name.
  useRemoveAttributeById(AIDES_FIELDSET_ID, 'aria-labelledby');

  const toggle = (label: string, checked: boolean) => {
    setError(undefined);
    setSelectedLabels((prev) => (checked ? [...prev, label] : prev.filter((l) => l !== label)));
  };

  const onConfirm = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);

    const insee = (new FormData(e.currentTarget).get('residenceInsee') ?? '')
      .toString()
      // CityFinder keeps the previous value when re-editing; fall back to it.
      .trim();
    const residenceInsee = insee || initialResidenceInsee;

    let ok = true;
    if (selectedLabels.length === 0) {
      setError('Cochez au moins une case.');
      ok = false;
    }
    if (!residenceInsee) {
      setCityInputState({ state: 'error', errorMsg: 'Sélectionnez une commune.' });
      ok = false;
    }
    if (!ok) return;

    const aides = AIDE_OPTIONS.filter((o) => selectedLabels.includes(o.label)).flatMap(
      (o) => o.allowances,
    );

    setIsLoading(true);
    try {
      const res = await fetch('/api/france-connect/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aides, residenceInsee }),
      });

      // 409: this FranceConnect user already has a request on the queue (the job is
      // keyed on their `sub`, so reconnecting cannot create a second one). Treat it as
      // success — their request exists and the result still arrives by email.
      if (res.status === 409) {
        onQueued?.();
        return;
      }

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error ?? 'Une erreur est apparue. Merci de réessayer ultérieurement.');
        return;
      }

      // Job queued (202): the worker will email the code. Show the confirmation.
      onQueued?.();
    } catch {
      setSubmitError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onConfirm} className="fr-mt-2w">
      <Checkbox
        id={AIDES_FIELDSET_ID}
        legend={
          <>
            Votre situation <span className="text--required">*</span>
          </>
        }
        state={error ? 'error' : 'default'}
        stateRelatedMessage={error}
        options={AIDE_OPTIONS.map((opt) => ({
          label: opt.label,
          hintText: opt.hint,
          nativeInputProps: {
            name: 'aides',
            value: opt.allowances.join('-'),
            checked: selectedLabels.includes(opt.label),
            onChange: (e) => toggle(opt.label, e.target.checked),
          },
        }))}
      />
      <CityFinder
        legend={
          <>
            Commune de résidence de l’allocataire <span className="text--required">*</span>
          </>
        }
        inputName="residenceInsee"
        inputState={cityInputState}
        isDisabled={isLoading}
        onChanged={() => setCityInputState({ state: 'default' })}
        onBlur={() => {}}
        required
      />

      <div className="fr-mt-2w">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Envoi en cours…' : 'Confirmer'}
        </Button>
      </div>

      {submitError && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{submitError}</p>
        </div>
      )}
    </form>
  );
}
