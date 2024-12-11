import { push } from '@socialgouv/matomo-next';

export function trackRedirectionToPassSportForm() {
  push(['trackEvent', 'Test eligibilite base', 'Clicked', 'Redirection to pass Sport form']);
}

// BFC = Bourgogne Franche Comté
export function isSanitairesAndSociauxBoursiersBFC(matricule: string) {
  return /^D24-[0-9]{6}$/.test(matricule);
}
