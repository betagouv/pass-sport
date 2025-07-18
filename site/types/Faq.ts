export type Article = {
  id: string;
  title: string;
  order: number;
  url: string;
  createdAt: number;
  updatedAt: number;
  content: string;
};

export type CategoryWithArticles = {
  id: string;
  name: string;
  articles: Article[];
  order: number; // 1 being the most important
};

export const CATEGORY_IDENTIFIERS = {
  PRO_CATEGORY_IDENTIFIER: 'pro -',
  USER_CATEGORY_IDENTIFIER: 'bénéficiaire -',
  BECOME_PARTNER_IDENTIFIER: 'devenez partenaire -',
  ABOUT_PASS_SPORT_IDENTIFIER: `qu'est ce que le pass Sport -`,
  PARTNERS_IDENTIFIER: 'structures partenaires -',
} as const;

// Equivalent to 'pro -' | 'bénéficiaire -' | 'devenez partenaire -' etc.
export type CATEGORY_IDENTIFIER_TYPE =
  (typeof CATEGORY_IDENTIFIERS)[keyof typeof CATEGORY_IDENTIFIERS];
