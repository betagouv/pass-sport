export interface SportGouvJSONRecordsResponse {
  results: Club[];
  total_count: number;
}

export interface SportGouvJSONExportsResponse {
  results: ExportedClub[];
  total_count: number;
}

type YesNo = 'Oui' | 'Non';

export interface Club {
  nom: string;
  cp: string;
  activites: string[];
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

export interface ExportedClub {
  nom: Club['nom'];
  geoloc_finale: Club['geoloc_finale'];
}

export interface Activity {
  activites: string;
}

export interface ActivityResponse {
  results: Activity[];
}
