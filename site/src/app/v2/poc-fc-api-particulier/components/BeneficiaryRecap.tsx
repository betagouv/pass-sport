import type { BeneficiaryResult } from '@/app/services/applications';

const who = (b: BeneficiaryResult): string =>
  b.source === 'self' ? 'Vous' : (b.givenName ?? 'Votre enfant');

interface Props {
  beneficiaries: BeneficiaryResult[];
}

export default function BeneficiaryRecap({ beneficiaries }: Props) {
  const assessed = beneficiaries.filter((b) => b.verdict !== 'not_assessed');
  const confirmed = assessed.filter((b) => b.verdict === 'eligible_confirmed');
  const soon = assessed.filter((b) => b.verdict === 'eligible_pending');
  const notEligible = assessed.filter((b) => b.verdict === 'not_eligible');

  if (assessed.length === 0) {
    return (
      <div className="fr-alert fr-alert--info fr-mb-3w">
        <h2 className="fr-alert__title">Demande enregistrée</h2>
        <p>Aucun bénéficiaire n’a pu être évalué à partir des informations transmises.</p>
      </div>
    );
  }

  return (
    <section className="fr-mb-3w">
      <h2 className="fr-h4">Résultat de votre demande</h2>

      {confirmed.length > 0 && (
        <div className="fr-alert fr-alert--success fr-mb-2w">
          <h3 className="fr-alert__title">
            {confirmed.length > 1
              ? 'Les codes pass Sport suivants sont disponibles'
              : 'Le code pass Sport suivant est disponible'}
          </h3>
          <ul className="fr-ml-2w">
            {confirmed.map((b, i) => (
              <li key={`confirmed-${i}`}>
                {who(b)}
                {b.code && (
                  <>
                    &nbsp;: <strong>{b.code}</strong>
                  </>
                )}
              </li>
            ))}
          </ul>
          {/* Rows written before the code was stored carry a verdict but no code — for
              those, the email stays the only place it can be read. */}
          <p>
            {confirmed.some((b) => b.code)
              ? 'Une copie vous est également envoyée par email.'
              : `${confirmed.length > 1 ? 'Les codes vous sont envoyés' : 'Le code vous est envoyé'} par email.`}{' '}
            Présentez-{confirmed.length > 1 ? 'les' : 'le'} à une structure sportive partenaire pour
            bénéficier de l’aide.
          </p>
        </div>
      )}

      {soon.length > 0 && (
        <div className="fr-alert fr-alert--info fr-mb-2w">
          <h3 className="fr-alert__title">Éligibilité confirmée, code à venir</h3>
          <ul className="fr-ml-2w">
            {soon.map((b, i) => (
              <li key={`soon-${i}`}>{who(b)}</li>
            ))}
          </ul>
          <p>Le code sera envoyé prochainement par email.</p>
        </div>
      )}

      {notEligible.length > 0 && (
        <div className="fr-alert fr-alert--warning fr-mb-2w">
          <h3 className="fr-alert__title">
            D’après les informations disponibles, aucun droit n’a été trouvé pour&nbsp;:
          </h3>
          <ul className="fr-ml-2w">
            {notEligible.map((b, i) => (
              <li key={`not-eligible-${i}`}>{who(b)}</li>
            ))}
          </ul>
          <p>
            Si vous pensez qu’il s’agit d’une erreur, rapprochez-vous d’une structure partenaire.
          </p>
        </div>
      )}
    </section>
  );
}
