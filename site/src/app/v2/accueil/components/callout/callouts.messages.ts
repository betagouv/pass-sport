import { TOTAL_CLUBS_PARTNERS } from '@/app/constants/wordings';

export interface CalloutContent {
  id: number;
  title: string;
  description: string;
}

export const calloutContents = [
  {
    id: 1,
    title: '1 649 430 ',
    description: 'Jeunes inscrits',
  },
  {
    id: 2,
    title: TOTAL_CLUBS_PARTNERS,
    description: 'Clubs labélisés',
  },
  {
    id: 3,
    title: '1 005 847 ',
    description: 'Garçons',
  },
  {
    id: 4,
    title: '643 583 ',
    description: 'Filles',
  },
];
