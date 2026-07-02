'use client';

// POC mode 1 fallback: when the user cannot use FranceConnect, the pivot
// identity is typed here and sent to /v2/api/poc-fc-api-particulier/identite
// (API Particulier "identité" mode, static token). On success the page reloads
// and shows the same journey as the FranceConnect flow.
//
// Only people born in France are supported (commune of birth via CityFinder);
// people born abroad are directed to the contact form.

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';
import Input from '@codegouvfr/react-dsfr/Input';
import RadioButtons from '@codegouvfr/react-dsfr/RadioButtons';
import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import CityFinder from '@/app/v2/test-eligibilite/components/city-finder/CityFinder';
import { InputState } from 'types/form';

const DEFAULT_INPUT_STATE: InputState = { state: 'default' };

export default function IdentityForm() {
  const [gender, setGender] = useState<'M' | 'F' | ''>('');
  const [bornAbroad, setBornAbroad] = useState(false);
  const [birthPlaceState, setBirthPlaceState] = useState<InputState>(DEFAULT_INPUT_STATE);
  const [residenceState, setResidenceState] = useState<InputState>(DEFAULT_INPUT_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const birthplaceInsee = (formData.get('birthplaceInsee') ?? '').toString();
    const residenceInsee = (formData.get('residenceInsee') ?? '').toString();

    if (!birthplaceInsee) {
      setBirthPlaceState({ state: 'error', errorMsg: 'Sélectionnez une commune.' });
      return;
    }
    if (!residenceInsee) {
      setResidenceState({ state: 'error', errorMsg: 'Sélectionnez une commune.' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/v2/api/poc-fc-api-particulier/identite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastname: (formData.get('lastname') ?? '').toString().trim(),
          firstnames: (formData.get('firstnames') ?? '').toString().trim(),
          gender,
          birthdate: (formData.get('birthdate') ?? '').toString(),
          birthplaceInsee,
          residenceInsee,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Une erreur est apparue. Merci de réessayer ultérieurement.');
        setIsLoading(false);
        return;
      }

      // Session stored server-side: reload so the page shows the results.
      window.location.assign('/v2/poc-fc-api-particulier?status=ok');
    } catch {
      setError('Une erreur est apparue. Merci de réessayer ultérieurement.');
      setIsLoading(false);
    }
  };

  if (bornAbroad) {
    return (
      <div>
        <Checkbox
          className="fr-my-2w"
          options={[
            {
              label: 'Je suis né(e) à l’étranger',
              nativeInputProps: {
                checked: bornAbroad,
                onChange: (e) => setBornAbroad(e.target.checked),
              },
            },
          ]}
        />
        <div className="fr-alert fr-alert--info fr-alert--sm fr-mb-2w">
          <p>
            Ce parcours n’est pas encore disponible pour les personnes nées à l’étranger.
            Contactez-nous : nous étudierons votre situation.
          </p>
        </div>
        <Link className="fr-btn fr-btn--secondary" href="/v2/une-question">
          Nous contacter
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      {/* First question on purpose: people born abroad cannot use this journey,
          they must know it before filling anything else. */}
      <Checkbox
        options={[
          {
            label: 'Je suis né(e) à l’étranger',
            nativeInputProps: {
              checked: bornAbroad,
              onChange: (e) => setBornAbroad(e.target.checked),
            },
          },
        ]}
      />

      <Input
        label="Nom de naissance"
        hintText="Tel qu’il est écrit sur vos papiers d’identité."
        nativeInputProps={{ name: 'lastname', required: true, autoComplete: 'family-name' }}
        disabled={isLoading}
      />

      <Input
        label="Prénoms"
        hintText="Tous vos prénoms, dans l’ordre de vos papiers d’identité, séparés par un espace."
        nativeInputProps={{ name: 'firstnames', required: true, autoComplete: 'given-name' }}
        disabled={isLoading}
      />

      <RadioButtons
        legend="Sexe à l’état civil"
        name="gender"
        options={[
          {
            label: 'Féminin',
            nativeInputProps: {
              value: 'F',
              checked: gender === 'F',
              onChange: () => setGender('F'),
              required: true,
            },
          },
          {
            label: 'Masculin',
            nativeInputProps: {
              value: 'M',
              checked: gender === 'M',
              onChange: () => setGender('M'),
              required: true,
            },
          },
        ]}
        disabled={isLoading}
        orientation="horizontal"
      />

      <Input
        label="Date de naissance"
        nativeInputProps={{
          name: 'birthdate',
          type: 'date',
          required: true,
          min: '1900-01-01',
          max: '2099-12-31',
        }}
        disabled={isLoading}
      />

      <CityFinder
        legend="Commune de naissance"
        inputName="birthplaceInsee"
        inputState={birthPlaceState}
        isDisabled={isLoading}
        onChanged={() => setBirthPlaceState(DEFAULT_INPUT_STATE)}
        onBlur={() => {}}
        required
      />

      <CityFinder
        legend="Commune où vous habitez"
        inputName="residenceInsee"
        inputState={residenceState}
        isDisabled={isLoading}
        onChanged={() => setResidenceState(DEFAULT_INPUT_STATE)}
        onBlur={() => {}}
        required
      />

      <Button priority="primary" type="submit" disabled={isLoading} className="fr-mt-2w">
        {isLoading ? 'Vérification en cours…' : 'Continuer'}
      </Button>

      {error && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{error}</p>
        </div>
      )}
    </form>
  );
}
