import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { push } from '@socialgouv/matomo-next';
import DnDossierButton, {
  MAX_POLLS,
  POLL_INTERVAL_MS,
} from '@/app/v2/test-eligibilite/components/post-login-flow/DnDossierButton';
import type { DnDossier } from '@/app/services/dn-dossier-rules';

jest.mock('@socialgouv/matomo-next', () => ({ push: jest.fn() }));

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

const PREFILL_URL = 'https://demarche.numerique.gouv.fr/commencer/pass-sport?prefill_token=tok-1';

const DOSSIER: DnDossier = {
  number: 9001,
  state: 'prefilled',
  url: PREFILL_URL,
  submittedAt: null,
};

// jsdom has no Response: only what the component reads.
type FakeResponse = { status: number; ok: boolean; json: () => Promise<unknown> };

const answer = (status: number, body: unknown = {}): Promise<FakeResponse> =>
  Promise.resolve({ status, ok: status >= 200 && status < 300, json: async () => body });

// The POST, then one answer per poll.
const respond = (...answers: Array<() => Promise<FakeResponse>>) => {
  fetchMock.mockImplementationOnce(() => answer(202, { queued: true }));
  for (const next of answers) fetchMock.mockImplementationOnce(next);
};

const ready =
  (dossier: DnDossier = DOSSIER) =>
  () =>
    answer(200, { status: 'ready', dossier });
const pending = () => answer(200, { status: 'pending' });

const matomoNames = () =>
  jest
    .mocked(push)
    .mock.calls.filter(([[, , action]]) => action === 'dossier DN')
    .map(([[, , , name]]) => name);

// Lets the fetch promises and the polling timer settle.
const flush = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};

const click = async (name: string) => {
  fireEvent.click(screen.getByRole('button', { name }));
  await flush();
};

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  jest.mocked(push).mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DnDossierButton', () => {
  it('describes what the button does', () => {
    render(<DnDossierButton hasDossier={false} />);

    const button = screen.getByRole('button', { name: 'Vous pensez être éligible ?' });
    expect(button).toHaveAccessibleDescription(/dossier de vérification sur Démarche Numérique/);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('hands back a dossier the usager already holds', () => {
    render(<DnDossierButton hasDossier />);

    expect(screen.getByRole('button', { name: 'Accéder à mon dossier' })).toBeInTheDocument();
  });

  it('asks for the dossier, polls, then shows its personal link', async () => {
    respond(pending, ready());
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/france-connect/dossier', { method: 'POST' });
    expect(screen.getByRole('button', { name: 'Préparation de votre dossier…' })).toBeDisabled();

    await flush(POLL_INTERVAL_MS);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Votre dossier n° 9001 est prêt');
    expect(status).toHaveTextContent('avec FranceConnect');
    expect(status).toHaveTextContent('ne le partagez pas');

    const link = screen.getByRole('link', { name: 'Compléter mon dossier sur Démarche Numérique' });
    expect(link).toHaveAttribute('href', PREFILL_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute(
      'title',
      'Compléter mon dossier sur Démarche Numérique - nouvelle fenêtre',
    );
    // Its URL is the key to the dossier: Matomo's outlink tracking must not see it.
    expect(link).toHaveClass('matomo_ignore');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    fireEvent.click(link);
    expect(matomoNames()).toEqual(['demandé', 'prêt', 'ouvert']);
  });

  it('points a submitted dossier at its follow-up, without the steps', async () => {
    const submitted = {
      ...DOSSIER,
      state: 'en_construction',
      url: 'https://demarche.numerique.gouv.fr/dossiers/9001',
    };
    respond(ready(submitted));
    render(<DnDossierButton hasDossier />);

    await click('Accéder à mon dossier');

    expect(screen.getByRole('status')).toHaveTextContent('Votre dossier n° 9001 a été déposé');
    expect(screen.getByRole('status')).not.toHaveTextContent('ne le partagez pas');
    expect(
      screen.getByRole('link', { name: 'Suivre mon dossier sur Démarche Numérique' }),
    ).toHaveAttribute('href', submitted.url);
  });

  it('shows no link to anything but https', async () => {
    respond(ready({ ...DOSSIER, url: 'javascript:alert(1)' }));
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('rides out a transient error while polling', async () => {
    respond(
      () => answer(429),
      () => Promise.reject(new TypeError('offline')),
      ready(),
    );
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');
    await flush(POLL_INTERVAL_MS);
    await flush(POLL_INTERVAL_MS);

    expect(screen.getByRole('status')).toHaveTextContent('Votre dossier n° 9001 est prêt');
  });

  it.each([
    ['failed', { status: 'failed' }],
    ['none', { status: 'none' }],
  ])('offers to retry when the job ends %s', async (_label, body) => {
    respond(() => answer(200, body));
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');

    expect(screen.getByRole('alert')).toHaveTextContent('n’a pas pu être préparé');
    expect(matomoNames()).toEqual(['demandé', 'échec']);

    respond(ready());
    await click('Réessayer');

    expect(screen.getByRole('status')).toHaveTextContent('Votre dossier n° 9001 est prêt');
  });

  it('gives up after its last poll', async () => {
    respond(...Array.from({ length: MAX_POLLS }, () => pending));
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');
    await flush(POLL_INTERVAL_MS * MAX_POLLS);

    expect(fetchMock).toHaveBeenCalledTimes(MAX_POLLS + 1);
    expect(screen.getByRole('alert')).toHaveTextContent('plus de temps que prévu');
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(matomoNames()).toEqual(['demandé', 'délai dépassé']);
  });

  it('sends a usager whose session expired back to FranceConnect', async () => {
    fetchMock.mockImplementationOnce(() => answer(401, { error: 'Session expirée.' }));
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');

    expect(screen.getByRole('alert')).toHaveTextContent('Reconnectez-vous avec FranceConnect');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each([403, 404])('says the service is unavailable on a %i', async (status) => {
    fetchMock.mockImplementationOnce(() => answer(status, { error: 'Non disponible.' }));
    render(<DnDossierButton hasDossier={false} />);

    await click('Vous pensez être éligible ?');

    expect(screen.getByRole('alert')).toHaveTextContent('pas disponible');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
