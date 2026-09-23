import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { push } from '@socialgouv/matomo-next';
import BeneficiaryRecap from '@/app/v2/test-eligibilite/components/post-login-flow/BeneficiaryRecap';
import type { BeneficiaryResult } from '@/app/services/applications';

jest.mock('@socialgouv/matomo-next', () => ({ push: jest.fn() }));

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
  relanceAllowed: false,
  ...overrides,
});

const renderRecap = (beneficiaries: BeneficiaryResult[]) =>
  render(
    <BeneficiaryRecap beneficiaries={beneficiaries} allocataireIdentity={ALLOCATAIRE_IDENTITY} />,
  );

const RELANCE_LABEL = 'Relancer la vérification';

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

  it('shows the bare section title regardless of the allocataire’s email', () => {
    renderRecap([beneficiary()]);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('Résultat de votre demande');
    expect(heading).not.toHaveTextContent('envoyé à l’adresse');
  });

  it('shows the same bare title when FranceConnect served no email', () => {
    render(
      <BeneficiaryRecap
        beneficiaries={[beneficiary()]}
        allocataireIdentity={{ ...ALLOCATAIRE_IDENTITY, email: undefined }}
      />,
    );

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
    expect(downloadLink).toHaveClass('matomo_ignore');
  });

  it('does not show a PDF download link for an eligible_confirmed beneficiary without a code yet', () => {
    renderRecap([beneficiary({ verdict: 'eligible_confirmed', code: null })]);

    expect(screen.queryByRole('link', { name: 'Télécharger le code' })).not.toBeInTheDocument();
  });

  it('shows a PDF download link for an eligible_confirmed enfant beneficiary, keyed by their position', () => {
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
    expect(downloadLink).toHaveAttribute('href', '/api/france-connect/pdf?beneficiary=0');
    expect(downloadLink).toHaveClass('matomo_ignore');
  });

  it('never puts a pass Sport code in a download URL', () => {
    renderRecap([
      beneficiary({ verdict: 'eligible_confirmed', code: '24-ZORV-QYXA' }),
      beneficiary({ source: 'enfant', givenName: 'Zephyrin', code: '24-AZUR-KLMB' }),
      beneficiary({ source: 'enfant', givenName: 'Balthazine', code: '24-VORT-XQPL' }),
    ]);

    const hrefs = screen
      .getAllByRole('link', { name: 'Télécharger le code' })
      .map((link) => link.getAttribute('href'));

    expect(hrefs).toEqual([
      '/api/france-connect/pdf',
      '/api/france-connect/pdf?beneficiary=1',
      '/api/france-connect/pdf?beneficiary=2',
    ]);
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

    expect(screen.getByText('OSTRENYA Zephyrin, né(e) le 02/06/2015')).toBeInTheDocument();
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

  it('falls back to "Votre enfant" when a child has no given name', () => {
    renderRecap([beneficiary({ source: 'enfant', givenName: null })]);

    expect(screen.getByText('Votre enfant')).toBeInTheDocument();
  });

  it('shows a Card for every child, not just the ones already served a code', () => {
    const { container } = renderRecap([
      beneficiary({ source: 'enfant', givenName: 'Quorindel', verdict: 'eligible_pending' }),
      beneficiary({ source: 'enfant', givenName: 'Astravelle', verdict: 'eligible_confirmed' }),
    ]);

    const [pendingCard, confirmedCard] = cards(container);
    expect(cards(container)).toHaveLength(2);

    expect(within(pendingCard).getByText('Quorindel')).toBeInTheDocument();
    const pendingBadge = within(pendingCard).getByText('En cours de traitement');
    expect(pendingBadge).toHaveClass('fr-badge--info');

    expect(within(confirmedCard).getByText('Astravelle')).toBeInTheDocument();
    const confirmedBadge = within(confirmedCard).getByText('Eligible');
    expect(confirmedBadge).toHaveClass('fr-badge--success');
  });

  describe('Matomo', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('reports each verdict once, with the number of beneficiaries holding it', () => {
      renderRecap([
        beneficiary({
          source: 'enfant',
          givenName: 'Quorindel',
          verdict: 'eligible_confirmed',
          code: '24-QUIL-MPRS',
        }),
        beneficiary({
          source: 'enfant',
          givenName: 'Astravelle',
          verdict: 'eligible_confirmed',
          code: '24-VORT-XQPL',
        }),
        beneficiary({ source: 'enfant', givenName: 'Ostrelin', verdict: 'not_eligible' }),
      ]);

      expect(jest.mocked(push).mock.calls).toEqual([
        [['trackEvent', 'Demande FC', 'résultat', 'eligible_confirmed', 2]],
        [['trackEvent', 'Demande FC', 'résultat', 'not_eligible', 1]],
      ]);
    });

    it('reports that no beneficiary was found', () => {
      renderRecap([]);

      expect(jest.mocked(push).mock.calls).toEqual([
        [['trackEvent', 'Demande FC', 'résultat', 'aucun bénéficiaire trouvé', undefined]],
      ]);
    });
  });

  // Le drapeau est lu côté serveur et descendu en prop : ce composant est rendu depuis
  // ResultPanel, qui est 'use client'.
  describe('bouton de relance', () => {
    const refused = [beneficiary({ verdict: 'not_eligible' })];

    const renderWithRelance = (
      beneficiaries: BeneficiaryResult[],
      relanceEnabled: boolean | undefined,
      relanceAllowlistOnly = false,
    ) =>
      render(
        <BeneficiaryRecap
          beneficiaries={beneficiaries}
          allocataireIdentity={ALLOCATAIRE_IDENTITY}
          relanceEnabled={relanceEnabled}
          relanceAllowlistOnly={relanceAllowlistOnly}
        />,
      );

    it('est rendu quand le drapeau est levé et qu’il reste un refus', () => {
      renderWithRelance(refused, true);

      expect(screen.getByRole('button', { name: RELANCE_LABEL })).toBeInTheDocument();
    });

    it.each([
      ['le drapeau est baissé', false],
      ['le drapeau est absent', undefined],
    ])('est absent quand %s, même avec un refus', (_label, relanceEnabled) => {
      renderWithRelance(refused, relanceEnabled);

      expect(screen.queryByRole('button', { name: RELANCE_LABEL })).not.toBeInTheDocument();
    });

    // Une relance n'a rien à amender : elle ne touche que des lignes 'not_eligible'.
    it('est absent sans refus à reprendre, drapeau levé ou non', () => {
      renderWithRelance([beneficiary({ verdict: 'eligible_pending' })], true);

      expect(screen.queryByRole('button', { name: RELANCE_LABEL })).not.toBeInTheDocument();
    });

    describe('restreinte à la liste de test', () => {
      it('est absent quand aucun refus n’est autorisé', () => {
        renderWithRelance(refused, true, true);

        expect(screen.queryByRole('button', { name: RELANCE_LABEL })).not.toBeInTheDocument();
      });

      it('est rendu quand un refus est autorisé', () => {
        renderWithRelance(
          [
            beneficiary({ verdict: 'not_eligible' }),
            beneficiary({ source: 'enfant', verdict: 'not_eligible', relanceAllowed: true }),
          ],
          true,
          true,
        );

        expect(screen.getByRole('button', { name: RELANCE_LABEL })).toBeInTheDocument();
      });

      it('ignore une autorisation portée par une ligne déjà éligible', () => {
        renderWithRelance(
          [
            beneficiary({ verdict: 'not_eligible' }),
            beneficiary({ verdict: 'eligible_pending', relanceAllowed: true }),
          ],
          true,
          true,
        );

        expect(screen.queryByRole('button', { name: RELANCE_LABEL })).not.toBeInTheDocument();
      });
    });
  });
});
