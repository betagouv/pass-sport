import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import BeneficiaryRecap from '@/app/v2/test-eligibilite/components/BeneficiaryRecap';
import type { BeneficiaryResult } from '@/app/services/applications';

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const ALLOCATAIRE_IDENTITY = {
  given_name: 'Velmorak',
  family_name: 'OSTRENYA',
  birthdate: '1990-03-14',
  email: 'velmorak.ostrenya@example.test',
};

const beneficiary = (overrides: Partial<BeneficiaryResult> = {}): BeneficiaryResult => ({
  source: 'self',
  givenName: null,
  familyName: null,
  birthdate: null,
  gender: null,
  verdict: 'eligible_confirmed',
  code: null,
  ...overrides,
});

const renderRecap = (beneficiaries: BeneficiaryResult[]) =>
  render(
    <BeneficiaryRecap beneficiaries={beneficiaries} allocataireIdentity={ALLOCATAIRE_IDENTITY} />,
  );

const cards = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('.fr-card'));
const statusBadges = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.fr-badge'));

describe('BeneficiaryRecap', () => {
  it('shows a fallback message when the beneficiaries list is empty', () => {
    const { container } = renderRecap([]);

    expect(screen.getByText('Demande enregistrée')).toBeInTheDocument();
    expect(cards(container)).toHaveLength(0);

    const faqLink = screen.getByRole('link', { name: 'FAQ' });
    expect(faqLink).toHaveAttribute('href', '/v2/une-question');
  });

  it('names the mailbox the result was sent to in the section title', () => {
    renderRecap([beneficiary()]);

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Résultat de votre demande envoyé à l’adresse velmorak.ostrenya@example.test',
    );
  });

  it('keeps the bare title when FranceConnect served no email', () => {
    render(
      <BeneficiaryRecap
        beneficiaries={[beneficiary()]}
        allocataireIdentity={{ ...ALLOCATAIRE_IDENTITY, email: undefined }}
      />,
    );

    // Nothing was mailed in that case, so the title must not claim otherwise.
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Résultat de votre demande');
    expect(heading).not.toHaveTextContent('envoyé à l’adresse');
  });

  it('names a self beneficiary by their FranceConnect identity, not "Vous"', () => {
    const { container } = renderRecap([
      beneficiary({ verdict: 'eligible_confirmed', code: '24-ZORV-QYXA' }),
    ]);

    expect(
      screen.getByText('OSTRENYA Velmorak, né(e) le 14/03/1990', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText('24-ZORV-QYXA')).toBeInTheDocument();
    expect(screen.queryByText('Vous')).not.toBeInTheDocument();

    const badges = statusBadges(container);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveClass('fr-badge--success');
    expect(badges[0]).toHaveTextContent('Eligible');

    const downloadLink = screen.getByRole('link', { name: 'Télécharger le code' });
    expect(downloadLink).toHaveAttribute('href', '/api/france-connect/pdf');
  });

  it('does not show a PDF download link for an eligible_confirmed beneficiary without a code yet', () => {
    renderRecap([beneficiary({ verdict: 'eligible_confirmed', code: null })]);

    expect(screen.queryByRole('link', { name: 'Télécharger le code' })).not.toBeInTheDocument();
  });

  it('shows a PDF download link for an eligible_confirmed enfant beneficiary, keyed by their own code', () => {
    renderRecap([
      beneficiary({
        source: 'enfant',
        givenName: 'Zephyrin',
        familyName: 'OSTRENYA',
        birthdate: '2015-06-02',
        gender: 'male',
        verdict: 'eligible_confirmed',
        code: '24-AZUR-KLMB',
      }),
    ]);

    expect(
      screen.getByText('OSTRENYA Zephyrin, né(e) le 02/06/2015', { exact: false }),
    ).toBeInTheDocument();
    const downloadLink = screen.getByRole('link', { name: 'Télécharger le code' });
    expect(downloadLink).toHaveAttribute('href', '/api/france-connect/pdf?code=24-AZUR-KLMB');
  });

  it('shows a child’s full identity on their card, the same shape as the allocataire’s', () => {
    renderRecap([
      beneficiary({
        source: 'enfant',
        givenName: 'Zephyrin',
        familyName: 'OSTRENYA',
        birthdate: '2015-06-02',
        verdict: 'eligible_pending',
      }),
    ]);

    expect(
      screen.getByText('OSTRENYA Zephyrin, né(e) le 02/06/2015'),
    ).toBeInTheDocument();
  });

  it('does not show a PDF download link for an enfant beneficiary without a confirmed code', () => {
    renderRecap([
      beneficiary({ source: 'enfant', givenName: 'Zephyrin', verdict: 'eligible_pending' }),
    ]);

    expect(screen.getByText('Zephyrin')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Télécharger le code' })).not.toBeInTheDocument();
  });

  it('falls back to the given name alone when a child has no family_name/birthdate yet', () => {
    const { container } = renderRecap([
      beneficiary({ source: 'enfant', givenName: 'Zephyrin', verdict: 'eligible_pending' }),
    ]);

    expect(screen.getByText('Zephyrin')).toBeInTheDocument();

    const badges = statusBadges(container);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveClass('fr-badge--info');
    expect(badges[0]).toHaveTextContent('En cours de traitement');
  });

  it('renders one Card per child even when both share the same verdict', () => {
    const { container } = renderRecap([
      beneficiary({
        source: 'enfant',
        givenName: 'Zephyrin',
        verdict: 'eligible_confirmed',
        code: '24-AZUR-KLMB',
      }),
      beneficiary({
        source: 'enfant',
        givenName: 'Balthazine',
        verdict: 'eligible_confirmed',
        code: '24-VORT-XQPL',
      }),
    ]);

    const [firstCard, secondCard] = cards(container);
    expect(cards(container)).toHaveLength(2);

    expect(within(firstCard).getByText('Zephyrin')).toBeInTheDocument();
    expect(within(firstCard).getByText('24-AZUR-KLMB')).toBeInTheDocument();
    expect(within(firstCard).queryByText('Balthazine')).not.toBeInTheDocument();
    expect(within(firstCard).queryByText('24-VORT-XQPL')).not.toBeInTheDocument();

    expect(within(secondCard).getByText('Balthazine')).toBeInTheDocument();
    expect(within(secondCard).getByText('24-VORT-XQPL')).toBeInTheDocument();
    expect(within(secondCard).queryByText('Zephyrin')).not.toBeInTheDocument();
    expect(within(secondCard).queryByText('24-AZUR-KLMB')).not.toBeInTheDocument();
  });

  it('renders a distinct Card for an eligible and a not-eligible beneficiary', () => {
    const { container } = renderRecap([
      beneficiary({
        source: 'enfant',
        givenName: 'Nyxarel',
        verdict: 'eligible_confirmed',
        code: '24-QUIL-MPRS',
      }),
      beneficiary({ source: 'enfant', givenName: 'Ostrelin', verdict: 'not_eligible' }),
    ]);

    const [eligibleCard, notEligibleCard] = cards(container);
    expect(cards(container)).toHaveLength(2);

    expect(within(eligibleCard).getByText('Nyxarel')).toBeInTheDocument();
    expect(within(eligibleCard).getByText('24-QUIL-MPRS')).toBeInTheDocument();
    const eligibleBadge = within(eligibleCard).getByText('Eligible');
    expect(eligibleBadge).toHaveClass('fr-badge--success');

    expect(within(notEligibleCard).getByText('Ostrelin')).toBeInTheDocument();
    expect(within(notEligibleCard).queryByText('24-QUIL-MPRS')).not.toBeInTheDocument();
    const notEligibleBadge = within(notEligibleCard).getByText('Non-Eligible');
    expect(notEligibleBadge).toHaveClass('fr-badge--error');
  });

  it('does not show the code for an eligible_pending_lca beneficiary even when one already exists', () => {
    const { container } = renderRecap([
      beneficiary({
        source: 'enfant',
        givenName: 'Balthazine',
        verdict: 'eligible_pending_lca',
        code: '24-WOLX-TREP',
      }),
    ]);

    expect(screen.getByText('Balthazine')).toBeInTheDocument();
    expect(screen.queryByText('24-WOLX-TREP')).not.toBeInTheDocument();
    expect(screen.queryByText(/24-WOLX-TREP/)).not.toBeInTheDocument();

    const badges = statusBadges(container);
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveClass('fr-badge--info');
    expect(badges[0]).toHaveTextContent('En cours de traitement');
  });

  it('falls back to "Votre enfant" when a child has no given name', () => {
    renderRecap([beneficiary({ source: 'enfant', givenName: null })]);

    expect(screen.getByText('Votre enfant')).toBeInTheDocument();
  });

  it('shows a Card for a not_assessed child alongside the assessed ones, not just the assessed ones', () => {
    const { container } = renderRecap([
      beneficiary({ source: 'enfant', givenName: 'Quorindel', verdict: 'not_assessed' }),
      beneficiary({ source: 'enfant', givenName: 'Astravelle', verdict: 'eligible_confirmed' }),
    ]);

    const [notAssessedCard, confirmedCard] = cards(container);
    expect(cards(container)).toHaveLength(2);

    expect(within(notAssessedCard).getByText('Quorindel')).toBeInTheDocument();
    const notAssessedBadge = within(notAssessedCard).getByText('En cours de traitement');
    expect(notAssessedBadge).toHaveClass('fr-badge--info');

    expect(within(confirmedCard).getByText('Astravelle')).toBeInTheDocument();
    const confirmedBadge = within(confirmedCard).getByText('Eligible');
    expect(confirmedBadge).toHaveClass('fr-badge--success');
  });
});
