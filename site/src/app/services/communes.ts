import communesData from '@/data/communes.json';
import { City, type CommuneSearchOptions } from '@/types/City';
import { parseInseeCodeQuery } from '@/utils/city';

export interface RawCommune {
  code: string;
  nom: string;
  codesPostaux: string[];
  codeDepartement: string;
  isDistrict: boolean;
  // Arrondissements only: the code of Paris, Lyon or Marseille.
  codeParent?: string;
  // Codes this commune held before (department change, merger…), which partners may still use.
  codesHistoriques?: string[];
  // Former communes only: the current commune they now belong to.
  communeActuelle?: { code: string; nom: string };
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

const toPublicCity = ({
  nom,
  code,
  codesPostaux,
  codeDepartement,
  communeActuelle,
}: RawCommune): City => ({
  nom,
  code,
  codesPostaux,
  codeDepartement,
  ...(communeActuelle ? { communeActuelle } : {}),
});

const matchesQuery = (queryTokens: string[], commune: IndexedCommune): boolean =>
  queryTokens.every((queryToken) =>
    commune.nameTokens.some((communeToken) => tokenMatches(queryToken, communeToken)),
  );

// Ranks a commune whose first name token starts with a query token above the rest — a
// population-free stand-in for the `boost=population` ordering the external API provided
// (dropped: the embedded CSV carries no population figure). Current communes come before
// former ones, then ties break alphabetically.
const sortByRelevance = (queryTokens: string[]) => (a: IndexedCommune, b: IndexedCommune) => {
  const rank = (commune: IndexedCommune) =>
    queryTokens.some((queryToken) => commune.nameTokens[0]?.startsWith(queryToken)) ? 0 : 1;
  const formerRank = (commune: IndexedCommune) => (commune.raw.communeActuelle ? 1 : 0);

  return rank(a) - rank(b) || formerRank(a) - formerRank(b) || a.raw.nom.localeCompare(b.raw.nom);
};

const unique = (codes: (string | undefined)[]): string[] =>
  Array.from(new Set(codes.filter((code): code is string => Boolean(code))));

export const createCommuneSearch = (rawCommunes: RawCommune[]) => {
  const index: IndexedCommune[] = rawCommunes.map((raw) => ({
    raw,
    nameTokens: tokenize(raw.nom),
  }));

  const districtParentCodes = new Set(
    rawCommunes.map(({ codeParent }) => codeParent).filter(Boolean),
  );

  const currentByCode = new Map<string, RawCommune>();
  const formerByCode = new Map<string, RawCommune>();
  for (const raw of rawCommunes) {
    const byCode = raw.communeActuelle ? formerByCode : currentByCode;
    if (!byCode.has(raw.code)) {
      byCode.set(raw.code, raw);
    }
  }

  const isAllowed =
    ({
      includeDistricts,
      includeFormer = false,
      excludeDistrictParents = false,
    }: CommuneSearchOptions) =>
    ({ raw }: IndexedCommune): boolean =>
      (includeDistricts || !raw.isDistrict) &&
      (includeFormer || !raw.communeActuelle) &&
      !(excludeDistrictParents && !raw.communeActuelle && districtParentCodes.has(raw.code));

  const searchCommunesByInseeCode = (code: string, options: CommuneSearchOptions): City[] =>
    index
      .filter(isAllowed(options))
      .filter(({ raw }) => raw.code === code || raw.codesHistoriques?.includes(code))
      .sort(sortByRelevance([]))
      .map(({ raw }) => toPublicCity(raw));

  const searchCommunesByName = (query: string, options: CommuneSearchOptions): City[] => {
    const inseeCode = parseInseeCodeQuery(query);
    if (inseeCode) {
      return searchCommunesByInseeCode(inseeCode, options);
    }

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    return index
      .filter(isAllowed(options))
      .filter((commune) => matchesQuery(queryTokens, commune))
      .sort(sortByRelevance(queryTokens))
      .slice(0, MAX_RESULTS_BY_NAME)
      .map(({ raw }) => toPublicCity(raw));
  };

  const searchCommunesByPostalCodeAndName = (
    postalCode: string,
    query: string,
    options: CommuneSearchOptions,
  ): City[] => {
    const queryTokens = tokenize(query);

    return index
      .filter(isAllowed(options))
      .filter((commune) => commune.raw.codesPostaux.includes(postalCode))
      .filter((commune) => queryTokens.length === 0 || matchesQuery(queryTokens, commune))
      .sort(sortByRelevance(queryTokens))
      .slice(0, MAX_RESULTS_BY_POSTAL_CODE)
      .map(({ raw }) => toPublicCity(raw));
  };

  // The INSEE codes to try, in order, for the commune the usager picked. LCA mostly holds the
  // current code, so it comes first; the rest are codes some partners still use for the same
  // place. A current code is never expanded to all its délégués or arrondissements, which
  // could mean 20+ LCA calls.
  const lcaCandidateCodes = (code: string): string[] => {
    const current = currentByCode.get(code);
    if (current) {
      return unique([code, current.codeParent, ...(current.codesHistoriques ?? [])]);
    }

    const former = formerByCode.get(code);
    if (former?.communeActuelle) {
      return unique([former.communeActuelle.code, code, ...(former.codesHistoriques ?? [])]);
    }

    return [code];
  };

  return { searchCommunesByName, searchCommunesByPostalCodeAndName, lcaCandidateCodes };
};

const communeSearch = createCommuneSearch(communesData as RawCommune[]);

export const searchCommunesByName = communeSearch.searchCommunesByName;
export const searchCommunesByPostalCodeAndName = communeSearch.searchCommunesByPostalCodeAndName;
export const lcaCandidateCodes = communeSearch.lcaCandidateCodes;
