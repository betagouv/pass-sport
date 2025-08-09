'use server';

import { getCrispArticles, getFormattedCategories } from '@/utils/faq';
import { initCrispClient } from '@/utils/crisp';
import * as Sentry from '@sentry/nextjs';
import { CATEGORY_IDENTIFIER_TYPE, CategoryWithArticles } from '@/types/Faq';

const {
  envVars: { CRISP_WEBSITE },
  crispClient,
} = initCrispClient();

export const getCategoriesWithArticles = async ({
  categoryIdentifier,
}: {
  categoryIdentifier: CATEGORY_IDENTIFIER_TYPE;
}): Promise<CategoryWithArticles[]> => {
  try {
    const articles = await getCrispArticles({
      crispClient,
      crispIdentifier: CRISP_WEBSITE,
    });

    return getFormattedCategories({
      crispClient,
      crispIdentifier: CRISP_WEBSITE,
      articles,
      categoryIdentifier,
    });
  } catch (err) {
    Sentry.withScope((scope) => {
      scope.captureException(err);
      scope.setLevel('error');
      scope.captureMessage('Error occurred while trying to get articles from CRISP');
    });

    return [];
  }
};
