export interface City {
  nom: string;
  code: string;
  codesPostaux: string[];
  codeDepartement: string;
}

export interface CityWithPostalCode {
  nom: string;
  code: string;
  postalCode: string;
}
