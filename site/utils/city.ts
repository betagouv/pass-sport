import { City } from 'types/City';

// "#61157": a hidden lookup by INSEE code, for support staff. Without the "#", a 5-digit query
// would also be read as a code and show someone typing their postal code a different commune.
const INSEE_CODE_QUERY = /^#\s*(\d{5}|2[AB]\d{3})$/i;

export const parseInseeCodeQuery = (query: string): string | null =>
  query.trim().match(INSEE_CODE_QUERY)?.[1]?.toUpperCase() ?? null;

const parseDistrict = (inutValue: string) => {
  const result = inutValue.toLowerCase().match(/(marseille|paris|lyon)\s(\d+)/);
  if (!result) {
    return null;
  }

  return { city: result[1], district: result[2] };
};

// Current communes first, then former ones, each alphabetically.
const sortCitiesAlphabetically = (cities: City[]): City[] =>
  cities.sort((a: City, b: City) => {
    const formerDiff = Number(Boolean(a.communeActuelle)) - Number(Boolean(b.communeActuelle));
    if (formerDiff !== 0) {
      return formerDiff;
    }
    if (a.nom < b.nom) {
      return -1;
    }
    if (a.nom > b.nom) {
      return 1;
    }
    return 0;
  });

export const sortCities = (cities: City[], inputValue: string): City[] => {
  const matchingDistrict = parseDistrict(inputValue);

  if (!matchingDistrict) {
    return sortCitiesAlphabetically(cities);
  }

  let firstCity = cities.find((city) => city.nom.match(' ' + matchingDistrict.district + 'e'));
  if (!firstCity) {
    return sortCitiesAlphabetically(cities);
  }

  let remainingCities = cities.filter((city) => city.code !== firstCity!.code);
  return [firstCity].concat(sortCitiesAlphabetically(remainingCities));
};

// "Exmes → Gouffern en Auge (61)" for a former commune, plus the code on an INSEE code lookup.
export const cityOptionLabel = (city: City, searchTerm: string): string => {
  const name = city.communeActuelle ? `${city.nom} → ${city.communeActuelle.nom}` : city.nom;
  const searchedCode = parseInseeCodeQuery(searchTerm);
  const codeSuffix = searchedCode ? ` · INSEE ${searchedCode}` : '';

  return `${name} (${city.codeDepartement})${codeSuffix}`;
};
