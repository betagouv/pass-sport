export const MATOMO_CATEGORY = {
  franceConnectRequest: 'Demande FC',
  nonFranceConnectRequest: 'Demande hors FC',
  simplifiedTest: 'Test simplifié',
  clubFinder: 'Trouver un club',
  contact: 'Contact',
  faq: 'FAQ',
} as const;

export type MatomoCategory = (typeof MATOMO_CATEGORY)[keyof typeof MATOMO_CATEGORY];
