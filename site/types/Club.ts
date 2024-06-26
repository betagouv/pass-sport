export interface SportGouvJSONResponse {
  results: Club[];
  total_count: number;
}

type YesNo = 'Oui' | 'Non';

export interface Club {
  nom: string;
  cplt_1: string | null;
  cp: string;
  activites: string[] | null;
  adresse: string | null;
  com_arm_name: string;
  handicap: YesNo;
  cedex: string | null;
  commune: string | null;
  telephone: string | null;
  courriel: string | null;
  a_accueil_handicap_mental: YesNo | null;
  a_accueil_handicap_moteur: YesNo | null;
  geoloc_finale: {
    lon: number;
    lat: number;
  } | null;
}

export interface Activity {
  activites: string;
}

export interface ActivityResponse {
  results: Activity[];
}
