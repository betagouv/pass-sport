// Response payload types for API Particulier v3 (@api-gouv-dinum/api-particulier).
// The SDK types methods/params but returns `Response.data` as `unknown`; these interfaces
// describe the `data` envelope field per resource, derived from the official OpenAPI spec
// (datagouv/apistration: commons/swagger/openapi-particulier.yaml).
//
// NOTE: shapes correspond to the v3 endpoints (the SDK default). Some providers expose
// later versions (e.g. CNOUS v4, MEN v4/v5) with extra fields — pass `version` to the SDK
// method and extend the matching interface if you target those.

export interface ApiParticulierAdresse {
  destinataire?: string;
  complement_information?: string;
  complement_information_geographique?: string;
  numero_libelle_voie?: string;
  lieu_dit?: string;
  code_postal_ville?: string;
  pays?: string;
}

interface PersonneQuotientFamilial {
  nom_naissance?: string;
  nom_usage?: string;
  prenoms?: string;
  date_naissance?: string;
  sexe?: string;
}

interface PersonneEaje extends PersonneQuotientFamilial {
  code_cog_insee_commune_naissance?: string;
}

// dss.quotient_familial_identite / _france_connect
export interface QuotientFamilialData {
  allocataires: PersonneQuotientFamilial[];
  enfants: PersonneQuotientFamilial[];
  adresse: ApiParticulierAdresse;
  quotient_familial: {
    fournisseur?: string;
    valeur: number;
    annee: number;
    mois: number;
    annee_calcul?: number;
    mois_calcul?: number;
  };
}

// dss.participation_familiale_eaje_identite / _france_connect
export interface ParticipationFamilialeEajeData {
  allocataires: PersonneEaje[];
  enfants: PersonneEaje[];
  adresse: ApiParticulierAdresse;
  parametres_calcul_participation_familiale: {
    nombre_enfants_a_charge?: number;
    nombre_enfants_beneficiaire_aeeh?: number;
    base_ressources_annuelles?: {
      valeur?: number;
      annee_calcul?: number;
    };
  };
}

// dss.allocation_adulte_handicape_* (AAH) and allocation_soutien_familial_* (ASF)
export interface StatutBeneficiaireData {
  est_beneficiaire: boolean;
  date_debut_droit?: string;
}

// dss.allocation_enfant_handicape_* (AEEH)
export interface AllocationEnfantHandicapeData {
  status: string;
  date_debut_droit?: string;
}

// dss.complementaire_sante_solidaire_* (C2S)
export interface ComplementaireSanteSolidaireData {
  est_beneficiaire: boolean;
  avec_participation?: boolean;
  date_debut_droit?: string;
}

// dss.prime_activite_* and revenu_solidarite_active_* (RSA)
export interface PrestationAvecMajorationData {
  est_beneficiaire: boolean;
  avec_majoration?: boolean;
  date_debut_droit?: string;
}

// cnous.etudiant_boursier_identite / _france_connect / ine (v3)
export interface EtudiantBoursierData {
  est_boursier: boolean;
  email?: string;
  periode_versement_bourse?: {
    date_rentree?: string;
    duree?: number;
  };
  etablissement_etudes?: {
    nom_commune?: string;
    nom_etablissement?: string;
  };
  echelon_bourse?: {
    echelon?: string;
    echelon_bourse_regionale_provisoire?: boolean;
  };
  identite?: {
    nom?: string;
    prenoms?: string[];
    date_naissance?: string;
    nom_commune_naissance?: string;
    sexe?: string;
  };
}

// dsnj.service_national_*
export interface ServiceNationalData {
  statut_service_national: string;
  commentaires?: string;
}

// france_travail.indemnites
export interface FranceTravailIndemnitesData {
  identifiant?: string;
  paiements: {
    date_versement?: string;
    montant_total?: number;
    montant_allocations?: number;
    montant_aides?: number;
    montant_autres?: number;
  }[];
}

// france_travail.statut
export interface FranceTravailStatutData {
  identifiant?: string;
  identite?: {
    civilite?: string;
    nom_naissance?: string;
    nom_usage?: string;
    prenom?: string;
    sexe?: string;
    date_naissance?: string;
  };
  contact?: {
    telephone?: string;
    telephone2?: string;
    email?: string;
  };
  adresse?: {
    code_postal?: string;
    code_cog_insee_commune?: string;
    localite?: string;
    ligne_voie?: string;
    ligne_complement_destinataire?: string;
    ligne_complement_adresse?: string;
    ligne_complement_distribution?: string;
    ligne_nom?: string;
  };
  inscription?: {
    date_debut?: string;
    date_fin?: string;
    categorie?: { code?: number; libelle?: string };
    code_certification_cnav?: string;
  };
}

// gip_mds.service_civique_*
interface ServiceCiviqueContrat {
  contrat_trouve: boolean;
  organisme_accueil?: { siret?: string; raison_sociale?: string };
  date_debut_contrat?: string;
  date_fin_contrat?: string;
}
export interface ServiceCiviqueData {
  statut_actuel?: ServiceCiviqueContrat;
  statut_passe?: ServiceCiviqueContrat;
}

// men.scolarites_identite (v3)
export interface ScolaritesData {
  identite?: { nom?: string; prenom?: string; sexe?: string; date_naissance?: string };
  module_elementaire_formation?: { code_mef_stat?: string; libelle?: string };
  etablissement?: { code_uai?: string; code_ministere_tutelle?: string };
  annee_scolaire?: string;
  est_scolarise: boolean;
  statut_eleve?: { code?: string; libelle?: string };
  est_boursier?: boolean;
  echelon_bourse?: number;
}

// mesri.statut_etudiant_* / ine
export interface StatutEtudiantData {
  admissions: {
    date_debut?: string;
    date_fin?: string;
    est_inscrit?: boolean;
    regime_formation?: { libelle?: string; code?: string };
    code_cog_insee_commune?: string;
    etablissement_etudes?: { uai?: string; nom?: string };
  }[];
  identite?: { nom_naissance?: string; prenom?: string; date_naissance?: string };
}

// ants.extrait_immatriculation_vehicule
export interface ExtraitImmatriculationData {
  [key: string]: unknown;
}

// sdh.statut_sportif
interface StatutSportifInfos {
  periode?: { date_debut_statut?: string; date_fin_statut?: string };
  federation?: { code_federation?: string; nom_federation?: string; nom_court_federation?: string };
  etablissement?: { code_etablissement?: string; nom_etablissement?: string };
  region?: { code_region?: string; nom_region?: string };
  categorie?: { code_categorie?: string; nom_categorie?: string; valeur?: string };
  sportif_de_haut_niveau?: boolean;
}
export interface StatutSportifData {
  identite?: {
    nom_naissance?: string;
    nom_usage?: string;
    prenoms?: string;
    date_naissance?: string;
    sexe?: string;
  };
  est_sportif_de_haut_niveau: boolean;
  a_ete_sportif_de_haut_niveau?: boolean;
  informations_statut?: StatutSportifInfos;
  informations_statuts_precedents?: (StatutSportifInfos & { fiche?: number })[];
}
