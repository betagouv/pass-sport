import type Crisp from 'crisp-api';
import type { HelpdeskPage, HelpdeskTreeEntry, HelpdeskTreeState } from 'crisp-api';

const directory = (slug: string, title: string): HelpdeskTreeEntry => ({
  type: 'directory',
  slug,
  title,
});

const file = (
  slug: string,
  title: string,
  state: HelpdeskTreeState = { published: true, hidden: false },
): HelpdeskTreeEntry => ({ type: 'file', slug, title, state });

// Pages of entries, keyed by sub path ('' being the root)
const TREE: Record<string, HelpdeskTreeEntry[][]> = {
  '': [
    [
      directory('beneficiaire-obtenir', 'Bénéficiaire - Obtenir le pass Sport'),
      directory('pro-partenaire', 'Pro - Être partenaire du pass Sport'),
    ],
    [directory('beneficiaire-vide', 'Bénéficiaire - Sécurité des données')],
  ],
  'beneficiaire-obtenir': [
    [
      file('suis-je-eligible.md', 'Suis-je éligible ?'),
      file('brouillon.md', 'Brouillon', { published: false, hidden: false }),
      file('masque.md', 'Masqué', { published: true, hidden: true }),
      directory('sous-dossier', 'Sous-dossier'),
    ],
    [file('faire-ma-demande.md', 'Comment faire ma demande ?')],
  ],
  'pro-partenaire': [[file('qui-sont-les-beneficiaires.md', 'Qui sont les bénéficiaires ?')]],
};

const PAGES: HelpdeskPage[] = [
  { entity_id: 'id-eligible', tree_path: 'beneficiaire-obtenir/suis-je-eligible.md' },
  { entity_id: 'id-demande', tree_path: 'beneficiaire-obtenir/faire-ma-demande.md' },
];

const website = {
  listHelpdeskTree: jest.fn(
    async (_: string, __: string, ___: string, pageNumber: number, subPath?: string) =>
      TREE[subPath ?? '']?.[pageNumber - 1] ?? [],
  ),
  listHelpdeskPages: jest.fn(async (_: string, __: string, ___: string, pageNumber: number) =>
    pageNumber === 1 ? PAGES : [],
  ),
  resolveHelpdeskTreeContent: jest.fn(async (_: string, __: string, ___: string, path: string) => ({
    content: `Contenu de ${path}`,
  })),
};
const crispClient = { website } as unknown as Crisp;

// Dynamic import: utils/faq holds a module-level cache, reset between tests
let faq: typeof import('@/utils/faq');

describe('getFormattedCategories', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();
    faq = await import('@/utils/faq');
  });

  it('returns the published articles of the matching non-empty categories, in Crisp order', async () => {
    const categories = await faq.getFormattedCategories({
      crispClient,
      crispIdentifier: 'website-id',
      categoryIdentifier: 'bénéficiaire -',
    });

    expect(categories).toEqual([
      {
        id: 'beneficiaire-obtenir',
        name: 'Obtenir le pass Sport',
        articles: [
          {
            id: 'id-eligible',
            title: 'Suis-je éligible ?',
            content: 'Contenu de beneficiaire-obtenir/suis-je-eligible.md',
          },
          {
            id: 'id-demande',
            title: 'Comment faire ma demande ?',
            content: 'Contenu de beneficiaire-obtenir/faire-ma-demande.md',
          },
        ],
      },
    ]);
  });

  it('falls back to the tree path when the article has no page entity', async () => {
    const [category] = await faq.getFormattedCategories({
      crispClient,
      crispIdentifier: 'website-id',
      categoryIdentifier: 'pro -',
    });

    expect(category.articles.map((article) => article.id)).toEqual([
      'pro-partenaire/qui-sont-les-beneficiaires.md',
    ]);
  });

  it('fetches the knowledge base once for every category identifier', async () => {
    await faq.getFormattedCategories({
      crispClient,
      crispIdentifier: 'website-id',
      categoryIdentifier: 'bénéficiaire -',
    });
    const callCount = website.resolveHelpdeskTreeContent.mock.calls.length;

    await faq.getFormattedCategories({
      crispClient,
      crispIdentifier: 'website-id',
      categoryIdentifier: 'pro -',
    });

    expect(website.resolveHelpdeskTreeContent).toHaveBeenCalledTimes(callCount);
  });

  it('rethrows Crisp errors without caching them', async () => {
    website.resolveHelpdeskTreeContent.mockRejectedValueOnce(new Error('Crisp is down'));
    const params = {
      crispClient,
      crispIdentifier: 'website-id',
      categoryIdentifier: 'bénéficiaire -',
    } as const;

    await expect(faq.getFormattedCategories(params)).rejects.toThrow('Crisp is down');
    await expect(faq.getFormattedCategories(params)).resolves.toHaveLength(1);
  });
});
