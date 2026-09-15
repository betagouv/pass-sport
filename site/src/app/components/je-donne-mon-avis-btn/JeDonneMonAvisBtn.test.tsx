import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { push } from '@socialgouv/matomo-next';
import {
  JeDonneMonAvisBtn,
  type JeDonneMonAvisOrigin,
} from '@/app/components/je-donne-mon-avis-btn/JeDonneMonAvisBtn';

jest.mock('@socialgouv/matomo-next', () => ({ push: jest.fn() }));

describe('JeDonneMonAvisBtn', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each<[JeDonneMonAvisOrigin, string]>([
    ['simplified-test-eligible', 'Simplified eligibility test success'],
    ['simplified-test-not-eligible', 'Simplified eligibility test failure'],
    ['request-sent', 'Eligibility test request sent'],
    ['not-eligible', 'Eligibility test not eligible'],
  ])('reports a click coming from %s as "%s"', (origin, eventName) => {
    render(<JeDonneMonAvisBtn origin={origin} />);

    // IS_PRODUCTION_ENV is false outside production, so the link has no href in this test
    // environment — jsdom then withholds the "link" role, hence querying by its title instead.
    fireEvent.click(screen.getByTitle('Je donne mon avis - nouvelle fenêtre'));

    expect(push).toHaveBeenCalledWith([
      'trackEvent',
      'Je donne mon avis',
      'Link clicked',
      eventName,
    ]);
  });
});
