'use client';

// POC step 3: pick the beneficiary (a child from the quotient familial — the
// connected user is the parent) and the commune de résidence, then run the LCA
// search/confirm through /v2/api/poc-fc-api-particulier/eligibility.
//
// The residence INSEE code is asked to the user on purpose: a postal code maps to
// several communes, so it cannot be derived reliably from the QF address.

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import Button from '@codegouvfr/react-dsfr/Button';
import CityFinder from '@/app/v2/test-eligibilite/components/city-finder/CityFinder';
import { BeneficiaryCandidate } from '@/app/services/lca-bridge';
import { InputState } from 'types/form';
import { ConfirmResponseBodyItem, SearchResponseBodyItem } from 'types/EligibilityTest';
import styles from '../styles.module.scss';

interface EligibilityResponse {
  candidate?: BeneficiaryCandidate;
  search?: SearchResponseBodyItem[];
  confirm?: ConfirmResponseBodyItem[] | { message: string };
  // Present when the LCA search found nothing: API Particulier assessment of
  // every gathered person.
  eligibilitySummary?: BeneficiaryCandidate[];
  error?: string;
}

interface Props {
  candidates: BeneficiaryCandidate[];
}

const ALLOWANCE_LABELS: Record<string, string> = {
  ARS: 'allocation de rentrée scolaire (ARS)',
  AEEH: 'allocation d’éducation de l’enfant handicapé (AEEH)',
  AAH: 'allocation aux adultes handicapés (AAH)',
  CROUS: 'bourse étudiante (CROUS)',
};

const candidateLabel = (candidate: BeneficiaryCandidate): string =>
  `${candidate.source === 'self' ? 'Moi' : 'Mon enfant'} — ${candidate.firstname} ${candidate.lastname}, né(e) le ${candidate.birthdate}`;

const eligibilitiesLabel = (candidate: BeneficiaryCandidate): string =>
  candidate.eligibilities.length > 0
    ? `éligible au pass Sport (${candidate.eligibilities
        .map((allowance) => ALLOWANCE_LABELS[allowance] ?? allowance)
        .join(', ')})`
    : 'pas éligible au pass Sport d’après les informations reçues';

export default function EligibilitySection({ candidates }: Props) {
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [cityInputState, setCityInputState] = useState<InputState>({ state: 'default' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<EligibilityResponse | null>(null);

  const callEligibility = async (residenceInsee: string, searchItemId?: number) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/v2/api/poc-fc-api-particulier/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIndex, residenceInsee, searchItemId }),
      });

      const body = (await res.json()) as EligibilityResponse;
      setResponse(body);
      if (body.error) {
        setError(body.error);
      }
    } catch {
      setError('Une erreur est apparue. Merci de réessayer ultérieurement.');
    } finally {
      setIsLoading(false);
    }
  };

  const [residenceInsee, setResidenceInsee] = useState('');

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formData = new FormData(e.currentTarget);
    const insee = (formData.get('residenceInsee') ?? residenceInsee).toString();

    if (!insee) {
      setCityInputState({ state: 'error', errorMsg: 'Sélectionnez une commune.' });
      return;
    }

    setResidenceInsee(insee);
    setCityInputState({ state: 'default' });
    callEligibility(insee);
  };

  const confirmItems =
    response?.confirm && Array.isArray(response.confirm) ? response.confirm : null;
  const searchItems = response?.search ?? null;

  if (candidates.length === 0) {
    return (
      <div className="fr-alert fr-alert--warning fr-alert--sm">
        <p>
          Nous n’avons pas pu récupérer vos informations. Réessayez plus tard ou contactez-nous.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <fieldset className="fr-fieldset fr-mb-2w">
        <legend className="fr-fieldset__legend">Qui va utiliser le pass Sport ?</legend>
        {candidates.map((candidate, index) => (
          <div className="fr-radio-group" key={`${candidate.lastname}-${index}`}>
            <input
              type="radio"
              id={`poc-candidate-${index}`}
              name="candidate"
              checked={candidateIndex === index}
              onChange={() => setCandidateIndex(index)}
            />
            <label className="fr-label" htmlFor={`poc-candidate-${index}`}>
              {candidateLabel(candidate)}
            </label>
          </div>
        ))}
      </fieldset>

      <CityFinder
        legend="Commune où vous habitez"
        inputName="residenceInsee"
        inputState={cityInputState}
        isDisabled={isLoading}
        onChanged={() => setCityInputState({ state: 'default' })}
        onBlur={() => {}}
        required
      />

      <Button priority="primary" type="submit" disabled={isLoading} className="fr-mt-2w">
        {isLoading ? 'Recherche en cours…' : 'Obtenir mon code pass Sport'}
      </Button>

      {error && (
        <div className="fr-alert fr-alert--error fr-alert--sm fr-mt-2w" role="alert">
          <p>{error}</p>
        </div>
      )}

      {searchItems && searchItems.length === 0 && !error && (
        <div className="fr-mt-2w">
          <div className="fr-alert fr-alert--info fr-alert--sm fr-mb-2w">
            <p>Nous n’avons pas trouvé cette personne.</p>
          </div>

          {response?.eligibilitySummary && (
            <div className="fr-callout">
              <h3 className="fr-callout__title fr-h6">Qui est éligible au pass Sport ?</h3>
              <ul>
                {response.eligibilitySummary.map((person, index) => (
                  <li key={`summary-${index}`}>
                    <strong>
                      {person.firstname} {person.lastname}
                    </strong>{' '}
                    (né(e) le {person.birthdate}) : {eligibilitiesLabel(person)}
                  </li>
                ))}
              </ul>
              <p className="fr-callout__text fr-text--sm">
                Si une personne éligible n’a pas été trouvée, contactez-nous : nous étudierons votre
                situation.
              </p>
              <Link className="fr-btn fr-btn--secondary" href="/v2/une-question">
                Nous contacter
              </Link>
            </div>
          )}
        </div>
      )}

      {searchItems && searchItems.length > 1 && !confirmItems && (
        <div className="fr-mt-2w">
          <p>Plusieurs personnes correspondent, choisissez la bonne :</p>
          {searchItems.map((item) => (
            <Button
              key={item.id}
              priority="secondary"
              type="button"
              disabled={isLoading}
              className="fr-mr-1w fr-mb-1w"
              onClick={() => callEligibility(residenceInsee, item.id)}
            >
              {item.prenom} {item.nom} — {item.situation} ({item.organisme})
            </Button>
          ))}
        </div>
      )}

      {confirmItems && confirmItems.length > 0 && (
        <div className="fr-mt-2w">
          <div className="fr-alert fr-alert--success fr-mb-2w">
            <p>
              Code pass Sport obtenu : <strong>{confirmItems[0].id_psp}</strong>
            </p>
          </div>
          <pre className={styles.payload}>
            {JSON.stringify({ ...confirmItems[0], pdf_base_64: undefined }, null, 2)}
          </pre>
        </div>
      )}

      {confirmItems && confirmItems.length === 0 && (
        <div className="fr-alert fr-alert--warning fr-alert--sm fr-mt-2w">
          <p>Nous n’avons pas pu délivrer le code. Contactez-nous pour étudier votre situation.</p>
        </div>
      )}
    </form>
  );
}
