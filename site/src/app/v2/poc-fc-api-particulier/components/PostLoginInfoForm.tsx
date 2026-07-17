'use client';

// Reversed-flow info form, shown AFTER FranceConnect login: collects the aides
// bénéficiées + commune de résidence, then POSTs to /collect (the only place API
// Particulier is called). On success it refreshes the server component, which then
// renders the eligibility step. Reused for re-edit (prefilled + cancellable).

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import Button from '@codegouvfr/react-dsfr/Button';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import CityFinder from '@/app/v2/test-eligibilite/components/city-finder/CityFinder';
import { InputState } from 'types/form';

// ARS and AEEH are distinct aides: each one triggers its own per-child API
// Particulier calls, and both can be selected together.
const AIDE_OPTIONS: { label: string; allowances: ALLOWANCE[] }[] = [
  { label: 'ARS', allowances: [ALLOWANCE.ARS] },
  { label: 'AEEH', allowances: [ALLOWANCE.AEEH] },
  { label: 'AAH', allowances: [ALLOWANCE.AAH] },
  { label: 'CROUS', allowances: [ALLOWANCE.CROUS] },
];

const labelsFromAllowances = (aides: ALLOWANCE[]): string[] =>
  AIDE_OPTIONS.filter((opt) => opt.allowances.some((a) => aides.includes(a))).map((o) => o.label);

interface Props {
  // Prefill values when re-editing an already-collected session.
  initialAides?: ALLOWANCE[];
  initialResidenceInsee?: string;
  // Shown as a "back" button when re-editing.
  onCancel?: () => void;
  // Called after a successful collect, before the server re-render.
  onSuccess?: () => void;
}

export default function PostLoginInfoForm({
  initialAides = [],
  initialResidenceInsee = '',
  onCancel,
  onSuccess,
}: Props) {
  const router = useRouter();
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    labelsFromAllowances(initialAides),
  );
  // RGAA: empty selection is allowed to be *attempted*, but Confirmer then surfaces
  // an error on the group rather than silently doing nothing / disabling the button.
  const [error, setError] = useState<string | undefined>(undefined);
  const [cityInputState, setCityInputState] = useState<InputState>({ state: 'default' });
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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
      setError('Veuillez sélectionner au moins une aide.');
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
      const res = await fetch('/v2/api/poc-fc-api-particulier/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aides, residenceInsee }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSubmitError(body.error ?? 'Une erreur est apparue. Merci de réessayer ultérieurement.');
        return;
      }

      // Server session now holds the API Particulier results: re-render into the
      // eligibility step.
      onSuccess?.();
      router.refresh();
    } catch {
      setSubmitError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={onConfirm}>
      <Checkbox
        legend="De quelles aides bénéficiez-vous ?"
        state={error ? 'error' : 'default'}
        stateRelatedMessage={error}
        options={AIDE_OPTIONS.map((opt) => ({
          label: opt.label,
          nativeInputProps: {
            checked: selectedLabels.includes(opt.label),
            onChange: (e) => toggle(opt.label, e.target.checked),
          },
        }))}
      />
      <CityFinder
        legend="Commune où vous habitez"
        inputName="residenceInsee"
        inputState={cityInputState}
        isDisabled={isLoading}
        onChanged={() => setCityInputState({ state: 'default' })}
        onBlur={() => {}}
        required
      />

      <div className="fr-mt-2w">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Vérification en cours…' : 'Confirmer'}
        </Button>
        {onCancel && (
          <Button
            priority="secondary"
            type="button"
            className="fr-ml-2w"
            disabled={isLoading}
            onClick={onCancel}
          >
            Annuler
          </Button>
        )}
      </div>

      {submitError && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{submitError}</p>
        </div>
      )}
    </form>
  );
}
