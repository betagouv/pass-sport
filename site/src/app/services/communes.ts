import communesData from '@/data/communes.json';
import { City } from '@/types/City';

interface RawCommune {
  code: string;
  nom: string;
  codesPostaux: string[];
  codeDepartement: string;
  isDistrict: boolean;
}

const MAX_RESULTS_BY_NAME = 30;
const MAX_RESULTS_BY_POSTAL_CODE = 20;

const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '');

const normalize = (value: string): string => stripAccents(value).toLowerCase();

const tokenize = (value: string): string[] =>
  normalize(value)
    .split(/[\s'’-]+/)
    .filter(Boolean);

// French ordinal suffixes people type when searching an arrondissement, e.g. "2eme"/"2ème" for
// the official "2e", or "1ere"/"1ère" for "1er". A plain prefix match can't recognise these as
// the same district, because the typed suffix is longer than the official one ("2eme" is not a
// prefix of "2e") — so numeric-looking tokens are compared by their bare number instead.
const ORDINAL_TOKEN = /^(\d+)(er|ere|ère|eme|ème|ieme|ième|e)?$/i;

const ordinalNumber = (token: string): string | null => {
  const match = token.match(ORDINAL_TOKEN);
  return match ? match[1] : null;
};

const tokenMatches = (queryToken: string, communeToken: string): boolean => {
  if (communeToken.startsWith(queryToken)) {
    return true;
  }
  const queryNumber = ordinalNumber(queryToken);
  return queryNumber !== null && queryNumber === ordinalNumber(communeToken);
};

interface IndexedCommune {
  raw: RawCommune;
  nameTokens: string[];
}

const toPublicCity = ({ nom, code, codesPostaux, codeDepartement }: RawCommune): City => ({
  nom,
  code,
  codesPostaux,
  codeDepartement,
});

const matchesQuery = (queryTokens: string[], commune: IndexedCommune): boolean =>
  queryTokens.every((queryToken) =>
    commune.nameTokens.some((communeToken) => tokenMatches(queryToken, communeToken)),
  );

// Ranks a commune whose first name token starts with a query token above the rest — a
// population-free stand-in for the `boost=population` ordering the external API provided
// (dropped: the embedded CSV carries no population figure). Ties break alphabetically.
const sortByRelevance = (queryTokens: string[]) => (a: IndexedCommune, b: IndexedCommune) => {
  const rank = (commune: IndexedCommune) =>
    queryTokens.some((queryToken) => commune.nameTokens[0]?.startsWith(queryToken)) ? 0 : 1;

  const rankDiff = rank(a) - rank(b);
  return rankDiff !== 0 ? rankDiff : a.raw.nom.localeCompare(b.raw.nom);
};

export const createCommuneSearch = (rawCommunes: RawCommune[]) => {
  const index: IndexedCommune[] = rawCommunes.map((raw) => ({
    raw,
    nameTokens: tokenize(raw.nom),
  }));

  const searchCommunesByName = (query: string, includeDistricts: boolean): City[] => {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    return index
      .filter((commune) => includeDistricts || !commune.raw.isDistrict)
      .filter((commune) => matchesQuery(queryTokens, commune))
      .sort(sortByRelevance(queryTokens))
      .slice(0, MAX_RESULTS_BY_NAME)
      .map(({ raw }) => toPublicCity(raw));
  };

  const searchCommunesByPostalCodeAndName = (
    postalCode: string,
    query: string,
    includeDistricts: boolean,
  ): City[] => {
    const queryTokens = tokenize(query);

    return index
      .filter((commune) => includeDistricts || !commune.raw.isDistrict)
      .filter((commune) => commune.raw.codesPostaux.includes(postalCode))
      .filter((commune) => queryTokens.length === 0 || matchesQuery(queryTokens, commune))
      .sort(sortByRelevance(queryTokens))
      .slice(0, MAX_RESULTS_BY_POSTAL_CODE)
      .map(({ raw }) => toPublicCity(raw));
  };

  return { searchCommunesByName, searchCommunesByPostalCodeAndName };
};

const communeSearch = createCommuneSearch(communesData as RawCommune[]);

export const searchCommunesByName = communeSearch.searchCommunesByName;
export const searchCommunesByPostalCodeAndName = communeSearch.searchCommunesByPostalCodeAndName;
