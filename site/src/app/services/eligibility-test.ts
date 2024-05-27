import { ConfirmPayload } from 'types/EligibilityTest';

export const buildLCAConfirmUrl = (data: ConfirmPayload): URL => {
  const domain = process.env.NEXT_PUBLIC_LCA_API_URL;

  if (!domain) {
    throw new Error('Error: NEXT_PUBLIC_LCA_API_URL is not set');
  }

  const params = new URLSearchParams();
  params.append('id', data.id);
  params.append('situation', data.situation);
  params.append('organisme', data.organisme);

  const allocataireName = data.recipientLastname;
  if (allocataireName) {
    params.append('allocataireName', allocataireName);
  }

  const allocataireSurname = data.recipientFirstname;
  if (allocataireSurname) {
    params.append('allocataireSurname', allocataireSurname);
  }

  const matricule = data.recipientCafNumber;
  if (matricule) {
    params.append('matricule', matricule);
  }

  const recipientBirthPlace = data.recipientBirthPlace;
  if (recipientBirthPlace) {
    params.append('codeInseeBirth', recipientBirthPlace);
  }

  const recipientBirthDate = data.recipientBirthDate;
  if (recipientBirthDate) {
    params.append('allocataireBirthDate', recipientBirthDate);
  }

  const recipientBirthCountry = data.recipientBirthCountry;
  if (recipientBirthCountry) {
    params.append('codeIso', recipientBirthCountry);
  }

  const baseUrl = `${domain}/gw/psp-server/beneficiaires/confirm`;
  const url = new URL(baseUrl);
  url.search = params.toString();

  return url;
};
