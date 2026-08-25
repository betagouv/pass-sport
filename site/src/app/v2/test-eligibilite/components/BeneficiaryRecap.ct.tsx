import { test, expect } from '@playwright/experimental-ct-react';
import BeneficiaryRecap from './BeneficiaryRecap';
import type { BeneficiaryResult } from '@/app/services/applications';

// Fictional syllable-based identities: pass-sport processes real beneficiary data, so test
// fixtures must never resemble a plausible real name.
const ALLOCATAIRE_IDENTITY = {
  given_name: 'Velmorak',
  family_name: 'OSTRENYA',
  birthdate: '1990-03-14',
};

const beneficiary = (overrides: Partial<BeneficiaryResult> = {}): BeneficiaryResult => ({
  source: 'self',
  givenName: null,
  verdict: 'eligible_confirmed',
  code: null,
  ...overrides,
});

test.describe('BeneficiaryRecap', () => {
  test('shows a fallback message when the beneficiaries list is empty', async ({ mount }) => {
    const component = await mount(
      <BeneficiaryRecap beneficiaries={[]} allocataireIdentity={ALLOCATAIRE_IDENTITY} />,
    );

    await expect(component.getByText('Demande enregistrée')).toBeVisible();
    await expect(component.locator('.fr-card')).toHaveCount(0);

    const faqLink = component.getByRole('link', { name: 'FAQ' });
    await expect(faqLink).toBeVisible();
    await expect(faqLink).toHaveAttribute('href', '/v2/une-question');
  });

  test('names a self beneficiary by their FranceConnect identity, not "Vous"', async ({
    mount,
  }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[beneficiary({ verdict: 'eligible_confirmed', code: '24-ZORV-QYXA' })]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    await expect(component.getByText('OSTRENYA Velmorak, né(e) le 14/03/1990')).toBeVisible();
    // exact: the download link's own detail text ("PDF — 24-ZORV-QYXA") also contains this
    // code as a substring, so a loose match would resolve to two elements.
    await expect(component.getByText('24-ZORV-QYXA', { exact: true })).toBeVisible();
    await expect(component.getByText('Vous', { exact: true })).toHaveCount(0);

    const badges = component.locator('.fr-badge');
    await expect(badges).toHaveCount(1);
    await expect(badges).toHaveClass(/fr-badge--success/);
    await expect(badges).toHaveText('Eligible');

    const downloadLink = component.getByRole('link', { name: 'Télécharger' });
    await expect(downloadLink).toBeVisible();
    await expect(downloadLink).toHaveAttribute('href', '/api/france-connect/pdf');
  });

  test('does not show a PDF download link for an eligible_confirmed beneficiary without a code yet', async ({
    mount,
  }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[beneficiary({ verdict: 'eligible_confirmed', code: null })]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    await expect(component.getByRole('link', { name: 'Télécharger' })).toHaveCount(0);
  });

  test('never shows a PDF download link for an enfant beneficiary, even eligible_confirmed with a code', async ({
    mount,
  }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[
          beneficiary({
            source: 'enfant',
            givenName: 'Zephyrin',
            verdict: 'eligible_confirmed',
            code: '24-AZUR-KLMB',
          }),
        ]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    await expect(component.getByText('Zephyrin')).toBeVisible();
    await expect(component.getByRole('link', { name: 'Télécharger' })).toHaveCount(0);
  });

  test('names an enfant beneficiary by their first name only', async ({ mount }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[
          beneficiary({ source: 'enfant', givenName: 'Zephyrin', verdict: 'eligible_pending' }),
        ]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    await expect(component.getByText('Zephyrin')).toBeVisible();

    const badges = component.locator('.fr-badge');
    await expect(badges).toHaveCount(1);
    await expect(badges).toHaveClass(/fr-badge--info/);
    await expect(badges).toHaveText('En cours de traitement');
  });

  test('renders one Card per child even when both share the same verdict', async ({ mount }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[
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
        ]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    const cards = component.locator('.fr-card');
    await expect(cards).toHaveCount(2);

    const firstCard = cards.nth(0);
    const secondCard = cards.nth(1);

    await expect(firstCard.getByText('Zephyrin')).toBeVisible();
    await expect(firstCard.getByText('24-AZUR-KLMB')).toBeVisible();
    await expect(firstCard.getByText('Balthazine')).toHaveCount(0);
    await expect(firstCard.getByText('24-VORT-XQPL')).toHaveCount(0);

    await expect(secondCard.getByText('Balthazine')).toBeVisible();
    await expect(secondCard.getByText('24-VORT-XQPL')).toBeVisible();
    await expect(secondCard.getByText('Zephyrin')).toHaveCount(0);
    await expect(secondCard.getByText('24-AZUR-KLMB')).toHaveCount(0);
  });

  test('renders a distinct Card for an eligible and a not-eligible beneficiary', async ({
    mount,
  }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[
          beneficiary({
            source: 'enfant',
            givenName: 'Nyxarel',
            verdict: 'eligible_confirmed',
            code: '24-QUIL-MPRS',
          }),
          beneficiary({ source: 'enfant', givenName: 'Ostrelin', verdict: 'not_eligible' }),
        ]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    const cards = component.locator('.fr-card');
    await expect(cards).toHaveCount(2);

    const eligibleCard = cards.nth(0);
    const notEligibleCard = cards.nth(1);

    await expect(eligibleCard.getByText('Nyxarel')).toBeVisible();
    await expect(eligibleCard.getByText('24-QUIL-MPRS')).toBeVisible();
    const eligibleBadge = eligibleCard.getByText('Eligible');
    await expect(eligibleBadge).toHaveClass(/fr-badge--success/);

    await expect(notEligibleCard.getByText('Ostrelin')).toBeVisible();
    await expect(notEligibleCard.getByText('24-QUIL-MPRS')).toHaveCount(0);
    const notEligibleBadge = notEligibleCard.getByText('Non-Eligible');
    await expect(notEligibleBadge).toHaveClass(/fr-badge--error/);
  });

  test('does not show the code for an eligible_pending_lca beneficiary even when one already exists', async ({
    mount,
  }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[
          beneficiary({
            source: 'enfant',
            givenName: 'Balthazine',
            verdict: 'eligible_pending_lca',
            code: '24-WOLX-TREP',
          }),
        ]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    await expect(component.getByText('Balthazine')).toBeVisible();
    await expect(component.getByText('24-WOLX-TREP')).toHaveCount(0);

    const badges = component.locator('.fr-badge');
    await expect(badges).toHaveCount(1);
    await expect(badges).toHaveClass(/fr-badge--info/);
    await expect(badges).toHaveText('En cours de traitement');
  });

  test('falls back to "Votre enfant" when a child has no given name', async ({ mount }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[beneficiary({ source: 'enfant', givenName: null })]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    await expect(component.getByText('Votre enfant')).toBeVisible();
  });

  test('shows a Card for a not_assessed child alongside the assessed ones, not just the assessed ones', async ({
    mount,
  }) => {
    const component = await mount(
      <BeneficiaryRecap
        beneficiaries={[
          beneficiary({ source: 'enfant', givenName: 'Quorindel', verdict: 'not_assessed' }),
          beneficiary({ source: 'enfant', givenName: 'Astravelle', verdict: 'eligible_confirmed' }),
        ]}
        allocataireIdentity={ALLOCATAIRE_IDENTITY}
      />,
    );

    const cards = component.locator('.fr-card');
    await expect(cards).toHaveCount(2);

    const notAssessedCard = cards.nth(0);
    const confirmedCard = cards.nth(1);

    await expect(notAssessedCard.getByText('Quorindel')).toBeVisible();
    const notAssessedBadge = notAssessedCard.getByText('En cours de traitement');
    await expect(notAssessedBadge).toHaveClass(/fr-badge--info/);

    await expect(confirmedCard.getByText('Astravelle')).toBeVisible();
    const confirmedBadge = confirmedCard.getByText('Eligible');
    await expect(confirmedBadge).toHaveClass(/fr-badge--success/);
  });
});
