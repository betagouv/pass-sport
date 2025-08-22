import {
  ConfirmPayload,
  ConfirmResponseBody,
  ConfirmResponseBodyItem,
  SearchPayload,
  SearchResponseBody,
} from 'types/EligibilityTest';

export const buildSearchResponseBody = (): SearchResponseBody => {
  return [
    {
      id: 123,
      nom: 'DUPOND',
      prenom: 'MANON',
      date_naissance: '2011-01-01T23:00:00.000Z',
      situation: 'jeune',
      organisme: 'MSA',
      matricule: '9999999999999',
      hasMatricule: true,
    },
  ];
};

export const buildConfirmResponseBody = ({
  nom,
}: Partial<ConfirmResponseBodyItem>): ConfirmResponseBody => {
  return [
    {
      id: 12967588,
      id_psp: '24-IIII-IIII',
      nom: nom || 'DUPOND',
      prenom: 'MANON',
      date_naissance: '2011-01-01T02:00:00.000+01:00',
      genre: 'F',
      organisme: 'MSA',
      situation: 'jeune',
      allocataire: {
        code_organisme: '220',
        matricule: '9999999999999',
        nom: 'DUPOND',
        commune_naissance: 'GRENOBLE',
        code_insee_commune_naissance: '38000',
        date_naissance: '01/08/1979',
        courriel: 'fake_email@test.fr',
        telephone: '0600000000',
        qualite: 'Mme',
        prenom: 'BABETTE',
      },
      adresse: {
        code_insee: '29098',
        commune: 'LAMPAUL PLOUARZEL',
        code_postal: '29810',
        nom_adresse_postale: 'MME DUPOND BABETTE',
        voie: '31 RUE DU TEST',
      },
      created_at: '2024-04-24T14:09:47.646+02:00',
      updated_at: '2023-08-31T12:05:34.000+02:00',
      a_valider: false,
      exercice_id: 4,
      uuid_doc: null,
      refuser: false,
      nom_complet: 'MANON DUPOND',
      pdf_base_64: 'test-base-64',
    },
  ];
};

export const buildConfirmPayload = (data: Partial<ConfirmPayload>) => {
  return {
    id: '123456789',
    situation: data.situation || 'jeune',
    organisme: data.organisme || 'CAF',
    recipientLastname: data.recipientLastname,
    recipientFirstname: data.recipientFirstname,
    recipientCafNumber: data.recipientCafNumber,
    recipientBirthPlace: data.recipientBirthPlace,
    recipientBirthDate: data.recipientBirthDate,
    recipientBirthCountry: data.recipientBirthCountry,
  };
};

export const buildSearchPayload = (data: Partial<SearchPayload>) => {
  return {
    beneficiaryLastname: data.beneficiaryLastname || 'Marley',
    beneficiaryFirstname: data.beneficiaryFirstname || 'Bob',
    beneficiaryBirthDate: data.beneficiaryBirthDate || '2015-03-27',
    recipientResidencePlace: data.recipientResidencePlace || '05023',
  };
};
