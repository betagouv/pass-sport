import { render } from '@testing-library/react';
import init, { push } from '@socialgouv/matomo-next';
import { usePathname } from 'next/navigation';
import Matomo from '@/app/Matomo';

jest.mock('@socialgouv/matomo-next', () => ({
  __esModule: true,
  default: jest.fn(),
  push: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

const navigateTo = (path: string, title: string) => {
  window.history.pushState({}, '', path);
  document.title = title;
  jest.mocked(usePathname).mockReturnValue(path);
};

describe('Matomo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigateTo('/v2/accueil', 'Accueil - pass Sport');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('leaves the landing page view to init()', () => {
    render(<Matomo />);
    jest.runAllTimers();

    expect(init).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
  });

  it('hands the new URL and title over to Matomo on a client-side navigation', () => {
    const { rerender } = render(<Matomo />);

    navigateTo('/v2/trouver-un-club', 'Trouver un club - pass Sport');
    rerender(<Matomo />);
    jest.runAllTimers();

    expect(jest.mocked(push).mock.calls).toEqual([
      [['setReferrerUrl', `${window.location.origin}/v2/accueil`]],
      [['setCustomUrl', `${window.location.origin}/v2/trouver-un-club`]],
      [['setDocumentTitle', 'Trouver un club - pass Sport']],
      [['trackPageView']],
    ]);
  });
});
