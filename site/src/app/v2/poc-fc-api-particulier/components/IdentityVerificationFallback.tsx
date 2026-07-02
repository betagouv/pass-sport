'use client';

// Rendered through the AllowanceStep `searchNoMatchFallback` slot (POC embed
// only), inside the EligibilityTestContext provider: when the LCA search finds
// no match, asks the two pivot fields the eligibility test does not collect
// (sexe + commune de naissance) and verifies the situation through
// /v2/api/poc-fc-api-particulier/identite-verification. Eligible -> link to the
// support contact form; not eligible -> plain message, no link.
// People born abroad are directed to the contact form (no COG country
// referential in the repo, same limitation as the FranceConnect-less journey).

import { FormEvent, useContext, useState } from 'react';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';
import RadioButtons from '@codegouvfr/react-dsfr/RadioButtons';
import Checkbox from '@codegouvfr/react-dsfr/Checkbox';
import CityFinder from '@/app/v2/test-eligibilite/components/city-finder/CityFinder';
import VerdictPanel from '@/app/v2/test-eligibilite/components/verdict-panel/VerdictPanel';
import EligibilityTestContext from '@/store/eligibilityTestContext';
import { ALLOWANCE } from '@/app/v2/test-eligibilite/components/types/types';
import { InputState } from 'types/form';

const DEFAULT_INPUT_STATE: InputState = { state: 'default' };

const VERIFIABLE_ALLOWANCES = [ALLOWANCE.ARS, ALLOWANCE.AAH, ALLOWANCE.AEEH, ALLOWANCE.CROUS];

interface VerificationResult {
  eligible: boolean;
  verified: boolean;
}

export default function IdentityVerificationFallback() {
  const { allowance, dob, searchedBeneficiary, benefIsEligible, performNewTest } =
    useContext(EligibilityTestContext);

  const [gender, setGender] = useState<'M' | 'F' | ''>('');
  const [bornAbroad, setBornAbroad] = useState(false);
  const [birthPlaceState, setBirthPlaceState] = useState<InputState>(DEFAULT_INPUT_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  // Unsupported allowance or missing context data: degrade to the standard
  // verdict of the eligibility test.
  if (!allowance || !VERIFIABLE_ALLOWANCES.includes(allowance) || !dob || !searchedBeneficiary) {
    return <VerdictPanel isSuccess={false} isEligible={benefIsEligible} />;
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const birthplaceInsee = (formData.get('birthplaceInsee') ?? '').toString();

    if (!birthplaceInsee) {
      setBirthPlaceState({ state: 'error', errorMsg: 'Sélectionnez une commune.' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/v2/api/poc-fc-api-particulier/identite-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowance,
          lastname: searchedBeneficiary.lastname,
          firstname: searchedBeneficiary.firstname,
          gender,
          birthdate: dob,
          birthplaceInsee,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? 'Une erreur est apparue. Merci de réessayer ultérieurement.');
        return;
      }

      setResult((await res.json()) as VerificationResult);
    } catch {
      setError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  };

  if (result) {
    return (
      <div>
        {result.eligible ? (
          <div className="fr-alert fr-alert--info fr-mb-2w">
            <p>
              D’après nos vérifications, {searchedBeneficiary.firstname}{' '}
              {searchedBeneficiary.lastname} semble éligible au pass Sport
              {!result.verified && ' (sous réserve de vérification)'}. Contactez-nous pour obtenir
              le code.
            </p>
          </div>
        ) : (
          <div className="fr-alert fr-alert--error fr-mb-2w">
            <p>
              D’après nos vérifications, {searchedBeneficiary.firstname}{' '}
              {searchedBeneficiary.lastname} n’est pas éligible au pass Sport.
            </p>
          </div>
        )}

        {result.eligible && (
          <Link className="fr-btn fr-mb-2w" href="/v2/une-question">
            Contacter le support
          </Link>
        )}

        <div>
          <Button priority="tertiary" type="button" onClick={performNewTest}>
            Recommencer le test
          </Button>
        </div>
      </div>
    );
  }

  if (bornAbroad) {
    return (
      <div>
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
        <div className="fr-alert fr-alert--info fr-alert--sm fr-mb-2w">
          <p>
            Cette vérification n’est pas encore disponible pour les personnes nées à l’étranger.
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
      <div className="fr-alert fr-alert--info fr-mb-2w">
        <p>
          Nous n’avons pas retrouvé {searchedBeneficiary.firstname} {searchedBeneficiary.lastname}.
          Vérifions sa situation : renseignez les informations ci-dessous.
        </p>
      </div>

      {/* First question on purpose: people born abroad cannot use this
          verification, they must know it before filling anything else. */}
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

      <RadioButtons
        legend="Sexe à l’état civil"
        name="fallback-gender"
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

      <CityFinder
        legend="Commune de naissance"
        inputName="birthplaceInsee"
        inputState={birthPlaceState}
        isDisabled={isLoading}
        onChanged={() => setBirthPlaceState(DEFAULT_INPUT_STATE)}
        onBlur={() => {}}
        required
      />

      <Button priority="primary" type="submit" disabled={isLoading} className="fr-mt-2w">
        {isLoading ? 'Vérification en cours…' : 'Vérifier ma situation'}
      </Button>

      {error && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{error}</p>
        </div>
      )}
    </form>
  );
}
