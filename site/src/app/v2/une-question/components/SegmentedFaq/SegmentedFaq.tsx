'use client';

import styles from './styles.module.scss';
import { SegmentedControl } from '@codegouvfr/react-dsfr/SegmentedControl';
import { useState } from 'react';
import ContentSection from '@/app/v2/une-question/components/ContentSection/ContentSection';
import { CategoryWithArticles } from '@/types/Faq';
import { useRouter } from 'next/navigation';
import { FAQ_PAGE_QUERY_PARAMS } from '@/app/constants/search-query-params';
import { DISPLAY_TYPE } from '@/app/constants/display-type';

type SegementedFaqProps = {
  benefArticles: CategoryWithArticles[];
  proArticles: CategoryWithArticles[];
  displayType: DISPLAY_TYPE;
};

export default function SegmentedFaq({
  benefArticles,
  proArticles,
  displayType: displayTypeParam,
}: SegementedFaqProps) {
  const router = useRouter();
  const [displayType, setDisplayType] = useState<DISPLAY_TYPE>(displayTypeParam);

  return (
    <section className={styles.main}>
      <SegmentedControl
        hideLegend
        classes={{
          elements: styles.elements,
          'element-each': styles['element-each'],
          'element-each__label': styles['element-each__label'],
        }}
        segments={[
          {
            label: 'Jeunes et parents',
            nativeInputProps: {
              'aria-label': 'Afficher les articles dédiés aux jeunes et parents',
              defaultChecked: displayType === DISPLAY_TYPE.BENEF,
              onClick: () => {
                setDisplayType(DISPLAY_TYPE.BENEF);
                router.replace(`?${FAQ_PAGE_QUERY_PARAMS.displayType}=${DISPLAY_TYPE.BENEF}`, {
                  scroll: false,
                });
              },
            },
          },
          {
            label: 'Structures sportives',
            nativeInputProps: {
              'aria-label': 'Afficher les articles dédiés aux structures sportives',
              defaultChecked: displayType === DISPLAY_TYPE.PRO,
              onClick: () => {
                setDisplayType(DISPLAY_TYPE.PRO);
                router.replace(`?${FAQ_PAGE_QUERY_PARAMS.displayType}=${DISPLAY_TYPE.PRO}`, {
                  scroll: false,
                });
              },
            },
          },
        ]}
      />

      {displayType === DISPLAY_TYPE.BENEF && (
        <ContentSection categoriesWithArticles={benefArticles} isFromMainPage />
      )}

      {displayType === DISPLAY_TYPE.PRO && (
        <ContentSection categoriesWithArticles={proArticles} isFromMainPage />
      )}
    </section>
  );
}
