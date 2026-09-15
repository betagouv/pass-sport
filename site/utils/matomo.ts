import { push } from '@socialgouv/matomo-next';
import type { MatomoCategory } from './matomo-category';

export { MATOMO_CATEGORY } from './matomo-category';
export type { MatomoCategory } from './matomo-category';

export const trackEvent = (
  category: MatomoCategory,
  action: string,
  name?: string,
  value?: number,
) => {
  push(['trackEvent', category, action, name, value]);
};

export const trackSiteSearch = (keyword: string, category: string, resultsCount: number) => {
  push(['trackSiteSearch', keyword, category, resultsCount]);
};
