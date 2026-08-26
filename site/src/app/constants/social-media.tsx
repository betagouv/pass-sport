export interface SocialMediaLinkData {
  label: 'Instagram' | 'TikTok';
  href: string;
  id: number;
  iconClassName: string;
}

export const socialMedia: SocialMediaLinkData[] = [
  {
    id: 1,
    label: 'Instagram',
    href: 'https://www.instagram.com/passsportofficiel/',
    iconClassName: 'fr-icon-instagram-line',
  },
];
