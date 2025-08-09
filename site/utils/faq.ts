import Crisp from 'crisp-api';
import { CrispArticle, CrispCategory, CrispFullArticle } from '@/types/Crisp';
import { Article, CATEGORY_IDENTIFIER_TYPE, CategoryWithArticles } from '@/types/Faq';
import NodeCache from 'node-cache';

type Locale = 'fr' | 'en';
const LOCALE = 'fr';

const CACHE_DURATION = 7_200; // 2 hours in seconds
const CHECK_PERIOD = 3_600; // 1 hour in seconds
const HIGHEST_ORDER = 999; // the articles/categories that have this order will be displayed last

const cache = new NodeCache({
  checkperiod: CHECK_PERIOD,
  deleteOnExpire: true,
  stdTTL: CACHE_DURATION,
});

export enum CacheKey {
  ARTICLES = 'ARTICLES',
  FULL_ARTICLE = 'FULL-ARTICLE',
}

export async function getFormattedCategories({
  crispClient,
  articles,
  crispIdentifier,
  categoryIdentifier,
}: {
  crispClient: Crisp;
  articles: CrispArticle[];
  crispIdentifier: string;
  categoryIdentifier: CATEGORY_IDENTIFIER_TYPE;
}): Promise<CategoryWithArticles[]> {
  const categories = new Map<string, CategoryWithArticles>();
  const fullArticlePromises = articles
    .filter((article) => article.category?.category_id)
    .map((article, _) =>
      getCrispFullArticle({
        crispClient,
        articleId: article.article_id,
        crispIdentifier,
        locale: LOCALE,
      })
        .then((fullArticle) => ({
          article,
          fullArticle,
        }))
        .catch(() => {
          return {
            article: null,
            fullArticle: null,
          };
        }),
    );

  const fullArticles = await Promise.all(fullArticlePromises);
  const fullListOfCategories = await getCrispCategories({ crispClient, crispIdentifier });

  fullArticles
    .filter(
      ({ article, fullArticle }) =>
        article !== null && fullArticle !== null && fullArticle?.visibility === 'visible',
    )
    .forEach(({ article, fullArticle }) => {
      // Type narrowing despite filter above
      if (!article || !fullArticle || !article.category) return;

      const isWithinCategory = article.category?.name.toLowerCase().includes(categoryIdentifier);

      if (!isWithinCategory) return;

      // category cannot be null with the code above that does the filtering
      const categoryId = article.category.category_id;

      const formattedArticle = getFormattedArticleWithContent(article, fullArticle.content);
      const category = categories.get(categoryId);

      if (category) {
        category.articles.push(formattedArticle);
      } else {
        categories.set(categoryId, {
          id: categoryId,
          order:
            fullListOfCategories.find((category) => category.category_id === categoryId)?.order ||
            HIGHEST_ORDER,
          // category cannot be null with the code above that does the filtering
          name: stripCategoryIdentifier(article.category.name, categoryIdentifier),
          articles: [formattedArticle],
        });
      }
    });

  // Sort categories & articles by order
  return Array.from(categories.values())
    .sort((categoryA, categoryB) => categoryA.order - categoryB.order)
    .map((category) => ({
      ...category,
      articles: category.articles.sort((a, b) => a.order - b.order),
    }));
}

export async function getCrispCategories({
  crispClient,
  crispIdentifier,
  locale = LOCALE,
}: {
  crispClient: Crisp;
  crispIdentifier: string;
  locale?: Locale;
}): Promise<CrispCategory[]> {
  try {
    return crispClient.website.listHelpdeskLocaleCategories(crispIdentifier, locale);
  } catch (err) {
    console.error('Error while trying to get list of categories', err);
    return [];
  }
}

// Get list of articles, but these don't contain the "content" attribute
export async function getCrispArticles({
  crispClient,
  crispIdentifier,
  locale = LOCALE,
}: {
  crispClient: Crisp;
  crispIdentifier: string;
  locale?: Locale;
}): Promise<CrispArticle[]> {
  try {
    let articles: CrispArticle[] | undefined = cache.get(CacheKey.ARTICLES);

    if (articles === undefined) {
      articles = (await crispClient.website.listHelpdeskLocaleArticles(
        crispIdentifier,
        locale,
      )) as CrispArticle[];

      cache.set(CacheKey.ARTICLES, articles);
    }

    return articles;
  } catch (err) {
    console.error('Error occured while trying to get list of articles', err);

    return [];
  }
}

// Get a full article that contains the "content" attribute
export async function getCrispFullArticle({
  crispClient,
  articleId,
  crispIdentifier,
  locale = LOCALE,
}: {
  crispClient: Crisp;
  articleId: string;
  crispIdentifier: string;
  locale?: Locale;
}) {
  const cacheKey = `${CacheKey.FULL_ARTICLE}-${articleId}`;
  let fullArticle: CrispFullArticle | undefined = cache.get(cacheKey);

  if (fullArticle === undefined) {
    fullArticle = await crispClient.website.resolveHelpdeskLocaleArticle(
      crispIdentifier,
      locale,
      articleId,
    );

    cache.set(cacheKey, fullArticle);
  }

  return fullArticle;
}

export function getFormattedArticleWithContent(article: CrispArticle, content: string): Article {
  return {
    id: article.article_id,
    title: article.title,
    order: article.order || HIGHEST_ORDER,
    url: article.url,
    createdAt: article.created_at,
    updatedAt: article.updated_at,
    content,
  };
}

function stripCategoryIdentifier(title: string, categoryIdentifier: CATEGORY_IDENTIFIER_TYPE) {
  if (title.toLowerCase().startsWith(categoryIdentifier)) {
    const regex = new RegExp(categoryIdentifier, 'gi');

    return title.replace(regex, '').trim();
  }

  return title;
}
