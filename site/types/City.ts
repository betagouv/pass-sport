export interface City {
  nom: string;
  code: string;
  codesPostaux: string[];
  codeDepartement: string;
  // Set on former communes: the current commune they were merged into.
  communeActuelle?: { code: string; nom: string };
}

export interface CommuneSearchOptions {
  includeDistricts: boolean;
  includeFormer?: boolean;
  excludeDistrictParents?: boolean;
}

export interface CityWithPostalCode {
  nom: string;
  code: string;
  postalCode: string;
}
