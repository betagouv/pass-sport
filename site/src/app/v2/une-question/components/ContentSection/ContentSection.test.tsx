import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { push } from '@socialgouv/matomo-next';
import ContentSection from '@/app/v2/une-question/components/ContentSection/ContentSection';
import type { CategoryWithArticles } from '@/types/Faq';

jest.mock('@socialgouv/matomo-next', () => ({ push: jest.fn() }));
jest.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => children,
}));
jest.mock('remark-breaks', () => ({ __esModule: true, default: () => undefined }));

const CATEGORIES: CategoryWithArticles[] = [
  {
    id: 'category-1',
    name: 'Obtenir son code',
    order: 1,
    articles: [
      {
        id: 'article-1',
        title: 'Comment obtenir mon code ?',
        order: 1,
        url: '',
        createdAt: 0,
        updatedAt: 0,
        content: 'En faisant une demande sur le site.',
      },
    ],
  },
];

describe('ContentSection', () => {
  it('reports a question when it is opened, not when it is closed', () => {
    render(<ContentSection categoriesWithArticles={CATEGORIES} isFromMainPage />);
    const question = screen.getByRole('button', { name: 'Comment obtenir mon code ?' });

    fireEvent.click(question);
    fireEvent.click(question);

    expect(jest.mocked(push).mock.calls).toEqual([
      [['trackEvent', 'View FAQ', 'Clicked', 'Comment obtenir mon code ? (article-1)']],
    ]);
  });
});
