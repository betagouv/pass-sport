import Crisp, { HelpdeskContentType, type HelpdeskTreeEntry } from 'crisp-api';
import type { Article, CATEGORY_IDENTIFIER_TYPE, CategoryWithArticles } from '@/types/Faq';
import NodeCache from 'node-cache';

const LOCALE = 'fr';
const CONTENT_TYPE = HelpdeskContentType.Articles;

const CACHE_DURATION = 7_200; // 2 hours in seconds
const CHECK_PERIOD = 3_600; // 1 hour in seconds
const CACHE_KEY = 'KNOWLEDGE-BASE';
const MAX_PAGES = 20; // guards against a listing that never returns an empty page

const cache = new NodeCache({
  checkperiod: CHECK_PERIOD,
  deleteOnExpire: true,
  stdTTL: CACHE_DURATION,
});

type NamedTreeEntry = HelpdeskTreeEntry & { slug: string; title: string };

const isDirectory = (entry: HelpdeskTreeEntry): entry is NamedTreeEntry =>
  entry.type === 'directory' && !!entry.slug && !!entry.title;

const isPublishedFile = (entry: HelpdeskTreeEntry): entry is NamedTreeEntry =>
  entry.type === 'file' &&
  !!entry.slug &&
  !!entry.title &&
  entry.state?.published === true &&
  !entry.state.hidden;

// Crisp listings are paginated, an empty page marks the end
async function listAllPages<T>(listPage: (pageNumber: number) => Promise<T[]>): Promise<T[]> {
  const entries: T[] = [];

  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
    const page = await listPage(pageNumber);

    if (!page?.length) break;

    entries.push(...page);
  }

  return entries;
}

// Top-level directories of the knowledge base are the FAQ categories, their published files the
// articles, both in the order set in Crisp
async function getKnowledgeBase(
  crispClient: Crisp,
  crispIdentifier: string,
): Promise<CategoryWithArticles[]> {
  const cachedCategories = cache.get<CategoryWithArticles[]>(CACHE_KEY);

  if (cachedCategories) return cachedCategories;

  const listTree = (subPath?: string) =>
    listAllPages((pageNumber) =>
      crispClient.website.listHelpdeskTree(
        crispIdentifier,
        LOCALE,
        CONTENT_TYPE,
        pageNumber,
        subPath,
      ),
    );

  const [rootEntries, pages] = await Promise.all([
    listTree(),
    listAllPages((pageNumber) =>
      crispClient.website.listHelpdeskPages(crispIdentifier, LOCALE, CONTENT_TYPE, pageNumber),
    ),
  ]);
  const entityIdByTreePath = new Map(pages.map((page) => [page.tree_path, page.entity_id]));

  const categories = await Promise.all(
    rootEntries.filter(isDirectory).map(async (directory) => {
      const files = (await listTree(directory.slug)).filter(isPublishedFile);

      const articles = await Promise.all(
        files.map(async (file): Promise<Article> => {
          const treePath = `${directory.slug}/${file.slug}`;
          const { content } = await crispClient.website.resolveHelpdeskTreeContent(
            crispIdentifier,
            LOCALE,
            CONTENT_TYPE,
            treePath,
          );

          return {
            id: entityIdByTreePath.get(treePath) ?? treePath,
            title: file.title,
            content: content ?? '',
          };
        }),
      );

      return { id: directory.slug, name: directory.title, articles };
    }),
  );

  cache.set(CACHE_KEY, categories);

  return categories;
}

export async function getFormattedCategories({
  crispClient,
  crispIdentifier,
  categoryIdentifier,
}: {
  crispClient: Crisp;
  crispIdentifier: string;
  categoryIdentifier: CATEGORY_IDENTIFIER_TYPE;
}): Promise<CategoryWithArticles[]> {
  const categories = await getKnowledgeBase(crispClient, crispIdentifier);

  return categories
    .filter(
      (category) =>
        category.articles.length > 0 && category.name.toLowerCase().includes(categoryIdentifier),
    )
    .map((category) => ({
      ...category,
      name: stripCategoryIdentifier(category.name, categoryIdentifier),
    }));
}

function stripCategoryIdentifier(title: string, categoryIdentifier: CATEGORY_IDENTIFIER_TYPE) {
  if (title.toLowerCase().startsWith(categoryIdentifier)) {
    return title.slice(categoryIdentifier.length).trim();
  }

  return title;
}
