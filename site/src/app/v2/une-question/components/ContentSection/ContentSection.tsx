'use client';

import { Article, CategoryWithArticles } from '@/types/Faq';
import styles from './styles.module.scss';
import React from 'react';
import cn from 'classnames';
import Markdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import { useSearchParams } from 'next/navigation';
import { push } from '@socialgouv/matomo-next';
import Accordion from '@codegouvfr/react-dsfr/Accordion';

interface Props {
  categoriesWithArticles: CategoryWithArticles[];
  isFromMainPage: boolean;
}

export default function ContentSection({ categoriesWithArticles, isFromMainPage }: Props) {
  const searchParams = useSearchParams();
  const articleId = searchParams?.get('articleId') || null;
  let articleFromUrl: Article | null = null;

  // If there is an article id in the url
  // we need to set the selectedArticle and the selectedCategory associated to it
  if (articleId) {
    categoriesWithArticles.some((category) => {
      let articleFound = category.articles.find((article) => article.id === articleId);

      if (articleFound) {
        articleFromUrl = articleFound;

        // break out of loop if found
        return true;
      }

      return false;
    });
  }

  return (
    <div
      className={cn(styles['faq'], isFromMainPage ? styles['faq--from-main-page'] : '')}
      aria-live="polite"
    >
      {categoriesWithArticles.map((category: CategoryWithArticles) => (
        <section key={category.id} className="fr-mb-5w">
          <h2 className={cn('fr-h3', 'fr-m-0', 'fr-pb-2w', styles['faq__article-title'])}>
            {category.name}
          </h2>

          {category.articles.map((article) => (
            <Accordion
              key={article.id}
              label={article.title}
              defaultExpanded={articleFromUrl?.id === article.id}
              onExpandedChange={() => {
                push(['trackEvent', 'View FAQ', `Clicked`, `${article.title} (${article.id})`]);
              }}
            >
              <article
                id={article.id}
                className={cn('fr-px-6w', 'fr-pt-2w', styles['faq__accordion-expanded-container'])}
              >
                <Markdown remarkPlugins={[remarkBreaks]} className={styles['faq__markdown']}>
                  {article.content}
                </Markdown>

                <footer
                  className={cn(styles['faq__feedback-date'], 'fr-text--sm')}
                  suppressHydrationWarning
                >
                  Mis à jour le : {new Date(article.updatedAt).toLocaleDateString()}
                </footer>
              </article>
            </Accordion>
          ))}
        </section>
      ))}
    </div>
  );
}
